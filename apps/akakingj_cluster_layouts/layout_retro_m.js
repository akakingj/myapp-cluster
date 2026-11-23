'use strict';
/**
 * layout_retro_m.js - "Retro M": the round dials of an M car of the VDO era, drawn anew (an original drawing of the
 * idea: no picture, maker's name or M lettering of anyone's): two black dials on grey plastic over the whole screen, white
 * Barlow figures and bar ticks, orange needles over dark caps; a small gauge hanging in each big dial's face (the average
 * fuel economy, the oil, or the reading Settings picks) and the fuel and the coolant in small dials at either end;
 * between the big dials a small window with the gear and the M stripes under it (Old M's). A window in the
 * speedometer shows a reading picked on the page (the odometer as it comes), its figures and unit alone.
 *
 * One set of colours: the drive mode and the colour settings change nothing (palette). The needles, the tach's scale and
 * red zone, the temperature gauges and the small gauges' choices go as the other analog layouts'. Every piece a shader on the cluster's own GPU: the dials
 * (shaders.js RMDIAL_FS) each in one layer with the panel's plastic round them, under them the plastic over the whole
 * screen as JDM 2's carbon (RMBG_FS, a 6 px checker).
 */
const C = require('./layout_common');

const PAL = {
    bg: '#000000', face: '#050505', border: '#101112', ring: '#2a2b2c', mark: '#f2f2f2', red: '#e03a2a', hand: '#ff6a1a',
    cap: '#1a1a1a', panel: '#3a3c3e',
    text: '#f2f2f2', dim: '#d8d8d8', label: '#cfcfcf', win: '#121314', winEdge: '#2c2d2e', speedWinEdge: '#2a2a2a', glow: '#000000',
};
const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0] });
const unitC = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] });
const labelC = (t) => ({ color: [t.label, 1], glow: [t.glow, 0] });
const dialColours = (t) => ({ face: t.face, border: t.border, ring: t.ring, mark: t.mark, red: t.red, hand: t.hand, cap: t.cap, panel: t.panel });
const NONE = 1e9;

/** A text whose baseline is at y, `size` px (the font's size: the glyph cell 1 / 0.92 of it, its baseline 0.79 down). */
function textAt(key, cx, y, w, size, txt, colors, extra) {
    const h = Math.round(size / 0.92);
    return C.text(key, Math.round(cx - w / 2), Math.round(y - 0.79 * h), w, h, txt, colors, extra);
}

/* the small gauges' places (set on the page) and what each shows as the layout has it */
const OWN = { rmSpeedSub: 'econ', rmRpmSub: 'oil', rmLeft: 'fuel', rmRight: 'coolant' };
/** The reading a small gauge's place holds: the one picked on the page, else the layout's own. */
const pick = (o, place) => { const k = C.placeOf(o, place); return k === 'econ' || (k && C.GAUGES[k]) ? k : OWN[place]; };
/** What a small gauge shows of reading k (a GAUGES reading, or 'econ': the trip computer's average economy), as the
 * other analog layouts' small gauges: a temperature C - H (Settings > Temperature gauges) or on its scale, red from its
 * too-hot temperature; the fuel and the economy on their scales; any other reading along its scale without figures,
 * its figures in words (sub) instead. { V, red, figs, value(d), label, ch, sub(d), hot(d), dimLabel(d), scaleOf(d) } */
