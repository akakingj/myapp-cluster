'use strict';
/**
 * layout_arc_tach.js - "JDM 1" (0.40.0): after the idea of an 80s Japanese digital dash, an original drawing (its lines
 * after akakingj's vector of the look, its colours after the dashes of the time: white figures and slats, grey lines
 * on black, green LCDs). The rev bar rises along a curve from the bottom left, over to the right along the top, in
 * thin slats (ten a thousand) with the thousands' ticks and figures outside it; the dash's lines fan out under it (into
 * the speed's frame) and over it from the third thousand, two leaders run from the left box to its figures; the speed in green seven-segment figures on a dark LCD
 * in a framed display under the bar's top, a red lamp by its name; a box either side with two bar gauges (after a
 * race logger's), each a dark panel with a window filling green from the bottom, its name, its ends and its figures:
 * left a reading (Small gauge in the speedometer; the boost on a petrol or diesel car, the charge on a plug-in
 * hybrid) and the fuel, right the coolant and a reading (Small gauge in the tach; the engine oil); the gear big and
 * green at the bottom left, as a race logger shows it; the main readout under the display. Shaders: shaders.js
 * RTACH_FS, RBOX_FS, RSEG_FS.
 *
 * With the map in the middle (the Waze map, or the stock centre over the car's strip) the same dash either side of it
 * (mapDash): left the rev bar along a quarter curve up to the map's top corner, its figures outside, the gear and
 * TACH inside the curve; right the speed's framed LCD with the main readout, a box of two bar gauges under it.
 */
const C = require('./layout_common');
const B = require('./bimmer');
const { PALETTES, elecTxt } = require('./pods');

/* ---------- 0.40.0: the digital dash ---------- */
/* after an 80s digital dash: white figures and slats, grey lines on black, the speed and the bars in green on dark
 * LCDs (the 0.40.0 draft was all red) */
const DASH = { cupWall: '#f3f1ec', cupInner: '#d4d6da', cupEdge: '#5e504a', cupGlass: '#e4ecf4', cupWater: '#3f8fd4', cupFoam: '#86c4f2', ink: '#f1efe8', line: '#6c6f74', slat: '#383b40', lcd: '#5be596', lcdOff: '#13241a', panel: '#0b0e0d', lamp: '#e2302c', hot: '#e2302c', dark: '#000000' };
/* the LCDs' colour by the look (0.40.2): green in Comfort (and Adaptive), red in Sport, ECO PRO's green-blue in the
 * efficient modes; in Sport the gear goes white at the shift point */
const LCD = { comfort: {}, sport: { lcd: '#ff3a2e', lcdOff: '#2c0c0a', hot: '#fff1e4' }, efficient: { lcd: '#2fd0bb', lcdOff: '#0b2521' } };
const ink = (t) => ({ color: [t.ink, 1], glow: [t.ink, 0.12] });
const inkHot = (t) => ({ color: [t.lamp, 1], glow: [t.lamp, 0.45] });
const grn = (t) => ({ color: [t.lcd, 1], glow: [t.lcd, 0.25] });
/*
 * A plug-in hybrid's Power % on the bar (layout_common.electric): its 0 on the thousand nearest a quarter along, 100 at
 * the end, 50 between where a thousand is (on the same figures' places), the regeneration below the 0 down to the start;
 * under its name eDRIVE, CHARGE while regenerating, eBOOST at the top.
 */
const REGEN = '#3ddc84', EV = '#4ab4ff';
const pzOf = (s) => Math.max(1, Math.round(s.max / 4));
/** The bar's uniforms now: the Power % scale in an electric mode, else the engine speed's (its red zone, the shift). */
function barDyn(o, s, elec) {
    return (d) => (elec(d) ? { u_red: [2], u_orange: [2], u_shift: [0], u_zero: [pzOf(s) / s.max] }
        : Object.assign(((m) => ({ u_red: [m[0]], u_orange: [m[1]], u_shift: [B.shiftNow(o, d) ? 1 : 0] }))(B.redMarks(o, s.max * 1000, d)), { u_zero: [0] }));
}
/** Its figures: the thousands, or (electric) 0, 50 and 100 at theirs. at(u): the place; w, h a figure's cell (the
 * last one and the middle one wider, for 100 and 50). */
