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
 * With the Waze map in the middle (and so far only then) the previous JDM 1: the tach left of the map, a dial right.
 */
const C = require('./layout_common');
const B = require('./bimmer');
const TP = require('./pods');
const { PALETTES: POD_PALETTES, dialColours, lit, lbl, gearC, elecTxt, ranges } = TP;

/* the pods' colours (pods.js), and the tach's: its face and its dark ring */
const TACH = {
    comfort: { tface0: '#0d0e10', tface1: '#030304', ring: '#2a2d32' },
    sport: { tface0: '#120a09', tface1: '#040202', ring: '#3a2522' },
    efficient: { tface0: '#0a0e11', tface1: '#020405', ring: '#22303a' },
};
// (no Object.fromEntries: the head unit's Node is 8)
const PALETTES = Object.keys(POD_PALETTES).reduce((o, k) => { o[k] = Object.assign({ regen: '#3ddc84' }, POD_PALETTES[k], TACH[k]); return o; }, {});

/* the tach's sweep: three quarters of a turn from just left of six o'clock, up the left, over the top, down to
 * a little past three; the quarter it leaves open (bottom right) holds the digital speed */
const A0 = -165, A1 = 105;
const kwOf = (d) => (C.isNum(d.kw) ? d.kw : 0);

/**
 * The tach at (cx, cy), radius R (to the inside of its chrome ring): numerals 0 to the rev scale's end, the needle,
 * the red zone; the main readout above the hub, the speed bottom right, the gear (withGear) bottom left. On a
 * plug-in hybrid in an electric mode it reads the battery's power (layout_common.tachValue, tachDyn).
 */
