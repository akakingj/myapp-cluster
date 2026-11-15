'use strict';
/**
 * layout_jdm2.js - "JDM 2": an original drawing after the idea of a Japanese grand tourer's digital cluster. A dark
 * carbon-weave panel; a big tach whose scale is a broad coloured band with the numerals in it, a slim glowing needle
 * over a chrome ring hub and the digital speed in its open lower right; a G meter left of it (the car's own lateral
 * and longitudinal acceleration, rings at 0.5 and 1 g); a glossy disc with the gear; two small gauges with chrome
 * rings, the coolant (C-H) and the fuel (E-F), their marks along the left of each (Settings > Tach gauge /
 * Speedometer gauge, or the page, put another reading in either). The ranges and the main readout in the column right
 * of the KOMBI's dark box. No maker's marks or names. The parts are one shader's (shaders.js JDM_FS, kind 'jdm').
 * With the map the tach stands left of it and the disc and small gauges right of it; with the stock centre the tach
 * left of the KOMBI's content.
 */
const C = require('./layout_common');

const PALETTES = {
    comfort: {
        bg: '#000000', face: '#16171a', bezel: '#dfe2e6', band: '#c3132b', red: '#ff7a1a', tick: '#ffffff', needle: '#ff8a26', dot: '#ff2a2a', disc: '#1d4fe0',
        text: '#f2f4f6', dim: '#9aa0a8', glow: '#ffffff', accent: '#ff8a26', track: '#1b1c1f', ev: '#4ab4ff', face0: '#0e0f11', face1: '#030303', bezel2: '#3c3f44', minor: '#9aa0a8', num: '#ffffff', hub: '#17181b',
    },
    sport: {
        bg: '#000000', face: '#18161a', bezel: '#e4e2e2', band: '#d10a1c', red: '#ffc21a', tick: '#ffffff', needle: '#ffb02a', dot: '#ffc21a', disc: '#a60a18',
        text: '#ffffff', dim: '#a8a0a0', glow: '#ff5a3a', accent: '#ffb02a', track: '#1f1415', ev: '#4ab4ff', face0: '#100d0e', face1: '#030202', bezel2: '#423c3c', minor: '#a8a0a0', num: '#ffffff', hub: '#1a1617',
    },
    efficient: {
        bg: '#000000', face: '#14171a', bezel: '#dde3e8', band: '#1670c4', red: '#ff3a1e', tick: '#ffffff', needle: '#f4f8ff', dot: '#38d4ff', disc: '#0d8a78',
        text: '#eef6ff', dim: '#97a4ae', glow: '#6ab8ff', accent: '#38d4ff', track: '#111a20', ev: '#4ab4ff', face0: '#0c0f12', face1: '#030405', bezel2: '#394148', minor: '#97a4ae', num: '#ffffff', hub: '#15181b',
    },
};
const jdmColours = (t) => ({ face: t.face, bezel: t.bezel, band: t.band, red: t.red, tick: t.tick, needle: t.needle, dot: t.dot, disc: t.disc });
const dialColours = (t) => ({ face0: t.face0, face1: t.face1, bezel: t.bezel, bezel2: t.bezel2, tick: t.tick, minor: t.minor, num: t.num, red: '#ff2a2a', needle: t.needle, hub: t.hub, accent: t.accent, glow: t.glow });
const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.15] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0.1] });
const redTxt = () => ({ color: ['#ff2a2a', 1], glow: ['#ff2a2a', 0.2] });
const elecTxt = (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.2] });
const kwNow = (d) => (C.isNum(d.kw) ? d.kw : 0);
const powerTxt = (t, d) => ({ color: [kwNow(d) < -0.3 ? '#3ddc84' : t.ev, 1], glow: [t.ev, 0.2] });
const A0 = -145, A1 = 100;    // the tach's sweep: 0 at about seven o'clock, the top just past three
const G_MAX = 1;              // g at the G meter's outer ring
const r2 = (v) => (C.isNum(v) ? Math.round(v * 100) / 100 : 0);

/** The background, its weave continuous across pieces (key bg...: under everything, cut at the car's strip). */
const back = (key, x, y, w, h) => ({ key, kind: 'jdm', x, y, w, h, z: -200, params: { u_mode: [0], u_origin: [x, y] }, colors: jdmColours });