function barFigures(o, s, elec, at, w0, h) {
    const z = pzOf(s), mid = (z + s.max) / 2, out = [];
    const pct = (i) => (i === z ? '0' : i === s.max ? '100' : i === mid ? '50' : '');
    for (let i = 0; i <= s.max; i++) {
        const [x, y] = at(i / s.max), w = i === s.max ? Math.round(w0 * 2) : i === mid ? Math.round(w0 * 1.4) : w0;
        out.push(C.text('n' + i, Math.round(x - w / 2), Math.round(y - h / 2), w, h, (d) => (elec(d) ? pct(i) : String(i)), (t, d) => (!elec(d) && i * 1000 >= C.shiftPoint(o, d).red ? inkHot(t) : ink(t))));   // (red in the red zone)
    }
    return out;
}
/** The word under POWER %: CHARGE while the battery takes the regeneration, eBOOST at the top, else eDRIVE. */
const pctWord = (d) => (C.powerPct(d) < 0 ? 'CHARGE' : C.powerPct(d) >= C.EBOOST_AT ? 'eBOOST' : 'eDRIVE');
const pctWordC = (d) => { const c = C.powerPct(d) < 0 ? REGEN : EV; return { color: [c, 1], glow: [c, 0.2] }; };
const gearHot = (t) => ({ color: [t.hot, 1], glow: [t.hot, 0.45] });
/* the rev bar's curve (panel px): a quarter circle from the bottom left up to the top at x CX, then straight on to XE */
const CURVE = { cx: 1152, R: 750, top: 232, a0: -54.9, xe: 1372, T: 30, base: 600, lineTop: 136 };
CURVE.cy = CURVE.top + CURVE.R;
const tachLen = () => -CURVE.a0 * Math.PI / 180 * CURVE.R + (CURVE.xe - CURVE.cx);
/** The point a share u along the curve, `out` px outside its middle line (panel px). */
function tachAt(u, out) {
    const arcL = -CURVE.a0 * Math.PI / 180 * CURVE.R, s = u * tachLen();
    if (s >= arcL) return [CURVE.cx + (s - arcL), CURVE.top - out];
    const a = (CURVE.a0 * Math.PI / 180) + s / CURVE.R;
    return [CURVE.cx + Math.sin(a) * (CURVE.R + out), CURVE.cy - Math.cos(a) * (CURVE.R + out)];
}
/*
 * A box of two bar gauges at x, y (w 310, h 330): each a dark panel with its name at the top, its window filling green
 * from the bottom, its ends' letters beside it, its figures under it. bars: [{ key, label, frac(d), txt(d), lo, hi, hot(d) }].
 */
function gaugeBox(id, x, y, bars, k) {
    // (k: drawn k times its size in panel px, beside the map: its geometry stays in design px, u_k)
    const z = k || 1, R = (v) => Math.round(v * z), P = (v) => Math.round(v * z), K = k ? { u_k: [z] } : {};
    const W = 310, H = 330, PW = 136, PH = 298, list = [
        { key: id, kind: 'rbox', x, y, w: P(W), h: P(H), params: Object.assign({ u_box: [14, 3, 0, 0], u_win: [0, 0, 0, 0], u_seg: [0] }, K), colors: (t) => ({ fill: [t.dark, 1], line: t.line, wcol: t.dark }) },
    ];
    bars.forEach((b, i) => {
        const px = x + R(16 + i * (PW + 10)), py = y + R(16), wx = 56, wy = 50, ww = 50, wh = 170;
        list.push(
            { key: id + i, kind: 'rbox', x: px, y: py, w: P(PW), h: P(PH), z: 2, params: Object.assign({ u_box: [10, 2, 0, 0], u_win: [wx, wy, ww, wh], u_seg: [17] }, K),
                colors: (t) => ({ fill: [t.panel, 1], line: t.line, wcol: t.lcd }), value: (d) => Math.max(0, Math.min(1, b.frac(d) || 0)), max: 1, sweep: true },
            C.text(id + i + 'Lbl', px + R(6), py + R(14), P(PW - 12), P(20), b.label, ink, { z: 22 }),
            C.text(id + i + 'Hi', px + R(16), py + R(wy), P(30), P(24), b.hi, ink, { z: 22 }),
            C.text(id + i + 'Lo', px + R(16), py + R(wy + wh - 24), P(30), P(24), b.lo, ink, { z: 22 }),
            Object.assign(C.text(id + i + 'Num', px + R(3), py + R(wy + wh + 25), P(PW - 6), P(28), b.txt, (t, d) => (b.hot && b.hot(d) ? inkHot(t) : ink(t)), { z: 22 }), b.tone ? { tone: b.tone } : {}));
    });
    return list;
}
/** A gauge as the boxes draw it: the one picked for `which` (Small gauge in the speedometer / tach), else `def`. */
/** The boxes' four bars, left to right: the outer two Settings > Small gauge in the speedometer / in the tach (or the
 * page's), the inner two the layout's own places (0.41.10: boxL2, boxR1; the fuel and the coolant as designed). */
