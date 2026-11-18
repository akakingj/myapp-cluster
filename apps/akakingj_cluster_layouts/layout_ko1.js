'use strict';
/**
 * layout_ko1.js - "KO 1" (0.44.0): two round digital dials after the look of the mid 2020s' Korean saloons' screens,
 * an original drawing of the idea, not a copy of any one: no needles - each dial a dark disc with a glowing arc from
 * its start to the reading, the reading in large thin figures in its middle, and a thin arc across its open foot
 * (the speedometer's the fuel, 0 to 1, with the fuel range; the tach's the coolant, C to H - on a plug-in hybrid the
 * battery's charge; Settings > Speedometer gauge / Tach gauge, or the page, put another reading in either). Between
 * the dials a display as 20's: readouts 1 and 2 at its top, the car's trip computer (distance, driving time, average
 * fuel economy) and the main readout.
 *
 * The colours follow the drive mode (Settings > Colours): comfort the speedometer's arc blue and the tach's amber, ECO
 * PRO both teal and the arc a fan of fine slats over the dial's face, sport both red, wider, under a bright rim. All
 * drawn with the band shader (shaders.js BAND_FS: the arcs), the ring shader (RING_FS: the face, a disc, and the rim) and
 * texts; the arcs' shape for the mode
 * through dyn (the palette's), the rest as built.
 */
const C = require('./layout_common');

const A0 = -135, A1 = 135;          // the dials' sweep (degrees from twelve, clockwise)
// the foot's arc: from the lower left (its start) to the lower right, inside the dial's open foot (its scale ends at
// 225 and 135: KO 2's 0 and its last numeral, and its needle at rest, 13 degrees clear of the arc's ends)
const FOOT = [212, 148];
/* each look's colours, and the arcs' shape (as fractions of the dial's radius: radius, thickness; slats; the rim's
 * thickness px) */
const PALETTES = {
    comfort: {
        bg: '#000000', face: '#0a0e14', rim: '#2b323b', sTrack: '#121a24', sArc0: '#0c3156', sArc1: '#5cc8ff', rTrack: '#1c160f', rArc0: '#4a2a0e', rArc1: '#ffc58a',
        tip: '#ffffff', text: '#f2f5f8', dim: '#8d96a0', glow: '#9fd8ff', red: '#ff3b30', ev: '#4ab4ff', foot: '#e8edf2', footTrack: '#2a3038', num: '#f2f5f8', track: '#151a20',
        lcdTop: '#0d1117', lcdBottom: '#06080b', lcdEdge: '#2f3740', arcR: 0.9, arcT: 0.075, slats: 0, rimT: 3, soft: 0,
    },
    efficient: {
        bg: '#000000', face: '#06100f', rim: '#1d3633', sTrack: '#0b2523', sArc0: '#0a3f3b', sArc1: '#40f0da', rTrack: '#0b2523', rArc0: '#0a3f3b', rArc1: '#40f0da',
        tip: '#0d3431', text: '#eefcfa', dim: '#86a8a4', glow: '#40f0da', red: '#ff3b30', ev: '#40f0da', foot: '#e6f6f4', footTrack: '#1f3634', num: '#eefcfa', track: '#0e1c1b',
        lcdTop: '#0b1312', lcdBottom: '#050909', lcdEdge: '#24403c', arcR: 0.64, arcT: 0.44, slats: 120, rimT: 2, soft: 1,
    },
    sport: {
        bg: '#000000', face: '#100709', rim: '#9aa0a8', sTrack: '#2a0c12', sArc0: '#3e0710', sArc1: '#ff2a48', rTrack: '#2a0c12', rArc0: '#3e0710', rArc1: '#ff2a48',
        tip: '#ffd6dc', text: '#ffffff', dim: '#a8959a', glow: '#ff5a72', red: '#ff2a1a', ev: '#4ab4ff', foot: '#f2f2f2', footTrack: '#3a2a2e', num: '#ffffff', track: '#1d1214',
        lcdTop: '#120c0d', lcdBottom: '#070505', lcdEdge: '#4a3034', arcR: 0.86, arcT: 0.12, slats: 0, rimT: 9, soft: 0,
    },
};
const white = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.12] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0.05] });
const ICONS = { fuel: 4, soc: 6, battTemp: 6, coolant: 0, oil: 1, gearbox: 2, iat: 3, boost: 5, power: 7, torque: 13, throttle: 13, pedal: 13, timing: 9 };