function tach(o, cx, cy, R, withGear) {
    const k = R / 240, s = C.rpmScale(o), S = 2 * R;
    const evOff = (d) => C.electric(o, d);
    const list = [
        {
            key: 'rpm', kind: 'dial', x: cx - R, y: cy - R, w: S, h: S,
            params: {
                u_scale: [s.max, s.major, s.minor, s.red], u_arc: [A0, A1, Math.round(36 * k), Math.round(160 * k)],
                u_needle_dim: [Math.round(196 * k), Math.round(36 * k), Math.round(13 * k), 4], u_look: [0.9, 0.85, 0, 0], u_look2: [0, S / 640, 0.85, 0.7],
            },
            colors: (t) => Object.assign(dialColours(t), { face0: t.tface0, face1: t.tface1, bezel: t.ring, bezel2: t.ring }),
            max: s.max, sweep: true, value: C.tachValue(o), range: C.tachRange(o, s), dyn: C.tachDyn(o, s, s.red),
        },
        // the speed bottom right, where the scale leaves off; its unit and the scale's under it
        C.text('speedDigits', cx + Math.round(0.02 * R), cy + Math.round(0.31 * R), Math.round(0.5 * R), Math.round(0.21 * R), (d) => C.speedText(o, d), lit, { align: 1 }),
        C.text('speedDigitsUnit', cx + Math.round(0.02 * R), cy + Math.round(0.54 * R), Math.round(0.5 * R), Math.round(0.07 * R), C.speedUnit(o), lbl, { align: 1, tracking: 0.12 }),
        C.text('rpmUnit', cx + Math.round(0.12 * R), cy + Math.round(0.65 * R), Math.round(0.4 * R), Math.round(0.055 * R), (d) => (evOff(d) ? C.POWER_UNIT : 'x1000 rpm'), (t, d) => (evOff(d) ? elecTxt(t) : lbl(t)), { align: 1, tracking: 0.1 }),
        // the main readout above the hub
        C.fitText(C.text('kwNow', cx - Math.round(0.36 * R), cy - Math.round(0.46 * R), Math.round(0.72 * R), Math.round(0.15 * R), C.focus.power(o), (t, d) => (C.engineFocus(o) ? lit(t) : kwOf(d) < -0.3 ? { color: [t.regen, 1], glow: [t.regen, 0.3] } : elecTxt(t))), 'wide'),
        C.text('kwNowLbl', cx - Math.round(0.3 * R), cy - Math.round(0.29 * R), Math.round(0.6 * R), Math.round(0.055 * R), C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
    ];
    // (the gear: Settings > Arc tach: the gear in the arc; not twice, with the gear as the main readout too)
    if (withGear && o.arcGear !== 'off' && o.infoMain !== 'gear') list.push(C.text('gear', cx - Math.round(0.42 * R), cy + Math.round(0.14 * R), Math.round(0.3 * R), Math.round(0.22 * R), C.gearText, gearC));
    return list;
}

/**
 * A side dial at (cx, cy), radius r (to the inside of its ring), on `side` (-1 left, +1 right) of the tach: its
 * gauge along the top away from the tach (`which` 'speed': Small gauge in the speedometer, Auto the coolant; 'rpm':
 * Small gauge in the tach, Auto the fuel), a temperature C - H, the fuel F at the top and E below (its red at E),
 * another reading its name and figures; its icon by the pivot; the readout `readKey` at its foot.
 */
function sideDial(o, which, cx, cy, r, side, readKey) {
    const k = r / 170, S = 2 * r, g = C.gaugeOf(o, which);
    const key = g ? g.key : which === 'speed' ? 'coolant' : 'fuel', ch = C.chOf(o, key);
    const fuel = !g && key === 'fuel';
    // the scale's ends: from low (C, E... at the bottom outside) up over the top; the right one mirrored
    const arc = side < 0 ? [-125, 5] : [-5, 125];
    // (the fuel on the right: F at the top, E at the bottom - the scale runs backwards, its red at E)
    const back = fuel && side > 0;
    const red = ch ? C.chRed(o, ch) * 100 : g ? Math.min(101, g.redFrac * 100) : fuel ? (back ? 88 : 101) : C.hotAt(o, 'coolant') - 40;
    const raw = ch ? (d) => C.chFrac(ch, d[ch]) * 100 : g ? (d) => g.frac(d) * 100
        : fuel ? (d) => (C.isNum(d.fuelPct) ? Math.max(0, Math.min(100, d.fuelPct)) : 0) : (d) => (C.isNum(d.coolant) ? Math.max(0, d.coolant - 40) : 0);
    const id = 'side' + (side < 0 ? 'L' : 'R');
    const list = [{
        key: id, kind: 'dial', x: cx - r, y: cy - r, w: S, h: S,
        params: { u_scale: [100, 50, 12.5, red], u_arc: [arc[0], arc[1], 0, 0], u_needle_dim: [Math.round(112 * k), Math.round(20 * k), Math.round(8 * k), 3], u_look: [0.85, 0.85, 0, 0], u_look2: [0, S / 640, 0.75, 0.6] },
        colors: (t) => Object.assign(dialColours(t), { face0: t.tface0, face1: t.tface1, bezel: t.ring, bezel2: t.ring }),
        value: back ? (d) => 100 - raw(d) : raw, max: 100, sweep: true,
    }];
    // the scale's end letters, a little inside its marks
    const lh = Math.max(14, Math.round(24 * k)), at = (a) => [cx + Math.sin(a * Math.PI / 180) * r * 0.62, cy - Math.cos(a * Math.PI / 180) * r * 0.62];
    const letter = (n, a, txt, hot) => { const [x, y] = at(a), w = Math.round(lh * 1.6); return C.text(id + n, Math.round(x - w / 2), Math.round(y - lh / 2), w, lh, txt, hot ? (t) => ({ color: [t.red, 1], glow: [t.red, 0.3] }) : lit); };
    const lo = side < 0 ? arc[0] : arc[1], hi = side < 0 ? arc[1] : arc[0];   // (the reading's low end, its high end)
    if (ch) list.push(letter('Lo', lo, 'C'), letter('Hi', hi, 'H', true));
    else if (fuel) list.push(letter('Lo', back ? arc[1] : lo, 'E', true), letter('Hi', back ? arc[0] : hi, 'F'));
    // its icon (or the picked reading's name and figures) by the pivot, on the side away from the scale
    const ix = cx - side * Math.round(0.02 * r);
    if (g) {
        list.push(C.text(id + 'Lbl', ix - Math.round(0.45 * r), cy + Math.round(0.14 * r), Math.round(0.9 * r), Math.round(0.1 * r), g.label, lbl, { tracking: 0.12 }));
        if (!ch) list.push(C.text(id + 'Num', ix - Math.round(0.45 * r), cy + Math.round(0.27 * r), Math.round(0.9 * r), Math.round(0.15 * r), g.txt, (t, d) => (g.hot(d) ? { color: [t.red, 1], glow: [t.red, 0.3] } : lit(t))));
    } else {
        const iw = Math.round(0.2 * r);
        list.push(B.icon(id + 'Icon', ix - Math.round(iw / 2), cy + Math.round(0.14 * r), iw, iw, key === 'coolant' ? 'therm' : 'fuel', 'dim'));
    }
    if (readKey) {
        const txt = readKey === 'clock' ? C.clock : (d) => C.outsideText(o, d.outside);
        list.push(C.text(readKey, cx - Math.round(0.5 * r), cy + Math.round(0.5 * r), Math.round(r), Math.round(0.16 * r), txt, lit));
    }
    return list;
}

/**
 * Chrome rings round circles [{ x, y, r, front }] (r: the ring's middle line), w px thick: the one marked front all
 * round; each other one all round but where it goes behind a front one (inside its ring), so it seems to pass under
 * it. Each ring a thin satin band, in arcs (the band's angles wrap at six o'clock).
 */
function rims(circles, w) {
    const out = [];
    const wrap = (a) => ((a + 540) % 360) - 180;
    circles.forEach((c, i) => {
        const gaps = [];
        if (!c.front) {
            circles.forEach((e) => {
                if (!e.front || e === c) return;
                const D = Math.hypot(e.x - c.x, e.y - c.y), er = e.r + w;
                if (!(D < c.r + er && D > Math.abs(c.r - er))) return;
                const half = Math.acos((D * D + c.r * c.r - er * er) / (2 * D * c.r)) * 180 / Math.PI;
                gaps.push({ at: Math.atan2(e.x - c.x, -(e.y - c.y)) * 180 / Math.PI, half });
            });
        }
        const open = (a) => gaps.every((g) => Math.abs(wrap(a - g.at)) > g.half);
        const runs = [];
        let from = null;
        for (let a = -180; a <= 180.001; a += 0.25) {
            if (open(a) && a < 180) { if (from === null) from = a; continue; }
            if (from !== null && a - from >= 1) runs.push([from, Math.min(180, a)]);
            from = null;
        }
        runs.forEach((sp, n) => {
            const xs = [], ys = [];
            for (let a = sp[0]; a <= sp[1] + 0.01; a += Math.max(0.5, (sp[1] - sp[0]) / 48)) {
                for (const r of [c.r - w, c.r + w]) { xs.push(c.x + r * Math.sin(a * Math.PI / 180)); ys.push(c.y - r * Math.cos(a * Math.PI / 180)); }
            }
            const X = Math.floor(Math.min(...xs) - 4), Y = Math.floor(Math.min(...ys) - 4);
            const W = Math.ceil(Math.max(...xs) + 4) - X, H = Math.min(C.STRIP_Y, Math.ceil(Math.max(...ys) + 4)) - Y;
            if (H <= 0) return;
            // (0.39.5) a plain ring (shaders.js RING_FS), not the gauge band drawn full: the band's whole shader ran over
            // every pixel of each ring's box, 140 of the layout's 280 ms (SwiftShader) with the side dials grown to 210
            out.push({
                key: 'rim' + i + '_' + n, kind: 'ring', x: X, y: Y, w: W, h: H,
                params: { u_geo: [c.x - X, c.y - Y, c.r, w], u_span: [sp[0], sp[1], 0, 0] },
                colors: (t) => ({ fill1: t.bezel }),
            });
        });
    });
    return out;
}

/**
 * The three: the tach at (cx, cy), radius R inside its ring, in front; the side dials [which, readKey, radius]
 * left and right, their rings `tuck` px behind the tach's, their centres level with it. The sides first, the tach
 * over them, the rings last.
 */
function three(o, cx, cy, R, withGear, sides, tuck) {
    const k = R / 240, w = Math.max(4, Math.round(6 * k)), RC = R + w;
    const circles = [{ x: cx, y: cy, r: RC, front: true }];
    let list = [];
    sides.forEach(([which, readKey, r], i) => {
        const side = i === 0 ? -1 : 1, x = Math.round(cx + side * (RC + r + w - tuck));
        circles.push({ x, y: cy, r: r + w });
        list = list.concat(sideDial(o, which, x, cy, r, side, readKey));
    });
    return list.concat(tach(o, cx, cy, R, withGear), rims(circles, w));
}

/** A dial alone, with its own ring (the map, the stock centre, an M car's own strip). */
function alone(o, which, cx, cy, r, side, readKey) {
    const w = Math.max(3, Math.round(5 * r / 170));
    return sideDial(o, which, cx, cy, r, side, readKey).concat(rims([{ x: cx, y: cy, r: r + w, front: true }], w).map((p) => Object.assign(p, { key: 'rimS' + which + p.key })));
}
function tachAlone(o, cx, cy, R, withGear) {
    const w = Math.max(4, Math.round(6 * R / 240));
    return tach(o, cx, cy, R, withGear).concat(rims([{ x: cx, y: cy, r: R + w, front: true }], w));
}

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
function gaugeBox(id, x, y, bars) {
    const W = 310, H = 330, PW = 136, PH = 298, list = [
        { key: id, kind: 'rbox', x, y, w: W, h: H, params: { u_box: [14, 3, 0, 0], u_win: [0, 0, 0, 0], u_seg: [0] }, colors: (t) => ({ fill: [t.dark, 1], line: t.line, wcol: t.dark }) },
    ];
    bars.forEach((b, i) => {
        const px = x + 16 + i * (PW + 10), py = y + 16, wx = 56, wy = 50, ww = 50, wh = 170;
        list.push(
            { key: id + i, kind: 'rbox', x: px, y: py, w: PW, h: PH, z: 2, params: { u_box: [10, 2, 0, 0], u_win: [wx, wy, ww, wh], u_seg: [17] },
                colors: (t) => ({ fill: [t.panel, 1], line: t.line, wcol: t.lcd }), value: (d) => Math.max(0, Math.min(1, b.frac(d) || 0)), max: 1, sweep: true },
            C.text(id + i + 'Lbl', px + 6, py + 14, PW - 12, 20, b.label, ink, { z: 22 }),
            C.text(id + i + 'Hi', px + 16, py + wy, 30, 24, b.hi, ink, { z: 22 }),
            C.text(id + i + 'Lo', px + 16, py + wy + wh - 24, 30, 24, b.lo, ink, { z: 22 }),
            Object.assign(C.text(id + i + 'Num', px + 3, py + wy + wh + 25, PW - 6, 28, b.txt, (t, d) => (b.hot && b.hot(d) ? inkHot(t) : ink(t)), { z: 22 }), b.tone ? { tone: b.tone } : {}));
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
        params: { u_off: [X, Y], u_geo: [CURVE.cx, CURVE.cy, CURVE.R, CURVE.a0], u_geo2: [CURVE.xe, CURVE.T, CURVE.base, CURVE.lineTop], u_ticks: [s.max, 10], u_ld1: lead(1, s.max), u_ld2: lead(2, s.max) },
        colors: (t) => ({ ink: t.ink, dim: t.slat, line: t.line }),
        value: (d) => (elec(d) ? C.powerFrac(d) : C.isNum(d.rpm) ? Math.max(0, Math.min(1, d.rpm / (s.max * 1000))) : 0), max: 1, sweep: true,
        dyn: (d) => (elec(d) ? { u_red: [2], u_orange: [2], u_shift: [0] }
            : ((m) => ({ u_red: [m[0]], u_orange: [m[1]], u_shift: [B.shiftNow(o, d) ? 1 : 0] }))(B.redMarks(o, s.max * 1000, d))),
    });
    // the lines over the bar on up to the panel's top (0.40.4), as on the dash they're after, under the camera cowl
    // too (the camera hides them there): one more layer of the same drawing above the main one; only these lines
    // reach up there (hairlines, tools/clearance.js)
    list.push({ key: 'rtachTop', kind: 'rtach', x: X, y: 18, w: W, h: CURVE.lineTop - 18, z: -10, hairline: true,
        params: Object.assign({}, list[list.length - 1].params, { u_off: [X, 18], u_geo2: [CURVE.xe, CURVE.T, CURVE.base, 18] }),
        colors: (t) => ({ ink: t.ink, dim: t.slat, line: t.line }) });
    for (let i = 0; i <= s.max; i++) {
        const [x, y] = tachAt(i / s.max, 50), w = 60, h = 44;
        list.push(C.text('n' + i, Math.round(x - w / 2), Math.round(y - h / 2), w, h, String(i), (t, d) => (i * 1000 >= C.shiftPoint(o, d).red ? inkHot(t) : ink(t))));   // (red in the red zone)
    }
    // (the lines under the bar from the third thousand on: none cross the words or the gear, 0.40.2)
    list.push(C.text('tachLbl', 690, 470, 170, 28, (d) => (elec(d) ? 'POWER' : 'TACH'), ink, { align: 0, tracking: 0.06 }),
        C.text('tachUnit', 690, 502, 190, 22, (d) => (elec(d) ? C.POWER_UNIT : 'x1000 r/min'), ink, { align: 0 }));
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
            dyn: (d) => ({ u_num: [C.isNum(d.speed) ? Math.max(0, Math.min(999, Math.round(C.speedIn(o, d.speed)))) : 0] }) },
        C.text('spUnit', sp.x + sp.w - 112, sp.y + 112, 90, 30, C.speedUnit(o), grn, { align: 0, z: 22 }));
    // the main readout under the display (Settings > Main readout; a plug-in hybrid's battery power)
    const pv = C.focus.power(o), pl = C.focus.powerLabel(o, true);
    if (pv) list.push(Object.assign(C.fitText(C.text('kwNow', sp.x + 24, sp.y + 202, sp.w - 48, 30, (d) => (typeof pv === 'function' ? pv(d) : pv) + (pl ? '   ' + pl : ''), ink), 'wide'), { z: 22 }));
    // the boxes: left a reading and the fuel, right the coolant and a reading (each of the four set on the page:
    // Settings > Small gauge in the speedometer / in the tach for the outer two, the layout's places for the inner)
    const [left, fuel, cool, right] = boxBars(o);
    return scaled(list.concat(gaugeBox('boxL', 168, 236, [left, fuel]), gaugeBox('boxR', 1442, 236, [cool, right])))
        .concat(o.jdmCup === 'off' ? [] : [cup(o, o.jdmCup !== 'on')]);
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
 * The dash is drawn in design px (x 150..1822, y 132..602) and shown bigger (0.40.2): K times, its middle at x 960, its
 * bottom line at y 642 just above the car's strip (layout_common.STRIP_Y 646), its top lines just under the camera
 * cowl, its uprights clear of the panel's corners (tools/clearance.js). The shaders take their geometry in design px
 * (u_k); the lines stay 2 px.
 */
