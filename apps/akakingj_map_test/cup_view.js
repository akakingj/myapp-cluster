'use strict';
/**
 * cup_view.js - JDM 1's cup of water on the app's own page (0.43.0): the Water Cup app's view (akakingj/idrive7-apps,
 * apps/ak_water_cup) inside Cluster Layouts, so it needs no other app. JDM 1's page has its button ("Water cup
 * view"); Back (or Signals, Logs) leaves it.
 *
 * The water moves as JDM 1's cup on the cluster (layout_arc_tach.js CUP): the same G (data.js gLatZ / gLongZ: zeroed
 * while the car stands, smoothed), 2.2 times it, the same springs (1.2 a second, damping 0.09), Settings > JDM 2: G
 * meter, swap left / right for its side. Drawn with the kit's shapes (record.js fill: convex polygons, lines), worked
 * out every frame; a frame goes out only when the water moved (0.004) and at most 30 a second, so a still cup costs
 * nothing and the cluster's own frames keep the process's time.
 *
 *   view(geo?) -> { step(d, o, nowMs) -> key | null (null: nothing moved, no frame), draw(cv, t), reset() }
 *   shapes(geo, lat, lon, level) -> { body, water, surface, far } (polygons in px, each convex)
 */
const { withAlpha: alpha } = require('./kit/canvas');

const MAX_TILT = 0.6, LON_MIN = -0.22, LON_MAX = 0.32, E = 0.42, GAIN = 2.2, LEVEL = 0.5;
const WATER = '#3f8fd4', FOAM = '#86c4f2', GLASS = '#e4ecf4';
const isNum = (v) => typeof v === 'number' && isFinite(v);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A spring towards its target: step(target, dt ms) -> where it is (rounded to 0.004); step.reset(to). */
function spring(lo, hi) {
    const W = 2 * Math.PI * 1.2, Z = 0.09;
    let th = 0, v = 0;
    const step = (want, dt) => {
        if (!isNum(want)) want = 0;
        for (let left = Math.min(250, isNum(dt) ? dt : 0); left > 0; left -= 8) {
            const h = Math.min(8, left) / 1000;
            v += (-W * W * (th - want) - 2 * Z * W * v) * h;
            th = clamp(th + v * h, lo, hi);
        }
        return Math.round(Math.round(th / 0.004) * 0.004 * 1000) / 1000;
    };
    step.reset = (to) => { th = clamp(isNum(to) ? to : 0, lo, hi); v = 0; };
    return step;
}

/* ---------- the shapes (as Water Cup's cup.js) ----------
 * geo = { cx, ry (the rim's middle), aR (the rim's half width), aB (the bottom's), H (rim to bottom), e }
 * (seen a little from above: the rim and the bottom ellipses, e their height to width)
 */
const N = 48;
function bodyOf(geo, inset) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H, aBi = aB - inset, aRi = aR - inset, pts = [[cx - aRi, ry]];
    for (let i = 0; i <= N / 2; i++) {
        const a = Math.PI - (i / (N / 2)) * Math.PI;
        pts.push([cx + aBi * Math.cos(a), by + e * aBi * Math.sin(a)]);
    }
    pts.push([cx + aRi, ry]);
    return pts;
}
/** The polygon's part below the line y = y0 - (x - cx) tan(t) (Sutherland-Hodgman: a convex one stays convex). */
function below(poly, cx, y0, t) {
    const tn = Math.tan(t), f = (p) => p[1] - (y0 - (p[0] - cx) * tn), out = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
        if (fa >= 0) out.push(a);
        if ((fa >= 0) !== (fb >= 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    return out;
}
function shapes(geo, lat, lon, level) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H, inset = Math.max(3, aR * 0.035);
    const body = bodyOf(geo, 0), inner = bodyOf(geo, inset);
    for (let i = N / 2 - 1; i >= 1; i--) { const a = Math.PI + (i / (N / 2)) * Math.PI; body.push([cx + aR * Math.cos(a), ry + e * aR * Math.sin(a)]); }
    const yw = by - level * H, aw = aR + (aB - aR) * ((yw - ry) / H) - inset, bw = Math.max(0, (e + lon) * aw), tn = Math.tan(lat);
    const water = below(inner, cx, yw, lat);
    const surface = [], far = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * 2 * Math.PI, x = aw * Math.cos(a), y = yw - x * tn + bw * Math.sin(a);
        surface.push([cx + x, y]);
        if (Math.sin(a) <= 0) far.push([cx + x, y]);
    }
    far.sort((p, q) => p[0] - q[0]);
    return { body, water, surface, far };
}
/** Points along an ellipse from angle a0 to a1 (radians; 0 .. pi the near half, below). */
function ellipse(cx, cy, a, b, a0, a1) {
    const pts = [], n = 32;
    for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; pts.push([cx + a * Math.cos(t), cy + b * Math.sin(t)]); }
    return pts;
}
/** A sheen down the glass: a band at `at` of the half width (- left), w px wide, alpha a. */
function sheen(cv, geo, at, w, a) {
    const { cx, ry, aR, aB, H, e } = geo, by = ry + H;
    const x0 = cx + at * aR, x1 = cx + at * aB, y0 = ry + e * aR * Math.sqrt(1 - at * at) + 10, y1 = by + e * aB * Math.sqrt(1 - at * at) - 14;
    cv.quad([[x0, y0], [x0 + w, y0], [x1 + w * aB / aR, y1], [x1, y1]], alpha('#ffffff', a));
}