/** A band piece along a circle round (cx, cy) on the panel: radius r, thickness T, from a0 to a1; its quad round the
 * ink (pad px more each way, for its glow and marks). */
function arc(key, cx, cy, r, T, a0, a1, pad, extra) {
    const pts = [];
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    for (let a = lo; a <= hi + 0.01; a += Math.max(1, (hi - lo) / 90)) for (const rr of [Math.max(0, r - T / 2), r + T / 2]) {
        const q = a * Math.PI / 180; pts.push([cx + rr * Math.sin(q), cy - rr * Math.cos(q)]);
    }
    if (hi - lo >= 359) pts.push([cx - r - T / 2, cy], [cx + r + T / 2, cy], [cx, cy - r - T / 2], [cx, cy + r + T / 2]);
    const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) - pad), y0 = Math.floor(Math.min(...pts.map((p) => p[1])) - pad);
    const x1 = Math.ceil(Math.max(...pts.map((p) => p[0])) + pad), y1 = Math.ceil(Math.max(...pts.map((p) => p[1])) + pad);
    return Object.assign({
        key, kind: 'band', x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        params: { u_geo: [cx - x0, cy - y0, r, T], u_span: [a0, a1, 0, 0], u_marks: [0, 0, 0, 0], u_red: [2], u_zero: [0], u_soft: [0], u_neg: C.REGEN_RGB },
    }, extra || {});
}

/*
 * The thin arc across a dial's open foot (cx, cy, radius R): `which` 'speed' (the fuel, 0 - 1/2 - 1 as the car's own
 * gauge, the fuel range by its pump) or 'rpm' (the coolant, C to H; a plug-in hybrid's charge, 0 to 100); Settings >
 * Speedometer gauge / Tach gauge (or the page) another reading, its name and figures. Over the dial (KO 2's: its face).
 * Its end marks just outside its ends (clear of KO 2's numerals), the fuel's half under its middle.
 */
function foot(o, which, cx, cy, R, z) {
    const pick = C.gaugeOf(o, which);
    const own = which === 'speed' ? 'fuel' : !C.engineFocus(o) ? 'soc' : 'coolant';
    const key = pick ? pick.key : own;
    const g = pick || C.gaugeOf(Object.assign({}, o, which === 'speed' ? { gaugeSpeed: key } : { gaugeRpm: key }), which);
    const ch = C.chOf(o, key);
    const red = ch ? C.chRed(o, ch) : g.redFrac;
    const id = which === 'speed' ? 'speedFoot' : 'rpmFoot';
    const r = Math.round(R * 0.8), T = Math.max(3, Math.round(R * 0.016)), h = Math.max(14, Math.round(R * 0.075));
    const band = arc(id, cx, cy, r, T, FOOT[0], FOOT[1], 14, {
        z: z || 4, value: ch ? (d) => C.chFrac(ch, d[ch]) : (d) => g.frac(d), max: 1, sweep: true,
        colors: (t) => ({ track: t.footTrack, fill0: t.foot, fill1: t.foot, redc: t.red, tip: t.foot, tick: t.dim, num: t.dim, neg: t.foot }),
    });
    band.params.u_red = [red <= 1 ? red : 2];
    band.params.u_marks = [4, 0, 0, -1];
    band.params.u_soft = [1];
    const at = (a, rr) => [cx + Math.sin(a * Math.PI / 180) * rr, cy - Math.cos(a * Math.PI / 180) * rr];
    const ends = ch ? ['C', 'H'] : key === 'fuel' ? ['0', '1'] : key === 'soc' ? ['0', '100'] : null;
    const out = [band];
    if (ends) {
        [0, 1].forEach((i) => {
            const [x, y] = at(FOOT[i], r + h * 1.15), w = Math.round(h * 2.4);
            out.push(C.text(id + (i ? 'Hi' : 'Lo'), Math.round(x - w / 2), Math.round(y - h / 2), w, h, ends[i], i && ch ? (t) => ({ color: [t.red, 1], glow: [t.red, 0.2] }) : lbl));
        });
        if (key === 'fuel') {
            const [x, y] = at(180, r + h * 1.15), w = Math.round(h * 2.4);
            out.push(C.text(id + 'Mid', Math.round(x - w / 2), Math.round(y - h / 2), w, h, '1/2', lbl));
        }
    }
    // its icon and figures under the dial's middle, over the arc: the fuel its range, the rest the reading
    const fy = Math.round(cy + r - h * 2.4), is = Math.round(h * 1.25), fw = Math.round(R * 0.8);
    const fig = !pick && key === 'fuel' ? (d) => C.distText(o, d.frange) : pick && !ch ? (d) => g.label + ' ' + g.txt(d) : (d) => g.txt(d);
    const figKey = which === 'speed' ? 'speedSubNum' : 'rpmSubNum';
    // (the icon a little left of the middle, the figures after it: a short reading about centred, a long one room to the right)
    const ix = Math.round(cx - R * 0.27);
    out.push({ key: id + 'Icon', kind: 'icon', x: ix, y: Math.round(fy + (h * 1.3 - is) / 2), w: is, h: is, z: (z || 4) + 1, params: { u_icon: [ICONS[key] === undefined ? 13 : ICONS[key]], u_line: [0] }, colors: (t) => ({ color: [t.dim, 1] }) },
        Object.assign(C.text(figKey, Math.round(ix + is * 1.25), fy, Math.round(fw - is * 1.25), Math.round(h * 1.3), fig, (t, d) => (g.hot(d) ? { color: [t.red, 1], glow: [t.red, 0.2] } : white(t)), { align: 0, z: (z || 4) + 1 }),
            C.TEMP_TONES[key] ? { tone: key } : {}));
    return out;
}

