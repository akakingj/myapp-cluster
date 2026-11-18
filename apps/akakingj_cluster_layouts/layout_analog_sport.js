'use strict';
/**
 * layout_analog_sport.js - "20's": a classic sports-saloon pair of round dials. Black faces with crisp white
 * markings and numerals, bright chrome rings, slim white needles over dark hubs and a short red zone on the tach,
 * a small coolant gauge set into the foot of the tach, and two small satellite gauges tucked against the dials'
 * outer edges (the fuel by the speedometer, the oil by the tach; Settings > Speedometer gauge / Tach gauge put
 * another reading in either). A slim display between the dials with the time and outside temperature, the gear, the
 * digital speed and the main readout. Built around the KOMBI's dark box (the tach left of it, the ranges right of
 * it). With the map in the centre the speedometer is left of it and the tach right of it. An original design
 * after the look of the 2010s' analog clusters, not a copy of any one.
 */
const C = require('./layout_common');

const CY = 380;
const PALETTES = {
    comfort: {
        bg: '#000000', face0: '#121314', face1: '#030303', bezel: '#eef0f2', bezel2: '#4a4d52', tick: '#ffffff', minor: '#a4a8ad',
        num: '#f4f5f6', glow: '#d8e2ec', red: '#f0301c', needle: '#f6f6f4', hub: '#1b1c1e', accent: '#ff8a2a',
        lcdTop: '#0b0b0c', lcdBottom: '#040404', lcdEdge: '#3c3f44', text: '#f2f3f4', dim: '#9ea3a9', track: '#1a1b1d', ev: '#4ab4ff',
    },
    sport: {
        bg: '#000000', face0: '#141213', face1: '#040303', bezel: '#f0eeee', bezel2: '#4d4848', tick: '#ffffff', minor: '#b0a4a4',
        num: '#ffffff', glow: '#ff6a4a', red: '#ff2414', needle: '#ff4a26', hub: '#1c1a1a', accent: '#ff3a1a',
        lcdTop: '#0d0a0a', lcdBottom: '#050303', lcdEdge: '#4a3330', text: '#ffffff', dim: '#b0a2a0', track: '#1f1312', ev: '#4ab4ff',
    },
    efficient: {
        bg: '#000000', face0: '#0f1316', face1: '#030405', bezel: '#e8eef2', bezel2: '#454d53', tick: '#f2f9ff', minor: '#8fa0ab',
        num: '#eef7ff', glow: '#6ab8ff', red: '#f0301c', needle: '#f2f8ff', hub: '#191c1f', accent: '#3aa0ff',
        lcdTop: '#090c0e', lcdBottom: '#030405', lcdEdge: '#33404a', text: '#e6f3ff', dim: '#97a6b0', track: '#111a20', ev: '#4ab4ff',
    },
};
const dialColours = (t) => ({ face0: t.face0, face1: t.face1, bezel: t.bezel, bezel2: t.bezel2, tick: t.tick, minor: t.minor, num: t.num, red: t.red, needle: t.needle, hub: t.hub, accent: t.accent, glow: t.glow });
const glowText = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.25] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0.15] });
const white = (t) => ({ color: [t.num, 1], glow: [t.glow, 0.2] });

const kwNow = (d) => (C.isNum(d.kw) ? d.kw : 0);
const powerTxt = (t, d) => ({ color: [kwNow(d) < -0.3 ? t.regen || '#3ddc84' : t.ev, 1], glow: [t.ev, 0.2] });

/*
 * A big dial, sized `size`, centred at (cx, cy): the speedometer plain; the tach with the coolant gauge in its foot
 * (its figures, or C and H as the car's own) and, on a plug-in hybrid, the power meter (layout_common.powerMeter).
 */
