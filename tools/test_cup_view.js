'use strict';
/**
 * test_cup_view.js - JDM 1's water cup on the app's page (apps/akakingj_cluster_layouts/cup_view.js): the water
 * follows the G as the cluster's cup (2.2 times, higher on the outside of a bend, swapped with JDM 2's setting), rings
 * down, sends a frame only when it moved and at most 30 a second, its shapes convex (record.js fill), and a frame
 * costs little:
 *   node tools/test_cup_view.js
 */
const assert = require('assert');
const path = require('path');
require('./scene');     // (its loader hook: the app's './kit/...' from the kit)
const APP = path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts');
const CV = require(path.join(APP, 'cup_view'));
const { Recorder, OP } = require(path.join(__dirname, '..', 'kit', 'runtime', 'record'));
const themes = require(path.join(__dirname, '..', 'kit', 'runtime', 'themes'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
/** Runs the view at 60 ticks a second for ms; the frames it would send. */
const run = (v, d, o, t0, ms) => { let n = 0; for (let t = t0; t <= t0 + ms; t += 16) if (v.step(d, o, t) !== null) n++; return n; };
const convex = (pts) => {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
        const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(z) < 1e-6) continue;
        if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
    }
    return true;
};

check('still: one frame, then none while the water lies still', () => {
    const v = CV.view();
    assert(v.step({ gLatZ: 0, gLongZ: 0 }, {}, 1000) !== null);
    assert.strictEqual(run(v, { gLatZ: 0, gLongZ: 0 }, {}, 1016, 2000), 0);
});
check('a bend: the surface tilts towards atan(2.2 g), higher on the outside; frames at most 30 a second', () => {
    const v = CV.view();
    v.step({ gLatZ: 0 }, {}, 0);
    const n = run(v, { gLatZ: 0.3 }, {}, 16, 1000);
    assert(n > 5 && n <= 34, n + ' frames');
    run(v, { gLatZ: 0.3 }, {}, 1016, 8000);
    assert(Math.abs(v.state.lat - Math.atan(2.2 * 0.3)) < 0.01, 'lat ' + v.state.lat);
});
check('no swap any more (every app\'s G as the driver feels it): an old gFlipLat left in a setting changes nothing', () => {
    const v = CV.view();
    v.step({ gLatZ: 0 }, {}, 0);
    run(v, { gLatZ: 0.3 }, { gFlipLat: 'on' }, 16, 8000);
    assert(v.state.lat > 0.5, 'lat ' + v.state.lat);
});
check('hard: at most its tilt; braking to the far side, accelerating to the near', () => {
    const v = CV.view();
    v.step({}, {}, 0);
    run(v, { gLatZ: 2, gLongZ: -1 }, {}, 16, 8000);
    assert(Math.abs(v.state.lat - CV.MAX_TILT) < 0.005 && Math.abs(v.state.lon - CV.LON_MAX) < 0.005, JSON.stringify(v.state));
    run(v, { gLatZ: 0, gLongZ: 1 }, {}, 8016, 8000);
    assert(Math.abs(v.state.lon - CV.LON_MIN) < 0.005, JSON.stringify(v.state));
});
check('a step: it sloshes past and rings down (a spring, little damped)', () => {
    const v = CV.view();
    v.step({ gLatZ: 0 }, {}, 0);
    let peak = 0;
    for (let t = 16; t < 3000; t += 16) { v.step({ gLatZ: 0.2 }, {}, t); peak = Math.max(peak, v.state.lat); }
    assert(peak > Math.atan(0.44) * 1.3, 'peak ' + peak);
});
check('back after a gap (the page hidden): it starts where the G is, no slosh from the gap', () => {
    const v = CV.view();
    v.step({ gLatZ: 0 }, {}, 0);
    v.step({ gLatZ: 0.3 }, {}, 5000);
    assert(Math.abs(v.state.lat - Math.atan(0.66)) < 0.005);
});
check('the shapes are convex at every tilt and level (record.js fill takes convex ones)', () => {
    const geo = { cx: 800, ry: 128, aR: 150, aB: 107, H: 300, e: 0.42 };
    for (const lat of [-0.6, -0.3, 0, 0.3, 0.6]) for (const lon of [-0.22, 0, 0.32]) {
        const s = CV.shapes(geo, lat, lon, CV.LEVEL);
        ['body', 'water', 'surface'].forEach((k) => assert(convex(s[k]), k + ' at ' + lat + ', ' + lon));
    }
});
check('a frame: filled shapes, quick to work out and draw', () => {
    const v = CV.view(), t = themes.theme('m_tricolour');
    v.step({ gLatZ: 0.4 }, {}, 0);
    const t0 = process.hrtime();
    for (let i = 1; i <= 200; i++) { v.step({ gLatZ: 0.4 * Math.sin(i / 10) }, {}, i * 33); const cv = new Recorder(1600, 520); v.draw(cv, t); }
    const dt = process.hrtime(t0), ms = (dt[0] * 1e3 + dt[1] / 1e6) / 200;
    const cv = new Recorder(1600, 520); v.draw(cv, t);
    const u = cv.words(); let tris = 0;
    for (let i = 0; i < u.length; i++) if (u[i] === OP.TRIS) tris++;
    assert(tris >= 4, tris + ' filled shapes');
    assert(ms < 3, ms.toFixed(2) + ' ms a frame');
    console.log('     ' + ms.toFixed(2) + ' ms a frame here');
});
check('the software path: a filled shape plays back as one (no seams where its triangles meet)', () => {
    const { Canvas } = require(path.join(__dirname, '..', 'kit', 'runtime', 'canvas'));
    const { play } = require(path.join(__dirname, '..', 'kit', 'runtime', 'record'));
    const r = new Recorder(200, 200), pts = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI; pts.push([100 + 80 * Math.cos(a), 100 + 60 * Math.sin(a)]); }
    r.fill(pts, 'rgba(63,143,212,0.85)');
    const c = new Canvas(200, 200); play(r.words(), c);
    const px = (x, y) => Array.from(c.d.slice((y * 200 + x) * 4, (y * 200 + x) * 4 + 4)).join();
    const mid = px(100, 100);
    for (let y = 60; y <= 140; y += 7) for (let x = 40; x <= 160; x += 9) {
        if (((x - 100) / 72) ** 2 + ((y - 100) / 52) ** 2 < 1) assert.strictEqual(px(x, y), mid, 'at ' + x + ', ' + y);
    }
});
console.log(ok + ' passed');
