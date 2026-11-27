'use strict';
/**
 * layout_gt3.js - "GT3": a race dash. After bimmer-lab's GT3 theme for Cluster Themes (MIT, Copyright (c) 2026
 * bimmer-lab, github.com/bimmer-lab/apps): its arrangement and its shift scoring (theirs ported from
 * cauliflowermossgrape's Redline app, MIT), redrawn with this app's engine (every piece a shader on the cluster's own
 * GPU, the readings sent as numbers), fitted to the G05's glass and the car's own bottom strip, and made for a
 * plug-in hybrid.
 *
 * Eighteen round shift lights over a segmented rev bar along the top; a big gear in a framed centre with the
 * coolant and oil under it; on the left the speed, the engine speed (OFF in an electric drive) and the tyres
 * (pressure and temperature at each corner, from the car's tyre monitor); on the right the battery's power (boost
 * on a petrol or diesel car, or with Show: Engine), the charge (the shift point on a petrol or diesel car) and the
 * last upshift with its grade: EARLY, SPOT ON, LATE, COLD REV or LIMITER.
 */
const C = require('./layout_common');

const PALETTES = {
    comfort: { accent: '#ffb000', glow: '#ffb000' },
    sport: { accent: '#ff3326', glow: '#ff3326' },
    efficient: { accent: '#35e08a', glow: '#35e08a' },
};
const BASE = {
    bg: '#000000', text: '#ffffff', dim: '#8c949e', track: '#16191d', red: '#ff2a1f', ev: '#4ab4ff', regen: '#3ddc84',
    tileTop: '#101317', tileBottom: '#07080a', tileEdge: '#30363e', off: '#15181c', green: '#2fe06b', yellow: '#ffc400', blue: '#3a8cff',
    num: '#ffffff', tip: '#ffffff', cold: '#5ab0ff',
};
const pal = (lookId) => Object.assign({}, BASE, PALETTES[lookId] || PALETTES.comfort);

const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.1] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] });
const acc = (t) => ({ color: [t.accent, 1], glow: [t.glow, 0.35] });
const isNum = C.isNum;

/* ---------- shift scoring (bimmer-lab's shift_score.js, after cauliflowermossgrape's Redline; MIT) ----------
 * The shift point is the red line less 300 rpm, pulled down to 4500 rpm with the oil at 30 C and climbing to it as
 * the oil reaches 80 C. Each upshift (the gear one higher) is graded on the highest rpm in the 0.6 s before it:
 * LIMITER within 60 rpm of the red line, EARLY 250 under the shift point, LATE 200 over it (COLD REV while the oil
 * is cold), else SPOT ON. Shifts under 2500 rpm aren't graded. */
// (the shift point: layout_common.shiftPoint, with Settings > Shift point before redline, Cold-engine rev guard,
// Cold rev limit and Oil warm at; 300, on, 4500 and 80 °C by default, as before)
const shiftPoint = (o, oil) => C.shiftPoint(o, { oil });
// (the upshift itself: layout_common.driveSample's lastShift, d.lastShift)
const verdictOf = (o, s) => {
    if (!s) return '';
    const sp = shiftPoint(o, s.oil), red = C.rpmScale(o).red * 1000, rpm = s.rpm;
    return rpm >= red - 60 ? 'LIMITER' : rpm < sp.rpm - 250 ? 'EARLY' : rpm > sp.rpm + 200 ? (sp.cold ? 'COLD REV' : 'LATE') : 'SPOT ON';
};
const verdictC = (o) => (t, d) => {
    const v = verdictOf(o, d && d.lastShift);
    const c = v === 'SPOT ON' ? t.green : v === 'EARLY' ? t.cold : v === 'LATE' || v === 'COLD REV' ? t.yellow : v === 'LIMITER' ? t.red : t.dim;
    return { color: [c, 1], glow: [c, 0.3] };
};