function boxBars(o) {
    const inner = (k, def) => { const v = C.placeOf(o, k); return v && C.gaugeOf(Object.assign({}, o, { gaugeSpeed: v }), 'speed') ? v : def; };
    return [boxBar(o, 'speed', C.engineFocus(o) ? 'boost' : 'soc'), boxBar(Object.assign({}, o, { gaugeSpeed: inner('boxL2', 'fuel') }), 'speed', 'fuel'),
        boxBar(Object.assign({}, o, { gaugeRpm: inner('boxR1', 'coolant') }), 'rpm', 'coolant'), boxBar(o, 'rpm', 'oil')];
}
function boxBar(o, which, def) {
    const g = C.gaugeOf(o, which) || C.gaugeOf(Object.assign({}, o, which === 'speed' ? { gaugeSpeed: def } : { gaugeRpm: def }), which);
    const temp = ['coolant', 'oil', 'gearbox', 'iat', 'battTemp'].indexOf(g.key) >= 0;
    return { key: g.key, label: g.label, frac: g.frac, txt: g.txt, hot: g.hot, lo: g.key === 'fuel' ? 'E' : temp ? 'C' : 'L', hi: g.key === 'fuel' ? 'F' : temp ? 'H' : 'H' };
}
/** A leader line from the left box (x 480) to figure i's upper left: [from x, at y, to x], then 45 degrees down. */
function lead(i, max) {
    if (i > max) return [0, 0, 0];
    const [x, y] = tachAt(i / max, 50);
    return [480, Math.round(y - 38), Math.round(x - 44)];
}
function dash(o) {
    const s = C.rpmScale(o), list = [C.flat('bg', 0, 0, 1920, 720, 'bg')];
    // the dash's lines: the bottom one from the left upright to the right one, the uprights standing on it
    // (0.40.4: the uprights up to the panel's top, into its rounded corners: hairlines, tools/clearance.js)
    const up = (key, x) => Object.assign(C.flat(key, x, 18, 2, CURVE.base - 18, 'line'), { hairline: true });
    list.push(C.flat('lnBase', 150, CURVE.base, 1672, 2, 'line'), up('lnL', 150), up('lnR1', 1772), up('lnR2', 1820),
        // (the stubs from the left upright to the box)
        C.flat('lnS1', 152, 300, 16, 2, 'line'), C.flat('lnS2', 152, 420, 16, 2, 'line'));
    // the rev bar (the engine speed eased; on electricity the battery's power), its figures
    const X = 480, Y = CURVE.lineTop, W = CURVE.xe + 40 - X, H = CURVE.base + 4 - Y;
    const elec = (d) => C.electric(o, d);
    list.push({
        key: 'rtach', kind: 'rtach', x: X, y: Y, w: W, h: H, z: -10,
        params: { u_off: [X, Y], u_geo: [CURVE.cx, CURVE.cy, CURVE.R, CURVE.a0], u_geo2: [CURVE.xe, CURVE.T, CURVE.base, CURVE.lineTop], u_ticks: [s.max, 10], u_ld1: lead(1, s.max), u_ld2: lead(2, s.max), u_zero: [0] },
        colors: (t) => ({ ink: t.ink, dim: t.slat, line: t.line, regen: REGEN }),
        value: (d) => (elec(d) ? C.powerFrac(d, pzOf(s) / s.max) : C.isNum(d.rpm) ? Math.max(0, Math.min(1, d.rpm / (s.max * 1000))) : 0),
        max: 1, sweep: true,
        dyn: barDyn(o, s, elec),
    });
    // the lines over the bar on up to the panel's top (0.40.4), as on the dash they're after, under the camera cowl
    // too (the camera hides them there): one more layer of the same drawing above the main one; only these lines
    // reach up there (hairlines, tools/clearance.js)
    list.push({ key: 'rtachTop', kind: 'rtach', x: X, y: 18, w: W, h: CURVE.lineTop - 18, z: -10, hairline: true,
        params: Object.assign({}, list[list.length - 1].params, { u_off: [X, 18], u_geo2: [CURVE.xe, CURVE.T, CURVE.base, 18] }),
        colors: (t) => ({ ink: t.ink, dim: t.slat, line: t.line, regen: REGEN }) });
    list.push(...barFigures(o, s, elec, (u) => tachAt(u, 50), 60, 44));
    // (the lines under the bar from the third thousand on: none cross the words or the gear, 0.40.2)
    list.push(C.text('tachLbl', 690, 470, 170, 28, (d) => (elec(d) ? C.POWER_UNIT : 'TACH'), ink, { align: 0, tracking: 0.06 }),
        C.text('tachUnit', 690, 502, 190, 22, (d) => (elec(d) ? pctWord(d) : 'x1000 r/min'), (t, d) => (elec(d) ? pctWordC(d) : ink(t)), { align: 0 }));
    // the gear, as a race logger shows it, at the bottom left
    list.push(C.text('gearLbl', 600, 556, 86, 24, 'GEAR', ink, { align: 0 }),
        C.text('dashGear', 692, 522, 170, 76, C.gearText, (t, d) => (B.shiftNow(o, d) ? gearHot(t) : grn(t)), { align: 0 }));
    // the speed: a framed display under the bar's top down to the bottom line, the figures on a dark LCD, a red lamp
    // by its name, the main readout under them in the frame (the lines under the bar end at the frame)
    const sp = { x: 880, y: 330, w: 530, h: CURVE.base + 2 - 330 };
    list.push({ key: 'spFrame', kind: 'rbox', x: sp.x, y: sp.y, w: sp.w, h: sp.h, params: { u_box: [10, 3, 0, 0], u_win: [0, 0, 0, 0], u_seg: [0] }, colors: (t) => ({ fill: [t.dark, 1], line: t.line, wcol: t.dark }) },
        Object.assign(C.flat('spMark', sp.x + 22, sp.y + 72, 52, 12, 'lamp'), { z: 5 }),
        C.text('spLbl', sp.x + 14, sp.y + 94, 94, 18, 'SPEED', ink, { align: 0 }),
        { key: 'spLcd', kind: 'rseg', x: sp.x + 108, y: sp.y + 18, w: sp.w - 126, h: 154, z: 2,
            params: { u_dig: [sp.w - 126 - 110, 22, 62, 110], u_seg2: [13, 0.14, 3] },
            colors: (t) => ({ fill: t.panel, on: t.lcd, off: t.lcdOff }),
            dyn: (d) => ({ u_num: [C.isNum(d.speed) ? Math.min(999, C.speedShown(o, d)) : 0] }) },
        C.text('spUnit', sp.x + sp.w - 112, sp.y + 112, 90, 30, C.speedUnit(o), grn, { align: 0, z: 22 }));
    // the main readout under the display, its name first (Settings > Main readout; a plug-in hybrid's battery power)
    const pv = C.focus.power(o), pl = C.focus.powerLabel(o, true);
    if (pv) list.push(Object.assign(C.fitText(C.text('kwNow', sp.x + 24, sp.y + 202, sp.w - 48, 30, (d) => (pl ? pl + '   ' : '') + (typeof pv === 'function' ? pv(d) : pv), ink), 'wide'), { z: 22 }));
    // the boxes: left a reading and the fuel, right the coolant and a reading (each of the four set on the page:
    // Settings > Small gauge in the speedometer / in the tach for the outer two, the layout's places for the inner)
    const [left, fuel, cool, right] = boxBars(o);
    return scaled(list.concat(gaugeBox('boxL', 168, 236, [left, fuel]), gaugeBox('boxR', 1442, 236, [cool, right])))
        .concat(o.jdmCup === 'off' ? [] : [cup(o, o.jdmCup !== 'on')]);
}

