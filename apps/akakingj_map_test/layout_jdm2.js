'use strict';
/**
 * layout_jdm2.js - "JDM 2": an original drawing after the idea of a Japanese grand tourer's digital cluster. A dark
 * carbon-weave panel; a big tach whose scale is a broad coloured band with the numerals in it, a slim glowing needle
 * over a chrome ring hub and the digital speed in its open lower right; a G meter in a big round window left of it
 * (the car's own lateral and longitudinal acceleration, as G Force and Car Vitals read it); a glossy disc with the gear; two small gauges with chrome
 * rings, the coolant (C-H) and the fuel (E-F), their marks along the left of each (Settings > Tach gauge /
 * Speedometer gauge, or the page, put another reading in either). The ranges and the main readout in the column right
 * of the KOMBI's dark box. No maker's marks or names. The parts are one shader's (shaders.js JDM_FS, kind 'jdm').
 * Over the car's own strip (0.41.0) the beginner driver's mark at the right (a traffic sign of Japan's; the owner's
 * call). With the map the tach stands left of it and the disc and small gauges right of it; with the stock centre the tach
 * left of the KOMBI's content.
 */
const C = require('./layout_common');

/* one skin in every drive mode (the red tach, as the photo's tuned GT-R): only the gear's disc follows the mode -
 * blue in comfort and Adaptive, red in a sport mode, teal in ECO PRO and on electricity */
const BASE = {
    bg: '#000000', face: '#16171a', bezel: '#dfe2e6', band: '#c3132b', red: '#ff7a1a', tick: '#ffffff', needle: '#ff8a26', dot: '#ff2a2a', disc: '#1d4fe0',
    text: '#f2f4f6', dim: '#9aa0a8', glow: '#ffffff', accent: '#ff8a26', track: '#1b1c1f', ev: '#4ab4ff', face0: '#0e0f11', face1: '#030303', bezel2: '#3c3f44', minor: '#9aa0a8', num: '#ffffff', hub: '#17181b',
};
const DISCS = { comfort: '#1d4fe0', sport: '#c80a1c', efficient: '#0d8a78' };
const PALETTES = {
    comfort: BASE,
    sport: Object.assign({}, BASE, { disc: DISCS.sport }),
    efficient: Object.assign({}, BASE, { disc: DISCS.efficient }),
};
const jdmColours = (t) => ({ face: t.face, bezel: t.bezel, band: t.band, red: t.red, tick: t.tick, needle: t.needle, dot: t.dot, disc: t.disc, warn: '#ff2a2a' });
const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.15] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0.1] });
const redTxt = () => ({ color: ['#ff2a2a', 1], glow: ['#ff2a2a', 0.2] });
const elecTxt = (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.2] });
const kwNow = (d) => (C.isNum(d.kw) ? d.kw : 0);
const powerTxt = (t, d) => ({ color: [kwNow(d) < -0.3 ? '#3ddc84' : t.ev, 1], glow: [t.ev, 0.2] });
const A0 = -150, A1 = 95;     // the tach's sweep: 0 at about seven o'clock, the top just past three
const r2 = (v) => (C.isNum(v) ? Math.round(v * 100) / 100 : 0);
/** Settings > JDM 2: G meter size (g at the meter's outer ring; 1.5 as G Force and Car Vitals). */
const gScale = (o) => { const v = Number(o && o.gScale); return v >= 0.5 && v <= 3 ? v : 1.5; };

/** The background, its weave continuous across pieces (key bg...: under everything, cut at the car's strip). */
const back = (o, key, x, y, w, h) => ({ key, kind: 'jdm', x, y, w, h, z: -200, params: { u_mode: [0], u_origin: [x, y] }, colors: jdmColours });