/** The speedometer (which 'speed') or the tach ('rpm') at (cx, cy), radius R: the face, the rim, the glowing arc, the
 * reading in figures, its unit, the foot's arc. */
function dial(o, which, cx, cy, R) {
    const speed = which === 'speed', s = speed ? C.speedScale(o) : C.rpmScale(o);
    const elec = (d) => !speed && C.electric(o, d);
    const fr = (d) => {
        if (speed) return C.isNum(d.speed) ? Math.max(0, Math.min(1, C.speedIn(o, d.speed) / s.max)) : 0;
        if (elec(d)) return C.powerFrac(d, C.KW_ZERO);
        return C.isNum(d.rpm) ? Math.max(0, Math.min(1, d.rpm / 1000 / s.max)) : 0;
    };
    const P = speed ? 's' : 'r';
    // (the face and the rim: the ring shader, a plain disc and a line - cheap over their big squares; the band's glow
    // and gradient only for the arc that moves)
    const face = arc(which + 'Face', cx, cy, R * 0.44, R * 0.88, -180, 180, 2, { kind: 'ring', colors: (t) => ({ fill1: t.face }) });
    const rim = arc(which + 'Rim', cx, cy, R - 6, 4, -180, 180, 4, {
        kind: 'ring', colors: (t) => ({ fill1: t.rim }),
        // (the rim's thickness the look's: sport a bright bezel)
        dyn: (d, t) => { const T = (t && t.rimT) || 3; return { u_geo: [rim.params.u_geo[0], rim.params.u_geo[1], R - 2 - T / 2, T] }; },
    });
    [face, rim].forEach((p) => { p.params = { u_geo: p.params.u_geo, u_span: p.params.u_span }; });
    // (its quad 40 px round the ink: sport's wide arc glows that far, and a glow cut off at the quad's edge shows)
    const band = arc(which, cx, cy, R * 0.9, R * 0.075, A0, A1, 40, {
        z: 2, value: fr, max: 1, sweep: true,
        colors: (t) => ({ track: t[P + 'Track'], fill0: t[P + 'Arc0'], fill1: t[P + 'Arc1'], redc: t.red, tip: t.tip, tick: t.dim, num: t.dim, neg: t.ev }),
        // the look's shape (ECO PRO: a fan of slats over the face, without the glow round it), the red zone where the shift point puts it now, and
        // in an electric drive its 0 a quarter round (Power %, regeneration below it)
        dyn: (d, t) => {
            const ar = (t && t.arcR) || 0.9, at = (t && t.arcT) || 0.075;
            const sp = speed ? 2 : elec(d) ? 2 : Math.min(s.red, C.shiftPoint(o, d).red / 1000) / s.max;
            return { u_geo: [band.params.u_geo[0], band.params.u_geo[1], Math.round(R * ar), Math.round(R * at)], u_span: [A0, A1, t && t.slats ? t.slats : 0, 0.55], u_red: [sp], u_zero: [elec(d) ? C.KW_ZERO : 0], u_soft: [(t && t.soft) || 0] };
        },
    });
    const big = Math.round(R * 0.34), fy = Math.round(cy - big * 0.62);
    const digits = speed ? C.text('speedDigits', cx - R * 0.6, fy, R * 1.2, big, (d) => C.speedText(o, d), white)
        : C.text('rpmDigits', cx - R * 0.6, fy, R * 1.2, big, (d) => (elec(d) ? String(Math.round(C.powerPct(d))) : C.isNum(d.rpm) ? (d.rpm / 1000).toFixed(1) : '--'), white);
    const unit = C.text(which + 'Unit', cx - R * 0.4, Math.round(fy + big * 1.12), R * 0.8, Math.max(14, Math.round(R * 0.075)),
        speed ? C.speedUnit(o) : (d) => (elec(d) ? C.POWER_UNIT : 'x1000 rpm'), lbl, { tracking: 0.04 });
    return [face, rim, band, digits, unit].concat(foot(o, which, cx, cy, R));
}