const K = 1.1, SX = (x) => 960 + (x - 986) * K, SY = (y) => 642 - (602 - y) * K;
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
    // (its own fuel gauge, the right dial - unless Small gauge in the tach puts another reading there: then the strip's)
    // (the dash: its fuel bar in the left box, unless another reading is set there: no strip bar, which would sit on
    // the box's foot)
    stripFuel: (o) => { if (o.centre !== 'map') return false; const g = C.gaugeOf(o, 'rpm'); return !!g && g.key !== 'fuel'; },
    // its own places, set on the page (layouts.js placesFor): the boxes' inner bars (0.41.10)
    places: [{ key: 'boxL2', kind: 'gauge', label: 'Left box: second bar', when: (o) => (o.centre || 'info') === 'info' },
        { key: 'boxR1', kind: 'gauge', label: 'Right box: first bar', when: (o) => (o.centre || 'info') === 'info' }],
    speedGauge: false,  // (the speed in figures only)

    pieces(o) {
        const bg = [C.flat('bg', 0, 0, 1920, 720, 'bg')];
        if (o.centre === 'map') {
            // the tach left of the map, a dial right of it (above the KOMBI's gear box without the car's strip); the
            // readouts above the map, the ranges under it
            const top = C.MAP.y, bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
                tachAlone(o, 196, 390, 176, false),
                alone(o, 'rpm', 1712, 390, 168, 1, null), [
                    C.text('clock', 520, top - 76, 200, 34, C.clock, lit),
                    C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), lit),
                ],
                C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', lit, lbl),
                C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? lit : elecTxt, lbl),
            );
        }
        // over the car's own strip (layout_common.STRIP_Y), which shows the gear and the ranges: the tach centred,
        // its ring from clear of the camera's cowl to just over the strip, a dial behind it either side. (2026-11-15,
        // a G20 with the driver camera: the ring's top, at y 125, touched the cowl, lower in the middle than the
        // G05's NOTCH; now its chrome from y 150, the bottom where it was)
        // (0.39.5) The dials behind it larger, 210 (176 before): the tach can't grow (the cowl above, the strip below),
        // they can, out to the sides
        // (0.40.0) the digital dash (above); the three dials stay for the map
        return dash(o);
    },
};