/** The view: its springs, the G it last had, what it last drew. */
function view(geo) {
    const G = geo || { cx: 800, ry: 128, aR: 150, aB: 107, H: 300, e: E };
    const lat = spring(-MAX_TILT, MAX_TILT), lon = spring(LON_MIN, LON_MAX);
    let last = null, sent = -Infinity, drawn = null, a = 0, b = 0, demo = false;
    return {
        /** Moves the water to now; the frame's key when one should go out (moved, 30 ms since the last), else null. */
        step(d, o, now) {
            const dt = last === null ? 0 : now - last;
            last = now;
            const gOf = (k) => (isNum(d[k + 'Z']) ? d[k + 'Z'] : isNum(d[k]) ? d[k] : 0), sx = 1;
            const wLat = clamp(Math.atan(GAIN * sx * gOf('gLat')), -MAX_TILT, MAX_TILT), wLon = clamp(-GAIN * gOf('gLong'), LON_MIN, LON_MAX);
            // (back after a gap - the page hidden, a slow frame: start where the G is now, no slosh from the gap)
            if (!dt || dt > 1000) { lat.reset(wLat); lon.reset(wLon); }
            a = lat(wLat, dt); b = lon(wLon, dt); demo = !!d.demo;
            const key = a + ',' + b + ',' + demo;
            if (key === drawn || now - sent < 30) return null;
            drawn = key; sent = now;
            return key;
        },
        /** Forget what was drawn: the next step sends a frame. */
        reset() { drawn = null; sent = -Infinity; },
        draw(cv, t) {
            const s = shapes(G, a, b, LEVEL), { cx, ry, aR, aB, e } = G, by = ry + G.H;
            // the glass behind: a faint tint, the bottom's far half, the rim's far half
            cv.fill(s.body, alpha(GLASS, 0.06));
            cv.fill(ellipse(cx, by, aB, e * aB, Math.PI, 2 * Math.PI), alpha(GLASS, 0.05));
            cv.stroke(ellipse(cx, by, aB, e * aB, Math.PI, 2 * Math.PI), 2, alpha(GLASS, 0.25));
            cv.stroke(ellipse(cx, ry, aR, e * aR, Math.PI, 2 * Math.PI), 3, alpha(GLASS, 0.55));
            // the water, its surface (lighter), the far edge's glint where it rides up the glass
            if (s.water.length >= 3) cv.fill(s.water, alpha(WATER, 0.85));
            cv.fill(s.surface, FOAM);
            cv.stroke(s.far, 3, alpha('#ffffff', 0.55));
            // the glass in front: a veil, two sheens down the walls, the outline, the rim's near half, the bottom's
            cv.fill(s.body, alpha('#ffffff', 0.04));
            sheen(cv, G, -0.62, 14, 0.2);
            sheen(cv, G, 0.72, 6, 0.12);
            cv.line(cx - aR, ry, cx - aB, by, 3, alpha(GLASS, 0.85));
            cv.line(cx + aR, ry, cx + aB, by, 3, alpha(GLASS, 0.85));
            cv.stroke(ellipse(cx, by, aB, e * aB, 0, Math.PI), 3, alpha(GLASS, 0.85));
            cv.stroke(ellipse(cx, ry, aR, e * aR, 0, Math.PI), 4, alpha(GLASS, 0.9));
            if (demo) cv.text('DEMO', cx + aR + 40, ry + 14, 16, t.dim, { font: 'bold' });
        },
        get state() { return { lat: a, lon: b }; },
    };
}

module.exports = { view, shapes, spring, below, MAX_TILT, LON_MIN, LON_MAX, GAIN, LEVEL };