/** The tach at (cx, cy), radius R; the digital speed and its unit in its open lower right. */
function tach(o, cx, cy, R) {
    const size = 2 * R, s = C.rpmScale(o);
    return [
        {
            key: 'rpm', kind: 'jdm', x: cx - R, y: cy - R, w: size, h: size,
            params: { u_mode: [3], u_origin: [cx - R, cy - R], u_scale: [s.max, s.major, s.minor, s.red], u_arc: [A0, A1, 0.15, 0], u_min: [0], u_zero: [0], u_regen: C.REGEN_RGB },
            colors: jdmColours, max: s.max, sweep: true,
            value: C.tachValue(o), range: C.tachRange(o, s), dyn: C.tachDyn(o, s, s.red),
        },
        // the unit right of the hub, under the band's end (with the engine off the battery's power, the tach reads it then)
        C.text('rpmUnit', cx + Math.round(R * 0.2), cy + Math.round(R * 0.16), Math.round(R * 0.5), Math.max(14, Math.round(R * 0.07)),
            (d) => (C.electric(o, d) ? C.POWER_UNIT : 'x1000 rpm'), (t, d) => (C.electric(o, d) ? powerTxt(t, d) : redTxt(t)), { tracking: 0.06 }),
        // (0.37.0: both up a little, the unit clear of the bezel's ring: it sat on it at cy + R * 0.7)
        C.text('speedDigits', cx + Math.round(R * 0.16), cy + Math.round(R * 0.26), Math.round(R * 0.6), Math.round(R * 0.34), (d) => C.speedText(o, d), white),
        C.text('speedDigitsUnit', cx + Math.round(R * 0.16), cy + Math.round(R * 0.62), Math.round(R * 0.6), Math.max(14, Math.round(R * 0.08)), C.speedUnit(o), white, { tracking: 0.04 }),
    ];
}

/*
 * The G meter in a big round window at (cx, cy), radius R: the meter in its middle, its size's figures at the ends of
 * its cross. The dot as the driver feels the G (0.41.6; every app's since 0.47.0, no setting): right in a left bend
 * (the car's lateral G > 0 turning left), down while accelerating, up braking; the car's own acceleration less its
 * offset at a standstill, smoothed (data.js gLatZ, gLongZ). Behind the dot its trail (0.47.0; 0.47.2 as the iDrive
 * G-Force app's, flowing): a thin line through where it was over the last 3.2 s, a place every TRAIL_MS, TRAIL_N of
 * them, on to the dot, each piece fading smoothly with its age and the oldest shrinking away (the shader's u_trail,
 * four places a vec4, one number each: packOf; u_trail_np: how many, the phase, the trail's bounding circle - the
 * shader works nothing out outside it).
 */
const TRAIL_MS = 200, TRAIL_N = 16;
/** A place (x, y of the meter's ring, within 1.12) as one number: x and y in hundredths, 128 on, x the high byte. */
const packOf = (q) => (Math.round(q[0] * 100) + 128) * 256 + Math.round(q[1] * 100) + 128;
/** The trail from the dot's places: a new one every TRAIL_MS (now: ms), TRAIL_N kept, the oldest first; the phase to
 * the next (0..1, a twentieth at a time) every frame - but none while the dot stands still with the trail on it (a
 * parked car: nothing sent). */
function trailOf() {
    const pts = [];
    let at = 0;
    return (g, now) => {
        const l = Math.hypot(g[0], g[1]), k = l > 1.12 ? 1.12 / l : 1, here = [r2(g[0] * k), r2(g[1] * k)];
        const still = pts.length === TRAIL_N && pts.every((q) => q[0] === here[0] && q[1] === here[1]);
        if (!still && !(now - at < TRAIL_MS)) {
            at = now;
            pts.push(here);
            if (pts.length > TRAIL_N) pts.shift();
        }
        const flat = [];
        for (let i = 0; i < TRAIL_N; i++) flat.push(packOf(pts[i] || pts[pts.length - 1] || [0, 0]));
        const phase = still ? 0 : Math.min(1, Math.round((now - at) / TRAIL_MS * 20) / 20);
        // (the bounding circle of the places and the dot: its centre a place, its radius in the meter's units)
        const all = pts.concat([here]), xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
        const mid = [r2((Math.min(...xs) + Math.max(...xs)) / 2), r2((Math.min(...ys) + Math.max(...ys)) / 2)];
        const rad = Math.ceil(Math.max(...all.map((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1]))) * 100 + 1) / 100;
        return { u_trail: flat, u_trail_np: [pts.length, phase, packOf(mid), rad] };
    };
}
function gMeter(o, cx, cy, R) {
    // (0.37.2: the meter 0.6 R across, was 0.46; its figures larger, and the G now in figures under it)
    const gr = R * 0.6, h = Math.max(16, Math.round(R * 0.085)), w = Math.round(h * 2.6), max = gScale(o);
    const trail = trailOf();   // (module.exports.parts: its tests)
    const fig = Math.abs(max * 10 - Math.round(max * 10)) > 1e-6 ? max.toFixed(2) : max.toFixed(1);   // (1.2: '1.2')
    const mark = (k, x, y) => C.text('gMark' + k, Math.round(x - w / 2), Math.round(y - h / 2), w, h, fig, white);
    const gv = (d, k) => (C.isNum(d[k + 'Z']) ? d[k + 'Z'] : d[k]);
    return [
        {
            key: 'gMeter', kind: 'jdm', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R,
            params: { u_mode: [1], u_origin: [cx - R, cy - R], u_g: [0, 0] },
            colors: jdmColours, dyn: (d) => { const g = [r2(gv(d, 'gLat') / max), r2(gv(d, 'gLong') / max)]; return Object.assign({ u_g: g }, trail(g, Date.now())); },
        },
        mark('T', cx, cy - gr - h * 1.2), mark('B', cx, cy + gr + h * 1.2), mark('L', cx - gr - w * 0.6, cy), mark('R', cx + gr + w * 0.6, cy),
        // the G now (both ways together), in the meter's lower right quarter
        C.text('gNow', Math.round(cx + gr * 0.18), Math.round(cy + gr * 0.42), Math.round(gr * 0.78), Math.round(R * 0.13), (d) => {
            const x = gv(d, 'gLat'), y = gv(d, 'gLong');
            return C.isNum(x) || C.isNum(y) ? Math.hypot(C.isNum(x) ? x : 0, C.isNum(y) ? y : 0).toFixed(2) + ' G' : '';
        }, white, { align: 0.5 }),
    ];
}