/*
 * The display between the dials (as 20's): readouts 1 and 2 at its top, then the car's own trip computer (0.45.0, as
 * the screens KO is drawn after: the distance, the driving time and the average fuel economy, with a bar of it, in the
 * unit Settings > Fuel economy unit sets) and the main readout under it. KO 2's: the speed in figures first, then the
 * distance and the average economy.
 */
const barOf = (k) => { const r = C.READOUTS[k]; return r ? (d) => Math.max(0, Math.min(1, r.frac(d) || 0)) : () => 0; };
function centre(o, X, Y, W, H, look) {
    const sy = H / 446, at = (y) => Y + Math.round(y * sy), hh = (h) => Math.round(h * sy);
    const kw = (t, d) => (C.engineFocus(o) || C.phevPick(o, 'infoMain') ? white(t) : C.isNum(d.kw) && d.kw < -0.3 ? { color: ['#3ddc84', 1], glow: ['#3ddc84', 0.2] } : { color: [t.ev, 1], glow: [t.ev, 0.2] });
    // a line of the trip computer: its name at the left, its figures at the right; each line a place on the page
    // (0.45.0: tripRow1-3, any readout or nothing; as designed: the distance, the driving time, the average economy)
    const line = (k, place, own, y, h) => {
        const r = C.placeReadout(o, C.placeOf(o, place) || own);   // (places tripRow1-3, as the other layouts' trip computers)
        return row(k, y, h, r.short, r.value);
    };
    const row = (k, y, h, name, value) => [
        // (a space before the name: a capital's stem starts at the box's very edge, half a pixel of it cut off there)
        C.text(k + 'Lbl', X + 16, at(y) + Math.round(hh(h) * 0.22), Math.round(W * 0.3), Math.round(hh(h) * 0.6), ' ' + name, lbl, { align: 0, tracking: 0.06 }),
        // (made to hold its reading's widest figures: '25.5 L/100km')
        C.fitText(C.text(k, X + Math.round(W * 0.3), at(y), W - Math.round(W * 0.3) - 22, hh(h), value, white, { align: 1 }), 'light'),
    ];
    const head = [
        { key: 'lcd', kind: 'panel', x: X, y: Y, w: W, h: H, params: { u_box: [18, 2, 0.4, 1] }, colors: (t) => ({ top: t.lcdTop, bottom: t.lcdBottom, border: t.lcdEdge }) },
        C.text('clock', X + 18, at(20), (W - 40) / 2, 30, C.clock, white, { align: 0 }),
        C.text('outside', X + W / 2 + 2, at(20), (W - 40) / 2, 30, (d) => C.outsideText(o, d.outside), white, { align: 1 }),
        C.flat('rule1', X + 22, at(66), W - 44, 2, 'lcdEdge'),
    ];
    if (look === 'ko2') {
        // (KO 2's dials are analog: the speed in figures here, as 20's)
        return head.concat([
            C.text('speedDigits', X, at(84), W, hh(96), (d) => C.speedText(o, d), white),
            C.text('speedDigitsUnit', X, at(184), W, 20, C.speedUnit(o), lbl, { tracking: 0.12 }),
            C.flat('rule2', X + 22, at(218), W - 44, 2, 'lcdEdge'),
        ], line('koTrip', 'tripRow1', 'trip', 230, 34), line('koAvg', 'tripRow2', 'avgFuel', 270, 34), [
            C.flat('rule3', X + 22, at(316), W - 44, 2, 'lcdEdge'),
            C.text('kwNow', X, at(330), W, hh(50), C.focus.power(o), kw),
            C.text('kwNowLbl', X, at(388), W, 18, C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
        ]);
    }
    const P = 's';
    return head.concat([
        C.text('koTripHead', X, at(80), W, 16, 'TRIP COMPUTER', lbl, { tracking: 0.14 }),
    ], line('koTrip', 'tripRow1', 'trip', 104, 36), line('koTime', 'tripRow2', 'tripTime', 144, 36), line('koAvg', 'tripRow3', 'avgFuel', 184, 36), [
        // (the third line's reading as a bar - the average economy, 0 to 30 km/L - in the speedometer's arc colours)
        C.bar('koAvgBar', X + 18, at(230), W - 36, 16, barOf(C.placeOf(o, 'tripRow3') || 'avgFuel'), (t) => ({ track: t[P + 'Track'], fill0: t[P + 'Arc0'], fill1: t[P + 'Arc1'], redc: t.red, tip: t[P + 'Arc1'], tick: t.dim, num: t.dim })),
        C.flat('rule2', X + 22, at(268), W - 44, 2, 'lcdEdge'),
        C.text('kwNow', X, at(284), W, hh(70), C.focus.power(o), kw),
        C.text('kwNowLbl', X, at(362), W, 18, C.focus.powerLabel(o, true), lbl, { tracking: 0.1 }),
    ]);
}

/** The pieces of KO 1 (dialOf: KO 1's digital dial, or KO 2's analog one; look 'ko1' / 'ko2'). */
function build(o, dialOf, look) {
    if (o.centre === 'map') {
        // the dials either side of the map; readouts 1 and 2 above it
        const top = C.MAP.y;
        return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
            dialOf(o, 'speed', 208, 368, 196), dialOf(o, 'rpm', 1712, 368, 196), [
                C.text('clock', 520, top - 76, 200, 34, C.clock, white),
                C.text('outside', 1200, top - 76, 200, 34, (d) => C.outsideText(o, d.outside), white),
            ]);
    }
    // the car's own strip: the dials either side of the camera's cowl, clear of it and of the panel's corners, ending
    // above the strip; the display between them (tools/clearance.js)
    return [C.flat('bg', 0, 0, 1920, 720, 'bg')].concat(dialOf(o, 'speed', 452, 342, 288), dialOf(o, 'rpm', 1468, 342, 288), centre(o, 798, 170, 324, 440, look));
}

module.exports = {
    id: 'ko1',
    title: 'KO 1',
    font: 'light',
    palette: (lookId) => PALETTES[lookId] || PALETTES.comfort,
    gearText: C.gearText,
    ownStripGauges: true,   // (its own fuel arc, and a plug-in hybrid's charge; no bars over the car's strip)
    // its own places, set on the page (layouts.js placesFor): the trip computer's three lines
    places: C.tripPlaces(3, (o) => o.centre !== 'map' && o.centre !== 'stock'),
    pieces(o) { return build(o, dial, 'ko1'); },
    // (KO 2's; dial: KO 1 Map's)
    parts: { arc, foot, centre, build, dial, PALETTES, white, lbl, A0, A1 },
};