/*
 * The dash either side of the map (0.51.0): its look in panel px, clear of the map area (layout_common.MAP, x 416..1504)
 * and over the car's strip. Left, the rev bar on a quarter curve (MCURVE: from low on the left up to the map's top
 * left corner), its figures outside, four slats a thousand, the straight part's end on a line down to the bottom
 * one, TACH and the gear inside the curve. Right, the speed's frame (the LCD, its lamp and name, the
 * main readout under it) and under it a box of two bar gauges (Settings > Small gauge in the speedometer, in the
 * tach: Auto the boost or the charge, and the fuel). The clock and the outside temperature over the map, the ranges
 * under it.
 */
const MCURVE = { cx: 390, R: 320, top: 150, a0: -74, xe: 404, T: 26, base: 600 };
MCURVE.cy = MCURVE.top + MCURVE.R;
function mcurveAt(u, out) {
    const arcL = -MCURVE.a0 * Math.PI / 180 * MCURVE.R, s = u * (arcL + MCURVE.xe - MCURVE.cx);
    if (s >= arcL) return [MCURVE.cx + (s - arcL), MCURVE.top - out];
    const a = MCURVE.a0 * Math.PI / 180 + s / MCURVE.R;
    return [MCURVE.cx + Math.sin(a) * (MCURVE.R + out), MCURVE.cy - Math.cos(a) * (MCURVE.R + out)];
}
function mapDash(o) {
    const s = C.rpmScale(o), top = C.MAP.y, bot = C.MAP.y + C.MAP.h, elec = (d) => C.electric(o, d);
    const list = C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg'));
    // the bottom line under each side
    list.push(C.flat('lnBaseL', 40, MCURVE.base, 370, 2, 'line'), C.flat('lnEndL', MCURVE.xe, MCURVE.top + 22, 2, MCURVE.base - MCURVE.top - 22, 'line'),
        C.flat('lnBaseR', 1514, MCURVE.base + 40, 312, 2, 'line'));
    // the rev bar (as the dash's: shaders.js RTACH_FS; no lines over or under it, no leaders: one upright at its end)
    const X = 40, Y = 100, W = 412 - X, H = MCURVE.base + 2 - Y;
    list.push({
        key: 'rtach', kind: 'rtach', x: X, y: Y, w: W, h: H, z: -10,
        params: { u_off: [X, Y], u_geo: [MCURVE.cx, MCURVE.cy, MCURVE.R, MCURVE.a0], u_geo2: [MCURVE.xe, MCURVE.T, 0, 9999], u_ticks: [s.max, 4], u_ld1: [0, 0, 0], u_ld2: [0, 0, 0], u_k: [1], u_zero: [0] },
        colors: (t) => ({ ink: t.ink, dim: t.slat, line: t.line, regen: REGEN }),
        value: (d) => (elec(d) ? C.powerFrac(d, pzOf(s) / s.max) : C.isNum(d.rpm) ? Math.max(0, Math.min(1, d.rpm / (s.max * 1000))) : 0),
        max: 1, sweep: true,
        dyn: barDyn(o, s, elec),
    });
    list.push(...barFigures(o, s, elec, (u) => mcurveAt(u, 54), 44, 32));
    // inside the curve: TACH, then the gear as a race logger shows it
    list.push(C.text('tachLbl', 236, 392, 150, 26, (d) => (elec(d) ? C.POWER_UNIT : 'TACH'), ink, { align: 0, tracking: 0.06 }),
        C.text('tachUnit', 236, 422, 170, 20, (d) => (elec(d) ? pctWord(d) : 'x1000 r/min'), (t, d) => (elec(d) ? pctWordC(d) : ink(t)), { align: 0 }),
        C.text('gearLbl', 150, 552, 76, 22, 'GEAR', ink, { align: 0 }),
        C.text('dashGear', 232, 512, 172, 76, C.gearText, (t, d) => (B.shiftNow(o, d) ? gearHot(t) : grn(t)), { align: 0 }));
    // right: the speed's frame, the LCD, its lamp and name, the main readout under it
    // (under the panel's slanted top right corner: from y 168)
    const sp = { x: 1514, y: 168, w: 312, h: 180 };
    list.push({ key: 'spFrame', kind: 'rbox', x: sp.x, y: sp.y, w: sp.w, h: sp.h, params: { u_box: [10, 3, 0, 0], u_win: [0, 0, 0, 0], u_seg: [0], u_k: [1] }, colors: (t) => ({ fill: [t.dark, 1], line: t.line, wcol: t.dark }) },
        Object.assign(C.flat('spMark', sp.x + 16, sp.y + 46, 44, 10, 'lamp'), { z: 5 }),
        C.text('spLbl', sp.x + 8, sp.y + 64, 80, 16, 'SPEED', ink, { align: 0 }),
        { key: 'spLcd', kind: 'rseg', x: sp.x + 88, y: sp.y + 14, w: sp.w - 102, h: 106, z: 2,
            params: { u_dig: [sp.w - 102 - 76, 16, 40, 78], u_seg2: [9, 0.14, 3], u_k: [1] },
            colors: (t) => ({ fill: t.panel, on: t.lcd, off: t.lcdOff }),
            dyn: (d) => ({ u_num: [C.isNum(d.speed) ? Math.min(999, C.speedShown(o, d)) : 0] }) },
        C.text('spUnit', sp.x + sp.w - 70, sp.y + 76, 60, 22, C.speedUnit(o), grn, { align: 0, z: 22 }));
    const pv = C.focus.power(o), pl = C.focus.powerLabel(o, true);
    if (pv) list.push(Object.assign(C.fitText(C.text('kwNow', sp.x + 14, sp.y + 134, sp.w - 28, 26, (d) => (pl ? pl + '   ' : '') + (typeof pv === 'function' ? pv(d) : pv), ink), 'wide'), { z: 22 }));
    // under it the box: the two Small gauges (Auto: the boost or the charge, and the fuel)
    const bars = [boxBar(o, 'speed', C.engineFocus(o) ? 'boost' : 'soc'), boxBar(o, 'rpm', 'fuel')];
    list.push(...gaugeBox('boxR', sp.x + Math.round((sp.w - 248) / 2), sp.y + sp.h + 14, bars, 0.8));
    // the clock and the outside temperature over the map, the ranges under it
    list.push(C.text('clock', 520, top - 76, 200, 34, C.clock, ink), C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), ink));
    return list.concat(C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'RANGE', ink, ink),
        C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? ink : elecTxt, ink));
}