/** The tach at (cx, cy), size across; with the digital speed and its unit in its open lower right. */
function tach(o, cx, cy, size, digits) {
    const R = size / 2, s = C.rpmScale(o);
    const list = [
        {
            key: 'rpm', kind: 'jdm', x: cx - R, y: cy - R, w: size, h: size,
            params: { u_mode: [3], u_origin: [cx - R, cy - R], u_scale: [s.max, s.major, s.minor, s.red], u_arc: [A0, A1, 0.15, 0], u_min: [0], u_zero: [0], u_regen: C.REGEN_RGB },
            colors: jdmColours, max: s.max, sweep: true,
            value: C.tachValue(o), range: C.tachRange(o, s), dyn: C.tachDyn(o, s, s.red),
        },
        // the unit right of the hub, under the band's end (with the engine off the battery's power, which the tach reads then)
        C.text('rpmUnit', cx + Math.round(R * 0.16), cy + Math.round(R * 0.2), Math.round(R * 0.56), Math.max(14, Math.round(R * 0.075)),
            (d) => (C.electric(o, d) ? C.kwText(d) : 'RPM x1000'), (t, d) => (C.electric(o, d) ? powerTxt(t, d) : redTxt(t)), { tracking: 0.06 }),
    ];
    if (digits) list.push(
        C.text('speedDigits', cx + Math.round(R * 0.16), cy + Math.round(R * 0.34), Math.round(R * 0.62), Math.round(R * 0.38), (d) => C.speedText(o, d), white),
        C.text('speedDigitsUnit', cx + Math.round(R * 0.2), cy + Math.round(R * 0.74), Math.round(R * 0.62), Math.max(14, Math.round(R * 0.085)), C.speedUnit(o), white, { tracking: 0.04 }));
    return list;
}

/** The G meter at (cx, cy), size across: its scale's marks at the ends of its cross. */
function gMeter(o, cx, cy, size) {
    const R = size / 2, gr = R * 0.62, h = Math.max(14, Math.round(R * 0.075)), w = Math.round(h * 2.6);
    const mark = (k, x, y) => C.text('gMark' + k, Math.round(x - w / 2), Math.round(y - h / 2), w, h, G_MAX.toFixed(1), lbl);
    return [
        {
            key: 'gMeter', kind: 'jdm', x: cx - R, y: cy - R, w: size, h: size,
            params: { u_mode: [1], u_origin: [cx - R, cy - R], u_gmax: [G_MAX], u_g: [0, 0] },
            // (the dot where the car is pushed: right in a left bend, down while accelerating)
            colors: jdmColours, dyn: (d) => ({ u_g: [r2(-d.gLat), r2(d.gLong)] }),
        },
        mark('T', cx, cy - gr - h * 1.3), mark('B', cx, cy + gr + h * 1.3), mark('L', cx - gr - w * 0.62, cy), mark('R', cx + gr + w * 0.62, cy),
        C.text('gLbl', cx + Math.round(R * 0.32), cy + Math.round(R * 0.66), Math.round(R * 0.3), h, 'G', lbl),
    ];
}

/** The disc with the gear in it. */
const gearDisc = (o, cx, cy, size) => [
    { key: 'gearDisc', kind: 'jdm', x: cx - size / 2, y: cy - size / 2, w: size, h: size, params: { u_mode: [2], u_origin: [cx - size / 2, cy - size / 2] }, colors: jdmColours },
    C.text('gear', cx - size * 0.4, cy - size * 0.24, size * 0.8, Math.round(size * 0.48), C.gearText, (t, d) => ({ color: [C.gearText(d) === 'R' ? '#ff4a3a' : '#ffffff', 1], glow: ['#ffffff', 0.15] })),
];

/*
 * A small gauge, size across at (cx, cy): its marks along its left (from the bottom up), the needle from the middle,
 * its icon at the right. Own readings: the fuel by the speed's setting (E and F), the coolant by the tach's (C and H,
 * as the car's own unless Settings > Temperature gauges: Scale); another one: its name and figures at the right.
 */
function small(o, which, cx, cy, size) {
    const g = C.gaugeOf(o, which), own = which === 'speed' ? 'fuel' : 'coolant', key = g ? g.key : own;
    const gg = g || C.gaugeOf(Object.assign({}, o, which === 'speed' ? { gaugeSpeed: own } : { gaugeRpm: own }), which);
    const ch = C.chOf(o, key), R = size / 2, id = which === 'speed' ? 'fuelSmall' : 'coolSmall';
    const lo = key === 'fuel' ? 'E' : ch ? 'C' : null, hi = key === 'fuel' ? 'F' : ch ? 'H' : null;
    const out = [{
        key: id, kind: 'dial', x: cx - R, y: cy - R, w: size, h: size, z: 6,
        params: { u_scale: [100, 50, 12.5, ch ? C.chRed(o, ch) * 100 : Math.min(101, gg.redFrac * 100)], u_arc: [-155, -25, 0, 0], u_needle_dim: [R * 0.66, R * 0.14, 5, 2.5], u_look: [0.2, 1, 0, 0], u_look2: [Math.max(5, Math.round(size * 0.05)), size / 640, 0.6, 0.6] },
        colors: dialColours, value: ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => gg.frac(d) * 100, max: 100, sweep: true,
    }];
    const h = Math.max(14, Math.round(R * 0.2));
    if (lo) {
        // the ends' letters above and below the hub, the empty or hot end in red
        const redLo = key === 'fuel';
        out.push(C.text(id + 'Lo', cx - h, Math.round(cy + R * 0.5), h * 2, h, lo, redLo ? redTxt : white),
            C.text(id + 'Hi', cx - h, Math.round(cy - R * 0.5 - h), h * 2, h, hi, redLo ? white : redTxt));
    }
    if (lo && !g) {
        out.push({ key: id + 'Icon', kind: 'icon', x: Math.round(cx + R * 0.36), y: Math.round(cy - R * 0.14), w: Math.round(R * 0.3), h: Math.round(R * 0.3), params: { u_icon: [key === 'fuel' ? 4 : 0], u_line: [0] }, colors: (t) => ({ color: [t.dim, 1] }) });
        return out;
    }
    // another reading (or the gauge's own with its figures): its name and figures right of the hub
    const fig = which === 'speed' ? 'speedSubNum' : 'rpmSubNum';
    return out.concat(C.text(id + 'Lbl', Math.round(cx + R * 0.12), Math.round(cy - R * 0.36), Math.round(R * 0.74), Math.max(11, Math.round(R * 0.14)), gg.label, lbl, { tracking: 0.1 }),
        Object.assign(C.text(fig, Math.round(cx + R * 0.12), Math.round(cy + R * 0.16), Math.round(R * 0.74), Math.max(12, Math.round(R * 0.2)), gg.txt, white), C.TEMP_TONES[key] ? { tone: key } : {}));
}