/** A tyre's pressure in Settings > Pressure unit: bar to a tenth, psi and kPa whole (as GT3's). */
const pressIn = (o, bar) => (C.pressUnitOf(o) === 'bar' ? bar.toFixed(1) : String(Math.round(C.pressUnitOf(o) === 'psi' ? bar * 14.5038 : bar * 100)));
const TYRES = ['FL', 'FR', 'RL', 'RR'];
/** each tyre's state for the drawing: 0 no reading, 1 fine, 2 low (under 1.6 bar, or 0.25 bar under the fullest) */
const tyreStates = (d) => {
    const p = (d.tyres && d.tyres.p) || {}, have = TYRES.filter((k) => C.isNum(p[k])), top = have.length ? Math.max(...have.map((k) => p[k])) : 0;
    return TYRES.map((k) => (!C.isNum(p[k]) ? 0 : p[k] < 1.6 || p[k] < top - 0.25 ? 2 : 1));
};
/** The four temperatures' places in the window, from the top left clockwise. */
const TEMPS = ['oil', 'coolant', 'gearbox', 'iat'];

/*
 * The big round window left of the tach (Settings > JDM 2: left dial, set for JDM 2 on the page): the G meter (the
 * default), a speedometer, the tyres (pressure and temperature at each corner, the car from above) or four
 * temperatures (engine oil, coolant, gearbox oil, intake air: an arc each, red when too hot).
 */
