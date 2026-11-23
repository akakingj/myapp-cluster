'use strict';
/**
 * layout_retro_m.js - "Retro M": the round dials of an M car of the VDO era, drawn anew (an original drawing of the
 * idea: no picture, maker's name or M lettering of anyone's): two black dials on a grey plastic panel, white
 * condensed figures and bar ticks, orange needles over dark caps; the average fuel economy hanging in the
 * speedometer's face and the oil temperature in the tach's; the fuel and the coolant in small dials at either end;
 * between the big dials a small window with the gear and the M stripes under it (Old M's). A window in the
 * speedometer shows a reading picked on the page (the odometer as it comes), its figures and unit alone.
 *
 * One set of colours: the drive mode and the colour settings change nothing (palette). The tach's scale and red ticks
 * follow the Car profile (Gauge goes up to, Red light at). Every piece a shader on the cluster's own GPU: the dials
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

/** A big dial at (cx, cy), the speedometer or the tach, k its scale (1: radius 250 and its 264 px outer ring). */
function bigDial(o, which, cx, cy, k, fill) {
    const speed = which === 'speed', kmh = o.speedUnit === 'kmh', rs = C.rpmScale(o);
    const R = 264 * k, size = Math.ceil(2 * R + 2), x0 = Math.round(cx - size / 2), y0 = Math.round(cy - size / 2);
    const sk = (v) => Math.round(v * k * 100) / 100;
    const V1 = speed ? [0, kmh ? 260 : 160, 10, 20] : [0, rs.max, 0.5, 1];
    // the small gauge hanging in the face: the trip computer's average economy (speedometer), the oil (tach)
    const temp = (c) => C.tempIn(o, c), f = o.tempUnit !== 'c';
    const econU = C.econUnitOf(o, {});
    const V2 = speed ? (econU === 'mpg' ? [0, 60, 7.5, 15] : [0, 20, 2.5, 5]) : f ? [120, 300, 45, 45] : [50, 150, 25, 25];
    const red2 = speed ? [NONE, -NONE] : [f ? 255 : 125, -NONE];
    const value2 = speed ? (d) => { const e = C.econ(o, d); return e ? Math.min(V2[1], e.v) : 0; } : (d) => (C.isNum(d.oil) ? temp(d.oil) : V2[0]);
    const piece = {
        key: which, kind: 'rmdial', x: x0, y: y0, w: size, h: size,
        params: {
            u_c: [cx - x0, cy - y0], u_origin: [x0, y0], u_look: [fill ? 1 : 0, sk(3), sk(5), 0],
            u_rings: [sk(250), sk(254), sk(264), k],
            u_g1: [0, 0, -132, 132], u_v1: V1, u_t1: [sk(244), sk(214), sk(230), sk(9)], u_x1: [sk(5), sk(184), sk((speed ? 30 : 38) / 0.92), 0],
            u_g2: [0, sk(75), 236, 124], u_v2: V2, u_t2: [sk(102), sk(86), sk(86), sk(speed ? 5 : 7)], u_x2: [sk(5), sk(124), sk(22 / 0.92), sk(96)],
            u_reds: [speed ? NONE : rs.red, -NONE, red2[0], red2[1]],
            u_needle: [sk(232), sk(40), sk(8), sk(30)],
        },
        colors: dialColours, max: V1[1], sweep: true,
        value: speed ? (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0) : (d) => (C.isNum(d.rpm) ? d.rpm / 1000 : 0),
        dyn: (d) => ({ u_value2: [Math.round(value2(d) * 10) / 10] }),
    };
    const unitW = Math.round(220 * k), sub = { tracking: 0.02 };
    const out = [piece];
    if (speed) {
        out.push(textAt('speedUnit', cx, cy - 92 * k, unitW, 24 * k, C.speedUnit(o), unitC, sub));
        out.push(textAt('speedSubUnit', cx, cy + 75 * k - 16 * k, Math.round(150 * k), 18 * k, (d) => 'AVG ' + C.ECON_UNITS[C.econUnitOf(o, d)],
            (t, d) => (C.econ(o, d) ? labelC(t) : { color: [t.label, 0.45], glow: [t.glow, 0] }), sub));
    } else {
        out.push(textAt('rpmUnit', cx, cy - 92 * k, unitW, 24 * k, '1/min', unitC, sub), textAt('rpmUnit2', cx, cy - 56 * k, unitW, 22 * k, 'x1000', unitC, sub));
        out.push(textAt('rpmSubUnit', cx, cy + 75 * k - 16 * k, Math.round(150 * k), 18 * k, 'OIL °' + (f ? 'F' : 'C'), labelC, sub));
    }
    return out;
}

/** A small dial at one end (fuel, coolant) at (cx, cy): its scale an arc over a pivot below its centre. */
function sideDial(o, which, cx, cy, box) {
    const fuel = which === 'fuel', f = o.tempUnit !== 'c', piv = Math.round(120 * 0.42 * 10) / 10;
    const V = fuel ? [0, 100, 12.5, 25] : f ? [80, 280, 50, 50] : [30, 130, 25, 25];
    const red = fuel ? [NONE, 0] : [f ? C.tempIn(o, 130) : 130, -NONE];
    return [{
        key: fuel ? 'rmFuel' : 'rmCoolant', kind: 'rmdial', x: box.x, y: box.y, w: box.w, h: box.h,
        params: {
            u_c: [cx - box.x, cy - box.y], u_origin: [box.x, box.y], u_look: [1, 2, 0, 0],
            u_rings: [120, 120, 130, 1],
            u_g1: [0, piv, -48, 48], u_v1: V, u_t1: [112, 94, 94, 6], u_x1: [fuel ? 4 : 6, 76, Math.round(20 / 0.92 * 100) / 100, 0],
            u_g2: [0, 0, 0, 0], u_v2: [0, 1, 1, 1], u_t2: [0, 0, 0, 0], u_x2: [0, 0, 0, 0], u_reds: [red[0], red[1], NONE, -NONE],
            u_needle: [108, 0, 5, 14],
        },
        colors: dialColours, max: V[1], sweep: true,
        value: fuel ? (d) => (C.isNum(d.fuelPct) ? Math.max(0, Math.min(100, d.fuelPct)) : 0) : (d) => (C.isNum(d.coolant) ? C.tempIn(o, d.coolant) : V[0]),
    }, textAt(fuel ? 'rmFuelLbl' : 'rmCoolantLbl', cx, cy + piv + 40, 100, 18, fuel ? 'FUEL' : '°' + (f ? 'F' : 'C'), labelC, { tracking: 0.04 })];
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
    font: 'cond',
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
