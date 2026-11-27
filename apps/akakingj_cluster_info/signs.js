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
 * danger signs (DS_...) and give way are drawn as Korean signs: a yellow triangle with a red edge, give way a white
 * one point down. A DS_ type with no picture of its own gets the "!" sign. Each shows for SHOW_MS after it was last
 * seen, in a row in the order they came, at most MAX_SIGNS.
 *
 * Declared only where this car's catalog has it: app.json "survey" (group camera) and kit/runtime/survey_fit.js, as
 * the survey's members; this reads the list the fit wrote (kit/survey-signals.json). Read only: one event, no method,
 * no field written. The survey reads the same event through this one subscription (signalsFor), not a second proxy.
 *
 *   const sg = startSigns(ctx, log)
 *   sg.current() -> ['DS_ANIMAL_CROSSING', ...]     sg.status() -> { state, seen, types }
 *   sg.signalsFor(ctx.signals) -> signals for the survey
 *   drawSigns(cv, types, size, gap)    signSize() etc. for the overlay
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
const wanted = (t) => /^DS_/.test(t) || t === 'GIVE_WAY';

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

/* ---------- drawing ---------- */
const RED = '#e0261b', YELLOW = '#ffd21f', WHITE = '#f4f4f4', INK = '#101010';
const ROOT3 = Math.sqrt(3);

/** A sign's box: w wide, h tall (an equilateral triangle). */
const signBox = (size) => ({ w: size, h: Math.round(size * ROOT3 / 2) });

/** A triangle (point up, or down), its red edge and its fill; returns the corners of the fill. */
function triangle(cv, x, y, w, h, down, fill) {
    const pts = down ? [[x, y], [x + w, y], [x + w / 2, y + h]] : [[x + w / 2, y], [x + w, y + h], [x, y + h]];
    cv.convex(pts, RED);
    // the edge: a ninth of the width, all round (the corners moved toward the middle)
    const cx = x + w / 2, cy = down ? y + h / 3 : y + h * 2 / 3, rIn = w / (2 * ROOT3), k = 1 - (w * 0.11) / rIn;
    const inner = pts.map(([px, py]) => [cx + (px - cx) * k, cy + (py - cy) * k]);
    cv.convex(inner, fill);
    return inner;
}

/** The pictures, in the triangle's own measure: u across (0..1), v down (0..1). */
const PICTURES = {
    // "!" (any danger sign without a picture of its own)
    general(cv, P, w) {
        cv.convex([P(0.455, 0.36), P(0.545, 0.36), P(0.525, 0.70), P(0.475, 0.70)], INK);
        cv.circle(P(0.5, 0.80)[0], P(0.5, 0.80)[1], w * 0.05, INK);
    },
    // a car, skidding: two S-shaped tracks behind it
    slippery(cv, P, w) {
        car(cv, P, w, 0.5, 0.47, 0.30);
        [0.40, 0.58].forEach((u0) => {
            const pts = [];
            for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push(P(u0 + 0.05 * Math.sin(f * Math.PI * 2), 0.60 + f * 0.26)); }
            cv.polyline(pts, w * 0.04, INK);
        });
    },
    // a queue: two cars from behind, the one ahead smaller
    jam(cv, P, w) {
        car(cv, P, w, 0.5, 0.45, 0.22);
        car(cv, P, w, 0.5, 0.70, 0.36);
    },
    // a road going down to the right (or up)
    down(cv, P, w, right) {
        const m = (u) => (right ? u : 1 - u);
        cv.convex([P(m(0.27), 0.52), P(m(0.27), 0.84), P(m(0.73), 0.84)].sort((a, b) => a[0] - b[0]), INK);
    },
    up(cv, P, w, right) { PICTURES.down(cv, P, w, !right); },
    // a deer, leaping to the left (as the Korean wild animal sign)
    animal(cv, P, w) {
        cv.convex([P(0.38, 0.55), P(0.50, 0.50), P(0.64, 0.53), P(0.67, 0.60), P(0.60, 0.65), P(0.42, 0.64)], INK);   // body
        cv.convex([P(0.36, 0.57), P(0.43, 0.54), P(0.39, 0.42), P(0.33, 0.44)], INK);                                 // neck
        cv.convex([P(0.27, 0.43), P(0.33, 0.40), P(0.38, 0.43), P(0.33, 0.48)], INK);                                 // head
        const lw = w * 0.04;
        cv.polyline([P(0.35, 0.41), P(0.33, 0.33)], lw, INK);                                                          // antlers
        cv.polyline([P(0.33, 0.36), P(0.29, 0.33)], lw, INK);
        cv.polyline([P(0.34, 0.33), P(0.38, 0.30)], lw, INK);
        cv.polyline([P(0.42, 0.61), P(0.33, 0.66), P(0.30, 0.62)], lw, INK);                                           // front legs, tucked
        cv.polyline([P(0.46, 0.63), P(0.38, 0.71), P(0.35, 0.68)], lw, INK);
        cv.polyline([P(0.62, 0.62), P(0.72, 0.72), P(0.80, 0.80)], lw, INK);                                           // back legs, out behind
        cv.polyline([P(0.58, 0.64), P(0.66, 0.74), P(0.70, 0.83)], lw, INK);
        cv.convex([P(0.64, 0.52), P(0.71, 0.49), P(0.68, 0.56)], INK);                                                 // tail
    },
    // a bend: an arrow bending right (or left)
    curve(cv, P, w, right) {
        const m = (u) => (right ? u : 1 - u);
        const lw = w * 0.07;
        cv.polyline([P(m(0.44), 0.86), P(m(0.44), 0.62), P(m(0.47), 0.55), P(m(0.54), 0.50)], lw, INK);
        cv.convex([P(m(0.52), 0.42), P(m(0.66), 0.50), P(m(0.52), 0.58)].sort((a, b) => a[0] - b[0]), INK);
    },
};

