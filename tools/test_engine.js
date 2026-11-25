'use strict';
/**
 * test_engine.js - the engine with each layout against a recording stand-in for the cluster render client
 * (tools/scene.js): what is sent at the start and while driving, the start-up sweep, the fail-safe, the
 * centre left to the stock cluster, and that every shader's uniforms fit the service's limits.
 *   node tools/test_engine.js
 */
const assert = require('assert');
const path = require('path');
const { makeScene, APP } = require('./scene');
const { LAYOUTS } = require(path.join(APP, 'layouts'));
const font = require(path.join(APP, 'font'));

const RESERVED = ['u_mvp', 'u_mv', 'u_m', 'u_v', 'u_p', 'u_normal'];   // the renderer's matrix names (PROTOCOL.md)
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const drive = (s, seconds, fn) => { for (let i = 0; i < seconds * 25; i++) { s.setData(fn(i / 25)); s.engine._tick(); } };
const effects = (s) => Array.from(s.client.layers.values()).filter((l) => l.kind === 'effect');
const textsOf = (s) => s.engine._pieces().filter((p) => p.text !== null).map((p) => p.text);
const hard = (t) => ({ speed: 80 + 80 * Math.sin(t / 4), rpm: 2500 + 2000 * Math.sin(t * 2), stage: 'D', gear: 1 + Math.floor(t / 10) % 8, oil: 100 + t / 6, coolant: 90, mode: t > 30 ? 'S' : null });

