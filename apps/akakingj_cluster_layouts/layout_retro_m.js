'use strict';
/**
 * layout_retro_m.js - "Retro M": the round dials of an M car of the VDO era, drawn anew (an original drawing of the
 * idea: no picture, maker's name or M lettering of anyone's): two black dials on a grey plastic panel, white
 * Barlow figures and bar ticks, orange needles over dark caps; a small gauge hanging in each big dial's face (the average
 * fuel economy, the oil, or the reading Settings picks) and the fuel and the coolant in small dials at either end;
 * between the big dials a small window with the gear and the M stripes under it (Old M's). A window in the
 * speedometer shows a reading picked on the page (the odometer as it comes), its figures and unit alone.
 *
 * One set of colours: the drive mode and the colour settings change nothing (palette). The needles, the tach's scale and
 * red zone, the temperature gauges and the small gauges' choices go as the other analog layouts'. Every piece a shader on the cluster's own GPU: the dials
 * (shaders.js RMDIAL_FS) each in one layer with the panel's plastic round them, the panel between them in pieces
 * (RMBG_FS), none larger than a dial (528 x 528).
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

/** The small gauge hanging in a big dial's face (Settings > Small gauge in the speedometer / in the tach, else the
 * layout's own: the trip computer's average economy, the oil), as the other analog layouts': a temperature C - H
 * (Settings > Temperature gauges) or on its scale, red from its too-hot temperature; any other reading along its scale,
 * its name above the pivot and its figures under the scale. { V, red, figs, value(d), label, sub(d), ch } */
function hanging(o, which) {
    const speed = which === 'speed', g = C.gaugeOf(o, which), f = o.tempUnit !== 'c';
    const key = g ? g.key : speed ? 'econ' : 'oil', ch = C.chOf(o, key);
    if (ch) return { V: [0, 1, 0.25, 0.5], red: [C.chRed(o, ch), -NONE], figs: false, ch: true, label: g ? g.label : 'OIL',
        value: (d) => C.chFrac(ch, d[ch]) };
    if (!g && speed) {
        // (its scale in the unit the trip computer's figures come in: mpg to 60, else to 20)
        const scaleOf = (d) => (C.econUnitOf(o, d) === 'mpg' ? [0, 60, 7.5, 15] : [0, 20, 2.5, 5]);
        return { V: scaleOf({}), scaleOf, red: [NONE, -NONE], figs: true,
            label: (d) => 'AVG ' + C.ECON_UNITS[C.econUnitOf(o, d)], dimLabel: (d) => !C.econ(o, d),
            value: (d) => { const e = C.econ(o, d); return e ? Math.min(scaleOf(d)[1], e.v) : 0; } };
    }
    if (!g) {
        const hot = C.hotAt(o, 'oil');
        return { V: f ? [120, 300, 45, 45] : [50, 150, 25, 25], red: [C.isNum(hot) ? C.tempIn(o, hot) : NONE, -NONE], figs: true,
            label: 'OIL °' + (f ? 'F' : 'C'), value: (d) => (C.isNum(d.oil) ? C.tempIn(o, d.oil) : (f ? 120 : 50)) };
    }
    return { V: [0, 1, 0.125, 0.5], red: [g.redFrac, C.isNum(g.low) ? (g.low - g.min) / (g.max - g.min) : -NONE], figs: false, label: g.label,
        value: (d) => g.frac(d), sub: g.txt, hot: g.hot };
}

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
    const h = hanging(o, which), mid = [cx, cy + 75 * k];
    // (the small needle in steps of a 400th of its scale, sent when it moves one)
    const step2 = (v, V) => { const sp = V[1] - V[0]; return Math.round(v / sp * 400) / 400 * sp; };
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
    out.push(textAt(which + 'SubUnit', cx, mid[1] - 16 * k, Math.round(150 * k), 18 * k, h.label,
        (t, d) => (h.dimLabel && h.dimLabel(d) ? { color: [t.label, 0.45], glow: [t.glow, 0] } : labelC(t)), sub));
    if (h.ch) out.push(...C.chMarks(which + 'Sub', mid[0], mid[1], sk(118), 236, 124, Math.round(22 * k), labelC));
    if (h.sub) out.push(textAt(which + 'SubVal', cx, mid[1] + 124 * k + 8 * k, Math.round(150 * k), 22 * k, h.sub,
        (t, d) => (h.hot(d) ? { color: [t.red, 1], glow: [t.glow, 0] } : white(t)), sub));
    return out;
}

/** A small dial at one end (fuel, coolant) at (cx, cy): its scale an arc over a pivot below its centre. The coolant
 * as the other analog layouts' temperature gauges: C - H (Settings > Temperature gauges) or its scale, red from its
 * too-hot temperature. */
