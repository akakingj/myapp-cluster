'use strict';
/**
 * survey.js - Settings > Driving assistant check > Signal survey (1.11.0): one drive to find whether the speed limit
 * SIGN itself (not the limit Speed Limit Assist takes for the cruise control: the HUD data's vSLISpeedValue) reaches
 * an app on this car.
 *
 * What is read was declared when the app was built or installed on the car (app.json "survey",
 * kit/runtime/survey_fit.js): only what this car's catalog has, read only, at most 60 members; kit/survey-signals.json
 * says what was declared and what was left out. Nothing is asked of the car until the survey is started:
 *
 *   - start (driving or standing, 1.11.1): every declared service subscribed in turn, each given 20 s so a slow one holds up no
 *     other; the speed limit sign's candidates (groups marked sign) the whole survey long - a sign comes only as the
 *     car passes one; the driving assistant's settings (readOnce) read once; the fast ones (fast: the car ahead, the
 *     camera's objects, the lanes) their first 5 values each, then let go, how often they came measured
 *   - each change of a sign candidate's value written with the time, the speed and the HUD data's own figures
 *     (vSLISpeedValue x 5, ldmAdditionalSign, the ACC's symbol), the last 150
 *   - end (the button, or 30 min after the start): everything let go, the summary made - each member's state
 *     (values came / subscribed, no value / nothing provides it / refused / not in this car), how many, how often,
 *     the first value - and saved to the app's data folder (exports/survey-<time>.txt) and kept for the Logs
 *   - read only: no method is called, no field written (survey_fit declares none), no setting changed
 *
 *   const sv = startSurvey(ctx, log, { hud: () => adas.hudValue(), dir: ctx.dataDir })
 *   sv.info() -> { declared, missing, catalog, error, report }     sv.start() -> null | why not
 *   sv.end('button')     sv.status() -> { running, elapsedS, valued, changes, ... }     sv.sections(level)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let fit = null;
try { fit = require('./kit/survey_fit'); } catch (e) { /* an older kit: no survey */ }

const MAX_MS = 30 * 60 * 1000, SERVICE_MS = 20000, QUIET_MS = 3 * 60 * 1000, FAST_N = 5, CHANGES = 150;
const CATALOG = process.env.SOMEIP_CATALOG || '/etc/oap/someip/someip-interfaces.json';
/* the keys that look like figures, first in a value's text */
const FIGURE_RE = /speed|limit|value|class|sign|type/i;

/** Every leaf of a value as 'a.b=v' (arrays: their length and first two), at most max. */
function leaves(v, max) {
    const out = [];
    const walk = (x, p, d) => {
        if (out.length >= max) return;
        if (x === null || typeof x !== 'object') { out.push(p + '=' + (typeof x === 'string' ? JSON.stringify(x) : String(x))); return; }
        if (d > 6) { out.push(p + '=…'); return; }
        if (Array.isArray(x)) { out.push(p + '.length=' + x.length); x.slice(0, 2).forEach((e, i) => walk(e, p + '[' + i + ']', d + 1)); return; }
        Object.keys(x).forEach((k) => walk(x[k], p ? p + '.' + k : k, d + 1));
    };
    walk(v, '', 0);
    return out;
}
/** A value as one line, its figures (speed, limit, value, class, sign, type) first, cut at n letters. */
function valueText(v, n) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return v.slice(0, n); } }
    const all = leaves(v, 120), key = (l) => l.split('=')[0].split('.').pop();
    const first = all.filter((l) => FIGURE_RE.test(key(l))), rest = all.filter((l) => !FIGURE_RE.test(key(l)));
    return first.concat(rest).join(' ').slice(0, n);
}
const one = (v, key) => {
    if (!v || typeof v !== 'object') return undefined;
    if (key in v) return v[key];
    for (const k of Object.keys(v)) { const r = one(v[k], key); if (r !== undefined) return r; }
    return undefined;
};
/** What the HUD data says now: { kmh, vsli, takeover, acc } (undefined where it has none). */
function hudNow(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
    const sp = one(v, 'speed'), x = one(v, 'xSpeedLimitAssist'), acc = one(v, 'activeCruiseControl');
    return { kmh: sp && typeof sp.kmH === 'number' ? sp.kmH : undefined, vsli: x ? x.vSLISpeedValue : undefined,
        takeover: x ? x.ldmAdditionalSign : undefined, acc: acc ? acc.symbolACC : undefined };
}
const clock = (ms) => { const d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); };
const stamp = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19);

