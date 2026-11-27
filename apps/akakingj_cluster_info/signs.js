'use strict';
/**
 * signs.js - the road signs the front camera reads, other than the speed limit, on the HUD (1.12.0).
 *
 * The camera's sign event (de.bmw.environmentalmodel.SignRecognitionFrontCamera, TrafficSignRecognitionFrontCamera):
 * found by the signal survey (1.11.x, a drive on 2026-11-26), it comes once as the car passes a sign, not at a rate:
 *
 *   trafficSignRecognition.numberSigns=1  trafficSign[0].type="DS_ANIMAL_CROSSING"  trafficSign[0].value=0
 *
 * Types seen: SPEED_LIMIT (value 40, 90, 110), NO_PASSING_SIGN, GIVE_WAY, DS_TRAFFIC_JAM, DS_SPLIPPERY_ROAD (BMW's
 * spelling), DS_RIGHT_DOWNWARDS, DS_ANIMAL_CROSSING. The HUD shows the speed limit and the no passing sign itself
 * (the limit sign moves up and the no passing sign takes its place, photo 2026-11-27), so those are left out; the
 * danger signs (DS_...), give way, stop and no entry show as South Korea's own signs (sign_art.js: the government's
 * designs, cut out along their red edge; tools/make_sign_art.py). A warning with no sign of its own gets 위험 ("!").
 * Each shows for SHOW_MS after it was last seen, in a row in the order they came, at most MAX_SIGNS.
 *
 * Declared only where this car's catalog has it: app.json "survey" (group camera) and kit/runtime/survey_fit.js, as
 * the survey's members; this reads the list the fit wrote (kit/survey-signals.json). Read only: one event, no method,
 * no field written. The survey reads the same event through this one subscription (signalsFor), not a second proxy.
 *
 *   const sg = startSigns(ctx, log)
 *   sg.current() -> ['DS_ANIMAL_CROSSING', ...]     sg.status() -> { state, seen, types }
 *   sg.signalsFor(ctx.signals) -> signals for the survey
 *   drawSigns(cv, types, gap)    signWidth(type)    for the overlay
 */
const fs = require('fs');
const path = require('path');
let fit = null;
try { fit = require('./kit/survey_fit'); } catch (e) { /* an older kit */ }

const CAM_IFACE = 'de.bmw.environmentalmodel.SignRecognitionFrontCamera';
const CAM_EVENT = 'TrafficSignRecognitionFrontCamera';
const SHOW_MS = 10000;
const MAX_SIGNS = 4;

/** The sign types in one of the camera's values: ['GIVE_WAY', ...] (as many as numberSigns says, if it says). */
function parseSigns(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (!v || typeof v !== 'object') return [];
    const find = (o, key, d) => {
        if (!o || typeof o !== 'object' || d > 5) return undefined;
        if (key in o) return o[key];
        for (const k of Object.keys(o)) { const r = find(o[k], key, d + 1); if (r !== undefined) return r; }
        return undefined;
    };
    let list = find(v, 'trafficSign', 0);
    if (!Array.isArray(list)) list = list && typeof list === 'object' ? Object.keys(list).map((k) => list[k]) : [];
    const n = find(v, 'numberSigns', 0);
    if (typeof n === 'number' && n >= 0) list = list.slice(0, n);
    return list.map((s) => (s && typeof s === 'object' ? s.type : undefined))
        .filter((t) => typeof t === 'string' && t).map((t) => t.toUpperCase());
}

/** Whether a type is drawn: the danger signs and give way (the HUD shows the speed limit and no passing itself). */
const shownByHud = (t) => /SPEED_LIMIT|NO_PASSING|OVERTAK|(^|_)END(_|$)/.test(t);
const wanted = (t) => !shownByHud(t) && (/^DS_/.test(t) || artOf(t) !== 'danger');

/** The signs seen lately: add(types, t), current(t) -> the types to show, oldest first. */
function makeTracker(showMs, max) {
    showMs = showMs || SHOW_MS; max = max || MAX_SIGNS;
    const seen = new Map();      // type -> { first, last }
    return {
        add(types, t) {
            types.filter(wanted).forEach((ty) => {
                const s = seen.get(ty);
                if (s && t - s.last < showMs) s.last = t; else seen.set(ty, { first: t, last: t });
            });
        },
        current(t) {
            const out = [];
            seen.forEach((s, ty) => { if (t - s.last < showMs) out.push([s.first, ty]); else seen.delete(ty); });
            return out.sort((a, b) => a[0] - b[0]).slice(-max).map((e) => e[1]);
        },
    };
}