/** A car from behind: centred at u, v (its middle), wide of the triangle's width. */
function car(cv, P, w, u, v, wide) {
    const [x0, y0] = P(u - wide / 2, v - wide * 0.30), [x1, y1] = P(u + wide / 2, v + wide * 0.30);
    const bw = x1 - x0, bh = y1 - y0;
    cv.convex([[x0 + bw * 0.18, y0], [x1 - bw * 0.18, y0], [x1 - bw * 0.06, y0 + bh * 0.42], [x0 + bw * 0.06, y0 + bh * 0.42]], INK);  // roof
    cv.roundRect(x0, y0 + bh * 0.38, bw, bh * 0.46, bh * 0.10, INK);                                                       // body
    cv.fillRect(x0 + bw * 0.06, y0 + bh * 0.80, bw * 0.18, bh * 0.22, INK);                                                // wheels
    cv.fillRect(x1 - bw * 0.24, y0 + bh * 0.80, bw * 0.18, bh * 0.22, INK);
}

/** Which picture a type gets: [name, right] ('general' for a danger sign with none of its own). */
function pictureOf(t) {
    const right = !/LEFT/.test(t);
    if (/SLIP|SPLIP|SLIPPERY|SKID/.test(t)) return ['slippery'];   // (BMW's DS_SPLIPPERY_ROAD)
    if (/JAM|QUEUE|CONGEST/.test(t)) return ['jam'];
    if (/ANIMAL|DEER|WILD/.test(t)) return ['animal'];
    if (/DOWNWARD|DESCENT|DOWNHILL/.test(t)) return ['down', right];
    if (/UPWARD|ASCENT|UPHILL/.test(t)) return ['up', right];
    if (/CURVE|BEND/.test(t)) return ['curve', right];
    return ['general'];
}

/** One sign at x, y (size wide). */
function drawSign(cv, t, x, y, size) {
    const { w, h } = signBox(size);
    if (t === 'GIVE_WAY') { triangle(cv, x, y, w, h, true, WHITE); return; }
    triangle(cv, x, y, w, h, false, YELLOW);
    const P = (u, v) => [x + u * w, y + v * h];
    const [name, right] = pictureOf(t);
    PICTURES[name](cv, P, w, right);
}

/** A row of signs from the left of cv: each size wide, gap apart; cv cleared first. */
function drawSigns(cv, types, size, gap) {
    cv.clear([0, 0, 0, 0]);
    const { h } = signBox(size);
    types.forEach((t, i) => drawSign(cv, t, i * (size + gap), Math.floor((cv.h - h) / 2), size));
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
            return listen(CAM_EVENT, onSign).then(() => { state = 'subscribed'; log.info('road signs: the camera\'s signs subscribed'); });
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
        status: () => ({ state, seen, types: Object.assign({}, types) }),
        signalsFor,
        _onSign: onSign,
    };
}

/** Samples for checking the place (Settings: Road signs on the HUD: sample). */
const SAMPLE = ['GIVE_WAY', 'DS_SPLIPPERY_ROAD', 'DS_ANIMAL_CROSSING'];

module.exports = { startSigns, parseSigns, wanted, makeTracker, drawSign, drawSigns, signBox, pictureOf, SAMPLE, CAM_IFACE, CAM_EVENT, SHOW_MS, MAX_SIGNS };