/* ---------- pieces ---------- */
/** A framed box with its label in a strip along the top. */
function box(key, x, y, w, h, label) {
    return [
        { key: key + 'Box', kind: 'panel', x, y, w, h, params: { u_box: [6, 2, 0.25, 1] }, colors: (t) => ({ top: t.tileTop, bottom: t.tileBottom, border: t.tileEdge }) },
        C.flat(key + 'Head', x + 2, y + 2, w - 4, 26, 'tileEdge'),
        C.text(key + 'Lbl', x + 14, y + 6, w - 28, 18, label, white, { align: 0, tracking: 0.12 }),
    ];
}
/** The shift lights: lit from Settings > Yellow light at (Auto: 3000 rpm or 2500 under the shift point,
 * whichever is higher), full at the shift point (the shift warning), all of them flashing there. */
function lights(o, x, y, w, h) {
    return {
        key: 'lights', kind: 'leds', x, y, w, h, max: 1,
        value: (d) => { const at = shiftPoint(o, d.oil).rpm, from = Math.min(at - 500, Number(o.yellowFrom) > 0 ? Number(o.yellowFrom) : Math.max(3000, at - 2500)); return isNum(d.rpm) ? Math.max(0, Math.min(1, (d.rpm - from) / (at - from))) : 0; },
        params: { u_count: [18], u_soft: [0], u_shape: [0] },
        dyn: (d) => ({ u_flash: [isNum(d.rpm) && d.rpm >= shiftPoint(o, d.oil).rpm ? 1 : 0] }),
        colors: (t) => ({ off: t.off, green: t.green, yellow: C.lightsYellow(o, t), red: t.red }),
    };
}
/** The segmented rpm bar, red from the red zone: white turning yellow from Settings > Yellow light at (Auto: white
 * to yellow along the fill). */
