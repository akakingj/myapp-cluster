'use strict';
/**
 * alerts.js - the speed camera / speed bump test (Settings > Speed camera and bump test): what the car's navigation
 * says about speed cameras, section cameras, school zones, speed limits, dangerous curves and anything else ahead
 * on the route, read only, written to cluster-info-alerts.log and shown on this app's page, so a drive tells which of
 * them reach the head unit (BMW's navigation, or a phone's: CarPlay hands the car its turns and lanes, maybe nothing
 * else). Nothing is drawn on the HUD from it yet.
 *
 * Read the same way as the directions (navlog.js): GuidanceEventList.queryContent, a one-shot read from the car's
 * position. Its catalog lists speedCamera, speedSectionCamera, schoolZone, speedLimitAssist, speedLimit,
 * dangerousCurve, trafficEvent, tunnel, tollgate... (GuidanceEventUnion); none for a speed bump, so a bump could only
 * come as one of those or as a manoeuvre's text: every text of every event is looked at for the words of one
 * (KEYWORDS), and logged in full when it has one. The event types to ask for (includedTypes) are names found in
 * earlier probes (jaimeen77's Cluster Redline, vehicle-alerts.js, 1.2-1.3.9; none confirmed on a car: its drive saw
 * only the empty list accepted): each is asked alone once, the ones the car accepts are then asked together (and
 * the empty list in turn). Asked every ASK_MS while a route runs and the test is on.
 *
 * Log lines (at most 2 x 256 KiB, written only while a route runs):
 *   alerts: types <name> accepted | rejected (<error>)
 *   alerts: <kind> <distance> <event, coordinates left out>        a new event, or the same one at most every 5 s
 *   alerts: text <kind> "<text>" <distance>                         a text with a camera / bump / school word
 *   alerts: kinds <kind> x<n> ...                                   what each reply held, when that changes
 * Street names (texts without such a word) are written as their length only.
 */
const fs = require('fs');
const path = require('path');

const IFACE = 'de.bmw.infotainment.navigation.guiding.GuidanceEventList', INST = 'Main_Instance';
const ASK_MS = 2000, CALL_MS = 900, PROXY_RETRY_MS = 30000, MAX_BYTES = 256 * 1024, SAME_MS = 5000, LAST_N = 6;
// the type names to try, one at a time (a name the car's serializer doesn't know is refused, nothing else happens)
const TYPES = ['INCLUDE_SPEED_CAMERAS', 'INCLUDE_SPEED_CAMERA', 'INCLUDE_SAFETY_CAMERAS', 'INCLUDE_SCHOOL_ZONES', 'INCLUDE_SCHOOL_ZONE',
    'INCLUDE_SPEED_LIMIT_ASSIST', 'INCLUDE_SPEED_LIMITS', 'INCLUDE_SPEED_LIMIT', 'INCLUDE_DANGER_ZONES', 'INCLUDE_DANGEROUS_CURVES',
    'INCLUDE_WARNINGS', 'INCLUDE_TRAFFIC_EVENTS', 'INCLUDE_PASSIVE_MANEUVERS', 'INCLUDE_TUNNELS', 'INCLUDE_TOLLGATES',
    'INCLUDE_POIS', 'INCLUDE_POINTS_OF_INTEREST', 'INCLUDE_INFORMATION', 'INCLUDE_ALL_EVENTS', 'INCLUDE_EVERYTHING'];