function spec(o, k) {
    const f = o.tempUnit !== 'c', ch = C.chOf(o, k), g = k === 'econ' ? null : C.gaugeOf(Object.assign({}, o, { gaugeSpeed: k }), 'speed');
    if (k === 'econ') {
        // (its scale in the unit the trip computer's figures come in: mpg to 60, else to 20)
        const scaleOf = (d) => (C.ECON_UNITS[C.econUnitOf(o, d)] === 'mpg' ? [0, 60, 7.5, 15] : [0, 20, 2.5, 5]);
        return { V: scaleOf({}), scaleOf, red: [NONE, -NONE], figs: true,
            label: (d) => 'AVG ' + C.ECON_UNITS[C.econUnitOf(o, d)], dimLabel: (d) => !C.econ(o, d),
            value: (d) => { const e = C.econ(o, d); return e ? Math.min(scaleOf(d)[1], e.v) : 0; } };
    }
    if (ch) return { V: [0, 1, 0.25, 0.5], red: [C.chRed(o, ch), -NONE], figs: false, ch: true, label: g.label, value: (d) => C.chFrac(ch, d[ch]) };
    if (k === 'fuel') return { V: [0, 100, 12.5, 50], red: [NONE, 0], figs: true, label: 'FUEL', value: (d) => (C.isNum(d.fuelPct) ? Math.max(0, Math.min(100, d.fuelPct)) : 0) };
    if (C.HOT_KEY[k]) {
        const hot = C.hotAt(o, k), V = f ? [100, 300, 25, 100] : [40, 140, 12.5, 50];
        return { V, red: [C.isNum(hot) ? C.tempIn(o, hot) : NONE, -NONE], figs: true, label: g.label + ' °' + (f ? 'F' : 'C'),
            value: (d) => (C.isNum(d[k]) ? C.tempIn(o, d[k]) : V[0]) };
    }
    return { V: [0, 1, 0.125, 0.5], red: [g.redFrac, C.isNum(g.low) ? (g.low - g.min) / (g.max - g.min) : -NONE], figs: false, label: g.label,
        value: (d) => g.frac(d), sub: g.txt, hot: g.hot };
}
/** a small gauge's name: dimmed while it has nothing to show (the economy before the trip computer gives one) */
const labelOf = (h) => (t, d) => (h.dimLabel && h.dimLabel(d) ? { color: [t.label, 0.45], glow: [t.glow, 0] } : labelC(t));
const subOf = (h) => (t, d) => (h.hot(d) ? { color: [t.red, 1], glow: [t.glow, 0] } : white(t));
// (the small needles in steps of a 400th of their scale, sent when they move one)
const step2 = (v, V) => { const sp = V[1] - V[0]; return Math.round(v / sp * 400) / 400 * sp; };

/** A big dial at (cx, cy), the speedometer or the tach, k its scale (1: radius 250 and its 264 px outer ring). The tach
 * as the other analog layouts' (layout_common tachValue): its red zone lower while the oil is cold (shiftPoint), and in
 * a plug-in hybrid's electric modes Power % (0 - 100). */
function bigDial(o, which, cx, cy, k, fill) {
    const speed = which === 'speed', kmh = o.speedUnit === 'kmh', rs = C.rpmScale(o);
    const R = 264 * k, size = Math.ceil(2 * R + 2), x0 = Math.round(cx - size / 2), y0 = Math.round(cy - size / 2);
    const sk = (v) => Math.round(v * k * 100) / 100;
    const V1 = speed ? [0, kmh ? 260 : 160, 10, 20] : [0, rs.max, 0.5, 1];
    const PCT = [0, C.PCT.max, C.PCT.minor, C.PCT.major];
    const elec = (d) => !speed && C.electric(o, d);
    const h = spec(o, pick(o, speed ? 'rmSpeedSub' : 'rmRpmSub')), mid = [cx, cy + 75 * k];
    const reds = (d) => (speed ? [NONE, -NONE] : elec(d) ? [NONE, -NONE] : [Math.min(rs.red, C.shiftPoint(o, d).red / 1000), -NONE]).concat(h.red);
    const piece = {
        key: which, kind: 'rmdial', x: x0, y: y0, w: size, h: size,
        params: {
            u_c: [cx - x0, cy - y0], u_origin: [x0, y0], u_look: [fill ? 1 : 0, sk(3), sk(5), 0],
            u_rings: [sk(250), sk(254), sk(264), k],
            u_g1: [0, 0, -132, 132], u_v1: V1, u_t1: [sk(244), sk(214), sk(230), sk(9)], u_x1: [sk(5), sk(184), sk((speed ? (kmh ? 27 : 30) : 38) / 0.92), 0],
            u_g2: [0, sk(75), 236, 124], u_v2: h.V, u_t2: [sk(102), sk(86), sk(86), sk(speed ? 5 : 7)], u_x2: [sk(5), sk(124), h.figs ? sk(22 / 0.92) : 0, sk(96)],
            u_reds: reds({}),
            u_needle: [sk(232), sk(40), sk(8), sk(30)],
        },
        colors: dialColours, max: V1[1], sweep: true,
        value: speed ? (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0) : (d) => (elec(d) ? Math.max(0, C.powerPct(d)) : C.isNum(d.rpm) ? d.rpm / 1000 : 0),
        range: speed ? undefined : (d) => [0, elec(d) ? C.PCT.max : V1[1]],
        dyn: (d) => { const V2 = h.scaleOf ? h.scaleOf(d) : h.V; return Object.assign({ u_value2: [step2(h.value(d), V2)], u_reds: reds(d) }, h.scaleOf ? { u_v2: V2 } : {}, speed ? {} : { u_v1: elec(d) ? PCT : V1 }); },
    };
    const unitW = Math.round(220 * k), sub = { tracking: 0.02 };
    const out = [piece];
    if (speed) out.push(textAt('speedUnit', cx, cy - 92 * k, unitW, 24 * k, C.speedUnit(o), unitC, sub));
    else out.push(textAt('rpmUnit', cx, cy - 92 * k, unitW, 24 * k, (d) => (elec(d) ? C.POWER_UNIT : '1/min'), unitC, sub),
        textAt('rpmUnit2', cx, cy - 56 * k, unitW, 22 * k, (d) => (elec(d) ? '' : 'x1000'), unitC, sub));
    out.push(textAt(which + 'SubUnit', cx, mid[1] - 16 * k, Math.round(170 * k), 18 * k, h.label, labelOf(h), sub));
    if (h.ch) out.push(...C.chMarks(which + 'Sub', mid[0], mid[1], sk(118), 236, 124, Math.round(22 * k), labelC));
    if (h.sub) out.push(textAt(which + 'SubVal', cx, mid[1] + 124 * k + 8 * k, Math.round(150 * k), 22 * k, h.sub, subOf(h), sub));
    return out;
}