function sideDial(o, which, cx, cy, box) {
    const fuel = which === 'fuel', f = o.tempUnit !== 'c', piv = Math.round(120 * 0.42 * 10) / 10;
    const ch = !fuel && C.chOf(o, 'coolant'), hot = C.hotAt(o, 'coolant');
    const V = fuel ? [0, 100, 12.5, 50] : ch ? [0, 1, 0.25, 0.5] : f ? [80, 280, 50, 100] : [30, 130, 25, 50];
    const red = fuel ? [NONE, 0] : ch ? [C.chRed(o, 'coolant'), -NONE] : [C.isNum(hot) ? C.tempIn(o, hot) : NONE, -NONE];
    const out = [{
        key: fuel ? 'rmFuel' : 'rmCoolant', kind: 'rmdial', x: box.x, y: box.y, w: box.w, h: box.h,
        params: {
            u_c: [cx - box.x, cy - box.y], u_origin: [box.x, box.y], u_look: [1, 2, 0, 0],
            u_rings: [120, 120, 130, 1],
            u_g1: [0, piv, -48, 48], u_v1: V, u_t1: [112, 94, 94, 6], u_x1: [fuel ? 4 : 6, 76, ch ? 0 : Math.round(20 / 0.92 * 100) / 100, 0],
            u_g2: [0, 0, 0, 0], u_v2: [0, 1, 1, 1], u_t2: [0, 0, 0, 0], u_x2: [0, 0, 0, 0], u_reds: [red[0], red[1], NONE, -NONE],
            u_needle: [108, 0, 5, 14],
        },
        colors: dialColours, max: V[1], sweep: true,
        value: fuel ? (d) => (C.isNum(d.fuelPct) ? Math.max(0, Math.min(100, d.fuelPct)) : 0)
            : ch ? (d) => C.chFrac('coolant', d.coolant) : (d) => (C.isNum(d.coolant) ? C.tempIn(o, d.coolant) : V[0]),
    }, textAt(fuel ? 'rmFuelLbl' : 'rmCoolantLbl', cx, cy + piv + 40, 100, 18, fuel ? 'FUEL' : ch ? 'COOLANT' : '°' + (f ? 'F' : 'C'), labelC, { tracking: 0.04 })];
    if (ch) out.push(...C.chMarks('rmCoolant', cx, cy + piv, 76, -48, 48, 20, labelC));
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

/* the big dials' centres' height: their outer rings clear of the camera's cowl (its corners at x 730 and 1190, y 128) */
const CY = 360;
/* the panel between the dials (x 40 - 1880, y 66 - 640), in pieces round the dials' squares (each dial draws the
 * plastic in its own square round its face: CY - 265 to CY + 265) */
const PANEL = [[40, 66, 1880, CY - 265], [40, CY + 265, 1880, 640], [40, CY - 265, 335, 340], [865, CY - 265, 1055, CY + 265], [1585, CY - 265, 1880, 340]];
const panelPiece = (r, i) => ({ key: 'bg' + i, kind: 'rmbg', x: r[0], y: r[1], w: r[2] - r[0], h: r[3] - r[1], params: { u_origin: [r[0], r[1]] },
    colors: (t) => ({ panel: t.panel }) });

module.exports = {
    id: 'retro_m',
    title: 'Retro M',
    palette: () => Object.assign({}, PAL),
    gearText: C.gearText,
    stripFuel: false,         // (its own fuel gauge)
    ownStripGauges: true,     // (none of the strip's bars: its dials hold the fuel)
    stripGear: true,          // (its gear window stays over the car's strip too)
    speedDigits: false,       // (no speed in figures: the car's strip shows it)
    // its own place, set on the page: the speedometer's window
    places: [{ key: 'speedWin', kind: 'readout', label: "Speedometer's window", when: (o) => (o.centre || 'info') === 'info' }],

    pieces(o) {
        if (o.centre === 'map') {
            // the two dials either side of the map, without their window, the end dials and the middle
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
                bigDial(o, 'speed', 208, 360, 202 / 264, false), bigDial(o, 'rpm', 1712, 360, 202 / 264, false));
        }
        const out = [C.flat('bgBlack', 0, 0, 1920, 720, 'bg')].concat(PANEL.map(panelPiece),
            bigDial(o, 'speed', 600, CY, 1, true), bigDial(o, 'rpm', 1320, CY, 1, true),
            sideDial(o, 'fuel', 190, 470, { x: 40, y: 340, w: 295, h: CY + 265 - 340 }), sideDial(o, 'coolant', 1730, 470, { x: 1585, y: 340, w: 295, h: CY + 265 - 340 }));
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