function bigDial(o, which, cx, size, cy) {
    const k = size / 640, speed = which === 'speed', s = speed ? C.speedScale(o) : C.rpmScale(o);
    const red = speed ? s.max + 1 : s.red;
    // km/h: 14 numerals, most of three figures (mph: 9): smaller and further out. (0.48.3: both about Old M's and ID6 M's
    // share of the dial - 0.11 of its radius the speedometer's, 0.13 the tach's - they were 0.14 and 0.18: crowded)
    const dense = speed && o.speedUnit === 'kmh';
    // (Show: Engine: no power meter; none while the tach itself is the Power % meter: layout_common.electric)
    const extra = !speed && !C.engineFocus(o) ? C.powerMeter(cx, size, cy, lbl, o).map((p) => Object.assign(p, { visible: (d) => !C.electric(o, d) })) : [];
    const list = extra.concat([
        {
            key: which, kind: 'dial', x: cx - size / 2, y: cy - size / 2, w: size, h: size,
            params: { u_scale: [s.max, s.major, s.minor, red], u_arc: [-135, 135, Math.round((dense ? 33 : 40) * k + 2), (dense ? 226 : 218) * k], u_needle_dim: [290 * k, 56 * k, 14 * k, 4], u_look: [0.22, 1, 0, 0], u_look2: [Math.round(20 * k), k, 0.9, 1] },
            colors: dialColours, max: s.max, sweep: true,
            // the tach reads the battery's power in an electric eDrive mode (layout_common.electric)
            value: speed ? (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0) : C.tachValue(o), range: speed ? undefined : C.tachRange(o, s),
            dyn: speed ? undefined : C.tachDyn(o, s, red),
        },
        // the unit (the tach's: with the engine off the battery's power, which the power meter reads)
        C.text(which + 'Unit', cx - 120, cy + Math.round(speed ? 96 * k : 62 * k), 240, Math.round(22 * k), speed ? C.speedUnit(o)
            : (d) => (C.electric(o, d) ? C.POWER_UNIT : 'x1000 rpm'), speed ? lbl : (t, d) => (C.electric(o, d) ? powerTxt(t, d) : lbl(t)), { tracking: 0.08 }),
    ]);
    if (speed) return list;
    // the coolant gauge in the tach's foot (or the reading set there on the page: place footGauge)
    const g = C.placeGauge(o, C.placeOf(o, 'footGauge') || 'coolant'), key = g.key;
    const sub = Math.round(170 * k), subDy = Math.round(176 * k), ks = sub / 640, ch = C.chOf(o, key), scy = cy + subDy;
    const fig = (d) => { const n = g.num(d); return n === '--' || n === 'OFF' ? n : n + (g.unit[0] === '°' ? '°' : ' ' + g.unit); };
    return list.concat([
        {
            key: 'coolantDial', kind: 'dial', x: cx - sub / 2, y: scy - sub / 2, w: sub, h: sub, z: 5,
            params: { u_scale: [100, 50, 12.5, ch ? C.chRed(o, ch) * 100 : Math.min(101, g.redFrac * 100)], u_arc: [-120, 120, 0, 0], u_needle_dim: [60 * sub / 170, 14 * sub / 170, 5, 2], u_look: [0.2, 1, 0, 0], u_look2: [Math.max(4, Math.round(8 * sub / 170)), ks, 0.6, 0.6] },
            colors: dialColours, value: ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => g.frac(d) * 100, max: 100, sweep: true,
        },
        C.text('coolantLbl', cx - 60, scy + Math.round(24 * k), 120, Math.max(11, Math.round(13 * k)), g.label, lbl, { tracking: 0.16 }),
    ], ch ? C.chMarks('coolantCh', cx, scy, sub * 0.35, -116, 116, Math.max(12, Math.round(16 * k)), white) : [
        Object.assign(C.text('coolantFig', cx - 70, scy + sub / 2 + Math.round(2 * k), 140, Math.round(24 * k), fig, glowText), g.tone ? { tone: g.tone } : {}),
    ]);
}

/*
 * A small satellite gauge, size across at (cx, cy), tucked against a big dial's edge: by the speedometer the fuel,
 * by the tach the oil (or what Settings > Speedometer gauge / Tach gauge puts there). Its name under the hub, its
 * figures under that (a temperature as the car's own: C and H at its ends, no figures); the fuel E and F.
 */