/*
 * The cup of water (0.41.0; Settings > JDM 1: cup of water, or the layout's page): a clear cup (0.41.9, the default)
 * or a paper one standing over the left box, its water sloshing with the car's G - wilder than the G alone would tilt it (0.41.8: 2.2 times, the owner's
 * call), to the rim and down the far wall. Sideways: higher on the outside of the bend, where the driver is pushed
 * (0.41.6; the side JDM 2's G meter's dot goes, Settings > JDM 2: G meter, swap left / right), at most about 34
 * degrees. Fore and aft (0.41.4): braking sends it to the far side (its surface seen taller), accelerating to the near
 * side (flatter). Each on a spring that rings down after a change (about 1.2 a second, little damped: it sloshes back
 * a few times), worked out every frame here and sent only when it moves (0.004): nothing while the water lies still.
 * Shader: shaders.js CUP_FS (the water drawn only inside the cup's mouth: never over its rim). In px on the panel
 * (after scaled()): over the left box's second gauge (the fuel's), in line with it (0.41.3), its rim clear of the
 * panel's rounded corner (tools/clearance.js: the cup's outline).
 */
const CUP = { x: 233, y: 96, w: 160, h: 137, rim: 26, aR: 56, aB: 40, H: 92, e: 0.42, level: 0.72, maxTilt: 0.6, lonMin: -0.22, lonMax: 0.32, gain: 2.2, clearLevel: 0.5 };
/** A spring towards its target: step(target, dt ms) -> where it is (rounded to 0.004). */
function spring(lo, hi) {
    const W = 2 * Math.PI * 1.2, Z = 0.09;
    let th = 0, v = 0;
    return (want, dt) => {
        for (let left = Math.min(250, dt || 0); left > 0; left -= 8) {
            const h = Math.min(8, left) / 1000;
            v += (-W * W * (th - want) - 2 * Z * W * v) * h;
            th = Math.max(lo, Math.min(hi, th + v * h));
        }
        return Math.round(Math.round(th / 0.004) * 0.004 * 1000) / 1000;
    };
}
function cup(o, clear) {
    const sx = 1, lat = spring(-CUP.maxTilt, CUP.maxTilt), lon = spring(CUP.lonMin, CUP.lonMax);
    // (the clear cup half full: its water seen whole through the glass, room for the slosh; the paper cup's fuller, its
    // surface seen through its mouth)
    const level = clear ? CUP.clearLevel : CUP.level;
    const gOf = (d, k) => (C.isNum(d[k + 'Z']) ? d[k + 'Z'] : C.isNum(d[k]) ? d[k] : 0);
    return {
        key: 'cup', kind: 'cup', x: CUP.x, y: CUP.y, w: CUP.w, h: CUP.h, z: 4,
        params: { u_cup: [CUP.w / 2, CUP.rim, CUP.aR, CUP.aB], u_cup2: [CUP.H, CUP.e, level, 0], u_lon: [0], u_clear: [clear ? 1 : 0] },
        colors: (t) => ({ wall: t.cupWall, inner: t.cupInner, edge: clear ? t.cupGlass : t.cupEdge, water: t.cupWater, foam: t.cupFoam }),
        frame: (d, dt) => ({
            u_cup2: [CUP.H, CUP.e, level, lat(Math.max(-CUP.maxTilt, Math.min(CUP.maxTilt, Math.atan(CUP.gain * sx * gOf(d, 'gLat')))), dt)],
            // (the car's longitudinal G: > 0 accelerating, kwfuse.js)
            u_lon: [lon(Math.max(CUP.lonMin, Math.min(CUP.lonMax, -CUP.gain * gOf(d, 'gLong'))), dt)],
        }),
    };
}
/*
 * The dash is drawn in design px (x 150..1822, y 132..602) and shown K times, its middle at x 960, its bottom line at
 * y 642 just above the car's strip (layout_common.STRIP_Y 646), its top lines just under the camera cowl, its uprights
 * clear of the panel's corners (tools/clearance.js). K 1: its side boxes clear of the KOMBI's warning lights along the
 * glass's sides (layout_common.SIDE_LIGHTS; at 1.1 they ran under them). The shaders take their geometry in design px
 * (u_k); the lines stay 2 px.
 */
