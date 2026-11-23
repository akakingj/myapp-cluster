'use strict';

// Cluster Info's panel over the Waze map (apps/akakingj_cluster_info/overlay.js) against a fake cluster render client and a status.json
// in a temp folder: where the badge goes on each target, that it shows only while the map shows and a reading
// exists, and that updates carry only what changed. Also writes a preview of the badge:
//   node kit/tools/test_cluster_info_overlay.js [preview.png]

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..'), KIT = path.join(ROOT, 'kit', 'runtime');
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req.startsWith('./kit/')) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.call(this, req, parent, isMain);
};
const { startOverlay, mapRect, badgeRect, drawBadge, changed, parseStatus, underStrip } = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'overlay.js'));
const { Canvas } = require(path.join(KIT, 'canvas'));
const themes = require(path.join(KIT, 'themes'));
const theme = themes.theme('m_tricolour');

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

/* ---------- geometry ---------- */
check('cluster map: the whole 1088x480 scene', () => assert.deepStrictEqual(mapRect('map', 0), { x: 0, y: 0, w: 1088, h: 480 }));
check('panel: the centred map area', () => assert.deepStrictEqual(mapRect('panel', 0), { x: 416, y: 120, w: 1088, h: 480 }));
check('HUD standard: 452x200 at 173,140 (as waze-on-cluster scales it)', () => assert.deepStrictEqual(mapRect('hud', 0), { x: 173, y: 140, w: 452, h: 200 }));
check('HUD at 85 %, at the right edge, both values: 52-60 high, ends inside what the HUD shows (x 680)', () => {
    const r = mapRect('hud', 85), b = badgeRect(r, 'bottom', 'hud', 2), kwOnly = badgeRect(r, 'bottom', 'hud', 0);
    assert(b.h >= 52 && b.h <= 60 && b.x >= 405 && b.x + b.w <= 680, JSON.stringify(b));
    assert.strictEqual(kwOnly.x + kwOnly.w, 676, 'a narrow panel sits at the right edge too');
});
check('HUD always, map on the cluster: the panel sits where it does with the map on the HUD (same HUD size)', () => {
    assert.deepStrictEqual(badgeRect(mapRect('hud', 85), 'bottom', 'hud', 2), badgeRect(mapRect('hud', 85), 'bottom', 'hud', 2));
});
check('HUD widest: 85 % (680x300), 100 % is held to it', () => { assert.deepStrictEqual(mapRect('hud', 85), mapRect('hud', 100)); assert.strictEqual(mapRect('hud', 85).w, 680); });
check('unknown target: none', () => assert.strictEqual(mapRect('nope', 0), null));
check('badge inside the map, bottom and top', () => {
    ['map', 'hud', 'panel'].forEach((tg) => [0, 40, 70, 100].forEach((pct) => ['bottom', 'top'].forEach((w) => {
        const r = mapRect(tg, pct), b = badgeRect(r, w, tg);
        assert(b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h, tg + ' ' + pct + ' ' + w);
        assert(b.w % 4 === 0 && b.h % 2 === 0 && b.w >= 100);
    })));
    // (1.9.0: 12 px wider than with Ubuntu, the kW's figures in IBM Plex measured wider; 1.9.1: 28 px narrower,
    // its text smaller and its figures' column for "188" / "-88")
    assert.deepStrictEqual(badgeRect(mapRect('map', 0), 'bottom', 'map'), { x: 448, y: 376, w: 192, h: 72, ph: 72 });   // 1.3x, near the map's bottom (below the car's arrow, above the dimmed edge)
    assert.deepStrictEqual(badgeRect(mapRect('hud', 0), 'bottom', 'hud'), { x: 461, y: 276, w: 160, h: 60, ph: 60 });   // the HUD's, at the map's right edge
});

/* ---------- drawing and diffs ---------- */
const pw = (kw) => ({ kw, text: kw == null ? '--' : (kw < -0.3 ? '-' : '') + Math.abs(kw).toFixed(Math.abs(kw) < 10 ? 1 : 0), col: kw < -0.3 ? '#2fd27a' : theme.text });
check('the badge draws: opaque-ish backdrop, transparent corners', () => {
    const cv = new Canvas(200, 56);
    drawBadge(cv, theme, pw(23), 100, 50);
    assert.strictEqual(cv.d[3], 0, 'corner transparent');
    assert(cv.d[(28 * 200 + 100) * 4 + 3] > 150, 'middle covered');
});
check('a changed value: only its rectangles', () => {
    const a = new Canvas(200, 56), b = new Canvas(200, 56);
    drawBadge(a, theme, pw(23), 100, 50); drawBadge(b, theme, pw(23), 100, 50);
    assert.strictEqual(changed(a.d, b.d, 200, 56, 100), null);
    drawBadge(b, theme, pw(-12), 100, 50);
    const r = changed(a.d, b.d, 200, 56, 100);
    assert(r && r.length === 2);
    assert(r.reduce((n, x) => n + x.w * x.h, 0) < 200 * 56);
});

