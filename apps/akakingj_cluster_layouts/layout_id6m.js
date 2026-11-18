'use strict';
/**
 * layout_id6m.js - "ID6 M": round dials after the M cars' analog clusters of the mid 2010s, an original drawing. Two
 * big dials, each with a thin white ring round its top (open at the bottom), a dark band, white marks and large
 * numerals, a darker disc in the middle and a long red-orange needle; between the dials a display (0.41.0, as 20's: readouts
 * 1 and 2, the speed in big figures, the main readout); the tach's shift lights along the outside of
 * its top end (amber Settings > Amber zone below the red zone, then red; lower while the oil is cold, as the red zone);
 * the gear under the tach in a white arc; the M tricolour under the speedometer (no lettering); a small fuel gauge
 * left of the speedometer and a small engine oil gauge right of the tach (Settings > Speedometer gauge / Tach gauge,
 * or the page, put another reading in either). Shaders: shaders.js MROUND_FS (kind 'mround').
 */
const C = require('./layout_common');

const PALETTES = {
    comfort: { bg: '#000000', face: '#1d1e21', ring: '#f2f3f4', tick: '#ffffff', needle: '#ff4a1c', amber: '#ffb01a', red: '#ff2a1a', text: '#ffffff', dim: '#9ca0a6', glow: '#ffffff', accent: '#ff4a1c', track: '#1a1b1d', ev: '#4ab4ff', num: '#ffffff', lcdTop: '#17181b', lcdBottom: '#0a0a0c', lcdEdge: '#4b4e54' },
    sport: { bg: '#000000', face: '#1f1d1e', ring: '#f4f2f2', tick: '#ffffff', needle: '#ff2a14', amber: '#ffa014', red: '#ff1a10', text: '#ffffff', dim: '#a49c9c', glow: '#ff6a4a', accent: '#ff2a14', track: '#1d1819', ev: '#4ab4ff', num: '#ffffff', lcdTop: '#17181b', lcdBottom: '#0a0a0c', lcdEdge: '#4b4e54' },
    efficient: { bg: '#000000', face: '#1b1e21', ring: '#e8f0f6', tick: '#f2f8ff', needle: '#ff6a1c', amber: '#ffb01a', red: '#ff2a1a', text: '#f2f8ff', dim: '#98a4ae', glow: '#6ab8ff', accent: '#3aa0ff', track: '#151a1e', ev: '#4ab4ff', num: '#ffffff', lcdTop: '#17181b', lcdBottom: '#0a0a0c', lcdEdge: '#4b4e54' },
};
const roundColours = (t) => ({ face: t.face, ring: t.ring, tick: t.tick, needle: t.needle, amber: t.amber, red: t.red });
const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.12] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0.08] });
const elecTxt = (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.2] });
const kwNow = (d) => (C.isNum(d.kw) ? d.kw : 0);
const powerTxt = (t, d) => ({ color: [kwNow(d) < -0.3 ? '#3ddc84' : t.ev, 1], glow: [t.ev, 0.2] });
const A0 = -125, A1 = 125;     // the big dials' sweep
const NUM_H = 0.13;            // their numerals' height, of the radius
/** Settings > Amber zone below the red zone, in thousands of rpm (700 rpm by default, as ID7 M's and ID8 M's). */
const amberK = (o) => (o && o.amberRpm !== undefined && o.amberRpm !== '' && isFinite(Number(o.amberRpm)) ? Math.max(0, Number(o.amberRpm)) : 700) / 1000;

/** The speedometer at (cx, cy), radius R: its unit over the middle, the M tricolour in its open foot. */
function speedo(o, cx, cy, R) {
    const s = C.speedScale(o), dense = o.speedUnit === 'kmh';
    return [
        {
            key: 'speed', kind: 'mround', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R,
            params: { u_mode: [0], u_scale: [s.max, s.major, s.minor, s.max + 1], u_arc: [A0, A1, dense ? 0.115 : NUM_H, s.max + 1], u_min: [0], u_zero: [0], u_regen: C.REGEN_RGB },
            colors: roundColours, max: s.max, sweep: true, value: (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0),
        },
        C.text('speedUnit', cx - R * 0.3, cy - Math.round(R * 0.3), R * 0.6, Math.max(14, Math.round(R * 0.075)), C.speedUnit(o), white, { tracking: 0.04 }),
        // the M tricolour (bimmer-lab's stripes, as ID7 M's and Old M's)
        { key: 'mStripes', kind: 'mdash', x: Math.round(cx - 42), y: Math.round(cy + R * 0.62), w: 84, h: 34, z: 5, params: { u_part: [4], u_off: [Math.round(cx - 42), Math.round(cy + R * 0.62)], u_mark: [Math.round(cx - 36), Math.round(cy + R * 0.62) + 4, 1.2] }, colors: (t) => ({ red: t.red }) },
    ];
}