function leftDial(o, cx, cy, R) {
    const what = o.leftDial || 'gmeter', base = { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R };
    const h = Math.max(14, Math.round(R * 0.075));
    if (what === 'speed') {
        const s = C.speedScale(o);
        return [
            Object.assign({ key: 'speedDial', kind: 'jdm' }, base, {
                params: { u_mode: [5], u_origin: [cx - R, cy - R], u_scale: [s.max, s.major, s.minor, s.max + 1], u_arc: [145, 415, 0.1, 0] },
                colors: (t) => Object.assign(jdmColours(t), { needle: '#ff2a1e' }), max: s.max, sweep: true,
                value: (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0),
            }),
            C.text('speedDialUnit', cx - R * 0.3, cy - Math.round(R * 0.36), R * 0.6, h, C.speedUnit(o), lbl, { tracking: 0.06 }),
        ];
    }
    if (what === 'tyres') {
        const cw = Math.round(R * 0.5), big = Math.round(R * 0.15), small = Math.round(R * 0.085);
        return [Object.assign({ key: 'tyreDial', kind: 'jdm' }, base, { params: { u_mode: [6], u_origin: [cx - R, cy - R], u_tyre: [0, 0, 0, 0] }, colors: jdmColours, dyn: (d) => ({ u_tyre: tyreStates(d) }) }),
            C.text('tyreUnit', cx - R * 0.4, cy - Math.round(R * 0.78), R * 0.8, h, 'TYRES ' + C.pressLabel(o).toUpperCase(), lbl, { tracking: 0.1 }),
        ].concat(...TYRES.map((k, i) => {
            const left = i % 2 === 0, ty = cy + (i < 2 ? -Math.round(R * 0.3) : Math.round(R * 0.16)), tx = left ? cx - Math.round(R * 0.32) - cw : cx + Math.round(R * 0.32);
            const col = (t, d) => (tyreStates(d)[i] === 2 ? { color: ['#ff2a2a', 1], glow: ['#ff2a2a', 0.2] } : white(t));
            return [
                C.text('tyre' + k, tx, ty, cw, big, (d) => (d.tyres && C.isNum(d.tyres.p[k]) ? pressIn(o, d.tyres.p[k]) : '--'), col, { align: left ? 1 : 0 }),
                C.text('tyreT' + k, tx, ty + big + 6, cw, small, (d) => (d.tyres && C.isNum(d.tyres.t[k]) ? C.tempText(o, d.tyres.t[k]) : ''), lbl, { align: left ? 1 : 0 }),
            ];
        }));
    }
    if (what === 'temps') {
        // (each quarter's reading as designed, or the one set there on the page: places temp1-4)
        const gs = TEMPS.map((k, i) => C.placeGauge(o, C.placeOf(o, 'temp' + (i + 1)) || k));
        const big = Math.round(R * 0.13), small = Math.round(R * 0.07), w = Math.round(R * 0.62);
        return [Object.assign({ key: 'tempDial', kind: 'jdm' }, base, {
            params: { u_mode: [7], u_origin: [cx - R, cy - R], u_t: [0, 0, 0, 0], u_tr: gs.map((g) => Math.min(1.01, Math.round(g.redFrac * 1000) / 1000)) },
            colors: jdmColours, dyn: (d) => ({ u_t: gs.map((g) => Math.round(g.frac(d) * 200) / 200) }),
        })].concat(...gs.map((g, i) => {
            // its figures in the quarter, the name under them
            const qx = i === 0 || i === 3 ? -1 : 1, qy = i < 2 ? -1 : 1;
            const x = Math.round(cx + qx * R * 0.36 - w / 2), y = Math.round(cy + qy * R * 0.36 - (big + small + 6) / 2);
            return [
                Object.assign(C.text(TEMPS[i] + 'Temp', x, y, w, big, (d) => { const n = g.num(d); return n === '--' || n === 'OFF' ? n : n + (g.unit[0] === '°' ? '°' : ' ' + g.unit); }, white), g.tone ? { tone: g.tone } : {}),
                C.text(TEMPS[i] + 'TempLbl', x, y + big + 6, w, small, g.label, lbl, { tracking: 0.1 }),
            ];
        }));
    }
    return gMeter(o, cx, cy, R);
}

/** The disc with the gear in it, radius R. */
const gearDisc = (o, cx, cy, R) => [
    { key: 'gearDisc', kind: 'jdm', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, params: { u_mode: [2], u_origin: [cx - R, cy - R] }, colors: jdmColours },
    C.text('gear', cx - R * 0.8, cy - R * 0.5, R * 1.6, Math.round(R * 1.0), C.gearText, (t, d) => ({ color: [C.gearText(d) === 'R' ? '#ff4a3a' : '#ffffff', 1], glow: ['#ffffff', 0.12] })),
];

/*
 * A small gauge at (cx, cy), radius R: its marks along its left from the bottom up, the needle from the middle, its
 * icon at the right. Own readings: the fuel by the speed's setting (E and F), the coolant by the tach's (C and H, as
 * the car's own unless Settings > Temperature gauges: Scale); another one: its name and figures at the right.
 */