LAYOUTS.forEach((L) => {
    const id = L.id;
    check(id + ': only shader layers on the panel; the only pixels are the glyph atlas', () => {
        const s = makeScene({ layout: id, data: { speed: 0, rpm: 800, stage: 'P', oil: 40, coolant: 40 } });
        const ls = Array.from(s.client.layers.values());
        assert(ls.every((l) => l.kind === 'effect' || l.kind === 'asset'));
        assert.strictEqual(ls.filter((l) => l.kind === 'asset').length, 1);
        assert(effects(s).every((l) => l.opts.target === 'panel' && l.opts.x >= 0 && l.opts.y >= 0 && l.opts.x + l.opts.w <= 1920 && l.opts.y + l.opts.h <= 720), 'inside the panel');
        effects(s).forEach((l) => {
            const n = Object.keys(l.uniforms).length, nums = Object.keys(l.uniforms).reduce((a, k) => a + l.uniforms[k].v.length, 0);
            assert(n <= 30 && nums <= 4096, 'uniforms ' + n);
            Object.keys(l.uniforms).forEach((k) => assert(l.uniforms[k].v.length <= 1024, k + ' over 1024 numbers'));
        });
        effects(s).forEach((l) => RESERVED.forEach((n) => assert(!new RegExp('(^|[^A-Za-z0-9_])' + n + '($|[^A-Za-z0-9_])').test(l.opts.fs), 'the shader uses ' + n + ', a RAMSES matrix semantic')));
        console.log('     start: ' + effects(s).length + ' layers, ' + s.client.messages + ' messages, ' + Math.round(s.client.bytes / 1024) + ' KB in all');
        assert(s.client.bytes < 600 * 1024);
        s.stop();
    });
    check(id + ': driving sends a few KB a second, no pixels', () => {
        const s = makeScene({ layout: id, data: {} });
        s.engine._tick();
        s.client.reset();
        drive(s, 60, hard);
        const perSec = s.client.bytes / 60;
        console.log('     driving: ' + Math.round(s.client.messages / 60) + ' messages/s, ' + (perSec / 1024).toFixed(1) + ' KB/s');
        assert(!s.client.log.some((m) => m.op === 'pixels' || m.op === 'layer'));
        assert(perSec < 16 * 1024);
        s.stop();
    });
    check(id + ': parked with nothing changing sends nothing (but an animated background\'s clock)', () => {
        const s = makeScene({ layout: id, data: {} });
        const still = () => ({ speed: 0, rpm: 0, stage: 'P', oil: 50, coolant: 50 });
        drive(s, 2, still);
        s.client.reset();
        drive(s, 10, still);
        const other = s.client.log.filter((m) => !(m.op === 'uniform' && m.name === 'u_time'));
        assert.strictEqual(other.length, 0, JSON.stringify(other.slice(0, 3)));
        s.stop();
    });
    check(id + ': the readings reach the cluster (gear, digits, values)', () => {
        const s = makeScene({ layout: id, data: {} });
        drive(s, 2, () => ({ speed: 50 * 1.609344, rpm: 2500, stage: 'D', gear: 3, oil: 100, coolant: 90 }));
        const t = textsOf(s);
        // (the car's strip shows the gear, so only the
        // layouts made round a big gear show it too: L.stripGear)
        // (JDM 1's speed in seven-segment figures: its LCD layer's u_num)
        const segNum = [...s.client.layers.values()].some((l) => l.uniforms.u_num && l.uniforms.u_num.v[0] === 50);
        // (Retro M has no speed in figures: L.speedDigits false - the car's strip shows it)
        [...(L.stripGear ? [L.gearNumber ? '3' : 'D3'] : []), ...(L.speedDigits === false ? [] : ['50'])].forEach((x) => assert(t.indexOf(x) >= 0 || (x === '50' && segNum), x + ' in ' + JSON.stringify(t)));
        const vals = s.engine._pieces().filter((p) => p.value !== null).map((p) => p.value);
        // (on the scale's 160 mph, or a layout's own scale: L._speedFrac; a speed in figures only: L.speedGauge)
        assert(L.speedGauge === false || vals.some((v) => Math.abs(v - 50) < 0.3 || Math.abs(v - 50 / 160) < 0.003 || (L._speedFrac && Math.abs(v - L._speedFrac(50)) < 0.003)), 'speed ' + vals);
        s.stop();
    });
    if (L.stripGear) check(id + ': S on the selector shows S3', () => {
        const s = makeScene({ layout: id, data: {} });
        drive(s, 1, () => ({ speed: 60, rpm: 4000, stage: 'D', gear: 3, mode: 'S' }));
        assert(textsOf(s).indexOf(L.gearNumber ? '3' : 'S3') >= 0);
        s.stop();
    });
    check(id + ': centre left to the stock cluster: nothing over the middle', () => {
        const s = makeScene({ layout: id, options: { centre: 'stock' }, data: { speed: 0 } });
        s.engine._tick();
        // (a whole-view backdrop, M's, with that area cut see-through: u_hole)
        const cutOut = (l) => /^mdash$/.test(l.kind) && l.params.u_hole && l.params.u_hole[0] <= 820 && l.params.u_hole[0] + l.params.u_hole[2] >= 1100;
        // (over the car's strip the stock centre shows in the map's window: the backgrounds round it and the black band
        // under the layout may span the middle above and below the window, nothing in it)
        const W = L.mapWindow || require(path.join(APP, 'layout_common')).MAP_VIEW;
        const over = s.engine._pieces().filter((l) => l.x < 1100 && l.x + l.w > 820 && l.y < W.y + W.h && l.y + l.h > W.y && !cutOut(l));
        assert(!over.length, 'a piece over x 820-1100: ' + over.map((l) => l.key).join(' '));
        s.stop();
    });
    check(id + ': map in the centre: nothing over the map window, the readings round it', () => {
        const C = require(path.join(APP, 'layout_common'));
        const s = makeScene({ layout: id, options: { centre: 'map' }, data: { speed: 0 } });
        s.engine._tick();
        // (the layout's own map window, M's, else the native map area)
        const W = L.mapWindow || C.MAP_VIEW, overMap = (r) => r.x < W.x + W.w && r.x + r.w > W.x && r.y < W.y + W.h && r.y + r.h > W.y;
        // (and beside it the KOMBI's own speed readout, C.STOCK_SPEED, with the view the layouts leave open)
        const S = C.STOCK_SPEED, overSpeed = (r) => !L.mapWindow && r.x < S.x + S.w && r.x + r.w > S.x && r.y < S.y + S.h && r.y + r.h > S.y;
        const over = s.engine._pieces().filter((l) => overMap(l) || overSpeed(l));
        // a band's rectangle may reach into the window as long as what it draws stays out: only those may overlap
        const hole = (l) => /^mdash$/.test(l.kind) && l.params.u_hole && l.params.u_hole[2] > 0;   // (cut see-through there)
        assert(over.every((l) => (l.geo && l.geo[2] > 0) || hole(l)), 'over the map: ' + over.map((l) => l.key).join(' '));
        s.stop();
    });
    ['comfort', 'sport', 'efficient'].forEach((look) => check(id + ': ' + look + ' palette has every colour its pieces use', () => {
        const pal = L.palette(look);
        L.pieces({ speedUnit: 'mph', tempUnit: 'f', centre: 'info', redline: 7000, rpmMax: 8000 }).forEach((p) => {
            if (!p.colors) return;
            const c = p.colors(pal, { stage: 'D', gear: 3, oil: 90, coolant: 90 });
            Object.keys(c).forEach((k) => { const v = Array.isArray(c[k]) ? c[k][0] : c[k]; assert(/^#[0-9a-f]{6}$/i.test(v), p.key + '.' + k + ' = ' + v); });
        });
    }));
});

/*
 * Every layout is built around what the glass and the KOMBI keep for themselves over the car's own strip (the only form
 * since 0.34.0): the camera's cowl, the slanted top corners and the strip itself; every piece that draws something
 * (not the backgrounds) stays clear of them, at most 60 pieces; a dial counts as its circle.
 */
const { clashes } = require('./clearance');
/* the car's own strip: no background below CUT_Y but the black band, nothing small crossing it */
const { CUT_Y, BG_NOTCH, BG_NOTCH_Y, GEAR_WINDOW, GEAR_KEEP, GEAR_KEEP_WIDE, STRIP_TRIM_MAX, STRIP_COVERS, blackBand, overGear } = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layouts'));
LAYOUTS.forEach((L) => ['info', 'map', 'stock'].forEach((centre) => ['phev', 'ice'].forEach((vehicle) => check(L.id + ' (' + centre + ', ' + vehicle + '): the layout ends at y ' + CUT_Y + ', at most 60 pieces, clear of the cowl and corners', () => {
    // (the options as an older save might pass them: the layouts hold the car's strip whatever they say)
    const o = { speedUnit: 'mph', tempUnit: 'f', centre, redline: 7000, rpmMax: 8000, vehicle, cluster: 'm', bottomStrip: 'layout' };
    const ps = L.pieces(o);
    Object.assign(o, { cluster: 'standard', bottomStrip: 'stock' });
    assert(ps.length <= 60, ps.length + ' pieces: the renderer draws 64 layers an app');
    const low = ps.filter((p) => p.y + p.h > CUT_Y && !/^bgBand/.test(p.key) && (/^bg/.test(p.key) || p.kind === 'flat' || p.kind === 'panel' || p.kind === 'flag' || p.h <= 80));
    assert(!low.length, low.map((p) => p.key + ' ' + p.y + '+' + p.h).join(', '));
    // as it comes (BMW's bottom strip: 18 px), the black band below to the row above the gear's window, over the
    // stock dials' edges, but over the strip's drive mode and gear only to BG_NOTCH_Y (short of their tops at 660)
    const band = ps.filter((p) => /^bgBand/.test(p.key));
    assert(band.length === 3 && band.every((p) => p.y === CUT_Y && (p.x + p.w <= BG_NOTCH[0] || p.x >= BG_NOTCH[1] ? p.y + p.h === CUT_Y + STRIP_TRIM_MAX : p.y + p.h === BG_NOTCH_Y && BG_NOTCH_Y < 660)), JSON.stringify(band.map((p) => [p.x, p.w, p.h])));
    assert(ps.some((p) => /^bg/.test(p.key)), 'a background still');
    const bad = ps.map((p) => [p.key, clashes(p, o)]).filter(([, c]) => c.length).map(([k, c]) => k + ' ' + c.join(', '));
    assert(!bad.length, bad.join('; '));
}))));

/* BMW's bottom strip (bottomExtra, as AK Cluster ID8's): each choice's black pieces, none of them ever in the gear's
 * window (the KOMBI's fallback gear box), at most 3, in every layout */
check('BMW\'s bottom strip: show all, the three trims, hide and hide with the wider gap - never over the gear', () => {
    assert.strictEqual(STRIP_TRIM_MAX, 18);
    assert.strictEqual(GEAR_WINDOW.y, CUT_Y + STRIP_TRIM_MAX + 1, 'the largest trim ends on the row above the gear\'s window');
    const foot = (b) => Math.max(...b.map((p) => p.y + p.h));
    STRIP_COVERS.forEach((v) => {
        const b = blackBand({ bottomExtra: v });
        assert(b.length <= 3, v + ': ' + b.length + ' pieces');
        b.forEach((p) => assert(!overGear(p), v + ': ' + p.key + ' over the gear\'s window ' + JSON.stringify([p.x, p.y, p.w, p.h])));
        b.forEach((p) => assert(p.y >= CUT_Y && p.x >= 0 && p.x + p.w <= 1920 && p.y + p.h <= 720, v + ': ' + p.key + ' off the strip'));
    });
    assert.deepStrictEqual(blackBand({ bottomExtra: '0' }), [], 'show all of it: nothing below the layout');
    assert.strictEqual(foot(blackBand({ bottomExtra: '6' })), CUT_Y + 6);
    assert.strictEqual(foot(blackBand({ bottomExtra: '12' })), CUT_Y + 12);
    assert.strictEqual(foot(blackBand({ bottomExtra: '18' })), CUT_Y + 18);
    // an unknown value (or none) is the default, 18
    assert.deepStrictEqual(blackBand({}).map((p) => [p.x, p.y, p.w, p.h]), blackBand({ bottomExtra: '18' }).map((p) => [p.x, p.y, p.w, p.h]));
    // hidden: to the screen's foot either side of the gear's columns, the left cover a column short of its window
    [['hide', GEAR_KEEP], ['hideWide', GEAR_KEEP_WIDE]].forEach(([v, k]) => {
        const b = blackBand({ bottomExtra: v });
        assert.strictEqual(foot(b), 720, v);
        const l = b.find((p) => p.x === 0 && p.y + p.h === 720), r = b.find((p) => p.x > GEAR_WINDOW.x && p.y + p.h === 720);
        assert(l && r && l.w === k.x && r.x === k.x + k.w && r.x + r.w === 1920, v + ' ' + JSON.stringify(b.map((p) => [p.x, p.y, p.w, p.h])));
        assert(l.x + l.w < GEAR_WINDOW.x && r.x >= GEAR_WINDOW.x + GEAR_WINDOW.w, v + ': the gear\'s window left open');
    });
    assert.strictEqual(GEAR_KEEP.x, GEAR_WINDOW.x - 1);
    // every layout, every choice: the band with the backgrounds, the layout's own pieces unchanged, at most 60 in all
    LAYOUTS.forEach((L) => STRIP_COVERS.forEach((v) => {
        const ps = L.pieces({ centre: 'info', vehicle: 'ice', bottomExtra: v });
        assert(ps.length <= 60, L.id + ' ' + v + ': ' + ps.length + ' pieces');
        assert(!ps.some((p) => !/^bgBand/.test(p.key) && overGear(p) && !/^bg/.test(p.key) && p.kind === 'flat'), L.id + ' ' + v);
        assert.strictEqual(ps.filter((p) => /^bgBand/.test(p.key)).length, blackBand({ bottomExtra: v }).length, L.id + ' ' + v);
    }));
});

/* the car's own bottom strip, the readings in the centre: no range numbers (the strip shows both), the fuel
 * gauge bottom left (Retro: its own, in the speedometer) and the charge bottom right on a plug-in hybrid,
 * the dial layouts' dials centred (their centres either side of x 960, the same distance off it) */
LAYOUTS.forEach((L) => ['phev', 'ice'].forEach((vehicle) => check(L.id + ' (' + vehicle + ', stock bottom strip): the strip\'s ranges, gauges above them, centred', () => {
    const o = { speedUnit: 'mph', tempUnit: 'f', centre: 'info', redline: 7000, rpmMax: 8000, vehicle, cluster: 'standard', bottomStrip: 'stock' };
    const ps = L.pieces(o), keys = ps.map((p) => p.key);
    assert(!keys.some((k) => /^(fuel|elec|frange|erange)(Lbl|L)?$/.test(k)), 'range numbers: ' + keys.filter((k) => /fuel|elec|range/.test(k)).join(' '));
    // (Retro, M, Sport and Classic M: their own fuel gauges; M, Sport and Classic M their own charge, in their own look)
    // (Arc tach and Twin cowl: stripFuel a function - their own fuel gauge unless a Small gauge setting puts another reading there)
    assert.strictEqual(keys.indexOf('stripFuel') >= 0, (typeof L.stripFuel === 'function' ? L.stripFuel(o) : L.stripFuel !== false) && !L.ownStripGauges, 'fuel gauge');
    assert.strictEqual(keys.indexOf('stripSoc') >= 0, vehicle !== 'ice' && !L.ownStripGauges, 'charge gauge');
    assert(ps.length <= 60, ps.length + ' pieces');
    const dials = ps.filter((p) => (p.key === 'speed' || p.key === 'rpm') && p.kind === 'dial');
    if (dials.length === 2) {
        const c = dials.map((p) => p.x + p.w / 2);
        assert(Math.abs((c[0] + c[1]) / 2 - 960) < 2 && dials.every((p) => p.y + p.h <= CUT_Y), 'dials centred and above the strip: ' + c.join(' '));
    }
})));

/* 60 frames a second, a reading drawn within 5 ms: an update (every needle, bar and text of the layout) takes
 * well under 5 ms here; the unit's CPU is slower, so the budget asserted is 1.5 ms (worst 4 ms) on this machine */
LAYOUTS.forEach((L) => check(L.id + ': an update takes well under 5 ms (60 a second, drawn at once on a reading)', () => {
    const s = makeScene({ layout: L.id, data: {} });
    for (let i = 0; i < 30; i++) { s.setData(hard(i / 60)); s.engine._tick(); }   // warmed up
    const times = [];
    for (let i = 0; i < 600; i++) {
        s.setData(hard(i / 60));
        const t0 = process.hrtime.bigint();
        s.engine._full();     // the worst case: every needle, every text and colour at once
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length, p99 = times[Math.floor(times.length * 0.99)];
    console.log('     update: avg ' + avg.toFixed(3) + ' ms, 99% ' + p99.toFixed(3) + ' ms, worst ' + times[times.length - 1].toFixed(3) + ' ms');
    assert(avg < 1.5 && p99 < 4, 'avg ' + avg.toFixed(2) + ' ms, 99% ' + p99.toFixed(2) + ' ms');
    s.stop();
}));

check('start-up sweep: played by the cluster (one animation per needle and band), stopped after', () => {
    const s = makeScene({ layout: 'analog_sport', data: { speed: 0, rpm: 0 }, sweep: true });
    s.engine._tick();
    const anims = s.client.log.filter((m) => m.op === 'animate');
    assert(anims.length >= 4 && anims.every((a) => a.property === 'uniform' && a.name === 'u_value'));
    s.stop();
    assert(s.client.log.filter((m) => m.op === 'stop').length >= 4);
});

check('Power % tach (0.35.9): HYBRID and ELECTRIC as the car\'s own: the pedal, else the battery over its limit; CHARGE below 0; XTRABOOST the revs', () => {
    const d = { speed: 40, rpm: 0, stage: 'D', driveMode: 'ELECTRIC', engineOn: false, kw: 55, kwOut: 120, kwIn: 50 };
    const s = makeScene({ layout: 'analog_sport', data: d });
    const tach = () => s.engine._pieces().find((p) => p.key === 'rpm');
    drive(s, 3, () => d);
    assert(Math.abs(tach().value - 55 / 120 * 100) < 0.5, 'drawing, no pedal read: ' + tach().value);
    const u = s.client.layers.get(tach().layer).uniforms;
    assert.deepStrictEqual(u.u_min.v, [-100]); assert.strictEqual(u.u_scale.v[0], 100); assert.deepStrictEqual(u.u_zero.v, [0.25]);
    drive(s, 3, () => Object.assign({}, d, { pedal: 62 }));
    assert(Math.abs(tach().value - 62) < 0.5, 'the pedal: ' + tach().value);
    drive(s, 3, () => Object.assign({}, d, { kw: -80, pedal: 0 }));
    assert(Math.abs(tach().value + 100) < 0.5, 'regenerating, held at the limit: ' + tach().value);
    drive(s, 3, () => Object.assign({}, d, { driveMode: 'HYBRID', engineOn: true, rpm: 2500, pedal: 30 }));
    assert(Math.abs(tach().value - 30) < 0.5, 'HYBRID: Power % too: ' + tach().value);
    drive(s, 3, () => Object.assign({}, d, { driveMode: 'SPORT XTRABOOST', engineOn: true, rpm: 4000, pedal: 80 }));
    assert(Math.abs(tach().value - 4) < 0.05, 'XTRABOOST: the revs: ' + tach().value);
    s.stop();
});

check('electric: Classic M\'s tach reads Power % (the battery over its limits), Retro\'s economy gauge the battery\'s kW', () => {
    const d = { speed: 40, rpm: 0, stage: 'D', driveMode: 'ELECTRIC', engineOn: false, kw: 55, kwOut: 120, kwIn: 50 };
    const c = makeScene({ layout: 'classic', data: d });
    drive(c, 3, () => d);
    assert(Math.abs(c.engine._pieces().find((p) => p.key === 'rpm').value - 55 / 120 * 100) < 0.5);
    drive(c, 3, () => Object.assign({}, d, { kw: -30 }));
    assert(Math.abs(c.engine._pieces().find((p) => p.key === 'rpm').value + 60) < 0.5);
    c.stop();
    const h = Object.assign({}, d, { driveMode: 'HYBRID', engineOn: true, rpm: 1500, kw: -30 });
    const r = makeScene({ layout: 'retro', data: h });
    drive(r, 3, () => h);
    assert(Math.abs(r.engine._pieces().find((p) => p.key === 'econDial').value + 30) < 0.5);
    r.stop();
});

check('settle: shown only once wanted for a moment without a break (no flashing while the car comes up)', () => {
    let live = true;
    const s = makeScene({ data: { speed: 10 }, live: () => live, settleMs: 1200 });
    const now = Date.now, at = (ms) => { Date.now = () => now() + ms; s.engine._tick(); };
    try {
        at(0); assert(!s.engine.status().shown, 'not at once');
        at(600); live = false; at(700); live = true; at(800);
        at(1900); assert(!s.engine.status().shown, 'a break starts the wait again');
        at(2100); assert(s.engine.status().shown, 'shown after 1.2 s wanted');
    } finally { Date.now = now; s.stop(); }
});

check('fail-safe: hidden while the car data is not live, shown again when it is; off when disabled', () => {
    let live = true, on = true;
    const s = makeScene({ data: { speed: 10 }, live: () => live, enabled: () => on });
    const visible = () => effects(s).length > 0 && effects(s).every((l) => l.opts.visible === true);
    const hidden = () => effects(s).length === 0;
    s.engine._tick(); assert(visible());
    live = false; s.engine._tick(); assert(visible(), 'a moment\'s gap in the data keeps it (nothing dropped and resent)');
    const now = Date.now; Date.now = () => now() + 2000; s.engine._tick(); Date.now = now;
    assert(hidden(), 'stale data for longer hides it');
    live = true; s.engine._tick(); assert(visible());
    on = false; s.engine._tick(); assert(hidden(), 'off hides it');
    s.stop();
});

check('a switch of layout never leaves the target empty, to another glyph family too (no flash of the stock HMI)', () => {
    const { startCluster } = require(path.join(APP, 'engine'));
    const { byId } = require(path.join(APP, 'layouts'));
    const { FakeClient } = require('./scene');
    // bold -> wide (Sport) -> orb (M) -> bold, and the same family as a control
    for (const [from, to] of [['analog_sport', 'sport'], ['sport', 'm'], ['m', 'analog_sport'], ['analog_sport', 'retro'], ['track', 'gt3']]) {
        const client = new FakeClient();
        let L = byId(from), watching = false, fewest = Infinity;
        const shownNow = () => Array.from(client.layers.values()).filter((l) => l.kind === 'effect' && l.opts.visible !== false).length;
        ['effect', 'drop', 'set', 'asset'].forEach((k) => {
            const fn = client[k].bind(client);
            client[k] = (...a) => { const r = fn(...a); if (watching) fewest = Math.min(fewest, shownNow()); return r; };
        });
        const e = startCluster({
            client, log: { info() {}, warn() {}, error() {} }, layout: () => L, font: () => L.font || 'bold', settleMs: 0,
            options: () => ({ speedUnit: 'kmh', tempUnit: 'c', centre: 'info', vehicle: 'ice', bottomStrip: 'stock' }),
            theme: () => L.palette('comfort'), sweep: () => false, data: () => ({ speed: 40, rpm: 2000, engineOn: true }),
            live: () => true, enabled: () => true,
        });
        e._tick();
        assert(shownNow() > 0, from + ' shows');
        watching = true; L = byId(to); e.rebuild(); e._tick(); watching = false;
        assert(fewest >= 1, from + ' -> ' + to + ': the target went empty during the switch');
        assert(shownNow() > 0, to + ' shows');
        const atlases = Array.from(client.layers.values()).filter((l) => l.kind === 'asset' && l.opts.format === 'r8').length;
        assert.strictEqual(atlases, 1, from + ' -> ' + to + ': one glyph atlas left after the switch');
        e.stop();
    }
});

console.log(ok + ' passed');
process.exit(0);