/** The tach at (cx, cy), radius R: the shift lights, the unit, the gear in the white arc under it. */
function tach(o, cx, cy, R, gear) {
    const s = C.rpmScale(o), dyn = C.tachDyn(o, s, s.red);
    const list = [
        {
            key: 'rpm', kind: 'mround', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R,
            params: { u_mode: [0], u_scale: [s.max, s.major, s.minor, s.red], u_arc: [A0, A1, NUM_H, s.red - amberK(o)], u_min: [0], u_zero: [0], u_regen: C.REGEN_RGB },
            colors: roundColours, max: s.max, sweep: true, value: C.tachValue(o), range: C.tachRange(o, s),
            // (the shift lights from the red zone where the shift point puts it now; none on the battery's power)
            dyn: (d) => { const u = dyn(d), red = u.u_scale[3]; return Object.assign(u, { u_arc: [A0, A1, NUM_H, C.electric(o, d) ? u.u_scale[0] + 1 : red - amberK(o)] }); },
        },
        C.text('rpmUnit', cx - R * 0.35, cy - Math.round(R * 0.3), R * 0.7, Math.max(14, Math.round(R * 0.07)),
            (d) => (C.electric(o, d) ? C.POWER_UNIT : 'x1000 rpm'), (t, d) => (C.electric(o, d) ? powerTxt(t, d) : white(t)), { tracking: 0.02 }),
    ];
    if (!gear) return list;
    // the gear's white arc under the tach, in its open foot
    const ax = Math.round(cx - R * 0.66), ay = Math.round(cy + R * 0.5), aw = Math.round(R * 1.32), ah = Math.round(R * 0.54), ar = Math.round(R * 1.02);
    return list.concat([
        { key: 'gearArc', kind: 'mround', x: ax, y: ay, w: aw, h: ah, params: { u_mode: [2], u_arc: [cx - ax, cy - ay, ar, 34] }, colors: roundColours },
        C.text('gear', cx - R * 0.3, Math.round(cy + R * 0.62), R * 0.6, Math.round(R * 0.26), C.gearText, (t, d) => ({ color: [C.gearText(d) === 'R' ? t.red : t.text, 1], glow: [t.glow, 0.1] })),
    ]);
}

/*
 * A small gauge at (cx, cy), radius R: by the speedometer the fuel (0, 1/2, 1), by the tach the engine oil (70 to 170
 * °C, 160 to 340 °F, red from Settings > Too hot) - on a plug-in hybrid the battery's charge (0 to 100 %; 0.42.1, as
 * the other layouts show it); another reading there (Settings > Speedometer gauge / Tach
 * gauge): its name and figures under the hub (a temperature as the car's own: C and H at the ends).
 */
function small(o, which, cx, cy, R) {
    const g = C.gaugeOf(o, which), own = which === 'speed' ? 'fuel' : !C.engineFocus(o) ? 'soc' : 'oil', id = which === 'speed' ? 'fuelSmall' : 'oilSmall';
    const f = o.tempUnit === 'c', h = Math.max(13, Math.round(R * 0.2));
    const pos = (a, rr) => [cx + Math.sin(a * Math.PI / 180) * R * rr, cy - Math.cos(a * Math.PI / 180) * R * rr];
    const mark = (k, a, txt, col) => { const [x, y] = pos(a, 0.5), w = Math.round(h * 2.4); return C.text(id + k, Math.round(x - w / 2), Math.round(y - h / 2), w, h, txt, col || white); };
    let value, red, marks = [], under = [];
    if (!g) {
        if (own === 'fuel') {
            value = (d) => (C.isNum(d.fuelPct) ? Math.max(0, Math.min(100, d.fuelPct)) : 0); red = 101;
            marks = [mark('Lo', -105, '0'), mark('Mid', 0, '1/2'), mark('Hi', 105, '1')];
        } else if (own === 'soc') {
            value = (d) => (C.isNum(d.soc) ? Math.max(0, Math.min(100, d.soc)) : 0); red = 101;
            marks = [mark('Lo', -105, '0'), mark('Mid', 0, '50'), mark('Hi', 105, '100')];
        } else {
            const hot = C.hotAt(o, 'oil');
            value = (d) => (C.isNum(d.oil) ? Math.max(0, Math.min(100, d.oil - 70)) : 0); red = Math.max(0, Math.min(101, hot - 70));
            marks = [mark('Lo', -105, f ? '70' : '160'), mark('Mid', 0, f ? '120' : '250'), mark('Hi', 105, f ? '170' : '340')];
        }
        const [ix, iy] = pos(own === 'fuel' ? -140 : 140, 0.55), is = Math.round(R * 0.26);
        under = [{ key: id + 'Icon', kind: 'icon', x: Math.round(ix - is / 2), y: Math.round(iy - is / 2), w: is, h: is, params: { u_icon: [own === 'fuel' ? 4 : own === 'soc' ? 6 : 1], u_line: [0] }, colors: (t) => ({ color: [t.text, 1] }) }];
    } else {
        const ch = C.chOf(o, g.key);
        value = ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => g.frac(d) * 100;
        red = ch ? C.chRed(o, ch) * 100 : Math.min(101, g.redFrac * 100);
        if (ch) marks = [mark('Lo', -105, 'C'), mark('Hi', 105, 'H', (t) => ({ color: [t.red, 1], glow: [t.red, 0.2] }))];
        const fig = which === 'speed' ? 'speedSubNum' : 'rpmSubNum';
        under = [C.text(id + 'Lbl', cx - R * 0.6, Math.round(cy + R * 0.22), R * 1.2, Math.max(11, Math.round(R * 0.14)), g.label, lbl, { tracking: 0.1 }),
            Object.assign(C.text(fig, cx - R * 0.6, Math.round(cy + R * 0.42), R * 1.2, Math.max(12, Math.round(R * 0.2)), g.txt, white), C.TEMP_TONES[g.key] ? { tone: g.key } : {})];
    }
    return [{
        key: id, kind: 'mround', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, z: 6,
        params: { u_mode: [1], u_scale: [100, 50, 12.5, red], u_arc: [-110, 110, 0, 0] }, colors: roundColours, value, max: 100, sweep: true,
    }].concat(marks, under);
}

