'use strict';
/**
 * layout_sport.js - "Sport": bimmer-lab's Sport theme for Cluster Themes (MIT, Copyright (c) 2026 bimmer-lab,
 * github.com/bimmer-lab/apps; after BMW's Live Cockpit Sport view), as theirs: their shader for the whole view
 * (SDASH_FS: the blue speed bracket and the red rev bracket, the fuel and oil bars, the bottom bar) with their
 * layout's numbers, and every text where their layout puts it, in their faces (Michroma, Barlow Medium; font.js
 * 'wide'), the size and on the line theirs are (bimmer.js).
 *
 * Fitted to the G05: the whole view pressed a little in height (Y below) so it ends at the car's own bottom strip
 * (y 646) and above the warning lights; their time, fuel range, outside temperature and badge under the bottom
 * bar left out (the car's strip shows them); the top numeral and the top line kept out of the glass's corner and
 * the camera's cowl. With the Waze map their window (the map drawn there, map_window.js) and their map-up places.
 * Full screen without the car's strip the KOMBI's own gear box (x 1410-1662, y 262-454) shows over a part of the
 * rev bracket, and the readings round it step aside. A plug-in hybrid: the bottom bar's blue half reads the
 * battery's power (boost on a petrol or diesel car, or with Show: Engine).
 */
const C = require('./layout_common');
const B = require('./bimmer');

/* their theme (hud_themes.js sportdash), its rev bracket's colours following the drive mode (themes.js lookNow):
 * red in a sport mode, as theirs and BMW's Sport view; silver in comfort; teal in ECO PRO and on electricity alone */