// the turns (the directions' own): counted, their texts looked at, not logged whole here
const MANEUVERS = { intersection: 1, branch: 1, roundabout: 1, alongMainRoad: 1, laneChange: 1, destinationManeuver: 1, vehicleTransportation: 1 };
// a camera, a bump, a school zone, in Korean and English (TMAP, BMW's navigation, Apple Maps)
const KEYWORDS = /과속|카메라|단속|방지턱|과속방지|어린이|스쿨|보호구역|신호위반|camera|enforcement|speed ?bump|hump|school/i;
const COORD = /^(lat|lon|lng|latitude|longitude|wgs84|geo|coordinate|coordinates|position2d|geoPosition)$/i;
const UNITS = { 1: 'km', 2: 'mi', 3: 'mi', 4: 'm', 5: 'yd', 6: 'ft', KM: 'km', MILE_UK: 'mi', MILE_US: 'mi', METER: 'm', YARD: 'yd', FEET: 'ft' };
const SPEEDING = ['UNKNOWN', 'SPEED_OKAY', 'TOO_FAST'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const mono = () => { const t = process.hrtime(); return t[0] * 1000 + t[1] / 1e6; };

/** The union's one kind and its body, or null. */
function unionOf(e) {
    if (!isObj(e)) return null;
    const keys = Object.keys(e).filter((k) => e[k] !== undefined && e[k] !== null);
    return keys.length === 1 ? { kind: keys[0], body: e[keys[0]] } : null;
}
/** The car's formatted distance as text ('450 m'), or ''. */
function distOf(b) {
    const f = isObj(b) && b.formattedDistance;
    if (!isObj(f) || typeof f.distance !== 'string' || !/\d/.test(f.distance)) return '';
    const u = UNITS[f.unit] || '';
    return f.distance.trim() + (u && !new RegExp(u + '$', 'i').test(f.distance.trim()) ? ' ' + u : '');
}
/** speedLimitAssistInfo's limit and the car's speeding verdict: { limit, verdict } or null. */
function limitOf(b) {
    const v = isObj(b) && isObj(b.speedLimitAssistInfo) && b.speedLimitAssistInfo.value, r = isObj(v) && v.reason, s = isObj(r) && r.speedLimitInfo;
    if (!isObj(s)) return null;
    const n = Number(s.speedLimit), verdict = typeof s.speedingInfo === 'string' ? s.speedingInfo : SPEEDING[s.speedingInfo] || null;
    return { limit: Number.isInteger(n) && n > 0 && n < 400 ? n : null, verdict };
}
/** Every string in v (with its key path), for the keyword look. */
function texts(v, pre, out, depth) {
    if (depth > 10) return out;
    if (typeof v === 'string') { if (v.trim()) out.push([pre, v]); return out; }
    if (Array.isArray(v)) { v.slice(0, 40).forEach((x, i) => texts(x, pre + '[' + i + ']', out, depth + 1)); return out; }
    if (isObj(v)) Object.keys(v).forEach((k) => { if (!COORD.test(k)) texts(v[k], pre ? pre + '.' + k : k, out, depth + 1); });
    return out;
}
/** The event for a log line: coordinates out, texts without a keyword as their length. */
function clean(v, depth) {
    if (depth > 12) return '…';
    if (Array.isArray(v)) return v.slice(0, 40).map((x) => clean(x, depth + 1));
    if (isObj(v)) {
        const o = {};
        Object.keys(v).forEach((k) => { if (!COORD.test(k) && typeof v[k] !== 'function') o[k] = clean(v[k], depth + 1); });
        return o;
    }
    if (typeof v === 'string') return KEYWORDS.test(v) ? v : '<' + v.length + ' chars>';
    return v;
}
const json = (v) => { try { const s = JSON.stringify(clean(v, 0)); return s.length > 2000 ? s.slice(0, 2000) + '…' : s; } catch (e) { return '"(' + e + ')"'; } };
/** The event without what changes as the car nears it (to tell a new one from the same one nearer). */
const coreOf = (v) => { try { return JSON.stringify(v, (k, x) => (k === 'formattedDistance' || k === 'rawDistance' || k === 'distance' || k === 'timeStamp' ? undefined : x)); } catch (e) { return ''; } };

/**
 * One queryContent reply: { ok, error, kinds: { kind: n }, alerts: [{ kind, dist, limit, verdict, inside, avg,
 * core, event }], words: [{ kind, text, dist }] }.
 */
function decode(reply) {
    const out = { ok: false, error: null, kinds: {}, alerts: [], words: [] };
    if (!isObj(reply)) { out.error = 'no reply'; return out; }
    const err = reply.GuidanceEventListError;
    if (err !== undefined && err !== 0 && err !== 'NO_ERROR') { out.error = 'rejected: ' + err; return out; }
    const views = reply.viewContent, events = Array.isArray(views) && isObj(views[0]) && views[0].eventsInView;
    if (!Array.isArray(events)) { out.error = 'no view'; return out; }
    out.ok = true;
    events.slice(0, 16).forEach((e) => {
        const u = unionOf(e);
        if (!u) return;
        out.kinds[u.kind] = (out.kinds[u.kind] || 0) + 1;
        const dist = distOf(u.body);
        texts(u.body, '', [], 0).forEach(([, t]) => { if (KEYWORDS.test(t)) out.words.push({ kind: u.kind, text: t.slice(0, 80), dist }); });
        if (MANEUVERS[u.kind]) return;
        const b = isObj(u.body) ? u.body : {}, l = limitOf(b), avg = Number(b.averageSpeed);
        out.alerts.push({ kind: u.kind, dist, limit: l ? l.limit : null, verdict: l ? l.verdict : null, inside: b.isInsideEvent === true,
            avg: Number.isInteger(avg) && avg > 0 && avg < 400 ? avg : null, core: u.kind + coreOf(b), event: e });
    });
    return out;
}

/**
 * start(ctx, log, opts): opts.wanted() (the test on, the car not parked), opts.routing() (a route runs). Returns
 * { status(), stop() }: status { state, types: { name: 'accepted' | 'rejected' }, replies, kinds, last: [lines] }.
 */
function start(ctx, log, opts) {
    const wanted = opts && opts.wanted ? opts.wanted : () => true, routing = opts && opts.routing ? opts.routing : () => false;
    const file = path.join(ctx.dataDir || '.', 'cluster-info-alerts.log');
    const st = { state: 'waiting for a route', types: {}, replies: 0, kinds: {}, last: [] };
    const write = (msg) => {
        try {
            const s = fs.existsSync(file) ? fs.statSync(file) : null;
            if (s && s.size > MAX_BYTES) fs.renameSync(file, file + '.1');
            fs.appendFileSync(file, new Date().toISOString() + ' alerts: ' + msg + '\n');
        } catch (e) { /* the log is best effort */ }
    };
    if (!ctx.signals || !ctx.signals.proxy || !ctx.signals.call) { st.state = 'no signals here (preview)'; return { status: () => st, stop() {} }; }
    let proxy = null, proxyFailedAt = -Infinity, asking = false, turn = 0, kindsLine = '', routeWas = false;
    const seen = {};      // core -> when last logged
    const note = (line) => { st.last.unshift(new Date().toTimeString().slice(0, 8) + ' ' + line); st.last.length = Math.min(st.last.length, LAST_N); };
    /** The next type list: each name alone until all are tried, then the accepted ones together, the empty list in turn. */
    const nextTypes = () => {
        const untried = TYPES.filter((t) => !st.types[t]);
        if (untried.length) return { list: [untried[0]], probe: untried[0] };
        const ok = TYPES.filter((t) => st.types[t] === 'accepted');
        turn++;
        return { list: ok.length && turn % 3 ? ok : [], probe: null };
    };
    const ask = () => {
        const now = mono();
        if (asking) return;
        if (!wanted() || !routing()) {
            if (routeWas) { routeWas = false; write('route over'); }
            st.state = !wanted() ? 'off' : 'waiting for a route';
            return;
        }
        if (!routeWas) { routeWas = true; write('route running: asking every ' + ASK_MS / 1000 + ' s'); }
        if (!proxy && now - proxyFailedAt < PROXY_RETRY_MS) return;
        asking = true;
        const q = nextTypes();
        Promise.resolve().then(() => proxy || ctx.signals.proxy(IFACE, INST).then((p) => { proxy = p; write('connected'); return p; }, (e) => { proxyFailedAt = mono(); throw e; }))
            .then((p) => ctx.signals.call(p, 'queryContent', { viewConfigs: [{
                viewport: { startPoint: { anchorPoint: { standardReferencePoint: 'CCP' }, offsets: [] }, maxElementCount: 16, endPoints: [], includedTypes: q.list },
                options: [], minimumUpdateIntervalMs: 1000, segmentItemRasterLength: 100 }] }, CALL_MS))
            .then((reply) => {
                const r = decode(reply);
                if (q.probe) { st.types[q.probe] = r.ok ? 'accepted' : 'rejected'; write('types ' + q.probe + ' ' + (r.ok ? 'accepted' : 'rejected (' + r.error + ')')); }
                if (!r.ok) { st.state = 'asking: ' + r.error; return; }
                st.replies++; st.state = 'asking (' + (q.list.length ? q.list.length + ' types' : 'no types') + ')';
                Object.keys(r.kinds).forEach((k) => { st.kinds[k] = (st.kinds[k] || 0) + r.kinds[k]; });
                const kl = Object.keys(r.kinds).sort().map((k) => k + ' x' + r.kinds[k]).join(' ');
                if (kl !== kindsLine) { kindsLine = kl; write('kinds [' + q.list.join(',') + '] ' + (kl || 'none')); }
                const t = mono();
                r.alerts.forEach((a) => {
                    if (t - (seen[a.core] || -Infinity) < SAME_MS) return;
                    const fresh = seen[a.core] === undefined;
                    seen[a.core] = t;
                    write(a.kind + ' ' + (a.dist || '--') + ' ' + json(a.event));
                    if (fresh) note(a.kind + ' ' + (a.dist || '') + (a.limit ? ' ' + a.limit : '') + (a.avg ? ' avg ' + a.avg : '') + (a.inside ? ' inside' : '') + (a.verdict === 'TOO_FAST' ? ' TOO FAST' : ''));
                });
                r.words.forEach((w) => {
                    const k = 'w' + w.kind + w.text;
                    if (t - (seen[k] || -Infinity) < SAME_MS) return;
                    const fresh = seen[k] === undefined;
                    seen[k] = t;
                    write('text ' + w.kind + ' "' + w.text + '" ' + (w.dist || '--'));
                    if (fresh) note(w.kind + ' "' + w.text + '" ' + w.dist);
                });
            })
            .catch((e) => {
                const m = String(e && e.message || e).slice(0, 160);
                if (!proxy) { write('not connected: ' + m); st.state = 'not connected: ' + m; }
                else if (q.probe) { st.types[q.probe] = 'rejected'; write('types ' + q.probe + ' rejected (' + m + ')'); }
                else { write('error: ' + m); st.state = 'error: ' + m; }
            })
            .then(() => { asking = false; });
    };
    const timer = setInterval(ask, ASK_MS);
    if (timer.unref) timer.unref();
    if (log) log.info('alerts test: on, writing cluster-info-alerts.log while a route runs');
    return { status: () => st, stop() { clearInterval(timer); } };
}

module.exports = { start, decode, TYPES, KEYWORDS };