function satellite(o, which, cx, cy, size) {
    const g = C.gaugeOf(o, which), own = which === 'speed' ? 'fuel' : 'oil', key = g ? g.key : own;
    const ch = C.chOf(o, key), ks = size / 640, r = size / 2, fuel = key === 'fuel';
    const gg = g || C.gaugeOf(Object.assign({}, o, which === 'speed' ? { gaugeSpeed: own } : { gaugeRpm: own }), which);
    const id = which === 'speed' ? 'fuelSat' : 'oilSat';
    const fig = which === 'speed' ? 'speedSubNum' : 'oilNum';
    const out = [
        {
            key: id, kind: 'dial', x: cx - r, y: cy - r, w: size, h: size, z: 6,
            params: { u_scale: [100, 50, 12.5, ch ? C.chRed(o, ch) * 100 : Math.min(101, gg.redFrac * 100)], u_arc: [-120, 120, 0, 0], u_needle_dim: [r * 0.74, r * 0.18, 5, 2], u_look: [0.2, 1, 0, 0], u_look2: [Math.max(5, Math.round(size * 0.055)), ks, 0.6, 0.7] },
            colors: dialColours, value: ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => gg.frac(d) * 100, max: 100, sweep: true,
        },
        C.text(id + 'Lbl', cx - r, cy + Math.round(r * 0.2), size, Math.max(11, Math.round(r * 0.16)), gg.label, lbl, { tracking: 0.14 }),
    ];
    const ends = Math.max(12, Math.round(r * 0.2));
    if (ch) return out.concat(C.chMarks(id + 'Ch', cx, cy, r * 0.62, -116, 116, ends, white));
    if (fuel) {
        const pos = (a) => [cx + Math.sin(a * Math.PI / 180) * r * 0.6, cy - Math.cos(a * Math.PI / 180) * r * 0.6];
        const [ex, ey] = pos(-116), [fx, fy] = pos(116), w = Math.round(ends * 1.6);
        out.push(C.text(id + 'E', Math.round(ex - w / 2), Math.round(ey - ends / 2), w, ends, 'E', (t) => ({ color: [t.red, 1], glow: [t.red, 0.2] })),
            C.text(id + 'F', Math.round(fx - w / 2), Math.round(fy - ends / 2), w, ends, 'F', white));
    }
    return out.concat(C.text(fig, cx - r, cy + Math.round(r * 0.42), size, Math.max(12, Math.round(r * 0.22)), gg.txt, glowText));
}

module.exports = {
    id: 'analog_sport',
    title: "20's",
    palette: (lookId) => PALETTES[lookId] || PALETTES.comfort,
    gearText: C.gearText,
    // (its own fuel gauge by the speedometer: the strip's fuel bar only with another reading there)
    stripFuel: (o) => { const g = C.gaugeOf(o, 'speed'); return !!g && g.key !== 'fuel'; },
    // its own places, set on the page (layouts.js placesFor)
    // (0.46.0: and the trip computer's three lines, with Settings > Centre display: Trip computer)
    places: [{ key: 'footGauge', kind: 'gauge', label: "Gauge in the tach's foot" }].concat(C.tripPlaces(3)),

    /*
     * Built around what the glass and the KOMBI keep (layout_common: the camera's cowl, the dark box where the
     * stock gear readout was, the eDrive box, the slanted corners, the warning lights along the bottom; checked
     * by tools/clearance.js): the tach sits left of the dark box, never under it.
     */
    pieces(o) {
        const gearC = (t, d) => ({ color: [C.gearText(d) === 'R' ? t.red : t.text, 1], glow: [t.glow, 0.25] });
        const elecTxt = (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.3] });
        if (o.centre === 'map') {
            // the speedometer left of the map, the tach right of it (small, below the dark box; with the car's
            // strip, as big as the speedometer), each with its satellite gauge below its inner side; the gear and
            // speed in the free corner above the box; the ranges in the strip under the map, above the warning lights
            const top = C.MAP.y, bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
                bigDial(o, 'speed', 208, 404, 360), satellite(o, 'speed', 350, 584, 120),
                bigDial(o, 'rpm', 1712, 404, 360), satellite(o, 'rpm', 1570, 584, 120), [
                    C.text('clock', 520, top - 76, 200, 34, C.clock, glowText),
                    C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), glowText),
                    C.text('gear', 1520, 130, 230, 92, C.gearText, gearC),
                ],
                C.readingUp('fuel', 560, bot + 2, 260, 30, (d) => C.distText(o, d.frange), 'FUEL RANGE', glowText, lbl),
                C.readingUp('elec', 1100, bot + 2, 300, 30, C.focus.both(o), C.focus.rangeLabel(o), C.engineFocus(o) ? glowText : elecTxt, lbl),
            );
        }
        // the car's own bottom strip (layout_common.STRIP_Y): no boxes to keep clear of, so the dials stand
        // centred either side of the display, sized to end above the strip, the satellites at their outer
        // feet (above the strip's fuel and charge bars: layouts.js); the ranges are the strip's
        const SS = 600, scy = 328, X = 830, W = 260, Y = 164, H = 440;   // (its top clear of the camera's cowl: a photo of the car)
        return [C.flat('bg', 0, 0, 1920, 720, 'bg')].concat(bigDial(o, 'speed', 452, SS, scy), bigDial(o, 'rpm', 1468, SS, scy),
            satellite(o, 'speed', 160, 510, 160), satellite(o, 'rpm', 1776, 510, 160), centreDisplay(o, X, Y, W, H, gearC, elecTxt, true));
    },
};

