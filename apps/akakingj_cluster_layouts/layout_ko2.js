'use strict';
/**
 * layout_ko2.js - "KO 2" (0.44.0): KO 1's analog sibling, an original drawing after the same look: two round dials
 * with thin numerals inside a ring of fine ticks, a slim white needle over a dark hub, the face tinted by the drive mode
 * and lit from the scale's start to the needle along its edge (comfort: the speedometer blue, the tach amber; ECO PRO
 * teal; sport red under a bright bezel), and KO 1's thin arc across each dial's open foot (the fuel, 0 to 1, with the
 * range; the coolant, C to H, or a plug-in hybrid's charge; Settings > Speedometer gauge / Tach gauge, or the page).
 * Between them the display as 20's: readouts 1 and 2, the speed in figures, the main readout. Shaders: DIAL_FS (the
 * dials, as 20's), BAND_FS (the foot's arcs), texts.
 */
const C = require('./layout_common');
const K = require('./layout_ko1').parts;

/* KO 1's colours and, for the dials, each side's face (s: the speedometer, r: the tach), the bezel and the needle */
const DIALS = {
    comfort: { sFace0: '#122338', sFace1: '#04070b', rFace0: '#2a1d12', rFace1: '#0a0705', bezel: '#56606b', bezel2: '#12161b', tick: '#e9eef3', minor: '#6c7783', needle: '#f4f6f8', hub: '#1c2026', dglow: '#bcdcff', bezelW: 6 },
    efficient: { sFace0: '#0c2725', sFace1: '#030807', rFace0: '#0c2725', rFace1: '#030807', bezel: '#2f5753', bezel2: '#0b1716', tick: '#e2fbf7', minor: '#5f8783', needle: '#7ff7e8', hub: '#132321', dglow: '#40f0da', bezelW: 6 },
    sport: { sFace0: '#36101a', sFace1: '#0b0405', rFace0: '#36101a', rFace1: '#0b0405', bezel: '#c2c8d0', bezel2: '#2c2f34', tick: '#ffffff', minor: '#8c7c80', needle: '#eef0f2', hub: '#1f1a1c', dglow: '#ff5a72', bezelW: 14 },
};
const PALETTES = {};
Object.keys(K.PALETTES).forEach((k) => { PALETTES[k] = Object.assign({}, K.PALETTES[k], DIALS[k]); });

/** An analog dial (which 'speed' or 'rpm') at (cx, cy), radius R, its unit, and the foot's arc. */
function dial(o, which, cx, cy, R) {
    const speed = which === 'speed', s = speed ? C.speedScale(o) : C.rpmScale(o), size = 2 * R, k = size / 640;
    const red = speed ? s.max + 1 : s.red, dense = speed && o.speedUnit === 'kmh', P = speed ? 's' : 'r';
    const tach = speed ? null : C.tachDyn(o, s, red);
    const look2 = (t) => [Math.round(((t && t.bezelW) || 6) * k), k, 0.45, 0.7];
    return [{
        key: which, kind: 'dial', x: cx - R, y: cy - R, w: size, h: size,
        params: { u_scale: [s.max, s.major, s.minor, red], u_arc: [K.A0, K.A1, Math.round((dense ? 34 : 44) * k + 2), Math.round((dense ? 214 : 206) * k)], u_needle_dim: [262 * k, 44 * k, 11 * k, 3], u_look: [0.3, 0.5, 1, 3], u_look2: look2(null), u_min: [0], u_zero: [0], u_regen: C.REGEN_RGB },
        colors: (t) => ({ face0: t[P + 'Face0'], face1: t[P + 'Face1'], bezel: t.bezel, bezel2: t.bezel2, tick: t.tick, minor: t.minor, num: t.num, red: t.red, needle: t.needle, hub: t.hub, accent: t[P + 'Arc1'], glow: t.dglow }),
        max: s.max, sweep: true,
        value: speed ? (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0) : C.tachValue(o), range: speed ? undefined : C.tachRange(o, s),
        // (the bezel the look's: sport a bright, wide one; the tach's red zone where the shift point puts it, Power %
        // in an electric drive)
        dyn: (d, t) => Object.assign(tach ? tach(d) : {}, { u_look2: look2(t) }),
    },
    C.text(which + 'Unit', cx - R * 0.4, Math.round(cy + R * 0.22), R * 0.8, Math.max(14, Math.round(R * 0.07)),
        speed ? C.speedUnit(o) : (d) => (C.electric(o, d) ? C.POWER_UNIT : 'x1000 rpm'), K.lbl, { tracking: 0.04 }),
    ].concat(K.foot(o, which, cx, cy, R, 6));
}

module.exports = {
    id: 'ko2',
    title: 'KO 2',
    font: 'light',
    palette: (lookId) => PALETTES[lookId] || PALETTES.comfort,
    gearText: C.gearText,
    ownStripGauges: true,   // (its own fuel arc, and a plug-in hybrid's charge; no bars over the car's strip)
    // its own places, set on the page (layouts.js placesFor): the trip computer's two lines
    places: C.tripPlaces(2, (o) => o.centre !== 'map' && o.centre !== 'stock'),
    pieces(o) { return K.build(o, dial, 'ko2'); },
};