/* ---------- following the map ---------- */
class FakeCR extends EventEmitter {
    constructor(app) { super(); this.app = app; this.layers = new Map(); this.next = 1; this.log = []; FakeCR.last = this; }
    connect() { this.connected = true; setImmediate(() => this.emit('ready')); }
    close() { this.connected = false; }
    image(o) { const r = this.next++; this.layers.set(r, Object.assign({}, o)); this.log.push(['image', r, o]); return r; }
    set(r, o) { Object.assign(this.layers.get(r), o); this.log.push(['set', r, o]); }
    drop(r) { this.layers.delete(r); this.log.push(['drop', r]); }
    pixels(r, rects, px) {
        const l = this.layers.get(r);
        const need = rects ? rects.reduce((n, x) => n + x.w * x.h * 4, 0) : l.iw * l.ih * 4;
        assert.strictEqual(px.length, need, 'pixel bytes match');
        this.log.push(['pixels', r, rects]);
    }
}

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'woc-'));
    const status = path.join(dir, 'status.json');
    const write = (o) => { fs.writeFileSync(status + '.tmp', JSON.stringify(o)); fs.renameSync(status + '.tmp', status); };
    const settings = { v: { show: 'map', place: 'bottom', bar: 'on' }, get(k) { return this.v[k]; } };
    const logs = [];
    const log = { info: (m) => logs.push(m), warn: (m) => logs.push('WARN ' + m) };
    let kw = 18, fast = 0, t = 1e6;
    let ind = 'off';
    const lv = { power: () => (kw === null ? null : pw(kw)), limits: () => ({ outMax: 100, inMax: 60 }), keepFast: () => { fast++; }, indicator: () => ind, night: () => night, extras: () => extras };
    let night = false, extras = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms || 30));
    const claims = path.join(dir, 'mgu-hud'); fs.mkdirSync(claims);
    const ov = startOverlay({ settings, log, theme: () => theme }, lv, { statusPath: status, ClusterRender: FakeCR, now: () => t, setInterval: () => 0, clearInterval: () => {}, hudClaims: claims });
    const step = async () => { ov._read(); await wait(); };

    await step();
    check('no status file: nothing, no connection', () => { assert.strictEqual(ov.shown(), false); assert(!FakeCR.last); });

    write({ state: 'waiting', target: 'map', hud_width_pct: 0 });
    await step();
    check('map not showing: still nothing', () => { assert.strictEqual(ov.shown(), false); assert(!FakeCR.last); });

    write({ state: 'showing', target: 'map', hud_width_pct: 0 });
    await step();
    await wait();
    const cr = FakeCR.last;
    check('map showing on the cluster: an overlay layer at its bottom, shown, fast reads asked', () => {
        assert(cr && cr.app === 'akakingj_cluster_info');
        const l = [...cr.layers.values()][0];
        assert.strictEqual(l.target, 'map'); assert.strictEqual(l.klass, 'overlay');
        assert.deepStrictEqual([l.x, l.y, l.w, l.h], [448, 376, 192, 72]);
        assert.strictEqual(l.visible, true); assert(ov.shown()); assert(fast > 0);
        assert(cr.log.some((e) => e[0] === 'pixels' && e[2] === null), 'whole image first');
    });

    let n = cr.log.length;
    t += 100; ov._tick();
    check('nothing new within 250 ms of the last: no update', () => assert.strictEqual(cr.log.length, n));
    t += 16; kw = 40; ov._tick();
    check('a new value: drawn at once (the next frame), only the rectangles that changed', () => {
        const e = cr.log.slice(n).find((x) => x[0] === 'pixels');
        assert(e && Array.isArray(e[2]) && e[2].length >= 1);
    });
    t += 300;
    n = cr.log.length;
    t += 300; ov._tick();
    check('the same value again: nothing sent', () => assert.strictEqual(cr.log.length, n));

    kw = null; t += 300; ov._tick();
    check('no reading (parked): hidden', () => { assert.strictEqual(ov.shown(), false); assert.strictEqual([...cr.layers.values()][0].visible, false); });
    kw = 5; t += 300; ov._tick();
    check('a reading again: shown', () => assert(ov.shown()));

    write({ state: 'showing', target: 'hud', hud_width_pct: 0 });
    await step();
    check('the map moves to the HUD: the old layer dropped, a new one inside the HUD map', () => {
        assert(cr.log.some((e) => e[0] === 'drop'));
        const l = [...cr.layers.values()][0];
        const r = mapRect('hud', 0);
        assert.strictEqual(l.target, 'hud');
        assert(l.x >= r.x && l.y + l.h <= r.y + r.h && l.w < 200, JSON.stringify(l));
        assert(ov.shown());
    });

    write({ state: 'waiting', target: 'hud', hud_width_pct: 0, reason: 'a HUD pop-up is open' });
    await step();
    check('a HUD pop-up (the map waits): hidden, so it never asks for the slot', () => {
        assert.strictEqual(ov.shown(), false); assert.strictEqual([...cr.layers.values()][0].visible, false);
    });
    write({ state: 'showing', target: 'hud', hud_width_pct: 0 });
    await step();

    /* ---------- directions on the HUD (lv.nav(): nav.js's turn), only while the panel is on the HUD ---------- */
    let navM = null;
    lv.nav = () => navM;
    const NV = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'nav_view.js'));
    // (the directions: 173 x 132 with the panel to the glass, 149 x 114 over a Waze map on the HUD)
    const MS = NV.sizeAt(NV.MAP_SCALE), isNav = (l) => (l.w === NV.W && l.h === NV.H) || (l.w === MS.W && l.h === MS.H);
    const navLayer = () => [...cr.layers.values()].find(isNav);
    ov._navTick();
    check('directions: no route, no layer', () => { assert(!navLayer()); assert.strictEqual(ov.nav().shown, false); });
    navM = { kind: 'turn', dir: 'RIGHT', dist: '350', unit: 'm', road: 'Example Road' };
    ov._navTick();
    check('directions: a turn, the panel on the HUD: a layer above it, its right edge with the panel\'s', () => {
        const l = navLayer(), p = [...cr.layers.values()][0];
        assert(l && l.target === 'hud' && l.visible === true && ov.nav().shown, JSON.stringify(l));
        assert.strictEqual(l.x + l.w, Math.min(672, p.x + p.w)); assert(l.y + l.h <= p.y - 4 && l.y >= 148, JSON.stringify([l, p]));
        assert(ov.navCan());
    });
    let nn = cr.log.length;
    ov._navTick();
    check('directions: the same turn again: nothing sent', () => assert.strictEqual(cr.log.length, nn));
    navM = Object.assign({}, navM, { dist: '300' });
    ov._navTick();
    check('directions: nearer: drawn again', () => assert(cr.log.slice(nn).some((e) => e[0] === 'pixels')));
    write({ state: 'showing', target: 'map', hud_width_pct: 0 });
    await step();
    ov._navTick();
    check('directions: the panel off the HUD (BMW\'s own card shows the turns): hidden', () => {
        assert.strictEqual(ov.nav().shown, false); assert.strictEqual(navLayer().visible, false); assert(!ov.navCan());
    });
    write({ state: 'showing', target: 'hud', hud_width_pct: 0 });
    await step();
    ov._navTick();
    check('directions: back on the HUD with the panel', () => assert(ov.nav().shown));
    fs.writeFileSync(path.join(claims, 'redline'), JSON.stringify({ held: true }));
    t += 2000; fs.utimesSync(path.join(claims, 'redline'), t / 1000, t / 1000); ov._navTick();
    check('directions: another app holds the HUD (Redline): hidden', () => assert.strictEqual(ov.nav().shown, false));
    fs.unlinkSync(path.join(claims, 'redline'));
    t += 2000; navM = null; ov._navTick(); ov._tick();
    check('directions: the route over: hidden', () => assert.strictEqual(ov.nav().shown, false));
    // (the fake's directions layer taken out: the panel's checks below look at the first layer there)
    for (const [r, l] of cr.layers) if (isNav(l)) cr.layers.delete(r);

    settings.v.show = 'off'; t += 300; ov._tick();
    check('setting off: hidden', () => assert.strictEqual(ov.shown(), false));
    settings.v.show = 'map'; settings.v.place = 'top'; t += 300; ov._tick();
    check('setting top: at the top of the map', () => {
        const l = [...cr.layers.values()][0], r = mapRect('hud', 0);
        assert(l.y < r.y + 20 && ov.shown(), JSON.stringify(l));
    });

    settings.v.place = 'bottom';
    write({ state: 'showing', target: 'map', hud_width_pct: 70 });
    await step();
    settings.v.show = 'hud'; t += 300; ov._tick();
    check('Always on the HUD, the map on the cluster: the panel to the glass (no map on the HUD to sit in), at its bottom right', () => {
        const l = [...cr.layers.values()][0], b = badgeRect(Object.assign({ glass: true }, mapRect('hud', 70)), 'bottom', 'hud', 0, true);
        assert.deepStrictEqual([b.x + b.w, b.y + b.h, b.h], [672, 352, 58]);
        assert.strictEqual(l.target, 'hud'); assert(ov.shown());
        assert.deepStrictEqual([l.x, l.y, l.w, l.h], [b.x, b.y, b.w, b.h]);
    });
    fs.unlinkSync(status);
    await step();
    t += 300; ov._tick();
    check('Always on the HUD: shown without Waze on cluster too', () => assert(ov.shown()));
    kw = null; t += 300; ov._tick();
    check('Always on the HUD, no reading: hidden', () => assert.strictEqual(ov.shown(), false));
    settings.v.show = 'map'; kw = 5; t += 300; ov._tick();
    check('Waze on cluster stopped (status gone): hidden', () => assert.strictEqual(ov.shown(), false));
    /* extras, brightness, night */
    settings.v.show = 'map'; settings.v.place = 'bottom';
    write({ state: 'showing', target: 'hud', hud_width_pct: 0 });
    await step();
    extras = [{ label: 'BATT', text: '24°' }, { label: 'OIL', text: '88°' }]; t += 300; ov._tick();
    let ml = [...cr.layers.values()].find((l) => l.klass === 'overlay' && l.w > 100);
    check('two extras: the meter wider, still inside the HUD map', () => {
        const r = mapRect('hud', 0);
        assert(ml && ml.w > 140 && ml.x >= r.x && ml.x + ml.w <= r.x + r.w, JSON.stringify(ml));
    });
    settings.v.hudBrightness = 50; t += 300; ov._tick();
    check('HUD brightness 50 %: the meter at half opacity', () => assert.strictEqual(ml.opacity, 0.5));
    settings.v.hudBrightness = 100; night = true; t += 300; ov._tick();
    check('night: dimmer', () => assert(ml.opacity < 1 && ml.opacity > 0.4));
    settings.v.nightDim = 'off'; t += 300; ov._tick();
    check('night dimming off: full', () => assert.strictEqual(ml.opacity, 1));
    check('status for the diagnostics', () => { const st = ov.status(); assert(/connected|connecting/.test(st.renderer) && /hud/.test(st.map)); });
    extras = []; night = false; settings.v.nightDim = 'on';

    /* the kW without its bar on the HUD (setting bar 'cluster', the default), with it on the cluster */
    t += 300; ov._tick();
    const withBar = [...cr.layers.values()].find((l) => l.klass === 'overlay' && l.visible && l.h > 30);
    settings.v.bar = 'cluster'; t += 300; ov._tick();
    const noBar = [...cr.layers.values()].find((l) => l.klass === 'overlay' && l.visible && l.h > 30);
    check('kW only on the HUD: a narrower panel without the bar', () => assert(withBar && noBar && noBar.w < withBar.w, JSON.stringify([withBar && withBar.w, noBar && noBar.w])));
    check('the panel geometry without a bar is narrower than with it', () => {
        const r = mapRect('hud', 70);
        assert(badgeRect(r, 'bottom', 'hud', 2, 'number').w < badgeRect(r, 'bottom', 'hud', 2, true).w || badgeRect(r, 'bottom', 'hud', 2, 'number').h > badgeRect(r, 'bottom', 'hud', 2, true).h);
    });
    settings.v.bar = 'on';

    /* the kW meter in any slot: drawn after the values in slots before it */
    check('the kW meter in the middle slot: a value, the meter, a value (pixels differ from meter-first)', () => {
        const ex = [{ label: 'OIL', text: '88°', slot: 0 }, { label: 'BATT', text: '24°', slot: 2 }];
        const b = badgeRect(mapRect('map', 0), 'bottom', 'map', 2, true);
        const a1 = new Canvas(b.w, b.h), a2 = new Canvas(b.w, b.h);
        drawBadge(a1, theme, Object.assign(pw(12), { bar: true }), 100, 50, ex, 0);
        drawBadge(a2, theme, Object.assign(pw(12), { bar: true }), 100, 50, ex, 1);
        assert(changed(a1.d, a2.d, b.w, b.h, Math.round(b.w / 2)));
        // the left quarter of meter-in-the-middle holds a value's text, no bar track
        const q = Math.round(b.w / 4);
        let lit = 0;
        for (let y = 0; y < b.h; y++) for (let x = 0; x < q; x++) if (a2.d[(y * b.w + x) * 4] > 200) lit++;
        assert(lit > 0);
    });

    /* no power provider (a car without eDrive Live): the values alone */
    kw = null; extras = [{ label: 'OIL', text: '88°' }, { label: 'COOL', text: '90°' }]; t += 300; ov._tick();
    ml = [...cr.layers.values()].find((l) => l.klass === 'overlay' && l.w > 60 && l.h > 30 && l.visible);
    check('no power, two values: a values-only panel, narrower than with the meter', () => assert(ov.shown() && ml && ml.w < 232, JSON.stringify(ml)));
    extras = [{ label: 'OIL', text: '--' }]; t += 300; ov._tick();
    check('nothing with a reading: hidden', () => assert.strictEqual(ov.shown(), false));
    kw = 5; extras = [];

    /* turn signals: arrows on the HUD, blinking by opacity only */
    const sets = () => cr.log.filter((e) => e[0] === 'set').length;
    ov._arrowTick();
    check('no signal: no arrows', () => assert(!ov.arrows().shown && !ov.arrows().refs.left));
    ind = 'left'; t += 10; ov._arrowTick();
    const refs = ov.arrows().refs, la = cr.layers.get(refs.left), ra = cr.layers.get(refs.right);
    check('left: both arrows made on the HUD, small, at its top; the left lit at once', () => {
        assert(la.target === 'hud' && ra.target === 'hud' && la.y < 200 && la.w <= 32 && la.x < ra.x);
        assert(ov.arrows().shown && la.visible && la.opacity === 1 && ra.opacity === 0);
    });
    const px0 = cr.log.filter((e) => e[0] === 'pixels').length;
    t += 400; ov._arrowTick();
    check('blinks at the cluster arrow rate: off after 335 ms', () => assert(la.opacity === 0 && la.visible));
    t += 400; ov._arrowTick();
    check('and on again, with no pixels sent', () => assert(la.opacity === 1 && cr.log.filter((e) => e[0] === 'pixels').length === px0));
    const n0 = sets();
    t += 50; ov._arrowTick();
    check('nothing sent between flashes', () => assert.strictEqual(sets(), n0));
    ind = 'both'; t += 10; ov._arrowTick();
    check('hazards: both lit', () => assert(la.opacity === 1 && ra.opacity === 1));
    // the flash edges where the cluster's are (measured: 640 ms a flash, 638 by the head unit's clock, lit 335, the
    // head unit told 40 ms after the cluster's first flash)
    const seq = [];
    ind = 'right'; ov._arrowTick(); seq.push(ra.opacity);
    for (const dt of [290, 10, 290, 10]) { t += dt; ov._arrowTick(); seq.push(ra.opacity); }
    check('flash timing: lit to 295 ms after the stalk news, dark, lit again from 598 ms', () => assert.deepStrictEqual(seq, [1, 1, 0, 0, 1]));
    ind = 'off'; t += 10; ov._arrowTick();
    check('let go: dark, still placed for a moment', () => assert(la.opacity === 0 && ov.arrows().shown));
    t += 1300; ov._arrowTick();
    check('then hidden (the HUD slot let go)', () => assert(!ov.arrows().shown && !la.visible));
    settings.v.turnSignals = 'off'; ind = 'right'; t += 10; ov._arrowTick();
    check('setting off: no arrows', () => assert(!ov.arrows().shown));
    // another app holding the HUD (the idrive7-apps kit's claim: Redline's HUD): the arrows and a panel on the HUD step aside
    settings.v.turnSignals = 'on'; ind = 'off'; t += 1300; ov._arrowTick();
    const touch = (f, at, body) => { fs.writeFileSync(path.join(claims, f), body === undefined ? '{"held": true}\n' : body); fs.utimesSync(path.join(claims, f), at / 1000, at / 1000); };
    touch('redline', t); touch('cluster_functions.standing', t, '{"on": true}\n');
    touch('other_app', t, '{"held": false}\n');                // (given back: not held)
    touch('stale_app', t + 3600000);                              // (an hour ahead: from before the clock went back)
    t += 1100; ind = 'right'; ov._arrowTick();
    check('the HUD held by Redline: no turn arrows there', () => assert(!ov.arrows().shown));
    check('the status says who holds it: Redline only (given back, ahead of the clock: not)', () => assert.strictEqual(ov.status().hud, 'held by redline (panel and arrows step aside)'));
    settings.v.show = 'hud'; t += 300; ov._tick();
    check('the HUD held: no panel on the HUD', () => assert.strictEqual(ov.shown(), false));
    settings.v.show = 'map'; t += 300; ov._tick();
    check('the Waze map on the HUD (status: target hud): the panel on it steps aside too', () => assert.strictEqual(ov.shown(), false));
    kw = 40; write({ state: 'showing', target: 'map', hud_width_pct: 0 }); await step(); t += 300; ov._tick();
    check('the Waze map on the cluster: the panel there, not affected', () => assert.strictEqual(ov.shown(), true));
    touch('redline', t, '{"held": false}\n'); t += 1100; ov._arrowTick();       // (Redline's HUD turned off: given back at once)
    check('given back: the arrows back at once, not 6 s later', () => assert(ov.arrows().shown));
    touch('redline', t); t += 1100; ov._arrowTick();
    check('held again: aside', () => assert(!ov.arrows().shown));
    t += 6000; ov._arrowTick();       // (not touched for 6 s: Redline stopped)
    check('the claim gone stale: the arrows back', () => assert(ov.arrows().shown));
    check('and the status says free', () => assert.strictEqual(ov.status().hud, 'free'));

    // (2026-11-15) where Redline puts its own with its rev counter off: near the top of what a G20 shows (y 114, not 86:
    // the arrows at 86 lost their top on the car), at 240 and 530; no lane change warning (1.6.24: the service isn't there)
    ind = 'left'; t += 1300; ov._arrowTick(); t += 10; ov._arrowTick();
    const lar = cr.layers.get(refs.left), rar = cr.layers.get(refs.right);
    check('the arrows at Redline\'s place: near the top of a G20\'s glass, far apart', () => {
        assert(lar.x === 240 && rar.x === 530 && lar.y === 114 && rar.y === 114, [lar.x, rar.x, lar.y].join(' '));
        assert(rar.x - (lar.x + lar.w) >= 150, 'the two arrows well apart: ' + (rar.x - (lar.x + lar.w)) + ' px');
        assert(lar.y >= 100 && rar.x + rar.w <= 676, 'in what a G20 shows');
    });
    /* the lane change warning (1.6.25: the door mirror lamps from the BDC, blindspot.js): outside each arrow, this car
     * and the other's bonnet (the sign of 1.6.12-1.6.23), steady while a car is there, the turn signal or not */
    let lw = null;
    lv.blindSpot = () => lw || { left: 0, right: 0 };
    ov._lcwTick();
    check('lane change warning: nothing beside, no sign made', () => assert(!ov.lcw().refs.left && !ov.lcw().refs.right));
    lw = { left: 1, right: 0 }; t += 10; ov._lcwTick();
    const lst = cr.layers.get(ov.lcw().refs.left);
    check('a car on the left: the left sign on, outside the left arrow, at Redline\'s place', () => {
        assert(lst && lst.target === 'hud' && lst.visible && lst.opacity === 1, JSON.stringify(lst));
        assert(lst.x === 200 && lst.y === 104 && lst.x + lst.w <= lar.x, 'x ' + lst.x + ', y ' + lst.y);
        assert(!ov.lcw().shown.right);
    });
    const nL = cr.log.length;
    ind = 'left'; ov._arrowTick(); ov._lcwTick(); t += 400; ov._arrowTick(); ov._lcwTick();
    check('turn signal toward it: the sign as it was, steady, nothing sent for it', () => assert(lst.visible && lst.opacity === 1 && !cr.log.slice(nL).some((e) => e[0] === 'set' && e[1] === ov.lcw().refs.left)));
    lw = { left: 0, right: 1 }; t += 10; ov._lcwTick();
    const rfl = cr.layers.get(ov.lcw().refs.right);
    check('the car now on the right: left off, right on, outside the right arrow', () => {
        assert(!lst.visible && rfl && rfl.visible && rfl.x >= rar.x + rar.w && rfl.x + rfl.w === 600, 'x ' + (rfl && rfl.x));
    });
    settings.v.blindSpot = 'off'; lw = { left: 1, right: 1 }; t += 10; ov._lcwTick();
    check('setting off: no sign', () => assert(!lst.visible && !rfl.visible));
    settings.v.blindSpot = 'on'; t += 10; ov._lcwTick();
    lw = null; t += 10; ov._lcwTick();
    check('no car: no sign', () => assert(!lst.visible && !rfl.visible));
    ind = 'left'; t += 1300; ov._arrowTick(); t += 10; ov._arrowTick();
    lw = { left: 1, right: 0 };
    settings.v.show = 'off'; t += 10; ov._arrowTick(); ov._lcwTick(); t += 1300; ov._arrowTick();
    check('Show the panel Off: no arrows and no sign either (one switch)', () => assert(!ov.arrows().shown && !lst.visible));
    lw = null; ov._lcwTick();
    settings.v.show = 'map';
    // (2026-11-15) the panel at the top of an 85 % HUD map with the kW and two values reaches the arrows' place: they go
    // just under it, and back when it goes
    ind = 'left';
    write({ state: 'showing', target: 'hud', hud_width_pct: 85 });
    await step();
    settings.v.place = 'top'; kw = 20; extras = [{ label: 'OIL', text: '88°' }, { label: 'COOL', text: '90°' }]; t += 300; ov._tick();
    t += 10; ov._arrowTick();
    const badge = [...cr.layers.values()].find((l) => l.target === 'hud' && l.z === 10 && l.visible);
    const larT = cr.layers.get(ov.arrows().refs.left);
    check('a wide map\'s panel at the top: the arrows just under it, still in what a G20 shows', () => {
        assert(badge, 'the panel on the HUD');
        assert(larT.y >= badge.y + badge.h, 'arrow ' + larT.y + ', panel ends ' + (badge.y + badge.h));
        assert(larT.y + larT.h <= 221, 'arrow ends ' + (larT.y + larT.h));
    });
    settings.v.place = 'bottom'; t += 300; ov._tick(); t += 10; ov._arrowTick();
    check('the panel back at the bottom: the arrows back at the top', () => assert(larT.y === 114, String(larT.y)));
    ind = 'off'; kw = null; extras = [];
    ov.stop();

    if (process.argv[2]) {
        const big = new Canvas(640, 160);
        big.clear([40, 70, 110, 255]);
        [[23, 0, 0], [-14.5, 220, 0], [4.2, 0, 80], [85, 220, 80]].forEach(([v, x, y]) => {
            const c = new Canvas(200, 56); drawBadge(c, theme, pw(v), 100, 50);
            const h = new Canvas(124, 34); drawBadge(h, theme, pw(v), 100, 50);
            [[c, x + 10, y + 10], [h, x + 10 + 0, y + 0]].slice(0, 1).forEach(([s, ox, oy]) => blend(big, s, ox, oy));
            blend(big, h, 460 + (x ? 0 : 0), y + (x ? 40 : 0) + 10);
        });
        fs.writeFileSync(process.argv[2], big.png());
        console.log('preview: ' + process.argv[2]);
    }
    /* Robert's Waze on cluster (robertnisipeanu/idrive-apps): status.json names the cluster's target and the HUD apart */