/** The column right of the KOMBI's dark box: the fuel range, the electric range (the boost), the main readout. */
function column(o, my) {
    const RX = 1672, RW = 216, y = my || 506;
    return [
        ...C.reading('fuel', RX, 292, RW, 44, (d) => C.distText(o, d.frange), 'FUEL RANGE', white, lbl),
        ...C.reading('elec', RX, 400, RW, 44, C.focus.range(o), C.focus.rangeLabel(o), C.engineFocus(o) ? white : elecTxt, lbl),
        C.text('kwNow', RX, y, RW, 44, C.focus.power(o), (t, d) => (C.engineFocus(o) ? white(t) : powerTxt(t, d))),
        C.text('kwNowLbl', RX, y + 56, RW, 18, C.focus.powerLabel(o), lbl, { tracking: 0.1 }),
    ];
}

module.exports = {
    id: 'jdm2',
    title: 'JDM 2',
    palette: (lookId) => PALETTES[lookId] || PALETTES.comfort,
    gearText: C.gearText,
    stripGear: true,    // (the gear's disc is one of its parts: kept over the car's own strip)
    speedGauge: false,  // (the speed in figures only, in the tach)
    // (its own fuel gauge: the strip's fuel bar only with another reading there)
    stripFuel: (o) => { const g = C.gaugeOf(o, 'speed'); return !!g && g.key !== 'fuel'; },

    /*
     * Built round what the glass and the KOMBI keep (layout_common; tools/clearance.js): the camera's cowl over the
     * tach's top, the dark box right of the gear's disc (the small gauges below it), the eDrive box over the column,
     * the warning lights under the tach. Nothing of it in the M car's boxes but the tach (layouts.M_ON_DIAL).
     */
    pieces(o) {
        if (o.centre === 'map') {
            // the tach left of the map; the disc, the small gauges right of it; the time and outside temperature
            // above the map, the ranges under it
            const top = C.MAP.y, bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => back('bg' + i, r.x, r.y, r.w, r.h)).concat(
                tach(o, 208, 360, 404, true), gearDisc(o, 1600, 175, 170), small(o, 'rpm', 1590, 565, 140), small(o, 'speed', 1780, 565, 140), [
                    C.text('clock', 520, top - 76, 200, 34, C.clock, white),
                    C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), white),
                ],
                C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', white, lbl),
                C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? white : elecTxt, lbl),
            );
        }
        if (C.strip(o) && o.centre !== 'stock') {
            // the car's own strip: no boxes to keep clear of; the G meter and the tach either side of the middle,
            // sized to end above the strip, the disc and the small gauges right of them; the readouts the strip
            // leaves (the main readout, readouts 1 and 2 in the time's and temperature's places) in the column
            return [back('bg', 0, 0, 1920, 720)].concat(gMeter(o, 330, 330, 520), tach(o, 900, 386, 520, true),
                gearDisc(o, 1300, 200, 190), small(o, 'rpm', 1300, 470, 200), small(o, 'speed', 1540, 470, 200), [
                    C.text('clock', 1672, 300, 216, 34, C.clock, white),
                    C.text('outside', 1672, 360, 216, 34, (d) => C.outsideText(o, d.outside), white),
                ], column(o, 430));
        }
        // the G meter left, the tach in the middle under the cowl, the disc and the coolant between the tach and the
        // dark box, the fuel below the box, the column right of it; with the stock centre the tach where the G meter was
        const stock = o.centre === 'stock';
        const list = stock
            ? [back('bg', 0, 0, 566, 720), back('bgR', 1104, 0, 816, 720)].concat(tach(o, 290, 380, 480, true))
            : [back('bg', 0, 0, 1920, 720)].concat(gMeter(o, 300, 372, 500), tach(o, 880, 386, 516, true));
        return list.concat(gearDisc(o, 1300, 170, 190), small(o, 'rpm', 1290, 530, 200), small(o, 'speed', 1536, 548, 180), [
            C.text('clock', 60, 652, 240, 34, C.clock, white, { align: 0 }),
            C.text('outside', 1430, 100, 220, 36, (d) => C.outsideText(o, d.outside), white, { align: 0 }),
        ], column(o));
    },
};