/** A small dial at one end (left: the fuel, right: the coolant, as the layout has them; each a place) at (cx, cy): its
 * scale an arc over a pivot below its centre, its name under the pivot (and its figures in words under that, for a
 * reading its scale has none of). */
function sideDial(o, place, cx, cy, box) {
    const h = spec(o, pick(o, place)), piv = Math.round(120 * 0.42 * 10) / 10, key = place === 'rmLeft' ? 'rmFuel' : 'rmCoolant';
    const out = [{
        key, kind: 'rmdial', x: box.x, y: box.y, w: box.w, h: box.h,
        params: {
            u_c: [cx - box.x, cy - box.y], u_origin: [box.x, box.y], u_look: [1, 2, 0, 0],
            u_rings: [120, 120, 130, 1],
            u_g1: [0, piv, -48, 48], u_v1: h.V, u_t1: [112, 94, 94, 6], u_x1: [5, 76, h.figs ? Math.round(20 / 0.92 * 100) / 100 : 0, 0],
            u_g2: [0, 0, 0, 0], u_v2: [0, 1, 1, 1], u_t2: [0, 0, 0, 0], u_x2: [0, 0, 0, 0], u_reds: h.red.concat([NONE, -NONE]),
            u_needle: [108, 0, 5, 14],
        },
        colors: dialColours, max: h.V[1], min: h.V[0], sweep: true, value: h.value,
        dyn: h.scaleOf ? (d) => ({ u_v1: h.scaleOf(d) }) : undefined,
        range: h.scaleOf ? (d) => [0, h.scaleOf(d)[1]] : undefined,
    }];
    out.push(textAt(key + 'Lbl', cx, cy + piv + (h.sub ? 32 : 40), 150, 18, h.label, labelOf(h), { tracking: 0.04 }));
    if (h.sub) out.push(textAt(key + 'Val', cx, cy + piv + 54, 120, 18, h.sub, subOf(h), { tracking: 0.02 }));
    if (h.ch) out.push(...C.chMarks(key, cx, cy + piv, 76, -48, 48, 20, labelC));
    return out;
}

/** The reading in the speedometer's window: its figures and unit alone (the odometer as it comes; the trip one decimal). */
function windowText(o) {
    const k = C.placeOf(o, 'speedWin') || 'odo';
    if (k === 'trip') return (d) => (C.isNum(d.tripKm) ? (o.speedUnit === 'kmh' ? d.tripKm : d.tripKm / 1.609344).toFixed(1) + (o.speedUnit === 'kmh' ? ' km' : ' mi') : '--');
    const r = C.READOUTS[k];
    if (!r) return '';
    return (d) => { const n = r.num(o, d); return n + (r.unit && n !== '--' && n !== 'OFF' ? ' ' + r.unit(o) : ''); };
}