/* ---------- drawing: South Korea's own signs (sign_art.js, tools/make_sign_art.py) ---------- */
const zlib = require('zlib');
const ART = require('./sign_art');
const pics = {};

/** A picture by name: { w, h, d } (RGBA), unpacked once. */
function pic(name) {
    if (pics[name] === undefined) {
        const a = ART.art[name];
        pics[name] = a ? { w: a.w, h: a.h, d: new Uint8Array(zlib.inflateSync(Buffer.from(a.z, 'base64'))) } : null;
    }
    return pics[name];
}

/* the camera's type -> the Korean sign (the first that matches; BMW's names as the camera gave them where seen:
 * DS_SPLIPPERY_ROAD, DS_TRAFFIC_JAM, DS_ANIMAL_CROSSING, DS_RIGHT_DOWNWARDS, GIVE_WAY; the rest by their likely words) */
const side = (l, r) => (t) => (/LEFT/.test(t) ? l : r);
const ART_OF = [
    // regulatory and instruction signs first (NO_LEFT_TURN is no bend)
    [/GIVE_WAY|YIELD/, 'give_way'], [/^STOP/, 'stop'], [/NO_ENTRY|DO_NOT_ENTER/, 'no_entry'],
    [/U_TURN/, 'no_u_turn'], [/NO_.*LEFT|LEFT_TURN_PROHIB|TURN_LEFT_PROHIB/, 'no_left_turn'],
    [/NO_.*RIGHT|RIGHT_TURN_PROHIB|TURN_RIGHT_PROHIB/, 'no_right_turn'], [/NO_.*STRAIGHT|STRAIGHT_PROHIB/, 'no_straight'],
    [/NO_.*(STOPPING|WAITING|STANDING)/, 'no_stopping'], [/NO_.*PARK|PARKING_PROHIB/, 'no_parking'],
    [/NO_.*(CAR|MOTOR|VEHICLE)/, 'no_cars'], [/DISTANCE|HEADWAY/, 'keep_distance_50m'], [/ONE_WAY/, 'one_way'],
    [/UNPROTECTED/, 'unprotected_left'], [/^SLOW|_SLOW/, 'slow'],
    [/SLIP|SPLIP|SKID/, 'slippery'], [/JAM|QUEUE|CONGEST/, 'traffic_jam'], [/ANIMAL|DEER|WILD/, 'wild_animal'],
    [/DOWNWARD|DESCENT|DOWNHILL/, 'downhill'], [/UPWARD|ASCENT|UPHILL/, 'uphill'],
    [/DOUBLE|SERIES|WINDING|(^|[^A-Z])S_(CURVE|BEND)/, (t) => (/LEFT.*RIGHT|LEFT_FIRST|^DS_LEFT/.test(t) ? 'double_bend_left' : 'double_bend_right')],
    [/CURVE|BEND/, side('curve_left', 'curve_right')],
    [/WORK|CONSTRUCTION/, 'road_works'], [/PEDESTRIAN|CROSSWALK|ZEBRA/, 'crosswalk'], [/CHILD|SCHOOL/, 'children'],
    [/BICYC|CYCLE/, 'bicycle'], [/HUMP|SPEED_BUMP/, 'speed_hump'], [/UNEVEN|BUMP/, 'bumpy_road'],
    [/ROCK|FALLING/, 'falling_rocks'], [/WIND/, 'crosswind'], [/TUNNEL/, 'tunnel'], [/BRIDGE/, 'bridge'],
    [/RAIL|TRAIN|LEVEL_CROSS/, 'railway'], [/LIGHT|SIGNAL/, 'traffic_lights'], [/ROUNDABOUT|CIRCLE/, 'roundabout'],
    [/MERGE|JOIN/, side('merge_left', 'merge_right')], [/RIVER|QUAY|BANK/, 'riverside'],
];
/** Which sign a type gets: 'danger' (140, "!") for a warning with none of its own. */
function artOf(t) {
    for (const [re, n] of ART_OF) if (re.test(t)) return typeof n === 'function' ? n(t) : n;
    return 'danger';
}