const K = 1.0, SX = (x) => 960 + (x - 986) * K, SY = (y) => 642 - (602 - y) * K;
function scaled(list) {
    return list.map((p) => {
        if (p.key === 'bg') return p;
        const x0 = Math.round(SX(p.x)), y0 = Math.round(SY(p.y)), thin = p.kind === 'flat';
        const q = Object.assign({}, p, { x: x0, y: y0, w: thin && p.w <= 3 ? p.w : Math.round(SX(p.x + p.w)) - x0, h: thin && p.h <= 3 ? p.h : Math.round(SY(p.y + p.h)) - y0 });
        if (p.kind === 'rtach' || p.kind === 'rbox' || p.kind === 'rseg') q.params = Object.assign({}, p.params, { u_k: [K] });
        return q;
    });
}

module.exports = {
    id: 'arc_tach',
    title: 'JDM 1',
    // one look in every drive mode (0.35.4)
    palette: (look) => Object.assign({}, PALETTES.comfort, DASH, LCD[look] || {}),
    font: 'wide',     // (0.40.0: the dash's lettering, Michroma)
    gearText: C.gearText,
    // (with the map its fuel bar in the box, unless Small gauge in the tach puts another reading there: then the
    // strip's; the dash: its fuel bar in the left box, no strip bar, which would sit on the box's foot)
    stripFuel: (o) => { if (o.centre !== 'map') return false; const g = C.gaugeOf(o, 'rpm'); return !!g && g.key !== 'fuel'; },
    // its own places, set on the page (layouts.js placesFor): the boxes' inner bars (0.41.10)
    places: [{ key: 'boxL2', kind: 'gauge', label: 'Left box: second bar', when: (o) => (o.centre || 'info') === 'info' },
        { key: 'boxR1', kind: 'gauge', label: 'Right box: first bar', when: (o) => (o.centre || 'info') === 'info' }],
    speedGauge: false,  // (the speed in figures only)

    pieces(o) {
        return o.centre === 'map' ? mapDash(o) : dash(o);
    },
};