const ECON = ['econ', "Average fuel economy (the car's trip computer)"];
// (with the map or the stock centre - over the car's strip, the stock centre is the map's form too - the two dials alone)
const noMap = (o) => (o.centre || 'info') === 'info';

/* the big dials' centres' height: their outer rings clear of the camera's cowl (its corners at x 730 and 1190, y 128) */
const CY = 360;
/** The background, the grey plastic over the whole screen as JDM 2's carbon, its grain continuous across pieces (key bg...:
 * under everything, cut at the car's strip). */
const back = (key, x, y, w, h) => ({ key, kind: 'rmbg', x, y, w, h, params: { u_origin: [x, y] }, colors: (t) => ({ panel: t.panel }) });

module.exports = {
    id: 'retro_m',
    title: 'Retro M',
    palette: () => Object.assign({}, PAL),
    gearText: C.gearText,
    stripFuel: false,         // (its own fuel gauge)
    ownStripGauges: true,     // (none of the strip's bars: its dials hold the fuel)
    stripGear: true,          // (its gear window stays over the car's strip too)
    speedDigits: false,       // (no speed in figures: the car's strip shows it)
    // its own places, set on the page: the speedometer's window, and every gauge but the speed's and the revs' (any small
    // gauge's reading, or the average economy)
    places: [{ key: 'speedWin', kind: 'readout', label: "Speedometer's window", when: noMap },
        { key: 'rmSpeedSub', kind: 'gauge', label: 'Gauge in the speedometer', extra: [ECON] },
        { key: 'rmRpmSub', kind: 'gauge', label: 'Gauge in the tach', extra: [ECON] },
        { key: 'rmLeft', kind: 'gauge', label: 'Small dial: left', extra: [ECON], when: noMap },
        { key: 'rmRight', kind: 'gauge', label: 'Small dial: right', extra: [ECON], when: noMap }],

    pieces(o) {
        if (o.centre === 'map') {
            // the two dials either side of the map (the plastic round it), without their window, the end dials and the middle
            return C.aroundMap().map((r, i) => back('bg' + i, r.x, r.y, r.w, r.h)).concat(
                bigDial(o, 'speed', 208, 360, 202 / 264, false), bigDial(o, 'rpm', 1712, 360, 202 / 264, false));
        }
        const out = [back('bg', 0, 0, 1920, 720)].concat(
            bigDial(o, 'speed', 600, CY, 1, true), bigDial(o, 'rpm', 1320, CY, 1, true),
            sideDial(o, 'rmLeft', 190, 470, { x: 40, y: 340, w: 295, h: CY + 265 - 340 }), sideDial(o, 'rmRight', 1730, 470, { x: 1585, y: 340, w: 295, h: CY + 265 - 340 }));
        // the speedometer's window, its reading
        out.push({ key: 'speedWinBox', kind: 'panel', x: 520, y: CY - 76, w: 160, h: 34, z: 5, params: { u_box: [3, 1, 0, 1] },
            colors: (t) => ({ top: t.win, bottom: t.win, border: t.speedWinEdge }) });
        out.push(Object.assign(textAt('speedWin', 600, CY - 51, 150, 26, windowText(o), white, { tracking: 0.02 }), { z: 25 }));
        // the gear in its window, the M stripes under it
        out.push({ key: 'gearWin', kind: 'panel', x: 896, y: 360, w: 128, h: 62, z: 5, params: { u_box: [6, 3, 0, 1] },
            colors: (t) => ({ top: t.win, bottom: t.win, border: t.winEdge }) });
        out.push(Object.assign(textAt('gearTxt', 960, 406, 116, 44, C.gearText, white), { z: 25 }));
        out.push({ key: 'mStripes', kind: 'mdash', x: 918, y: 444, w: 84, h: 34, z: 6, params: { u_part: [4], u_off: [918, 444], u_mark: [924, 448, 1.2] }, colors: (t) => ({ red: t.red }) });
        return out;
    },
};