function startSurvey(ctx, log, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const dir = opts.dir || ctx.dataDir || '.';
    const kitDir = opts.kitDir || path.join(__dirname, 'kit');
    const hud = opts.hud || (() => null);
    const signals = opts.signals || ctx.signals;
    let report = null, reportError = null;
    try { report = JSON.parse(fs.readFileSync(path.join(kitDir, fit ? fit.REPORT : 'survey-signals.json'), 'utf8')); }
    catch (e) { reportError = e.code === 'ENOENT' ? 'no survey list (built without the car\'s catalog)' : 'survey list not readable: ' + (e.code || e.message); }
    const declared = report && Array.isArray(report.declared) ? report.declared : [];
    const missing = report && Array.isArray(report.dropped) ? report.dropped : [];

    let run = null;          // the survey under way: { at, items, subs, changes, settings, catalog, timer }
    let last = null;         // the last one's record (also in survey-last.json)
    try { last = JSON.parse(fs.readFileSync(path.join(dir, 'survey-last.json'), 'utf8')); } catch (e) { /* none yet */ }
    const say = (m) => { if (log) log.info('signal survey: ' + m); };

    function info() {
        return { declared: declared.length, missing: missing.filter((d) => d.why !== ('over the ' + (report && report.max) + ' limit')).length,
            over: missing.filter((d) => /limit$/.test(d.why)).length, catalog: !!(report && report.catalog), error: reportError || (report && report.error) || null };
    }

    function itemOf(d) {
        return { iface: d.iface, instance: d.instance, member: d.member, kind: d.kind, flags: d.flags, group: d.group, sign: !!d.sign, readOnce: !!d.readOnce,
            fast: !!d.fast, status: 'waiting', n: 0, firstAt: 0, lastAt: 0, first: null, lastKey: null, times: [], subAt: 0, error: null };
    }

    /** One value of an item: counted, the first kept, a sign candidate's change written. */
    function onValue(it) {
        return (v) => {
            if (!run || (it.fast && it.n >= FAST_N)) return;
            const t = now();
            // (every value to the test log's recorder too: research.js, 1.13.0 - the sign services' every field)
            if (opts.onValue) { try { opts.onValue(it.iface, it.member, v, t); } catch (e) { /* not the survey's */ } }
            it.n++; it.lastAt = t;
            if (!it.firstAt) { it.firstAt = t; it.first = valueText(v, 200); }
            if (it.times.length < FAST_N) it.times.push(t);
            if (!it.sign) return;
            let key;
            try { key = JSON.stringify(v); } catch (e) { key = String(v); }
            if (key === it.lastKey) return;
            it.lastKey = key;
            const h = hudNow(hud());
            run.changes.push({ at: t, kmh: h.kmh, vsli: h.vsli, takeover: h.takeover, acc: h.acc, what: it.iface + '.' + it.member, value: valueText(v, 400) });
            if (run.changes.length > CHANGES) run.changes.shift();
        };
    }

    const within = (p, ms) => new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve({ timedOut: true }); } }, ms);
        Promise.resolve(p).then((r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } }, (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ error: String(e) }); } });
    });

    /** One service: its fields (handlers; a getter read too) and events, on its instance; its items' status. */
    function subscribe(iface, items) {
        const fields = items.filter((i) => i.kind === 'field'), events = items.filter((i) => i.kind === 'event');
        const handlers = {};
        fields.forEach((i) => { handlers[i.member] = onValue(i); });
        const readOnly = fields.some((i) => i.flags.indexOf('s') < 0);
        const work = Promise.resolve().then(() => signals.watch(iface, items[0].instance || '1', handlers, log,
            readOnly && !items[0].readOnce ? { pollMs: 5000, active: () => !!run } : undefined))
            .then((sub) => {
                if (!sub || sub.error) return { error: (sub && sub.error) || 'no proxy' };
                return events.reduce((p, e) => p.then(() => signals.on(sub.proxy, e.member, onValue(e), log)
                    .catch((err) => { e.error = String(err); })), Promise.resolve()).then(() => ({ sub }));
            });
        return within(work, SERVICE_MS).then((r) => {
            const t = now();
            items.forEach((i) => { i.subAt = t; });
            if (r.timedOut) { items.forEach((i) => { i.status = 'timed out'; }); say(iface + ': no answer in 20 s'); return null; }
            if (r.error) { items.forEach((i) => { i.status = 'refused'; i.error = r.error; }); say(iface + ': ' + r.error); return null; }
            items.forEach((i) => { i.status = i.error ? 'refused' : 'subscribed'; });
            return r.sub;
        });
    }

    /** Starts the survey; returns null, or why it did not (already on, nothing declared). Driving or standing
     *  (1.11.1): the speed at the start is in the record. */
    function start() {
        if (run) return 'already running';
        if (!declared.length) return reportError || 'nothing declared for this car';
        const h = hudNow(hud());
        const t = now();
        run = { at: t, items: declared.map(itemOf), subs: [], changes: [], settings: [], catalog: [], kmhAtStart: h.kmh };
        say('started: ' + declared.length + ' members');
        // the catalog's sign and driving assistant services, once, to the record (and the log)
        try { run.catalog = fit ? fit.catalogLines(JSON.parse(fs.readFileSync(opts.catalog || CATALOG, 'utf8')), readRequest()) : []; }
        catch (e) { run.catalog = ['(catalog not readable: ' + (e.code || e.message) + ')']; }
        const byIface = {};
        run.items.forEach((i) => { (byIface[i.iface] || (byIface[i.iface] = [])).push(i); });
        const mine = run;
        // in turn: one service at a time through the native binding (signals.js nativeTick) anyway
        Object.keys(byIface).reduce((p, iface) => p.then(() => {
            if (run !== mine) return null;
            return subscribe(iface, byIface[iface]).then((sub) => {
                if (!sub) return;
                if (run !== mine) { sub.shutdown(); return; }
                mine.subs.push({ iface, sub, items: byIface[iface], fast: byIface[iface].every((i) => i.fast), readOnce: byIface[iface].every((i) => i.readOnce), at: now() });
            });
        }), Promise.resolve()).catch((e) => say('subscribing: ' + e));
        run.timer = setInterval(tick, 1000);
        if (run.timer.unref) run.timer.unref();
        return null;
    }

    function readRequest() {
        try { return JSON.parse(fs.readFileSync(path.join(kitDir, fit.REQUEST), 'utf8')); } catch (e) { return { groups: [] }; }
    }

    /** Each second: the fast ones and the settings let go once done; the end at 30 min. */
    function tick() {
        if (!run) return;
        const t = now();
        run.subs.forEach((s) => {
            if (s.gone) return;
            const done = s.readOnce ? s.items.every((i) => i.n > 0) || t - s.at > 30000
                : s.fast ? s.items.every((i) => i.n >= FAST_N) || (s.items.some((i) => i.n >= FAST_N) && t - s.at > 60000) || t - s.at > QUIET_MS : false;
            if (!done) return;
            s.gone = true;
            if (s.readOnce) s.items.forEach((i) => { if (i.n) run.settings.push(i.iface + '.' + i.member + ' = ' + i.first); else run.settings.push(i.iface + '.' + i.member + ': no value'); });
            Promise.resolve().then(() => s.sub.shutdown()).catch(() => {});
        });
        if (t - run.at >= MAX_MS) end('30 min');
    }

    /** Ends the survey: everything let go, the record made and saved. */
    function end(why) {
        if (!run) return null;
        const r = run, t = now();
        run = null;
        clearInterval(r.timer);
        r.subs.forEach((s) => { if (!s.gone) Promise.resolve().then(() => s.sub.shutdown()).catch(() => {}); });
        // the settings not yet written (their service still open)
        r.subs.filter((s) => s.readOnce && !s.gone).forEach((s) => s.items.forEach((i) => r.settings.push(i.iface + '.' + i.member + (i.n ? ' = ' + i.first : ': no value'))));
        const available = {};
        r.subs.forEach((s) => { available[s.iface] = !!(s.sub && s.sub.available); });
        last = {
            at: r.at, endedAt: t, why: why || 'button', kmhAtStart: r.kmhAtStart,
            items: r.items.map((i) => ({ iface: i.iface, member: i.member, kind: i.kind, flags: i.flags, group: i.group, sign: i.sign, readOnce: i.readOnce,
                fast: i.fast, state: stateOf(i, available[i.iface], t), n: i.n, hz: hzOf(i), first: i.first, error: i.error })),
            missing: missing.map((d) => ({ iface: d.iface, member: d.member, kind: d.kind, why: d.why })),
            changes: r.changes, settings: r.settings, catalog: r.catalog,
        };
        try { fs.writeFileSync(path.join(dir, 'survey-last.json'), JSON.stringify(last)); } catch (e) { say('not kept: ' + e); }
        last.saved = saveText(text(last, 0));
        say('ended (' + last.why + '): ' + last.items.filter((i) => i.n).length + ' of ' + last.items.length + ' with values, ' + last.changes.length + ' sign changes');
        return last;
    }

    function stateOf(i, available, t) {
        if (i.status === 'refused') return 'refused' + (i.error ? ' (' + String(i.error).slice(0, 60) + ')' : '');
        if (i.status === 'timed out') return 'refused (no answer in 20 s)';
        if (i.status === 'waiting') return 'declared (not subscribed yet)';
        if (i.n) return 'values came';
        if (!available) return 'nothing provides it';
        return t - i.subAt >= QUIET_MS ? 'subscribed, no value' : 'subscribed, no value (under 3 min)';
    }
    const hzOf = (i) => (i.times.length >= 2 ? Math.round((i.times.length - 1) / Math.max(0.001, (i.times[i.times.length - 1] - i.times[0]) / 1000) * 10) / 10 : 0);

    function saveText(txt) {
        const name = 'survey-' + stamp(last.endedAt) + '.txt';
        try {
            const d = path.join(dir, 'exports');
            try { fs.mkdirSync(d); } catch (e) { if (e.code !== 'EEXIST') throw e; }
            fs.writeFileSync(path.join(d, name), txt);
            // keep the newest five
            fs.readdirSync(d).filter((f) => /^survey-/.test(f)).sort().slice(0, -5).forEach((f) => fs.unlinkSync(path.join(d, f)));
            return path.join(d, name);
        } catch (e) { say('not saved: ' + e); return null; }
    }

    /*
     * The record as text, its sections; level 0 in full (the file), 1 - 3 shorter (the QR codes): the first value and
     * the changes' values cut shorter, fewer changes, at 3 the catalog's lines cut too.
     */
    const LEVELS = [{ first: 80, value: 160, changes: CHANGES, cat: 400 }, { first: 60, value: 120, changes: CHANGES, cat: 300 },
        { first: 40, value: 80, changes: 100, cat: 200 }, { first: 20, value: 50, changes: 60, cat: 120 }];
    function sections(rec, level) {
        const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level || 0))];
        const flags = (f) => String(f || '').split('').join(',');
        const head = 'started ' + new Date(rec.at).toISOString() + (typeof rec.kmhAtStart === 'number' ? ' at ' + rec.kmhAtStart + ' km/h' : '')
            + ', ended ' + Math.round((rec.endedAt - rec.at) / 60000) + ' min later (' + rec.why + '); declared ' + rec.items.length
            + ', with values ' + rec.items.filter((i) => i.n).length + ', not in this car ' + rec.missing.length;
        const summary = [head].concat(rec.items.map((i) => i.iface + '.' + i.member + '  ' + i.state + '  flags=' + flags(i.flags) + '  n=' + i.n + '  hz=' + i.hz
            + '  first=' + (i.first ? String(i.first).slice(0, L.first) : '-')))
            .concat(rec.missing.map((d) => d.iface + (d.member ? '.' + d.member : '') + '  not in this car (' + d.why + ')'));
        const changes = rec.changes.slice(-L.changes).map((c) => clock(c.at) + ' ' + (typeof c.kmh === 'number' ? c.kmh : '?') + ' km/h vSLI='
            + (c.vsli === undefined ? '-' : c.vsli + 'x5=' + (typeof c.vsli === 'number' ? c.vsli * 5 : '?')) + ' takeover=' + (c.takeover || '-') + ' acc=' + (c.acc || '-')
            + ' | ' + c.what + ' = ' + String(c.value).slice(0, L.value));
        return [
            ['survey summary', summary.join('\n')],
            ['sign changes', changes.length ? changes.join('\n') : '(none)'],
            ['settings read', rec.settings.length ? rec.settings.join('\n') : '(none)'],
            ['catalog (sign/assist)', rec.catalog.length ? rec.catalog.map((l) => l.slice(0, L.cat)).join('\n') : '(none)'],
        ];
    }
    function text(rec, level) {
        return sections(rec, level).map(([t, b]) => '--- ' + t + ' ---\n' + b).join('\n\n') + '\n';
    }

    /** The last record's sections at the shortest level whose bundle (with other) fits in maxCodes QR codes;
     *  count(text): the codes a text takes (logs.codeCount), or a number: base64 characters a code. */
    function fitted(other, maxCodes, count) {
        if (!last) return [];
        const codesOf = typeof count === 'function' ? count
            : (all) => Math.ceil(zlib.deflateSync(Buffer.from(all, 'utf8'), { level: 9 }).toString('base64').length / (count || 380));
        for (let l = 0; l < LEVELS.length; l++) {
            const s = sections(last, l), all = other.concat(s).map(([t, b]) => '--- ' + t + ' ---\n' + b).join('\n');
            const n = codesOf(all);
            if (n <= maxCodes || l === LEVELS.length - 1) return s;
        }
        return [];
    }

    function status() {
        const t = now();
        if (!run) return { running: false, last: last && { at: last.at, endedAt: last.endedAt, why: last.why, valued: last.items.filter((i) => i.n).length, items: last.items.length, changes: last.changes.length, saved: last.saved } };
        return { running: true, elapsedS: Math.floor((t - run.at) / 1000), valued: run.items.filter((i) => i.n).length, items: run.items.length,
            subscribed: run.subs.length, changes: run.changes.length, recent: run.changes.slice(-3).reverse(),
            withValues: run.items.filter((i) => i.n && !i.readOnce).map((i) => i.iface.split('.').pop() + '.' + i.member + ' ' + i.n) };
    }

    return { info, start, end, status, sections: (level) => (last ? sections(last, level) : []), fitted, text: () => (last ? text(last, 0) : ''),
        running: () => !!run, last: () => last, report: () => report };
}

module.exports = { startSurvey, valueText, hudNow, leaves, MAX_MS, QUIET_MS, FAST_N };