function revBar(o, x, y, w, h) {
    const r = C.rpmScale(o);
    return { key: 'revs', kind: 'band', x, y, w, h,
        params: { u_geo: [4, h / 2, 0, Math.max(4, h - 6)], u_span: [0, 0, 52, 0.28], u_marks: [0, 0, 0, 0], u_red: [r.red / r.max], u_yellow: [C.yellowSet(o) ? Math.max(0.001, C.yellowAt(o, {}) / 1000 / r.max) : 0], u_soft: [1] },
        colors: (t) => ({ track: t.track, fill0: t.text, fill1: t.accent, redc: t.red, tip: t.accent, tick: t.dim, num: t.num }),
        value: (d) => (isNum(d.rpm) ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true };
}
/** a tyre's pressure in Settings > Pressure unit: bar to a tenth, psi and kPa whole */
const pressIn = (o, bar) => (C.pressUnitOf(o) === 'bar' ? bar.toFixed(1) : String(Math.round(C.pressUnitOf(o) === 'psi' ? bar * 14.5038 : bar * 100)));
/** The four tyres in a box: pressure, large, and temperature at each corner. */
function tyres(o, x, y, w, h) {
    const cw = (w - 28) / 2, rh = (h - 34) / 2;
    const cell = (k, i) => {
        const cx = x + 14 + (i % 2) * cw, cy = y + 32 + Math.floor(i / 2) * rh;
        return [
            C.text('tyre' + k, cx, cy, cw * 0.55, rh - 4, (d) => (d.tyres && isNum(d.tyres.p[k]) ? pressIn(o, d.tyres.p[k]) : '--'), white, { align: i % 2 ? 1 : 0 }),
            C.text('tyreT' + k, i % 2 ? cx : cx + cw * 0.55, cy + rh * 0.3, cw * 0.45 - 6, rh * 0.55, (d) => (d.tyres && isNum(d.tyres.t[k]) ? C.tempText(o, d.tyres.t[k]) : ''), lbl, { align: i % 2 ? 0 : 1 }),
        ];
    };
    return [].concat(box('tyres', x, y, w, h, 'TYRES ' + C.pressLabel(o).toUpperCase()), ...['FL', 'FR', 'RL', 'RR'].map((k, i) => {
        const c = cell(k, i);
        // (the right column's pressure right-aligned, its temperature to the left of it)
        if (i % 2) { c[0] = Object.assign({}, c[0], { x: x + w - 14 - cw * 0.55 }); c[1] = Object.assign({}, c[1], { x: x + w / 2 + 4 }); }
        return c;
    }));
}

module.exports = {
    id: 'gt3',
    title: 'GT3',
    stripGear: true,   // (the big gear is the layout's centre: kept over the car's own strip too)
    // its own places, set on the page (layouts.js placesFor): the boxes either side and the readings under the gear
    places: [['box1', 'Right box: top'], ['box2', 'Right box: middle'], ['box3', 'Right box: bottom (last shift)'], ['box4', 'Left box: bottom (tyres)'],
        ['gear1', 'Under the gear: left'], ['gear2', 'Under the gear: right']].map(([key, label]) => ({ key, kind: 'readout', label, when: (o) => o.centre !== 'map' && o.centre !== 'stock' })),
    palette: pal,
    gearText: C.gearText,

    pieces(o) {
        // (the stock centre: its window left clear as the map's)
        const engine = C.engineFocus(o), ice = o.vehicle === 'ice', strip = C.strip(o), map = o.centre === 'map' || o.centre === 'stock';
        const kmh = o.speedUnit === 'kmh';
        // the side columns: left of the centre (or the map), and right of it, each clear of the KOMBI's warning lights
        // along the glass's sides (C.SIDE_LIGHTS); full screen the right one keeps clear of the dark box the KOMBI
        // leaves (x 1410-1662) and its eDrive box (top right)
        const L = { x: 150, w: 260 }, R = strip ? { x: 1510, w: 270 } : { x: 1672, w: 226 };
        const top = strip ? 262 : 300, bottom = strip ? 586 : 640;
        const h1 = Math.round((bottom - top) * 0.34), h2 = Math.round((bottom - top) * 0.22), gap = 10, h3 = bottom - top - h1 - h2 - 2 * gap;
        const y2 = top + h1 + gap, y3 = y2 + h2 + gap;
        const rpmNow = (d) => (d.engineOn === false ? 'OFF' : isNum(d.rpm) ? String(C.rpmShown(d)) : '--');
        const hot = (k, lim) => (t, d) => ({ color: [isNum(d[k]) && d[k] >= lim ? t.red : t.text, 1], glow: [t.glow, 0.1] });
        const kwC = (t, d) => ({ color: [isNum(d.kw) && d.kw < -0.3 ? t.regen : t.ev, 1], glow: [t.ev, 0.2] });
        const power = engine || ice
            ? { label: 'BOOST ' + C.pressLabel(o).toUpperCase(), value: (d) => (d.engineOn === false ? 'OFF' : C.pressNum(o, d.boostActual)), c: white }
            : { label: 'BATTERY KW', value: (d) => (isNum(d.kw) ? (Math.abs(d.kw) < 10 ? d.kw.toFixed(1) : String(Math.round(d.kw))) : '--'), c: kwC };
        const second = ice || engine
            ? { label: 'SHIFT AT', value: (d) => String(shiftPoint(o, d.oil).rpm), c: (t, d) => (shiftPoint(o, d.oil).cold ? { color: [t.cold, 1], glow: [t.cold, 0.2] } : acc(t)) }
            : { label: 'CHARGE', value: (d) => (isNum(d.soc) ? Math.round(d.soc) + '%' : '--'), c: (t) => ({ color: [t.ev, 1], glow: [t.ev, 0.2] }) };
        // (the boxes and the readings under the gear as designed, or the reading set there on the page: places box1-box4,
        // gear1-gear2; not with the map, where the boxes hold other things)
        const P = (k) => (map ? null : C.placeOf(o, k)), Rd = (k) => C.placeReadout(o, P(k));
        const toneOf = (k, piece) => (P(k) && Rd(k).tone ? Object.assign({}, piece, { tone: Rd(k).tone }) : piece);
        if (P('box1')) Object.assign(power, { label: Rd('box1').label, value: Rd('box1').value, c: white, tone: Rd('box1').tone });
        if (P('box2')) Object.assign(second, { label: Rd('box2').label, value: Rd('box2').value, c: white, tone: Rd('box2').tone });
        const list = [C.flat('bg', 0, 0, 1920, 720, 'bg')];
        if (map) {
            // with the map: around its window, the rev bar under it, the gear and temperatures where the tyres
            // and the last shift were
            // (full screen with the stock centre: its own area, x 566-1104, left as the other layouts leave it)
            const around = o.centre === 'stock' && !strip ? [{ x: 0, y: 0, w: 566, h: 720 }, { x: 1104, y: 0, w: 816, h: 720 }] : C.aroundMap();
            list.splice(0, 1, ...around.map((b, i) => C.flat('bg' + i, b.x, b.y, b.w, b.h, 'bg')));
            if (o.centre === 'map') list.push(revBar(o, C.MAP_VIEW.x, C.MAP.y + C.MAP.h + 8, C.MAP_VIEW.w, 26));   // (the stock centre: nothing under it)
        } else {
            // under the camera's cowl and inside the glass's slanted corners: the lights, the rev bar, its scale
            list.push(lights(o, 470, 170, 980, 40), C.text('shiftLbl', 330, 180, 120, 22, 'SHIFT', lbl, { align: 1, tracking: 0.14 }),
                revBar(o, 440, 218, 1040, 30), C.text('revsLbl', 1490, 222, 150, 22, 'RPM', lbl, { align: 0, tracking: 0.14 }));
            // the centre: the gear, huge, and the coolant and oil under it
            // (an M car's two boxes sit in the middle full screen: the centre starts under them)
            const GX = 540, GW = 840, GY = C.mCar(o) ? 432 : top, GH = (strip ? 636 : 640) - GY;
            list.push(...box('gear', GX, GY, GW, GH, 'GEAR'),
                C.text('gear', GX, GY + 40, GW, GH - 140, C.gearText, (t, d) => ({ color: [C.gearText(d) === 'R' ? t.red : isNum(d.rpm) && d.rpm >= shiftPoint(o, d.oil).rpm ? t.red : t.text, 1], glow: [t.glow, 0.3] })),
                C.flat('gearRule', GX + 40, GY + GH - 96, GW - 80, 2, 'tileEdge'),
                C.text('coolantLbl', GX + 40, GY + GH - 84, 340, 18, P('gear1') ? Rd('gear1').label : 'COOLANT', lbl, { align: 0, tracking: 0.12 }),
                toneOf('gear1', C.text('coolant', GX + 40, GY + GH - 62, 340, 50, P('gear1') ? Rd('gear1').value : (d) => C.tempText(o, d.coolant), P('gear1') ? white : hot('coolant', C.hotAt(o, 'coolant')), { align: 0 })),
                C.text('oilLbl', GX + GW - 380, GY + GH - 84, 340, 18, P('gear2') ? Rd('gear2').label : 'OIL', lbl, { align: 1, tracking: 0.12 }),
                toneOf('gear2', C.text('oil', GX + GW - 380, GY + GH - 62, 340, 50, P('gear2') ? Rd('gear2').value : (d) => C.tempText(o, d.oil), P('gear2') ? white : hot('oil', C.hotAt(o, 'oil')), { align: 1 })));
        }
        // left: the speed, the engine speed, the tyres (with the map: the gear)
        list.push(...box('speedB', L.x, top, L.w, h1, 'SPEED ' + C.speedUnit(o).toUpperCase()),
            C.text('speedDigits', L.x + 14, top + 36, L.w - 28, h1 - 46, (d) => C.speedText(o, d), white, { align: 1 }),
            ...box('rpmB', L.x, y2, L.w, h2, 'RPM'),
            C.text('rpmNow', L.x + 14, y2 + 32, L.w - 28, h2 - 38, rpmNow, (t, d) => ({ color: [isNum(d.rpm) && d.rpm >= shiftPoint(o, d.oil).rpm ? t.red : t.text, 1], glow: [t.glow, 0.1] }), { align: 1 }));
        if (map) list.push(...box('mgear', L.x, y3, L.w, h3, 'GEAR'), C.text('gear', L.x + 14, y3 + 32, L.w - 28, h3 - 38, C.gearText, white));
        else if (P('box4')) list.push(...box('tyres', L.x, y3, L.w, h3, Rd('box4').label), toneOf('box4', C.fitText(C.text('tyresVal', L.x + 14, y3 + 36, L.w - 28, h3 - 46, Rd('box4').value, white, { align: 1 }))));
        else list.push(...tyres(o, L.x, y3, L.w, h3));
        // right: the battery's power (boost), the charge (shift point), the last shift (with the map: the temperatures)
        list.push(...box('powerB', R.x, top, R.w, h1, power.label),
            // (a reading set there made to fit its widest figures: '25.5 L/100km')
            Object.assign(P('box1') ? C.fitText(C.text('power', R.x + 14, top + 36, R.w - 28, h1 - 46, power.value, power.c, { align: 1 })) : C.text('power', R.x + 14, top + 36, R.w - 28, h1 - 46, power.value, power.c, { align: 1 }), power.tone ? { tone: power.tone } : {}),
            ...box('secondB', R.x, y2, R.w, h2, second.label),
            Object.assign(C.text('second', R.x + 14, y2 + 32, R.w - 28, h2 - 38, second.value, second.c, { align: 1 }), second.tone ? { tone: second.tone } : {}));
        if (map) {
            // (each half no taller than holds three figures and a degree, '104°', in its width, a gap between the two:
            // the narrow tile ran them over its edges, and into each other)
            const gap = 18, tw = (R.w - 28 - gap) / 2, th = Math.min(h3 - 42, Math.floor(tw / 2)), ty = y3 + 34 + Math.round((h3 - 42 - th) / 2);
            list.push(...box('temps', R.x, y3, R.w, h3, 'COOLANT  ·  OIL'),
                C.text('coolant', R.x + 14, ty, tw, th, (d) => C.tempText(o, d.coolant), hot('coolant', C.hotAt(o, 'coolant')), { align: 0 }),
                C.text('oil', R.x + R.w - 14 - tw, ty, tw, th, (d) => C.tempText(o, d.oil), hot('oil', C.hotAt(o, 'oil')), { align: 1 }));
        } else if (P('box3')) {
            list.push(...box('lastB', R.x, y3, R.w, h3, Rd('box3').label), toneOf('box3', C.fitText(C.text('lastVal', R.x + 14, y3 + 36, R.w - 28, h3 - 46, Rd('box3').value, white, { align: 1 }))));
        } else {
            list.push(...box('lastB', R.x, y3, R.w, h3, 'LAST SHIFT'),
                C.text('lastGears', R.x + R.w - 120, y3 + 6, 106, 18, (d) => (d.lastShift ? d.lastShift.from + '-' + d.lastShift.to : ''), lbl, { align: 1 }),
                C.fitText(C.text('lastRpm', R.x + 14, y3 + 36, R.w * 0.45, h3 - 46, (d) => (d.lastShift ? String(d.lastShift.rpm) : '--'), verdictC(o), { align: 0 })),
                C.text('verdict', R.x + R.w * 0.45, y3 + 44, R.w * 0.55 - 14, (h3 - 46) * 0.6, (d) => verdictOf(o, d.lastShift), verdictC(o), { align: 1, tracking: 0.06 }));
        }
        return list;
    },
    /** (for the tests) */
    _shift: { shiftPoint, verdictOf },
};