const PAL = {
    bg: '#000000', text: '#f4f7fc', fg: '#f4f7fc', dim: '#96aacd', faint: '#606e87', sblue: '#78aaf5', spink: '#ec8c8c', sred: '#eb3c46',
    red: '#ff2a2a', regen: '#3ddc84', glow: '#3cd7ff',
    rline: '#f21f29', rband: '#540f1a', rlit: '#ed1a26', rin: '#db1421',
};
const LOOKS = {
    sport: {},
    comfort: { spink: '#c3cede', sred: '#e4eaf4', rline: '#d6deea', rband: '#262c38', rlit: '#b9c4d6', rin: '#a9b5ca' },
    efficient: { spink: '#8fe0d6', sred: '#3fd6c4', rline: '#2cccbb', rband: '#0b3532', rlit: '#25bcab', rin: '#1ea898' },
};
const pal = (look) => Object.assign({}, PAL, LOOKS[look] || LOOKS.sport);
const isNum = C.isNum;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* their view is 674 px high (the bottom bar's foot); here it ends at 646: their heights pressed by SY from the
 * top line (y 120) down */
const TOP = 120, SY = (C.STRIP_Y - TOP) / (674 - TOP);
const Y = (y) => Math.round(TOP + (y - TOP) * SY);
const RPM_MAX = 7000;   // their scale: 0-7 (ticks 7)
const E_ZERO = C.KW_ZERO;   // the ePower scale's 0, a quarter up (below it regeneration, to the battery's limit)

/* their map window ("hole" [524, 120, 872, 480], inset 10), pressed as the rest */
/*
 * SDASH_FS's bracket: the outer line (y at its top, at its bend, at its bottom; x at the bend), how far it leans
 * (x a px of y above the bend, below it; the bend's roundness), the inner line's distance from it; and worked out once
 * here, not every pixel (0.38.1): the outer line's x at its top and its bottom, the inner line's x at its top run,
 * 1 / the scale's height (u_pts)
 */
const GEO = [Y(120), Y(317), Y(620), 180], KK = [0.58 / SY, 0.75 / SY, 30], INNER = 59;
const outerX = (y) => { const dy = y - GEO[1], k = dy < 0 ? KK[0] : KK[1]; return GEO[3] + k * (Math.sqrt(dy * dy + KK[2] * KK[2]) - KK[2]); };
const slope = (y) => { const dy = y - GEO[1], k = dy < 0 ? KK[0] : KK[1]; return k * dy / Math.sqrt(dy * dy + KK[2] * KK[2]); };
const PTS = [outerX(GEO[0]), outerX(GEO[2]), outerX(GEO[0] + 8) + INNER * Math.sqrt(1 + slope(GEO[0] + 8) * slope(GEO[0] + 8)), 1 / (Y(610) - Y(155))];
/*
 * (0.38.1) the left bracket's three layers [y0, y1, x0, x1], the right one's mirrored: round all either draws (its
 * glow, its flares, the bar and its rail), measured off the shader's own picture (alpha above 1/255) with 2 px to
 * spare, the rows not overlapping. One 760 x 586 layer a side (most of it empty black, every pixel through the whole
 * shader) restarted the car's cluster: these are 42 % of that.
 */
const BOXES = [[112, 130, 246, 731], [130, 410, 28, 344], [410, 646, 175, 552]];
const WINDOW = { x: 534, y: Y(130), w: 852, h: Y(130 + 460) - Y(130) };

module.exports = {
    id: 'sport',
    title: 'ID8 M',
    font: 'wide',
    stripGear: true,    // (the gear is one of its two big readings: kept over the car's own strip)
    stripFuel: false,   // (its own fuel bar)
    ownStripGauges: true,   // (the charge is its bottom bar's blue half, the fuel its own bar: none of the strip's bars)
    mapWindow: WINDOW,
    speedGauge: false,  // (its speed bracket reads through dyn, u_speed: the engine eases the engine speed alone)
    // its own places, set on the page (layouts.js placesFor): the brackets' bars and the bottom bar's halves
    places: [['fuelBar', 'Bar in the speed bracket (fuel)'], ['oilBar', 'Bar in the rev bracket (oil; a plug-in hybrid\'s charge)'], ['half1', 'Bottom bar: left'], ['half2', 'Bottom bar: right']]
        .map(([key, label]) => ({ key, kind: 'gauge', label })),
    palette: pal,
    gearText: C.gearText,

    pieces(o) {
        const strip = C.strip(o), map = o.centre === 'map', stock = o.centre === 'stock' && !strip;
        const us = o.speedUnit !== 'kmh', scale = B.SPEED_SCALE[us ? 'us' : 'metric'];
        const engine = C.engineFocus(o) || o.vehicle === 'ice';
        const [redFrom, orange] = B.redMarks(o, RPM_MAX);
        const T = (key, box, font, txt, colors, align) => B.text('wide', key, box, font, txt, colors, align, Y);
        // a plug-in hybrid in an electric drive: the rev bracket reads the battery's power as ePower %, as BMW's
        // electric M cars (i4 M50) do (the share of the most the battery gives, eDrive Live's limits:
        // layout_common.kwRange), its bottom quarter regeneration (green, to the most it takes)
        const elec = (d) => C.electric(o, d);
        const ePower = (d) => C.powerFrac(d, E_ZERO);   // (Power %: layout_common.powerPct)
        // the background: black (with the map round its window; the stock centre full screen round its area, x 566-1104)
        const W2 = WINDOW, around = [{ x: 0, y: 0, w: 1920, h: W2.y }, { x: 0, y: W2.y + W2.h, w: 1920, h: 720 - W2.y - W2.h },
            { x: 0, y: W2.y, w: W2.x, h: W2.h }, { x: W2.x + W2.w, y: W2.y, w: 1920 - W2.x - W2.w, h: W2.h }];
        const list = map ? around.map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg'))
            : stock ? [C.flat('bgL', 0, 0, 566, 720, 'bg'), C.flat('bgR', 1104, 0, 816, 720, 'bg')] : [C.flat('bg', 0, 0, 1920, 720, 'bg')];
        /*
         * The view (SDASH_FS) in seven layers, never one over the whole panel (M's backdrop in one full-screen layer
         * restarted the cluster): the speed bracket with the fuel bar (three: BOXES), the rev bracket with the oil bar
         * (three), the bottom line and strip. Each over the background.
         */
        const sd = {
            u_geo: GEO, u_k: KK, u_w: [40], u_inner: [INNER], u_pts: PTS,
            u_scale: [Y(610), Y(155)], u_ticks: [8, 7], u_redFrom: [redFrom], u_orange: [orange],
            u_fuelSeg: [412, Y(440), 537, Y(607)], u_oilSeg: [1508, Y(440), 1383, Y(607)],
            // the map window cut see-through (the map drawn in it); the stock centre's area likewise
            u_hole: map ? [WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h] : stock ? [566, 0, 538, 720] : [0, 0, 0, 0], u_holeR: [map ? 28 : 0],
            u_strip: [425, Y(632), Math.round(42 * SY), 26], u_topEnd: [726],
            u_speed: [0], u_fuel: [0], u_oil: [0], u_stripFill: [0, 0], u_zero: [0], u_regenR: [0],
        };
        const bottom = strip ? C.STRIP_Y : 646;
        // (the brackets' bars and the bottom bar's halves as designed, or the readings set there on the page: places
        // fuelBar, oilBar, half1, half2)
        const PG = (k) => (C.placeOf(o, k) ? C.placeGauge(o, C.placeOf(o, k)) : null);
        // (a plug-in hybrid's rev bracket bar: its battery's charge, as designed, 0.36.1; set on the page as any other)
        const pF = PG('fuelBar'), pO = PG('oilBar') || (C.engineFocus(o) || o.vehicle === 'ice' ? null : C.placeGauge(o, 'soc')), pL = PG('half1'), pR = PG('half2');
        const q = (f) => Math.round(clamp01(f) * 500) / 500;
        const part = (key, n, x, y, w, h, extra) => Object.assign({ key, kind: 'sdash', x, y, w, h, z: -90, params: Object.assign({ u_part: [n], u_off: [x, y] }, sd),
            colors: (t) => ({ rline: t.rline, rband: t.rband, rlit: t.rlit, rin: t.rin }) }, extra);
        const speedDyn = { dyn: (d) => ({
            u_speed: [isNum(d.speed) ? Math.round(B.scaleFrac(C.speedIn(o, d.speed), scale) * 500) / 500 : 0],
            u_fuel: [pF ? q(pF.frac(d)) : isNum(d.fuelPct) ? Math.round(clamp01(d.fuelPct / 100) * 500) / 500 : 0],
        }) };
        // (0.38.1) each bracket in three layers close round what it draws (BOXES; the right one mirrored): its top
        // runs (nothing there moves), its upper part and its lower part with the bar
        const side = (key, n, extra) => BOXES.map(([y0, y1, x0, x1], i) => part(key + i, n,
            n === 1 ? x0 : 1920 - x1, y0, x1 - x0, Math.min(y1, bottom) - y0, i ? extra : {}));
        list.push(
            ...side('speedSide', 1, speedDyn),
            // the engine speed eased by the engine (u_value), or in an electric drive the battery's power
            ...side('revSide', 2, {
                value: (d) => (elec(d) ? ePower(d) : isNum(d.rpm) ? clamp01(d.rpm / RPM_MAX) : 0), max: 1, sweep: true,
                dyn: (d) => ({
                    u_ticks: [8, elec(d) ? 4 : 7], u_redFrom: [elec(d) ? 2 : B.redMarks(o, RPM_MAX, d)[0]], u_orange: [elec(d) ? 2 : B.redMarks(o, RPM_MAX, d)[1]], u_zero: [elec(d) ? E_ZERO : 0],
                    u_oil: [pO ? q(pO.frac(d)) : isNum(d.oil) ? Math.round(clamp01((d.oil - 50) / 100) * 500) / 500 : 0],
                    // (the fuel there: the fuel's zones, red at the empty end; a plug-in's charge: none, all red when low)
                    u_regenR: [pO && pO.key === 'fuel' ? 4 : pO && pO.key === 'soc' ? (C.socLow(d) ? 12 : 8) : 0],
                }) }),
            // the bottom bar's halves as gauges: the charge and the battery's power (boost and the coolant)
            part('bottomBar', 3, 400, Y(620) - 6, 1120, bottom - Y(620) + 6, { dyn: (d) => ({
                u_stripFill: (engine ? [C.boostFrac(d), C.tempFrac(d.coolant)]
                    : [isNum(d.soc) ? clamp01(d.soc / 100) : 0, isNum(d.kw) ? Math.round(clamp01(Math.abs(d.kw) / (d.kw < 0 ? C.kwRange(d).in : C.kwRange(d).out)) * 200) / 200 : 0])
                    .map((f, i) => ([pL, pR][i] ? q([pL, pR][i].frac(d)) : f)),
                // (green while regenerating, as the other power gauges)
                // (and the left half red with the battery's charge low: layout_common.socLow)
                u_regenR: [(!engine && !pR && isNum(d.kw) && d.kw < -0.3 ? 1 : 0) + (((!engine && !pL) || (pL && pL.key === 'soc')) && C.socLow(d) ? 2 : 0)],
            }) }));
        // the scales' numerals: the one nearest the reading white (theirs: "near")
        const nearSpeed = (i) => (t, d) => {
            const v = isNum(d.speed) ? B.scaleFrac(C.speedIn(o, d.speed), scale) * 8 : -9;
            return { color: [Math.round(v) === i ? t.fg : t.sblue, 1], glow: [t.sblue, 0] };
        };
        const nearRpm = (i) => (t, d) => ({ color: [isNum(d.rpm) && Math.round(d.rpm / 1000) === i ? t.fg : t.spink, 1], glow: [t.spink, 0] });
        // (the nearest ePower numeral: above the 0 by quarters of the scale, below it the regeneration's half)
        const powNear = (d) => { const f = ePower(d); return f >= E_ZERO - E_ZERO / 4 ? Math.round(Math.max(0, f - E_ZERO) / ((1 - E_ZERO) / 4)) : -1; };
        const nearPow = (i) => (t, d) => { const c = i < 0 ? t.regen : t.spink; return { color: [isNum(d.kw) && powNear(d) === i ? t.fg : c, 1], glow: [c, 0] }; };
        const SPD = [[248, 596], [206, 540], [164, 483], [122, 426], [82, 369], [51, 312], [66, 255], [96, 198], [142, 142]];
        // (the top one nudged right of the glass's slanted corner: its right edge where theirs is)
        SPD.forEach(([x, y], i) => list.push(T('spd' + i, [x, y, i === 8 ? 96 : 110, 27], 's_scale', String(scale[i]), nearSpeed(i), 'right')));
        // (full screen 2 a few px right of the KOMBI's gear box, 5 a few down from its eDrive box)
        const RPM = [[1562, 596], [1610, 532], [strip ? 1658 : 1664, 466], [1706, 402], [1749, 336], [1752, strip ? 272 : 282], [1719, 206], [1682, 142]];
        RPM.forEach(([x, y], i) => list.push(Object.assign(T('rpm' + i, [x, y, 40, 27], 's_scale', String(i), nearRpm(i), 'left'), { visible: (d) => !elec(d) })));
        // the ePower scale's numerals (0 to 100 in 25s; below the 0, green, -50: half the most regeneration) at their
        // places along the bracket (between the rpm numerals')
        if (o.vehicle !== 'ice' && !C.engineFocus(o)) [-1, 0, 1, 2, 3, 4].forEach((i) => {
            const f = 7 * (i < 0 ? E_ZERO / 2 : E_ZERO + i / 4 * (1 - E_ZERO)), k = Math.min(6, Math.floor(f)), u = f - k, at = RPM[k].map((v, j) => Math.round(v + (RPM[k + 1][j] - v) * u));
            // (full screen clear of the KOMBI's eDrive box, x 1770 on above y 265)
            if (!strip && at[0] + 50 > 1770 && at[1] < 284) at[1] = 284;
            list.push(Object.assign(T(i < 0 ? 'powRegen' : 'pow' + i, [at[0], at[1], i < 0 || i === 4 ? 74 : 50, 27], 's_scale', i < 0 ? '-50' : String(i * 25), nearPow(i), 'left'), { visible: elec }));
        });
        list.push(T('mphCap', [338, 88, 80, 29], 's_unit', C.speedUnit(o), B.role('sblue'), 'center'),
            T('rpmCap', [1430, 86, 200, 29], 's_unit', (d) => (elec(d) ? 'ePower %' : 'x1000 rpm'), B.role('sred'), 'center'));
        // their gear: the number alone (P, R or N in park, reverse or neutral; the selector's letter with no gear)
        // (the gear with its programme, D4 / S3 / M2: since 0.35.3, not the number alone as theirs)
        const gearNum = (d) => C.gearText(d);
        const gearC = (t, d) => ({ color: [B.shiftNow(o, d) ? t.red : t.fg, 1], glow: [t.fg, 0] });
        if (map) {
            // their map-up places (full screen the gear above the KOMBI's box)
            list.push(T('speedDigits', [285, 286, 230, 68], 's_speed', (d) => C.speedText(o, d), B.role('fg'), 'center'),
                T('speedUnit', [360, 358, 80, 29], 's_unit', C.speedUnit(o), B.role('sblue'), 'center'),
                T('gear', [1415, strip ? 230 : 182, 200, 65], 's_gear', gearNum, gearC, 'center'));
        } else {
            // (0.36.8: no cruise control icon or set speed here until the cruise control is read again; 0.28.0-0.36.7
            // drew BMW's icon at 490, Y(182), grey or green, the set speed beside it at 538, 182)
            list.push(T('speedDigits', [420, 313, 280, 68], 's_speed', (d) => C.speedText(o, d), B.role('fg'), 'center'),
                T('speedUnit', [580, 382, 80, 29], 's_unit', C.speedUnit(o), B.role('sblue'), 'center'),
                // (an M car's KOMBI boxes in the middle: the gear above the right one)
                T('gear', [1185, C.mCar(o) ? 196 : 310, 210, 65], 's_gear', gearNum, gearC, 'center'));
            if (!stock) {
                // the fuel and oil bars' labels (the bars are the shader's); full screen the oil's top label steps
                // left of the KOMBI's box
                const tl = (c) => String(Math.round(C.tempIn(o, c) / 10) * 10), tu = '°' + (o.tempUnit === 'c' ? 'C' : 'F');
                list.push(T('fuelFull', [pF ? 426 : 446, 441, pF ? 80 : 40, 22], 's_gl', pF ? pF.marks[2] : '1', B.role('fg'), 'center'),
                    T('fuelHalf', [pF ? 484 : 504, 516, pF ? 100 : 60, 22], 's_gl', pF ? pF.marks[1] : '1/2', B.role('fg'), 'center'),
                    B.icon('fuelIcon', 549, Y(551), 26, 30, pF ? pF.bIcon : 'fuel', 'dim'),
                    T('fuelEmpty', [pF ? 542 : 567, 593, pF ? 80 : 30, 22], 's_gl', pF ? pF.marks[0] : '0', B.role('fg'), 'center'),
                    T('oilHot', [strip ? 1405 : 1336, strip ? 441 : 446, 70, 22], 's_gl', pO ? pO.marks[2] : tl(150), B.role('fg'), 'center'),
                    T('oilUnit', [pO ? 1396 : 1406, 474, pO ? 60 : 40, 29], 's_unit', pO ? pO.unit : tu, B.role('dim'), 'center'),
                    T('oilMid', [1343, 516, 70, 22], 's_gl', pO ? pO.marks[1] : tl(100), B.role('fg'), 'center'),
                    B.icon('oilIcon', 1332, Y(554), 36, 24, pO ? pO.bIcon : 'oilcan', 'dim'),
                    T('oilCold', [1291, 593, 70, 22], 's_gl', pO ? pO.marks[0] : tl(50), B.role('fg'), 'center'));
            }
        }
        // the bottom bar's halves, each a gauge: the charge on blue and the battery's power on red (boost and the
        // coolant on a petrol or diesel car)
        const tu = '°' + (o.tempUnit === 'c' ? 'C' : 'F');
        const halves = engine
            ? [{ icon: 'turbo', txt: (d) => (d.engineOn === false ? 'OFF' : C.pressNum(o, d.boostActual)), unit: C.pressUnitOf(o) === 'psi' ? 'PSI' : C.pressLabel(o) },
                { icon: 'therm', txt: (d) => (isNum(d.coolant) ? String(Math.round(C.tempIn(o, d.coolant))) : '--'), unit: tu }]
            : [{ icon: 'battery', txt: (d) => (isNum(d.soc) ? String(Math.round(d.soc)) : '--'), unit: '%' },
                { icon: 'bolt', txt: (d) => (isNum(d.kw) ? (Math.abs(d.kw) < 10 ? d.kw.toFixed(1) : String(Math.round(d.kw))) : '--'), unit: 'kW' }];
        [pL, pR].forEach((g, i) => { if (g) halves[i] = { icon: g.bIcon, txt: g.num, unit: g.unit }; });
        list.push(B.icon('barIconL', 652, Y(638), 30, 30, halves[0].icon, 'fg'),
            T('barL', [690, 640, 150, 26], 's_val', halves[0].txt, B.role('fg'), 'right'),
            T('barLUnit', [846, 640, 60, 29], 's_unit', halves[0].unit, B.role('dim'), 'left'),
            B.icon('barIconR', 992, Y(638), 30, 30, halves[1].icon, 'fg'),
            T('barR', [1026, 640, 100, 26], 's_val', halves[1].txt, B.role('fg'), 'right'),
            T('barRUnit', [1132, 640, 60, 29], 's_unit', halves[1].unit, B.role('dim'), 'left'));
        if (stock) return list.filter((p) => p.kind === 'flat' || /^(speedSide|revSide)\d$/.test(p.key) || p.x + p.w <= 566 || p.x >= 1104);
        return list;
    },
};