function small(o, which, cx, cy, R) {
    const g = C.gaugeOf(o, which), own = which === 'speed' ? 'fuel' : 'coolant', key = g ? g.key : own;
    const gg = g || C.gaugeOf(Object.assign({}, o, which === 'speed' ? { gaugeSpeed: own } : { gaugeRpm: own }), which);
    const ch = C.chOf(o, key), id = which === 'speed' ? 'fuelSmall' : 'coolSmall', fuel = key === 'fuel';
    const lo = fuel ? 'E' : ch ? 'C' : null, hi = fuel ? 'F' : ch ? 'H' : null;
    // (the warning end: the fuel's empty quarter at the bottom, a temperature's red zone at the top)
    const warn = fuel ? -1 : ch ? C.chRed(o, ch) * 100 : Math.min(101, gg.redFrac * 100);
    const out = [{
        key: id, kind: 'jdm', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, z: 6,
        params: { u_mode: [4], u_origin: [cx - R, cy - R], u_scale: [100, 50, 12.5, fuel ? 101 : warn], u_arc: [-160, -20, 0, 0] },
        colors: jdmColours, value: ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => gg.frac(d) * 100, max: 100, sweep: true,
    }];
    const h = Math.max(14, Math.round(R * 0.2));
    if (lo) {
        out.push(C.text(id + 'Lo', cx - h, Math.round(cy + R * 0.48), h * 2, h, lo, fuel ? redTxt : white),
            C.text(id + 'Hi', cx - h, Math.round(cy - R * 0.48 - h), h * 2, h, hi, fuel ? white : redTxt));
    }
    if (lo && !g) {
        out.push({ key: id + 'Icon', kind: 'icon', x: Math.round(cx + R * 0.34), y: Math.round(cy - R * 0.16), w: Math.round(R * 0.32), h: Math.round(R * 0.32), params: { u_icon: [fuel ? 4 : 0], u_line: [0] }, colors: (t) => ({ color: [t.text, 1] }) });
        return out;
    }
    // another reading (or the gauge's own with its figures): its name and figures right of the hub
    const fig = which === 'speed' ? 'speedSubNum' : 'rpmSubNum';
    return out.concat(C.text(id + 'Lbl', Math.round(cx + R * 0.1), Math.round(cy - R * 0.36), Math.round(R * 0.74), Math.max(11, Math.round(R * 0.14)), gg.label, lbl, { tracking: 0.1 }),
        Object.assign(C.text(fig, Math.round(cx + R * 0.1), Math.round(cy + R * 0.16), Math.round(R * 0.74), Math.max(12, Math.round(R * 0.2)), gg.txt, white), C.TEMP_TONES[key] ? { tone: key } : {}));
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
    speedGauge: false,  // (the speed in figures in the tach; a speedometer only with Settings > JDM 2: left dial)
    // the engine unit's readings its left dial shows (the temperatures: the intake air and the gearbox oil)
    needs: (o) => (o && o.leftDial === 'temps' ? ['iat', 'gearbox'] : []),
    // its own places, set on the page (layouts.js placesFor): the temperatures' four quarters, while the left dial shows them
    places: ['top left', 'top right', 'bottom right', 'bottom left'].map((w, i) => ({ key: 'temp' + (i + 1), kind: 'gauge', label: 'Left dial: temperatures, ' + w, when: (o) => o.leftDial === 'temps' })),
    // (its own fuel gauge: the strip's fuel bar only with another reading there)
    stripFuel: (o) => { const g = C.gaugeOf(o, 'speed'); return !!g && g.key !== 'fuel'; },
    // (the G trail's parts: its tests)
    trailParts: { trailOf, packOf, TRAIL_MS, TRAIL_N },

    /*
     * Built round what the glass and the KOMBI keep (layout_common; tools/clearance.js): the camera's cowl over the
     * tach's top, the dark box right of the gear's disc (the small gauges below it), the eDrive box over the column,
     * the warning lights under the tach. Nothing of it in the M car's boxes but the tach (layouts.M_ON_DIAL).
     */
    pieces(o) {
        if (o.centre === 'map') {
            // the tach left of the map; the disc and the small gauges right of it; the time and outside temperature
            // above the map, the ranges under it
            const top = C.MAP.y, bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => back(o, 'bg' + i, r.x, r.y, r.w, r.h)).concat(
                tach(o, 208, 360, 202), gearDisc(o, 1600, 175, 85), small(o, 'rpm', 1592, 565, 72), small(o, 'speed', 1780, 565, 72), [
                    C.text('clock', 520, top - 76, 200, 34, C.clock, white),
                    C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), white),
                ],
                C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', white, lbl),
                C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? white : elecTxt, lbl),
            );
        }
        // the car's own strip: no boxes to keep clear of, so as first drawn: the G meter's window left, the tach
        // over its edge, the disc above right of the tach, the coolant under it and the fuel right of both. (0.37.0:
        // no column of readouts at the right any more - readouts 1 and 2 and the main readout, the intake air, the
        // gearbox oil and the torque there - the owner's call; column() stays for a later use)
        // (0.41.0: all of it 110 px to the left, the beginner driver's mark at the right, the owner's)
        // (0.41.6: the G meter smaller and higher, clear of the strip's fuel bar under it; the tach a little smaller
        // and lower, its top clear of the camera's cowl, as seen on the car)
        return [back(o, 'bg', 0, 0, 1920, 720)].concat(leftDial(o, 335, 385, 215), tach(o, 790, 393, 248),
            gearDisc(o, 1177, 262, 100), small(o, 'rpm', 1187, 526, 112), small(o, 'speed', 1390, 404, 110), [wakaba(1572, 214, 335)]);
    },
};

/** The beginner driver's mark (shoshinsha, "wakaba"), h px tall at (x, y): shaders.js WAKABA_FS (its picture 1901 x 2121). */
function wakaba(x, y, h) {
    const s = 2121 / h;
    return { key: 'wakaba', kind: 'wakaba', x, y, w: Math.round(1901 / s), h, z: 2, params: { u_s: [s] }, colors: () => ({ yellow: '#ffee00', green: '#00ad56', edge: '#000000' }) };
}