/** The slim display between the dials: the time and outside temperature, the gear, the digital speed, the
 * battery's power. */
function centreDisplay(o, X, Y, W, H, gearC, elecTxt, stripped) {
    const sy = H / 470;   // its rows spread to its height
    if (stripped) {
        // over the car's own strip, which shows the gear and the drive mode: the digital speed takes the gear's
        // place, large, and the battery's power below it
        return [
            { key: 'lcd', kind: 'panel', x: X, y: Y, w: W, h: H, params: { u_box: [20, 2, 0.5, 1] }, colors: (t) => ({ top: t.lcdTop, bottom: t.lcdBottom, border: t.lcdEdge }) },
            C.text('clock', X + 16, Y + 18, (W - 38) / 2, 30, C.clock, glowText, { align: 0 }),
            C.text('outside', X + W / 2 + 3, Y + 18, (W - 38) / 2, 30, (d) => C.outsideText(o, d.outside), glowText, { align: 1 }),
            C.flat('rule1', X + 24, Y + Math.round(62 * sy), W - 48, 2, 'lcdEdge'),
        ].concat(C.tripShown(o)
            // (Settings > Centre display: Trip computer, 0.46.0: its three lines in the speed's place)
            ? C.tripRows(o, X + 14, Y + Math.round(80 * sy), W - 28, Math.round(220 * sy), 3, lbl, glowText, 'bold')
            : [
                C.text('speedDigits', X, Y + Math.round(104 * sy), W, 140, (d) => C.speedText(o, d), glowText),
                C.text('speedDigitsUnit', X, Y + Math.round(254 * sy), W, 22, C.speedUnit(o), lbl, { tracking: 0.12 }),
            ], [
            C.flat('rule2', X + 24, Y + Math.round(312 * sy), W - 48, 2, 'lcdEdge'),
            C.text('kwNow', X, Y + Math.round(338 * sy), W, 54, C.focus.power(o), (t, d) => (C.engineFocus(o) ? glowText(t) : C.isNum(d.kw) && d.kw < -0.3 ? { color: ['#3ddc84', 1], glow: ['#3ddc84', 0.3] } : elecTxt(t))),
            C.text('kwNowLbl', X, Y + Math.round(400 * sy), W, 18, C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
        ]);
    }
    return [
        { key: 'lcd', kind: 'panel', x: X, y: Y, w: W, h: H, params: { u_box: [20, 2, 0.5, 1] }, colors: (t) => ({ top: t.lcdTop, bottom: t.lcdBottom, border: t.lcdEdge }) },
        C.text('clock', X + 16, Y + 18, (W - 38) / 2, 30, C.clock, glowText, { align: 0 }),
        C.text('outside', X + W / 2 + 3, Y + 18, (W - 38) / 2, 30, (d) => C.outsideText(o, d.outside), glowText, { align: 1 }),
        C.flat('rule1', X + 24, Y + Math.round(62 * sy), W - 48, 2, 'lcdEdge'),
        C.text('gear', X, Y + Math.round(82 * sy), W, 130, C.gearText, gearC),
        C.text('speedDigits', X, Y + Math.round(236 * sy), W, 72, (d) => C.speedText(o, d), glowText),
        C.text('speedDigitsUnit', X, Y + Math.round(314 * sy), W, 22, C.speedUnit(o), lbl, { tracking: 0.12 }),
        C.flat('rule2', X + 24, Y + Math.round(356 * sy), W - 48, 2, 'lcdEdge'),
        C.text('kwNow', X, Y + Math.round(376 * sy), W, 40, C.focus.power(o), (t, d) => (C.engineFocus(o) ? glowText(t) : C.isNum(d.kw) && d.kw < -0.3 ? { color: ['#3ddc84', 1], glow: ['#3ddc84', 0.3] } : elecTxt(t))),
        C.text('kwNowLbl', X, Y + Math.round(422 * sy), W, 18, C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
    ];
}