module.exports = {
    id: 'id6m',
    title: 'ID6 M',
    palette: (lookId) => PALETTES[lookId] || PALETTES.comfort,
    gearText: C.gearText,
    stripGear: true,     // (the gear's white arc is part of the tach: kept over the car's own strip)
    ownStripGauges: true,   // (its own fuel gauge; no bars over the car's strip, which shows the ranges)
    // its own places, set on the page: the trip computer's three lines (with Settings > Centre display: Trip computer)
    places: C.tripPlaces(3),

    /*
     * Built round what the glass and the KOMBI keep (layout_common; tools/clearance.js): the camera's cowl between
     * the dials' tops, the dark box right of the tach (the oil gauge under it), the warning lights under the middle.
     */
    pieces(o) {
        if (o.centre === 'map') {
            // the speedometer left of the map, the tach right of it (small, below the dark box; with the car's
            // strip as big as the speedometer); the small gauges below their inner sides
            const top = C.MAP.y, bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
                speedo(o, 208, 360, 202), small(o, 'speed', 350, 584, 58),
                tach(o, 1712, 360, 202, true), small(o, 'rpm', 1570, 584, 58), [
                    C.text('clock', 520, top - 76, 200, 34, C.clock, white),
                    C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), white),
                ],
                C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', white, lbl),
                C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? white : elecTxt, lbl),
            );
        }
        // the car's own strip: the two dials either side of the camera's cowl, as big as Old M's (0.39.5; radius 250
        // before, close in under the cowl), the small gauges in the outer bottom corners, clear of the dials' open
        // feet and over the strip; no readouts beside them (the strip shows the time, temperature and ranges)
        return [C.flat('bg', 0, 0, 1920, 720, 'bg')].concat(speedo(o, 470, 330, 300), tach(o, 1450, 330, 300, true),
            small(o, 'speed', 140, 562, 80), small(o, 'rpm', 1780, 562, 80), [
            ], centreDisplay(o, 812, 168, 296, 446));
    },
};

/*
 * The display between the dials (0.41.0, as 20's): readouts 1 and 2 at its top, the speed in big figures, the main
 * readout under it, in a dark panel with a thin ring-white edge; under the camera's cowl's foot, above the warning
 * lights (tools/clearance.js).
 */
function centreDisplay(o, X, Y, W, H) {
    const sy = H / 470;
    return [
        { key: 'lcd', kind: 'panel', x: X, y: Y, w: W, h: H, params: { u_box: [20, 2, 0.5, 1] }, colors: (t) => ({ top: t.lcdTop, bottom: t.lcdBottom, border: t.lcdEdge }) },
        C.text('clock', X + 16, Y + 18, (W - 38) / 2, 30, C.clock, white, { align: 0 }),
        C.text('outside', X + W / 2 + 3, Y + 18, (W - 38) / 2, 30, (d) => C.outsideText(o, d.outside), white, { align: 1 }),
        C.flat('rule1', X + 24, Y + Math.round(62 * sy), W - 48, 2, 'lcdEdge'),
    ].concat(C.tripShown(o)
        // (Settings > Centre display: Trip computer, 0.46.0: its three lines in the speed's place)
        ? C.tripRows(o, X + 14, Y + Math.round(80 * sy), W - 28, Math.round(220 * sy), 3, lbl, white, 'bold')
        : [
            C.text('speedDigits', X, Y + Math.round(104 * sy), W, 140, (d) => C.speedText(o, d), white),
            C.text('speedDigitsUnit', X, Y + Math.round(254 * sy), W, 22, C.speedUnit(o), lbl, { tracking: 0.12 }),
        ], [
        C.flat('rule2', X + 24, Y + Math.round(312 * sy), W - 48, 2, 'lcdEdge'),
        C.text('kwNow', X, Y + Math.round(338 * sy), W, 54, C.focus.power(o), (t, d) => (C.engineFocus(o) ? white(t) : powerTxt(t, d))),
        C.text('kwNowLbl', X, Y + Math.round(400 * sy), W, 18, C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
    ]);
}