check('status: the original Waze on cluster on the cluster, on the HUD alone, on both, off', () => {
    const base = { ev: 'status', state: 'showing', target: 'map', cluster: 1, hud: 0, hud_state: 'off', hud_width_pct: 70, hud_x: 0, hud_y: 40 };
    assert.deepStrictEqual(parseStatus(base), { showing: true, target: 'map', pct: 70, hx: 0, hy: 40 });
    assert.deepStrictEqual(parseStatus(Object.assign({}, base, { cluster: 0, state: 'off', hud: 1, hud_state: 'showing' })), { showing: true, target: 'hud', pct: 70, hx: 0, hy: 40 });
    assert.strictEqual(parseStatus(Object.assign({}, base, { hud: 1, hud_state: 'showing' })).target, 'map', 'both: the cluster');
    assert.strictEqual(parseStatus(Object.assign({}, base, { state: 'idle', hud: 1, hud_state: 'starting' })).showing, false);
    // the older build's form still reads
    assert.deepStrictEqual(parseStatus({ state: 'showing', target: 'map+hud', hud_width_pct: 0 }), { showing: true, target: 'map', pct: 0, hx: 0, hy: 0 });
    assert.strictEqual(parseStatus({ state: 'showing', target: 'hud', hud_width_pct: 60 }).target, 'hud');
});
check('the HUD map moved by its offset: the panel moves with it, held inside the HUD', () => {
    const a = mapRect('hud', 70), b = mapRect('hud', 70, 0, 40), c = mapRect('hud', 70, 0, 900);
    assert.strictEqual(b.y, a.y + 40); assert.strictEqual(b.x, a.x);
    assert.strictEqual(c.y + c.h, 480, 'held inside');
    assert.deepStrictEqual(mapRect('map', 0, 50, 50), mapRect('map', 0), 'the cluster map has no offset');
    const bb = badgeRect(b, 'bottom', 'hud', 1, true, true);
    assert(bb.y + bb.h <= 400, 'the panel and its thin bar above the HUD\'s visible bottom: ' + (bb.y + bb.h));
    assert.strictEqual(badgeRect(mapRect('hud', 70, 0, -40), 'bottom', 'hud', 1).y, badgeRect(a, 'bottom', 'hud', 1).y - 40, 'moved up: follows');
});
check('the thin kW bar: in a strip above the panel, the panel where it was, the layer that much taller', () => {
    const r = mapRect('map', 0), off = badgeRect(r, 'bottom', 'map', 2, true), on = badgeRect(r, 'bottom', 'map', 2, true, true);
    const u = underStrip(off.ph);
    assert.strictEqual(on.ph, off.ph); assert.strictEqual(on.h, off.h + u.total); assert.strictEqual(on.y + on.h, off.y + off.h, 'the panel\'s bottom where it was');
    // drawn: the panel's rows the same as without the bar (one strip lower in the layer), the bar above them
    const { Canvas } = require(path.join(ROOT, 'kit', 'runtime', 'canvas'));
    const t = require(path.join(ROOT, 'kit', 'runtime', 'themes')).theme('m_tricolour');
    const cv = new Canvas(on.w, on.h), plain = new Canvas(off.w, off.h);
    const ex = [{ label: 'OIL', text: '201°' }, { label: 'COOL', text: '203°' }];
    drawBadge(cv, t, null, 100, 50, ex, 0, { kw: 30 }, on.ph);
    drawBadge(plain, t, null, 100, 50, ex, 0, null, off.ph);
    const px = (c, x, y) => Array.from(c.d.slice((y * c.w + x) * 4, (y * c.w + x) * 4 + 4)).join(',');
    let panelDiff = 0, inStrip = 0;
    for (let y = 0; y < on.h; y++) for (let x = 0; x < on.w; x++) {
        if (y >= u.total) { if (px(cv, x, y) !== px(plain, x, y - u.total)) panelDiff++; } else if (px(cv, x, y) !== '0,0,0,0') inStrip++;
    }
    assert.strictEqual(panelDiff, 0, 'the panel moved or drawn over'); assert(inStrip > 50, 'the bar drawn above it: ' + inStrip);
});
check('directions: wherever the HUD map and the panel are, never over the panel, the turn signals, the lane change signs or BMW\'s speed, and on the glass a G20 shows', () => {
    const { navRect, ARROW, LCW, HUD_SEEN } = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'overlay.js'));
    const NV = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'nav_view.js')), MS = NV.sizeAt(NV.MAP_SCALE);
    const over = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const band = { x: ARROW.left, y: ARROW.y, w: ARROW.right + ARROW.w - ARROW.left, h: ARROW.h };
    let n = 0, none = 0;
    for (const pct of [0, 40, 50, 60, 70, 80, 85]) for (const hx of [-200, -100, 0, 100]) for (const hy of [-150, -100, -60, -30, 0, 30, 60, 100, 150]) {
        for (const where of ['bottom', 'top']) for (const ex of [0, 1, 2, 3]) for (const pw of [true, 'number', false]) for (const under of [false, true]) {
            if (!pw && !ex) continue;
            const b = badgeRect(mapRect('hud', pct, hx, hy), where, 'hud', ex, pw, under);
            const sh = over(b, band) ? Math.max(0, b.y + b.h + 6 - band.y) : 0, r = navRect(b, where, sh, MS.W, MS.H);
            n++;
            if (!r) { none++; continue; }
            const keep = [b, { x: 116, y: 320, w: 236, h: 48 }, { x: ARROW.left, y: ARROW.y + sh, w: ARROW.w, h: ARROW.h }, { x: ARROW.right, y: ARROW.y + sh, w: ARROW.w, h: ARROW.h },
                { x: LCW.left, y: LCW.y + sh, w: LCW.w, h: LCW.h }, { x: LCW.right, y: LCW.y + sh, w: LCW.w, h: LCW.h }];
            keep.forEach((k) => assert(!over(r, k), JSON.stringify({ pct, hx, hy, where, r, k })));
            assert(r.x >= HUD_SEEN.x && r.x + r.w <= HUD_SEEN.x + HUD_SEEN.w && r.y >= HUD_SEEN.y && r.y + r.h <= HUD_SEEN.y + HUD_SEEN.h, JSON.stringify(r));
        }
    }
    // no Waze map on the HUD: the panel to the glass (bigger), the directions still just above it at its right edge
    for (const ex of [0, 1, 2, 3, 4]) for (const pw of [true, 'number', false]) for (const under of [false, true]) {
        if (!pw && !ex) continue;
        const b = badgeRect(Object.assign({ glass: true }, mapRect('hud', 0)), 'bottom', 'hud', ex, pw, under), r = navRect(b, 'bottom', 0, NV.W, NV.H);
        assert(b.x >= 405 && b.x + b.w <= HUD_SEEN.x + HUD_SEEN.w && b.y + b.h <= HUD_SEEN.y + HUD_SEEN.h, JSON.stringify(b));
        assert(r && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y - 4, JSON.stringify({ ex, pw, under, b, r }));
    }
    const g3 = badgeRect(Object.assign({ glass: true }, mapRect('hud', 0)), 'bottom', 'hud', 3, false, false);
    assert.strictEqual(g3.h, 58, 'three values on the glass: 58 high, the directions 173 x 132 above them');
    // (no room only with the panel across the middle of the glass, the HUD map moved far: not shown then)
    assert(none < n / 100, none + ' of ' + n + ' without room');
    // the usual place: the standard HUD map, the panel at its bottom: just above the panel, at its right edge
    const b0 = badgeRect(mapRect('hud', 0), 'bottom', 'hud', 3, false, false), r0 = navRect(b0, 'bottom', 0, MS.W, MS.H);
    assert.deepStrictEqual([r0.x + r0.w, r0.y + r0.h], [b0.x + b0.w, b0.y - 4]);
});
console.log(ok + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });

function blend(dst, src, ox, oy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4, j = ((oy + y) * dst.w + ox + x) * 4, a = src.d[i + 3] / 255;
        for (let k = 0; k < 3; k++) dst.d[j + k] = src.d[i + k] * a + dst.d[j + k] * (1 - a);
    }
}

check('toll gates: the tollgate event, a straight on named a toll plaza, or toll lanes: the toll gate picture; hi-pass lanes tinted', () => {
    const NAV = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'nav.js'));
    const NV = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'nav_view.js'));
    const ev = NAV.decodeEvent({ tollgate: { formattedDistance: { distance: '1.2', unit: 1 } } });
    assert.deepStrictEqual([ev.kind, ev.dist, ev.unit], ['toll', '1.2', 'km']);
    const st = (m) => { const s = NV.stateOf(m); return s && s.maneuver; };
    assert.strictEqual(st(ev), 'TOLL');
    assert.strictEqual(st({ kind: 'turn', dir: 'STRAIGHT_ON', dist: '800', unit: 'm', road: '서울요금소' }), 'TOLL');
    assert.strictEqual(st({ kind: 'turn', dir: 'STRAIGHT_ON', dist: '800', unit: 'm', road: '판교톨게이트' }), 'TOLL');
    assert.strictEqual(st({ kind: 'turn', dir: 'STRAIGHT_ON', dist: '800', unit: 'm', road: '테헤란로', lanes: { lanes: [{ follow: 'STRAIGHT_ON', info: 'TOLL_ETC' }] } }), 'TOLL');
    assert.strictEqual(st({ kind: 'turn', dir: 'LEFT', dist: '800', unit: 'm', road: '서울요금소' }), 'LEFT', 'a turn stays a turn');
    assert.strictEqual(st({ kind: 'turn', dir: 'STRAIGHT_ON', dist: '800', unit: 'm', road: '테헤란로' }), 'STRAIGHT_ON');
    const cv = new NV.Canvas(NV.W, NV.H);
    assert(NV.draw(cv, { kind: 'toll', dist: '1.2', unit: 'km', road: '', lanes: { lanes: [{ follow: 'STRAIGHT_ON', info: 'TOLL_ETC', hi: true }, { follow: 'STRAIGHT_ON', info: 'TOLL_CASH' }] } }));
    let lit = 0; for (let i = 3; i < cv.d.length; i += 4) if (cv.d[i]) lit++;
    assert(lit > 500, 'drawn: ' + lit);
});