/** A sign's width on the HUD (all are ART.h high: a triangle wider than a round sign). */
function signWidth(t) { const p = pic(artOf(t)) || pic('danger'); return p ? p.w : ART.wmax; }

/** One sign, its left at x, its middle at cy. */
function drawSign(cv, t, x, cy) {
    const p = pic(artOf(t)) || pic('danger');
    if (p) cv.blit(p, x, Math.round(cy - p.h / 2));
}

/** A row of signs from the left of cv, gap apart, their middles on the row's; cv cleared first. */
function drawSigns(cv, types, gap) {
    cv.clear([0, 0, 0, 0]);
    let x = 0;
    types.forEach((t) => { drawSign(cv, t, x, cv.h / 2); x += signWidth(t) + gap; });
}

/* ---------- the car's own list of the camera's sign types ----------
 * The camera's value comes with its type as a name (the head unit's interface config holds the enumeration): this
 * app's own config for the camera's service (someipInterfaces/, made at install from the car's catalog) is read for
 * the list of names, so what this car's camera can say is known without driving past every sign - logged once in
 * lines the Logs' codes keep whole, and on the app's page. */
const NAME_RE = /^[A-Z][A-Z0-9_]{2,}$/;
/** The sign type names in an interface config: the enumeration holding GIVE_WAY or SPEED_LIMIT, [] if none. */
function typeNames(cfg) {
    let best = [];
    const seen = new Set();
    const names = (o) => {
        const out = [];
        const add = (v) => { if (typeof v === 'string' && NAME_RE.test(v)) out.push(v); };
        if (Array.isArray(o)) o.forEach((e) => { add(e); if (e && typeof e === 'object') { add(e.name); add(e.Name); add(e.value && typeof e.value === 'string' ? e.value : null); } });
        else Object.keys(o).forEach((k) => { add(k); add(o[k]); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { add(o[k].name); add(o[k].Name); } });
        return out;
    };
    const walk = (o, d) => {
        if (!o || typeof o !== 'object' || d > 12 || seen.has(o)) return;
        seen.add(o);
        const n = names(o);
        if (n.length > best.length && (n.indexOf('GIVE_WAY') >= 0 || n.indexOf('SPEED_LIMIT') >= 0 || n.some((x) => /^DS_/.test(x)))) best = n;
        (Array.isArray(o) ? o : Object.keys(o).map((k) => o[k])).forEach((v) => walk(v, d + 1));
    };
    walk(cfg, 0);
    return Array.from(new Set(best));
}
/** Names in lines of at most n letters (the log keeps 200 a line). */
function chunk(list, n) {
    const out = [];
    let line = '';
    list.forEach((x) => { if (line && line.length + x.length + 2 > n) { out.push(line); line = ''; } line += (line ? ', ' : '') + x; });
    if (line) out.push(line);
    return out;
}

