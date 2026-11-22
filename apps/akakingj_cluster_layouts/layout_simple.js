'use strict';
/**
 * layout_simple.js - "Simple": made for the car's own bottom strip. Three figures on one baseline across the middle,
 * the engine speed left, the speed large under the camera's cowl, the gear right; their units in one small line
 * under them, a rule, and under each of the three a line of the trip computer, its name small above its figures
 * (places tripRow1-3: as designed the distance, the driving time and the average economy). The engine speed turns yellow from Settings > Yellow shift
 * light from, red from the red zone (Red light at); at the shift warning (Shift now warning at) the speed and
 * the gear turn red with it. The settings as set, the cold-engine guard aside. Pulse's colours, after the drive mode;
 * with the map or the stock centre, Pulse's pieces. An original design.
 */
const C = require('./layout_common');
const P = require('./layout_pulse');

const YELLOW = '#ffc83d', RED = '#ff3b30';
const big = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.5] });
const txt = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.12] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] });
const bg = (key, x, y, w, h) => ({ key, kind: 'panel', x, y, w, h, params: { u_box: [0, 0, 0, 1] }, colors: (t) => ({ top: t.bgTop, bottom: t.bgBottom, border: t.bgBottom }) });

/** Where the engine speed stands: 0 under the yellow, 1 yellow, 2 red (the red zone), 3 at the shift warning. */
function level(o, d) {
    if (!C.isNum(d.rpm) || d.engineOn === false) return 0;
    const red = C.rpmScale(o).red * 1000, warn = C.shiftPoint(o, {}).rpm, yellow = Math.min(C.yellowAt(o, {}), red);
    return d.rpm >= warn ? 3 : d.rpm >= red ? 2 : d.rpm >= yellow ? 1 : 0;
}
const rpmC = (o) => (t, d) => { const l = level(o, d), c = l >= 2 ? RED : l === 1 ? YELLOW : t.text; return { color: [c, 1], glow: [l ? c : t.glow, 0.5] }; };
const warnC = (o, base) => (t, d) => (level(o, d) === 3 ? { color: [RED, 1], glow: [RED, 0.5] } : base(t, d));
const gearC = (t, d) => ({ color: [C.gearText(d) === 'R' ? RED : t.text, 1], glow: [t.glow, 0.5] });
/** The engine speed to 50 rpm with a thousands comma (6,100), OFF with the engine off. */
const rpmNum = (d) => (d.engineOn === false ? 'OFF' : C.isNum(d.rpm) ? String(C.rpmShown(d)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--');

// the three figures on one baseline (a digit's foot sits 0.785 of its box down, measured off the atlas as drawn),
// the units' line under it, the rule, the trip computer's names and figures
const BASE = 370, FOOT = 0.785, UNITS_Y = 392, RULE_Y = 442, TRIP_Y = 458;
const COLS = [[260, 400], [690, 540], [1260, 400]];   // x, w: the engine speed, the speed, the gear
const FIG_H = 115, SPEED_H = 250;
const topFor = (h) => Math.round(BASE - FOOT * h);

module.exports = {
    id: 'simple',
    stripGear: true,   // (the gear on the right: kept over the car's own strip)
    speedGauge: false,  // (the speed in figures only)
    title: 'Simple',
    // its own places, set on the page (layouts.js placesFor): the trip row's three lines
    places: C.tripPlaces(3, (o) => o.centre !== 'map' && o.centre !== 'stock'),
    palette: P.palette,
    gearText: C.gearText,

    pieces(o) {
        if (o.centre === 'map' || o.centre === 'stock') return P.pieces(o);
        const [R, S, G] = COLS;
        // a line of the trip computer under each figure: its name small above, its figures (the widest a readout
        // gives fitted)
        const cell = (i) => {
            const r = C.placeReadout(o, C.placeOf(o, 'tripRow' + (i + 1)) || C.TRIP_OWN[3][i]), [x, w] = COLS[i];
            const v = C.fitText(C.text('tripRow' + (i + 1), x + 40, TRIP_Y + 26, w - 80, 44, r.value, txt), 'bold', 0.95);
            return [C.text('tripLbl' + (i + 1), x, TRIP_Y, w, 20, r.short, lbl, { tracking: 0.25 }), Object.assign(v, r.tone ? { tone: r.tone } : {})];
        };
        return [bg('bg', 0, 0, 1920, 720),
            C.text('rpmDigits', R[0], topFor(FIG_H), R[1], FIG_H, rpmNum, rpmC(o)),
            C.text('speedDigits', S[0], topFor(SPEED_H), S[1], SPEED_H, (d) => C.speedText(o, d), warnC(o, big)),
            C.text('gear', G[0], topFor(FIG_H), G[1], FIG_H, C.gearText, warnC(o, gearC)),
            C.text('rpmUnit', R[0], UNITS_Y, R[1], 28, 'RPM', lbl, { tracking: 0.25 }),
            C.text('speedUnit', S[0], UNITS_Y, S[1], 28, C.speedUnit(o).toUpperCase(), lbl, { tracking: 0.25 }),
            C.text('gearUnit', G[0], UNITS_Y, G[1], 28, 'GEAR', lbl, { tracking: 0.25 }),
            C.flat('rule', R[0], RULE_Y, G[0] + G[1] - R[0], 2, 'tick'),
        ].concat(...[0, 1, 2].map(cell));
    },
};