/* ---------- the camera ---------- */
function startSigns(ctx, log, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const signals = opts.signals || ctx.signals;
    const kitDir = opts.kitDir || path.join(__dirname, 'kit');
    const tracker = makeTracker(opts.showMs, opts.max);
    let state = 'not declared', seen = 0;
    const types = {};                // each type seen, how many times (for the page and the log)
    const listeners = {};            // member -> [fn] (this and the survey)
    let mine = null;                 // the subscription: { proxy, available }
    const subscribed = {};           // member -> promise (on our proxy)

    // the car's list of types (its interface config; only where the camera is declared)
    let carTypes = null;
    function readTypes() {
        if (carTypes || !item) return;
        let cfg = null;
        try { cfg = (opts.loadConfig || signals.loadConfig)(CAM_IFACE); } catch (e) { carTypes = []; log.info('road signs: the car\'s list of sign types not readable (' + e.message + ')'); return; }
        carTypes = typeNames(cfg);
        if (!carTypes.length) { log.info('road signs: no list of sign types in the camera\'s interface config'); return; }
        const shown = carTypes.filter(wanted), noArt = shown.filter((t) => artOf(t) === 'danger' && !/^DS_DANGER|GENERAL|OTHER/.test(t));
        log.info('road signs: this car\'s camera knows ' + carTypes.length + ' sign types, ' + shown.length + ' drawn (' + noArt.length + ' as "!")');
        chunk(carTypes, 180).forEach((l, i) => log.info('road signs: types ' + (i + 1) + ': ' + l));
    }

    let item = null;
    try {
        const rep = JSON.parse(fs.readFileSync(path.join(kitDir, fit ? fit.REPORT : 'survey-signals.json'), 'utf8'));
        item = (rep.declared || []).find((d) => d.iface === CAM_IFACE && d.member === CAM_EVENT && d.kind === 'event') || null;
        if (!item) state = 'not in this car\'s catalog';
    } catch (e) { state = e.code === 'ENOENT' ? 'no survey list (built without the car\'s catalog)' : 'survey list not readable: ' + (e.code || e.message); }

    function onSign(v) {
        const t = now(), list = parseSigns(v);
        seen++;
        list.forEach((ty) => {
            if (!types[ty]) log.info('road signs: the camera read ' + ty + (wanted(ty) ? '' : ' (not drawn: the HUD shows it itself)'));
            types[ty] = (types[ty] || 0) + 1;
        });
        tracker.add(list, t);
    }
    /** One member on our proxy, its values to every listener. */
    function listen(name, fn) {
        (listeners[name] || (listeners[name] = [])).push(fn);
        if (!subscribed[name]) {
            subscribed[name] = signals.on(mine.proxy, name, (v) => (listeners[name] || []).slice().forEach((f) => { try { f(v); } catch (e) { log.warn(name + ': ' + e); } }), log);
        }
        return subscribed[name];
    }
    const unlisten = (name, fn) => { const l = listeners[name]; if (l && l.indexOf(fn) >= 0) l.splice(l.indexOf(fn), 1); };

    if (item && !opts.noSubscribe) {
        state = 'subscribing';
        Promise.resolve().then(() => signals.watch(CAM_IFACE, item.instance || '1', {}, log)).then((sub) => {
            if (!sub || sub.error || !sub.proxy) { state = 'refused: ' + ((sub && sub.error) || 'no proxy'); log.warn('road signs: ' + state); return; }
            mine = sub;
            return listen(CAM_EVENT, onSign).then(() => { state = 'subscribed'; log.info('road signs: the camera\'s signs subscribed'); readTypes(); });
        }).catch((e) => { state = 'refused: ' + e; log.warn('road signs: ' + e); });
    }

    /** The signals the survey uses: the camera's service through this subscription (one proxy), the rest as they are. */
    function signalsFor(base) {
        const TOKEN = { roadSigns: true };
        return Object.assign({}, base, {
            watch(iface, instance, handlers, lg, o) {
                if (iface !== CAM_IFACE || !mine) return base.watch(iface, instance, handlers, lg, o);
                const mineFns = [];
                const sub = { iface, error: null, proxy: TOKEN, get available() { return !!(mine && mine.available); },
                    shutdown: () => { mineFns.forEach(([n, f]) => unlisten(n, f)); mineFns.length = 0; return Promise.resolve(); } };
                TOKEN.fns = mineFns;
                return Promise.all(Object.keys(handlers || {}).map((f) => { mineFns.push([f, handlers[f]]); return listen(f, handlers[f]); })).then(() => sub);
            },
            on(p, name, fn, lg) {
                if (p !== TOKEN) return base.on(p, name, fn, lg);
                TOKEN.fns.push([name, fn]);
                return listen(name, fn);
            },
        });
    }

    return {
        current: () => tracker.current(now()),
        status: () => ({ state, seen, types: Object.assign({}, types), carTypes: carTypes ? carTypes.slice() : null,
            drawn: carTypes ? carTypes.filter(wanted).length : null, asDanger: carTypes ? carTypes.filter((t) => wanted(t) && artOf(t) === 'danger').length : null }),
        signalsFor,
        _onSign: onSign,
    };
}

/** Samples for checking the place (Settings: Road signs on the HUD: sample). */
const SAMPLE = ['GIVE_WAY', 'DS_SPLIPPERY_ROAD', 'DS_ANIMAL_CROSSING'];

module.exports = { startSigns, parseSigns, wanted, typeNames, chunk, makeTracker, drawSign, drawSigns, signWidth, artOf, ART_H: ART.h, ART_WMAX: ART.wmax, SAMPLE, CAM_IFACE, CAM_EVENT, SHOW_MS, MAX_SIGNS };
