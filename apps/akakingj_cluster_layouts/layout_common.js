'use strict';
/**
 * layout_common.js - what the layouts share: units, the gear's text, temperature scales and piece makers
 * (see engine.js for what a piece is).
 */
const KMH_PER_MPH = 1.609344;
const isNum = (v) => typeof v === 'number' && isFinite(v);

const speedIn = (o, kmh) => (o.speedUnit === 'kmh' ? kmh : kmh / KMH_PER_MPH);
const speedUnit = (o) => (o.speedUnit === 'kmh' ? 'km/h' : 'mph');
const tempIn = (o, c) => (o.tempUnit === 'c' ? c : c * 9 / 5 + 32);
const tempText = (o, c) => (isNum(c) ? Math.round(tempIn(o, c)) + '°' : '--');
// The speed figure: it moves to the next figure only once the speed is 0.75 past the one shown, as the car's own cluster
// holds its figure, so a speed about 79.5 stays 79 or 80 rather than flickering between them (one held figure a unit)
const heldSpeed = { kmh: null, mph: null };
const speedShown = (o, d) => {
    if (!isNum(d.speed)) return null;
    const v = Math.max(0, speedIn(o, d.speed)), u = o.speedUnit === 'kmh' ? 'kmh' : 'mph', h = heldSpeed[u];
    if (h === null || Math.abs(v - h) >= 0.75) heldSpeed[u] = Math.round(v);
    return heldSpeed[u];
};
const speedText = (o, d) => (isNum(d.speed) ? String(speedShown(o, d)) : '--');
// The rpm figure, in tens: it moves only once the rpm is 15 past the one shown, so the idle's few rpm either way
// do not flicker its last digit
let heldRpm = null;
const rpmShown = (d) => {
    if (!isNum(d.rpm)) return null;
    const v = Math.max(0, d.rpm);
    if (heldRpm === null || Math.abs(v - heldRpm) >= 15) heldRpm = Math.round(v / 10) * 10;
    return heldRpm;
};

/*
 * Where the speedometers and the boost gauges end: Settings > Speedometer up to (260 or 330 km/h) and Boost gauge up
 * to (bar; 0: each layout's own), the Car profile's where it sets them. Held here for the readings' bars, which are
 * given the car's data alone (main.js setScales, as the options change).
 */
const scales = { speedKmh: 260, boost: 0, psi: false, powerKw: 0, torqueNm: 0 };
/* The power and torque gauges' ends (kW, Nm): the engine's most as the Car profile gives it (Power / Torque gauge up
   to: on Auto the car's own Sport Display's, 0.64.0), else the layouts' own 200 kW and 450 Nm */
const powerTop = () => scales.powerKw || 200;
const torqueTop = () => scales.torqueNm || 450;
/* Boost gauge up to: the car's own boost gauges, each by its end in psi - in bar 2.0 up to 30 psi, 3.0 at 45 (kPa a
   hundredfold) */
const BOOST_GAUGES = { 15: { psi: 15, bar: 2 }, 20: { psi: 20, bar: 2 }, 30: { psi: 30, bar: 2 }, 45: { psi: 45, bar: 3 } };
function setScales(o) {
    scales.speedKmh = o && Number(o.speedMax) === 330 ? 330 : 260;
    scales.boost = o && BOOST_GAUGES[Number(o.boostMax)] ? Number(o.boostMax) : 0;
    scales.psi = !!o && pressUnitOf(o) === 'psi';
    scales.powerKw = o && Number(o.powerMax) >= 60 && Number(o.powerMax) <= 600 ? Number(o.powerMax) : 0;
    scales.torqueNm = o && Number(o.torqueMax) >= 150 && Number(o.torqueMax) <= 1000 ? Number(o.torqueMax) : 0;
}
/** The car's sport display's boost gauge end (bar) as one of Boost gauge up to's gauges (psi): the least at or over it,
 * within 5 % (200 kPa, 29 psi: 30 psi / 2.0 bar). */
const snapBoost = (bar) => (isNum(bar) && bar > 0 ? [15, 20, 30, 45].find((p) => p * 1.05 >= bar * 14.5038) || 45 : 0);
/** A boost gauge's top, bar: Settings' Boost gauge up to's, else the layout's own (own). */
const boostTop = (own) => (scales.boost ? BOOST_GAUGES[scales.boost].bar : own);
const BOOST_TICKS = { 15: [0, 5, 10, 15], 20: [0, 10, 20], 30: [0, 10, 20, 30], 45: [0, 15, 30, 45] };
/**
 * A boost scale's numbers as the car's own gauges number them, by the end's figure (psi as it is, bar x 10, kPa / 10):
 * 0 5 10 15, 0 10 20, 0 10 20 30, 0 15 30 45 psi; 0.0 1.0 2.0, 0.0 1.0 2.0 3.0 bar; 0 100 200,
 * 0 100 200 300 kPa. Any other end: 0, its middle and it. end in the unit. [[at 0..1, text]] (M Vitals' and AK Cluster
 * ID8's the same)
 */
function boostTicks(end, unit) {
    const per = unit === 'bar' ? 10 : unit === 'kpa' ? 0.1 : 1, f = Math.round(end * per);
    const at = Math.abs(end * per - f) < 1e-6 && BOOST_TICKS[f] ? BOOST_TICKS[f].map((v) => v / per) : [0, end / 2, end];
    const dec = unit === 'bar' ? 1 : 0, whole = (v) => Math.abs(v * Math.pow(10, dec) - Math.round(v * Math.pow(10, dec))) < 1e-6;
    return at.map((v) => [v / end, v.toFixed(whole(v) ? dec : dec + 1)]);
}
/** A boost reading (bar) as a share of its gauge: in psi on its psi end where Boost gauge up to is set. */
const boostShare = (v, own) => (scales.boost && scales.psi ? v * 14.5038 / BOOST_GAUGES[scales.boost].psi : v / boostTop(own));
/** The speed scale for the unit: { max, major, minor }. 330 km/h (an M car's): 0 to 330 by 30s; 200 mph. */
const speedScale = (o) => {
    const m = (o && Number(o.speedMax) === 330) || (!o && scales.speedKmh === 330);
    return o && o.speedUnit !== 'kmh' ? (m ? { max: 200, major: 20, minor: 5 } : { max: 160, major: 20, minor: 5 })
        : m ? { max: 330, major: 30, minor: 10 } : { max: 260, major: 20, minor: 10 };
};
/** Engine speed in thousands: the scale's end (5-10) and the red zone's start. */
function rpmScale(o) {
    const max = Math.max(5, Math.min(10, Math.round((o.rpmMax || 8000) / 1000)));
    return { max, major: 1, minor: 0.25, red: Math.max(2, Math.min(max, (o.redline || 7000) / 1000)) };
}
/*
 * The shift warning (the shift point) and the red zone now, worked as cauliflowermossgrape's Redline app works them
 * (GT3 did already): the red zone from Settings > Red light at (o.redline, main.js), the shift warning that
 * far under it (o.shiftBefore: 300 rpm; negative when Shift now warning at is past the red); with Settings > Cold-engine
 * rev guard on, pulled down to the Cold rev limit (4500 rpm) with the oil at 30 °C and climbing back as the oil
 * reaches Oil warm at (80 °C), the red zone keeping its distance to it: lower while cold (as an M car's variable
 * redline). d: the data (its oil); { rpm, red, cold }.
 */
const SHIFT_DEFAULTS = { shiftBefore: 300, coldLimit: 4500, warmOil: 80 };
const setNum = (o, k) => { const v = o ? Number(o[k]) : NaN; return o && o[k] !== '' && o[k] !== null && o[k] !== undefined && isFinite(v) ? v : SHIFT_DEFAULTS[k]; };
function shiftPoint(o, d) {
    const red = rpmScale(o || {}).red * 1000, before = setNum(o, 'shiftBefore');
    const n = Math.max(2500, red - before), oil = d && d.oil, warm = setNum(o, 'warmOil');
    if (!o || o.coldGuard === 'off' || !isNum(oil) || oil >= warm) return { rpm: n, red, cold: false };
    const cold = Math.min(setNum(o, 'coldLimit'), n), f = Math.max(0, Math.min(1, (oil - 30) / Math.max(1, warm - 30)));
    const rpm = Math.round((cold + (n - cold) * f) / 50) * 50;
    return { rpm, red: Math.max(2000, Math.min(red, rpm + before)), cold: true };
}
/** Where the tach turns yellow now (Settings > Yellow light at; Auto: 700 under the red zone), never past
 * the red zone; rpm. */
function yellowAt(o, d) {
    const red = shiftPoint(o, d).red, y = o && Number(o.yellowFrom) > 0 ? Number(o.yellowFrom) : red - 700;
    return Math.min(y, red);
}
/** A temperature (°C) on a 40-140 °C scale, 0..1. */
const tempFrac = (c) => (isNum(c) ? Math.max(0, Math.min(1, (c - 40) / 100)) : 0);

/** The gear: P R N, or D / S / M (the selector's programme) with the gear number. */
function gearText(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
    if (d.gear === -1) return 'R';
    // (an electric car's B, its selector's programme: B alone, as its own cluster shows it)
    if (d.mode === 'B') return 'B';
    const g = isNum(d.gear) && d.gear > 0 ? String(d.gear) : '';
    const mode = d.mode === 'S' || d.mode === 'M' ? d.mode : 'D';
    return d.stage === 'D' || g || d.mode ? mode + g : '-';
}
/** The selector letter lit in a P R N D row. */
function selectorLit(d) {
    const g = gearText(d);
    return g === '-' ? '' : g === 'P' || g === 'R' || g === 'N' ? g : 'D';
}
/** The drive mode line: the mode as the car names it (data.js FES_MODES), else S / M from the selector, else the
 * colours' name. */
const modeText = (d, t) => {
    if (d && d.driveMode) return d.driveMode;
    if (d && (d.mode === 'S' || d.mode === 'M')) return d.mode === 'M' ? 'MANUAL' : 'SPORT';
    return t.mode;
};
/* the local time (clock.js: the car's own; --:-- until the car has said) */
const clock = () => require('./clock').hm(undefined, true);   // (12-hour: with AM / PM)

/* ---------- the map window and the extra readings ---------- */

/** The native map area (slot 0x100), where the KOMBI draws its own map or centre: with the centre set to 'map' (or
 * the stock centre over the car's own strip) a layout puts none of its readings over it. */
const MAP = { x: 416, y: 120, w: 1088, h: 480 };
/*
 * What a layout leaves open of it: the middle between the KOMBI's own fins (x 574 and 1357 at the top; its "km/h",
 * speed-limit sign and "1/min" along the bottom edges), where Waze on cluster's map is hosted (map_host.js), and
 * STOCK_SPEED beside it, the KOMBI's own speed readout and speed bar at the left of its map (at 0 km/h x 416-705,
 * y 342-415), from just inside the fin's tip, as far left as the layouts' dials leave room, for a three-digit speed.
 */
const MAP_VIEW = { x: 592, y: 120, w: 746, h: 480 };
const STOCK_SPEED = { x: 426, y: 326, w: 166, h: 98 };
/** Background rectangles round the map's view and the KOMBI's speed readout (top, bottom, left above, beside and
 * below the readout, right). */
const aroundMap = () => {
    const V = MAP_VIEW, S = STOCK_SPEED;
    return [
        { x: 0, y: 0, w: 1920, h: V.y }, { x: 0, y: V.y + V.h, w: 1920, h: 720 - V.y - V.h },
        { x: 0, y: V.y, w: V.x, h: S.y - V.y }, { x: 0, y: S.y, w: S.x, h: S.h },
        { x: 0, y: S.y + S.h, w: V.x, h: V.y + V.h - S.y - S.h },
        { x: V.x + V.w, y: V.y, w: 1920 - V.x - V.w, h: V.h },
    ];
};
/** True when a rectangle overlaps the map window. */
const overMap = (r) => r.x < MAP.x + MAP.w && r.x + r.w > MAP.x && r.y < MAP.y + MAP.h && r.y + r.h > MAP.y;

/*
 * What the cluster's glass shows of the panel (from photos of a G05; the same on every car with this cluster):
 * the top corners are cut on a slant, the camera's cowl covers the top middle, the stock warning lights and
 * the gear's letter sit along the bottom, and while a layout is up the KOMBI leaves a dark box where the stock
 * gear readout was (right of centre). Layouts keep their readings out of these.
 */
const NOTCH = { x: 730, y: 0, w: 460, h: 128 };
/* the KOMBI's own bracket where its gear readout was (measured from a photo of the car: a thick grey bar on
 * top with a slanted left end, a thick bar on the right, a thin line at the bottom, black inside, at about
 * x 1490-1652, y 271-442), with a margin; drawn over us, so kept clear and dressed by boxBezel() */
const GEARBOX_HOLE = { x: 1410, y: 262, w: 252, h: 192 };
/* the bracket's grey (#1e1d21, from the photo against a tile of known colour) */
const BRACKET = '#1e1d21';
/** A bezel in the bracket's own grey behind it, a little larger: its bars merge into it and its black window
 * reads as a recessed screen, not a stray shape. */
const boxBezel = () => ({ key: 'boxBezel', kind: 'panel', x: 1476, y: 258, w: 190, h: 198, params: { u_box: [12, 1.5, 0, 1] },
    colors: () => ({ top: '#232227', bottom: BRACKET, border: '#2e2d33' }) });
/* a second, smaller one at the top right, where the stock eDrive readout sits on a plug-in hybrid */
const EDRIVE_HOLE = { x: 1770, y: 170, w: 150, h: 95 };
/*
 * Settings > Cluster: M car. An M car's KOMBI leaves two more dark boxes in the middle of the panel while a
 * layout is up (its own readouts' places in its M display), measured from one photo of a car showing Digital dash:
 * the photo's perspective fitted to the six tiles' corners (fit within 2 px of the photo, about 4 px here), then
 * the boxes' corners read back. The second box's right and bottom edges were at the tile's edges in the photo,
 * so it may reach further; the holes keep a margin round each (and more to the right and below the second).
 */
const M_BOXES = [{ x: 793, y: 289, w: 246, h: 92 }, { x: 1223, y: 328, w: 171, h: 78 }];
const M_HOLES = [{ x: 778, y: 274, w: 276, h: 122 }, { x: 1208, y: 313, w: 207, h: 113 }];
/** True for an M car (Settings > Cluster) whose boxes show: with the car's own bottom strip (Settings > Bottom
 * strip, the default) the layout ends at y 660 and the KOMBI leaves no boxes, so the layouts keep their own places. */
const mCar = (o) => !!o && o.cluster === 'm' && o.bottomStrip !== 'stock';
/** The KOMBI's dark boxes a layout keeps its readings out of, for this car: the gear box, and an M car's two. */
const holes = (o) => (strip(o) ? [] : [GEARBOX_HOLE, EDRIVE_HOLE].concat(mCar(o) ? M_HOLES : []));
/*
 * Settings > Bottom strip > The car's own (the default): the layout ends at STRIP_Y, the KOMBI's own strip shows
 * below it (its fuel range bottom left, the time, the street, the drive mode and gear, the outside temperature and
 * the electric range bottom right), and the KOMBI's gear bracket and eDrive box don't show: the layouts take their
 * centred places, the ranges' numbers are left to the strip, and the fuel and charge gauges sit above the strip's
 * ranges (stripGauges). 646: 660 just touched the top of the strip's drive mode (photo of the car).
 */
const STRIP_Y = 646;
const strip = (o) => !!o && o.bottomStrip === 'stock';
/** The fuel gauge above the strip's fuel range (bottom left) and the charge above its electric range (bottom
 * right): bars with a word, no numbers (the strip shows the ranges). The charge only on a plug-in hybrid. */
function stripGauges(o, opts) {
    const lab = (t) => ({ color: [t.dim || '#9aa4ae', 1], glow: [t.glow || '#000000', 0] });
    const fuelC = (t) => ({ track: t.track || '#1a1a1a', fill0: t.text || t.tick || '#e8e8e8', fill1: t.text || t.tick || '#e8e8e8', redc: t.red || '#ff3b30', tip: t.text || '#ffffff', tick: t.dim || '#888888', num: t.num || '#888888' });
    const evC = (t, d) => { const c = socLow(d) ? t.red || '#ff3b30' : t.ev || '#4ab4ff'; return { track: t.track || '#1a1a1a', fill0: c, fill1: c, redc: t.red || '#ff3b30', tip: c, tick: t.dim || '#888888', num: t.num || '#888888' }; };
    const out = opts && opts.fuel === false ? [] : [
        // each with its level in % beside its name (the strip under it shows the range)
        text('stripFuelLbl', 96, 598, 220, 16, (d) => 'FUEL' + (isNum(d.fuelPct) ? '  ' + Math.round(d.fuelPct) + '%' : ''), lab, { align: 0, tracking: 0.18 }),
        bar('stripFuel', 90, 618, 250, 16, (d) => (isNum(d.fuelPct) ? d.fuelPct / 100 : 0), fuelC, 16),
    ];
    if (o.vehicle !== 'ice') out.push(
        text('stripSocLbl', 1610, 598, 220, 16, (d) => (isNum(d.soc) ? Math.round(d.soc) + '%  ' : '') + 'CHARGE', (t, d) => (socLow(d) ? { color: [t.red || '#ff3b30', 1], glow: [t.red || '#ff3b30', 0.2] } : lab(t)), { align: 1, tracking: 0.18 }),
        bar('stripSoc', 1580, 618, 250, 16, (d) => (isNum(d.soc) ? d.soc / 100 : 0), evC, 16));
    return out;
}
/** The layout's own range readings (keys) left out with the strip: it shows both ranges. */
/** A plug-in hybrid's battery low (0.36.3: 10 %, as ID7 M's): at it and under its charge bars and gauges go red */
const LOW_SOC = 10;
const socLow = (d) => !!d && isNum(d.soc) && d.soc <= LOW_SOC;
const STRIP_DROP = /^(fuel|elec|frange|erange|range2)(Lbl)?$|^erangeL$/;

/*
 * A plug-in hybrid in an electric eDrive mode (ELECTRIC, ELECTRIC INDIVIDUAL; the car's drive mode, data.js
 * driveMode), or, before the car has named its mode, with the engine off: the analog layouts' tachs read the
 * battery's power instead (tachDyn, below). In HYBRID, SPORT, BATTERY CONTROL and the rest they are tachs, with a small
 * power gauge inside. Never with Show: Engine or on a petrol or diesel car.
 */
/* (0.35.9, as the car's own plug-in hybrid cluster: a Power % meter in HYBRID and ELECTRIC, eBOOST at its top,
 * CHARGE below its 0; the rev counter in SPORT and XTRABOOST, the lever in S or M) */
const sportNow = (d) => /SPORT|XTRABOOST/.test(d.driveMode || '') || d.mode === 'S' || d.mode === 'M';
const electric = (o, d) => !engineFocus(o) && !!o && o.vehicle !== 'ice' && !!d && !sportNow(d)
    && (typeof d.driveMode === 'string' && d.driveMode ? true : d.engineOn === false);
/*
 * The power gauges: 0 a quarter along (KW_ZERO), the battery's power drawn above it to the gauge's top, the
 * regeneration below it to its start, each side on its own scale. The ends are eDrive Live's (the battery's
 * discharge and charge limits, data.js kwOut / kwIn), else 100 and 35 kW.
 */
const KW_ZERO = 0.25;
const KW_FLOOR = -500;                  // (a dial's lowest value passed on: the engine's clamp; the gauge clamps itself)
const REGEN_RGB = [0.24, 0.86, 0.52];   // (#3ddc84, the layouts' regeneration green)
/*
 * Power % (the tach in HYBRID and ELECTRIC): the accelerator's demand, 0 to 100 (from the engine unit, as the car's own
 * Power % follows the pedal; the battery's power over its limit where the pedal isn't read), or, off the pedal, the
 * regeneration below 0 (CHARGE: the battery's charging over its limit, to -100). eBOOST: the top tenth.
 */
const PCT = { max: 100, major: 20, minor: 10 };
const POWER_UNIT = 'POWER %';
const EBOOST_AT = 90;
const powerPct = (d) => {
    if (!d) return 0;
    if (isNum(d.pedal) && d.pedal > 2) return Math.min(100, d.pedal);
    if (isNum(d.kw) && d.kw < -0.3) return -Math.min(100, -d.kw / kwRange(d).in * 100);
    if (!isNum(d.pedal) && isNum(d.kw) && d.kw > 0) return Math.min(100, d.kw / kwRange(d).out * 100);
    return 0;
};
/** Power % as a place along a bar (0..1, 0 % at z; ID7 M's blades) */
const powerFrac = (d, z) => { const zz = isNum(z) ? z : KW_ZERO, p = powerPct(d); return p >= 0 ? zz + (1 - zz) * p / 100 : zz * (1 + p / 100); };
/** The gauge's ends now: { out, in } kW. */
const kwRange = (d) => ({ out: d && isNum(d.kwOut) && d.kwOut >= 20 ? d.kwOut : 100, in: d && isNum(d.kwIn) && d.kwIn >= 5 ? d.kwIn : 35 });
/** kW as a place along a power gauge (0..1, 0 kW at z). */
const kwFrac = (kw, r, z) => {
    const zz = isNum(z) ? z : KW_ZERO;
    if (!isNum(kw)) return zz;
    return kw >= 0 ? zz + (1 - zz) * Math.min(1, kw / r.out) : zz * (1 - Math.min(1, -kw / r.in));
};
/** A round scale for out kW: { max, major, minor }, its numerals every major (4-5 of them). */
function kwDialScale(out) {
    const major = [20, 25, 40, 50].find((m) => Math.ceil(out / m) <= 5) || 100;
    return { max: Math.ceil(out / major) * major, major, minor: major / 5 };
}
/** A tach dial's dyn, value and range: kW in an electric mode (0 a quarter round), else the engine speed
 * (s: rpmScale(o), red where it is). */
const tachDyn = (o, s, red) => (d) => {
    // (the red zone where the shift point puts it now: lower while the oil is cold)
    if (!electric(o, d)) return { u_scale: [s.max, s.major, s.minor, Math.min(red, shiftPoint(o, d).red / 1000)], u_min: [0], u_zero: [0], u_regen: REGEN_RGB };
    return { u_scale: [PCT.max, PCT.major, PCT.minor, PCT.max + 1], u_min: [-PCT.max], u_zero: [KW_ZERO], u_regen: REGEN_RGB };
};
const tachValue = (o) => (d) => (electric(o, d) ? powerPct(d) : isNum(d.rpm) ? d.rpm / 1000 : 0);
const tachRange = (o, s) => (d) => (electric(o, d) ? [-PCT.max, PCT.max] : [0, s.max]);
/**
 * The Power % meter's words on a round tach (centre cx, cy, radius R, its sweep a0..a1 in degrees from twelve
 * o'clock): eBOOST by its top, eDRIVE above 0, CHARGE along the regeneration; empty while it is a rev counter.
 */
function powerLabels(o, key, cx, cy, R, a0, a1, rr) {
    const at = (f, r) => { const a = (a0 + (a1 - a0) * f) * Math.PI / 180; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
    const h = Math.max(15, Math.round(R * 0.065)), w = Math.max(60, Math.round(R * 0.32)), r0 = (rr || 0.42) * R;
    const ev = (t) => ({ color: [t.ev || '#4ab4ff', 1], glow: [t.ev || '#4ab4ff', 0.2] });
    const green = () => ({ color: ['#3ddc84', 1], glow: ['#3ddc84', 0.2] });
    const lab = (k, f, word, col) => { const [x, y] = at(f, r0); return text(key + k, Math.round(x - w / 2), Math.round(y - h / 2), w, h, (d) => (electric(o, d) ? word : ''), col, { tracking: 0.1 }); };
    return [lab('Boost', 0.94, 'eBOOST', ev), lab('Drive', KW_ZERO + 0.07, 'eDRIVE', ev), lab('Charge', KW_ZERO * 0.4, 'CHARGE', green)];
}
/* The readings put where the time and outside temperature were, with the car's own bottom strip (which shows
 * both): on a petrol or diesel car the two picked in Settings > Readout 1 / 2 (intake air and the gearbox oil's
 * by default), on a plug-in hybrid the battery's temperature and the gearbox oil's. box: the piece's { w, h }: the
 * long names where they fit ('INTAKE AIR 31°'), else the short ('IAT 31°'). */
const stripInfoA = (o, box) => (o.vehicle === 'ice' || engineFocus(o) || phevPick(o, 'infoA')
    ? readout(o, o.infoA || 'iat', box) : (d) => 'BATT ' + tempText(o, d.battTemp));
const stripInfoB = (o, box) => (o.vehicle === 'ice' || engineFocus(o) || phevPick(o, 'infoB')
    ? readout(o, o.infoB || 'gearbox', box) : (d) => 'GEARBOX ' + tempText(o, d.gearbox));

/*
 * A tach's power meter (a plug-in hybrid's eDrive scale): an inner arc across the top of the tach, 0 a quarter
 * along it (40 degrees left of twelve o'clock); right of it the power drawn from the battery (blue, 120 degrees, to
 * the battery's limit), left of it charging and recuperation (green, 40 degrees, to its limit): eDrive Live's ends
 * (kwRange), numbered in round steps. lbl: the label's colours.
 */
function powerMeter(cx, size, cy, lbl, o) {
    const k = size / 640, r = Math.round(150 * k), th = Math.max(8, Math.round(12 * k)), half = r + th + Math.round(22 * k);
    const box = { x: cx - half, y: cy - half, w: half * 2, h: half };     // the top half around the dial's centre
    // (each side's end rounded: the power drawn to 20 kW, in 4 marks; the regeneration to 10 kW, in 2)
    const outN = (d) => Math.ceil(kwRange(d).out / 20) * 20, inN = (d) => Math.ceil(kwRange(d).in / 10) * 10;
    const arc = (key, a0, a1, value, colour, marks, end) => ({
        key, kind: 'band', x: box.x, y: box.y, w: box.w, h: box.h + th, z: 2,
        params: { u_geo: [half, half, r, th], u_span: [a0, a1, 0, 0], u_marks: [marks, 25, Math.round(19 * k), -Math.round(24 * k)], u_red: [2] },
        colors: (t) => ({ track: t.track, fill0: colour(t), fill1: colour(t), redc: t.red, tip: colour(t), tick: t.dim, num: t.num }),
        dyn: (d) => ({ u_marks: [marks, end(d) / marks, Math.round(19 * k), -Math.round(24 * k)] }),
        value, max: 1, sweep: true,
        // (gone while the dial itself reads the battery's power: an electric mode)
        visible: o ? (d) => !electric(o, d) : undefined,
    });
    return [
        arc('kwDraw', -40, 80, (d) => Math.max(0, Math.min(1, (isNum(d.kw) ? d.kw : 0) / outN(d))), (t) => t.ev, 4, outN),
        arc('kwRegen', -40, -80, (d) => Math.max(0, Math.min(1, -(isNum(d.kw) ? d.kw : 0) / inN(d))), (t) => t.regen || '#3ddc84', 2, inN),
        Object.assign(text('kwLbl', cx - 40, cy - r + Math.round(46 * k), 80, Math.round(20 * k), 'kW', lbl, { tracking: 0.04 }), o ? { visible: (d) => !electric(o, d) } : {}),
    ];
}

/* the stock warning lights and the fallback gear letter along the bottom middle */
const TELLTALES = { x: 560, y: 652, w: 960, h: 68 };
/*
 * The KOMBI's own lights over us, each as its shape (a few rectangles, 4 px to spare), not a box round it: its turn
 * signal arrows (AK Cluster ID8's measured places, x 685-749 and 1146-1212: a head pointing out and a shaft half its
 * height) and its warning lights along the glass's sides (BMW's guide to the G-series cluster, TE18-0859, laid on
 * those arrows and ID8's tyre and parking brake lights; Auto Hold and the parking brake as a photo of a G20's cluster
 * shows them, 2026-11-25). Left: lane departure, brakes, tyres, ABS, DSC (round symbols about 46 px); right: Auto
 * Hold (its words), parking brake, steering. Those outside the glass (the lights, fog lights, engine, DSC off, the
 * turn signals' own lamps) are no matter.
 */
const arrowShape = (tip, out, cy, h) => {
    const at = (a, b) => (out < 0 ? { x: tip + a, w: b - a } : { x: tip - b, w: b - a });
    return [[0, 10, 0.18], [10, 20, 0.5], [20, 33, 0.96], [33, 64, 0.4]].map(([a, b, f]) => {
        const r = at(a, b), hh = Math.round(h * f) + 8;
        return { x: r.x - 4, y: Math.round(cy - hh / 2), w: r.w + 8, h: hh };
    });
};
const TURN_ARROWS = arrowShape(685, -1, 128, 60).concat(arrowShape(1212, 1, 122, 55));
const roundSymbol = ([x, y]) => [{ x: x - 27, y: y - 15, w: 54, h: 30 }, { x: x - 15, y: y - 27, w: 30, h: 54 }];
const SIDE_LIGHTS = [].concat(...[[163, 207], [94, 248], [88, 308], [80, 366], [73, 424], [1880, 293], [1888, 349]].map(roundSymbol),
    [{ x: 1784, y: 228, w: 100, h: 38 }]);
/** Rectangles covering r but not hole: r itself when they don't meet, else up to four around the hole (the
 * background drawn around the KOMBI's dark box, so nothing of ours sits under it). */
function cut(r, hole) {
    const hx = Math.max(r.x, hole.x), hy = Math.max(r.y, hole.y), hx2 = Math.min(r.x + r.w, hole.x + hole.w), hy2 = Math.min(r.y + r.h, hole.y + hole.h);
    if (hx >= hx2 || hy >= hy2) return [r];
    return [
        { x: r.x, y: r.y, w: r.w, h: hy - r.y },                       // above
        { x: r.x, y: hy2, w: r.w, h: r.y + r.h - hy2 },                // below
        { x: r.x, y: hy, w: hx - r.x, h: hy2 - hy },                   // left
        { x: hx2, y: hy, w: r.x + r.w - hx2, h: hy2 - hy },            // right
    ].filter((q) => q.w > 0 && q.h > 0);
}
/** True when a point is inside the glass's slanted top corners (hidden). */
const inCorner = (x, y) => y < 217 - 0.55 * Math.min(x, 1920 - x);

/** A distance in km as the speed unit wants it: '312 MI', '502 KM', or '--'. */
const distText = (o, km) => (isNum(km) ? Math.round(o.speedUnit === 'kmh' ? km : km / KMH_PER_MPH) + (o.speedUnit === 'kmh' ? ' km' : ' mi') : '--');
/** The electric range: '~31 MI' when it is the estimate from the charge (data.js), else as distText. */
const erangeText = (o, d) => (isNum(d.erange) && d.erangeEst ? '~' : '') + distText(o, d.erange);
/*
 * Settings > Vehicle: a plug-in hybrid (o.vehicle 'phev', the eDrive readings) or a petrol or diesel car
 * ('ice'). With ICE the layouts trade their eDrive readings for the engine's: battery power -> engine torque, charge -> ignition timing, electric range -> boost, the charge bar
 * -> boost against its target. Each helper takes o and gives the reading for the choice.
 */
const engineFocus = (o) => !!o && (o.vehicle === 'ice' || o.focus === 'engine');
/** Settings > Vehicle: Diesel (o.fuel): no ignition timing to read */
const diesel = (o) => !!o && o.fuel === 'diesel';
/**
 * Pressures (boost and fuel rail, bar in the data) in Settings > Pressure unit: psi, bar or kPa, or (the
 * default, 'auto') with the speed unit as before: psi with mph, bar with km/h. Only the figures change: every
 * bar, gauge and range works in bar, so a full bar means the same in any unit.
 */
const pressUnitOf = (o) => (o && (o.pressUnit === 'psi' || o.pressUnit === 'bar' || o.pressUnit === 'kpa') ? o.pressUnit
    : o && o.speedUnit === 'kmh' ? 'bar' : 'psi');
const pressIn = (o, bar) => (pressUnitOf(o) === 'psi' ? bar * 14.5038 : pressUnitOf(o) === 'kpa' ? bar * 100 : bar);
/** a pressure's figures: bar to a hundredth (whole from 10, the rail), psi to a tenth (whole from 100), kPa whole */
const pressNum = (o, bar) => {
    if (!isNum(bar)) return '--';
    const u = pressUnitOf(o), v = pressIn(o, bar);
    if (u === 'bar') return Math.abs(v) < 10 ? v.toFixed(2) : String(Math.round(v));
    if (u === 'psi') return Math.abs(v) < 100 ? v.toFixed(1) : String(Math.round(v));
    return String(Math.round(v));
};
const pressLabel = (o) => ({ psi: 'psi', bar: 'bar', kpa: 'kPa' })[pressUnitOf(o)];
const boostText = (o, d) => (d.engineOn === false ? 'OFF' : isNum(d.boostActual) ? pressNum(o, d.boostActual) + ' ' + pressLabel(o) : '--');
/** Engine torque (Nm) in Settings > Torque unit: Nm, kgm (to a tenth) or lb-ft. */
const torqueOf = (o) => (o && (o.torqueUnit === 'kgm' || o.torqueUnit === 'lbft') ? o.torqueUnit : 'nm');
const torqueNum = (o, nm) => (!isNum(nm) ? '--' : torqueOf(o) === 'kgm' ? (nm / 9.80665).toFixed(1)
    : String(Math.round(torqueOf(o) === 'lbft' ? nm * 0.737562 : nm)));
const torqueUnit = (o) => ({ nm: 'Nm', kgm: 'kgm', lbft: 'lb-ft' })[torqueOf(o)];
const torqueText = (o) => (d) => (isNum(d.torque) ? torqueNum(o, d.torque) + ' ' + torqueUnit(o) : '--');
/** Ignition timing: a tenth under 10 degrees, whole from 10 ('24°': '24.0°' ran over Track's tile). */
const timingText = (d) => (isNum(d.timing) ? (Math.abs(d.timing) < 10 ? d.timing.toFixed(1) : String(Math.round(d.timing))) + '°' : '--');
/** Boost (bar over atmosphere) 0..1.6 as 0..1. */
const boostFrac = (d) => (d.engineOn === false || !isNum(d.boostActual) ? 0 : Math.max(0, Math.min(1, boostShare(d.boostActual, 1.6))));
/** The engine's power (kW, data.js: its torque x its speed) in Settings > Power unit: hp (the default), PS or kW. */
const powerOf = (o) => (o && (o.powerUnit === 'ps' || o.powerUnit === 'kw') ? o.powerUnit : 'hp');
const powerNum = (o, kw) => (!isNum(kw) ? '--' : String(Math.round(powerOf(o) === 'kw' ? kw : kw * (powerOf(o) === 'ps' ? 1.35962 : 1.34102))));
const powerUnitText = (o) => ({ hp: 'hp', ps: 'PS', kw: 'kW' })[powerOf(o)];
const tempOf = (k) => (o, d) => tempText(o, d[k]);
const numOrOff = (f) => (o, d) => (d.engineOn === false ? 'OFF' : f(o, d));
/*
 * The readouts a petrol or diesel car's displays can pick (Settings > Readout 1, Readout 2, Main readout; 'off':
 * Nothing, in each of them):
 * short: the name where room is short; long: where there is room; num: the figures; unit: after them (none for
 * the temperatures and the pedal, whose figures carry theirs); frac: 0..1 for a bar under it; needs: what the engine
 * unit must read for it (data.js).
 */
/*
 * The car's own trip computer (0.45.0; data.js: KombiIF, read-only): trip 1's average fuel economy in the unit the car
 * shows it (avgConsUnit: 'l100', 'kml', 'mpg' US, 'mpguk'), its distance (km) and driving time (minutes). Settings > Fuel
 * economy unit (or the Car profile's): km/L, L/100km, mpg (US) or mpg (UK); none set, the car's own unit. Each unit is
 * its own number over litres a 100 km, so one turns into another as 100 / x does.
 */
const ECON_UNITS = { kml: 'km/L', l100: 'L/100km', mpg: 'mpg', mpguk: 'mpg' };
const ECON_K = { l100: 1, kml: 100, mpg: 235.215, mpguk: 282.481 };   // (x to l/100 km: K / x, l100 itself)
const econUnitOf = (o, d) => { const u = o && o.econUnit; return ECON_K[u] ? u : d && ECON_K[d.avgConsUnit] ? d.avgConsUnit : o && o.speedUnit === 'mph' ? 'mpg' : 'kml'; };
/** The average fuel economy in unit u (econUnitOf), or null. */
function econ(o, d) {
    if (!d || !isNum(d.avgCons) || d.avgCons < 0) return null;
    const src = ECON_K[d.avgConsUnit] ? d.avgConsUnit : 'l100', u = econUnitOf(o, d);
    // (0.0: a trip just reset, nothing to average yet - 0.0 in any unit, as the car's own trip computer shows it)
    if (d.avgCons === 0) return { v: 0, u };
    const l100 = src === 'l100' ? d.avgCons : ECON_K[src] / d.avgCons, v = u === 'l100' ? l100 : ECON_K[u] / l100;
    return isNum(v) && v > 0 && v < 1000 ? { v, u } : null;
}
const econNum = (o, d) => { const e = econ(o, d); return e ? e.v.toFixed(1) : '--'; };
const econText = (o, d) => { const e = econ(o, d); return e ? e.v.toFixed(1) + ' ' + ECON_UNITS[e.u] : '--'; };
const tripText = (o, d) => distText(o, d.tripKm);
const tripTimeText = (d) => (isNum(d.tripMin) ? Math.floor(d.tripMin / 60) + ':' + String(Math.round(d.tripMin % 60)).padStart(2, '0') : '--');
/** km/L for a bar (0..30) */
const econFrac = (d) => { const e = econ({ econUnit: 'kml' }, d); return e ? Math.max(0, Math.min(1, e.v / 30)) : 0; };

/*
 * (0.46.0) A centre display's trip computer, in place of its big speed (Settings > Centre display: Trip computer, or the
 * page, for each layout): n lines, each a place on the page (tripRow1-n: any readout, or nothing; as designed the
 * distance, the driving time and the average economy - two lines: the distance and the economy), its name at the left
 * and its figures at the right, under a small heading.
 */
const TRIP_OWN = { 1: ['avgFuel'], 2: ['trip', 'avgFuel'], 3: ['trip', 'tripTime', 'avgFuel'] };
const tripShown = (o) => !!o && o.centreView === 'trip';
const notMap = (o) => !!o && o.centre !== 'map' && o.centre !== 'stock';
/** The places of a trip computer of n lines (when: they show; default with the trip computer in the display). */
const tripPlaces = (n, when) => Array.from({ length: n }, (x, i) => ({ key: 'tripRow' + (i + 1), kind: 'readout', label: 'Trip computer: line ' + (i + 1), when: when || ((o) => tripShown(o) && notMap(o)) }));
/** Its pieces in the box X Y W H: the heading (unless head false), then the lines; nameC, valueC their colours, fam the
 * layout's glyph family (the figures made to fit their widest). */
function tripRows(o, X, Y, W, H, n, nameC, valueC, fam, head) {
    const out = [], top = head === false ? 0 : Math.max(14, Math.round(H * 0.1)), rh = (H - top - (head === false ? 0 : 6)) / n;
    if (head !== false) out.push(text('tripHead', X, Y, W, top, 'TRIP COMPUTER', nameC, { tracking: 0.14 }));
    for (let i = 0; i < n; i++) {
        const r = placeReadout(o, placeOf(o, 'tripRow' + (i + 1)) || TRIP_OWN[n][i]), y = Math.round(Y + H - rh * (n - i)), vh = Math.round(Math.min(rh * 0.78, 46)), lw = Math.round(W * 0.34);   // (0.34: room for the names)
        // (a space before the name: a capital's stem at the box's very edge loses half a pixel there)
        out.push(text('tripLbl' + (i + 1), X, y + Math.round((rh - vh * 0.6) / 2), lw, Math.round(vh * 0.6), ' ' + r.short, nameC, { align: 0, tracking: 0.06 }),
            // (0.48.4: a gap after the name, and a long figure - the distance since delivery, six figures - set smaller
            // rather than its glyphs squeezed up to the name: room 0.88 of the box)
            Object.assign(fitText(text('tripRow' + (i + 1), X + lw + Math.round(vh * 0.2), y + Math.round((rh - vh) / 2), W - lw - Math.round(vh * 0.2), vh, r.value, valueC, { align: 1 }), fam, 0.88), r.tone ? { tone: r.tone } : {}));
    }
    // (0.48.4) every line's figures one size, the smallest any of them needs at its widest (the distance's, six
    // figures, as a rule): lines of one height, not each its own
    const vals = out.filter((p) => /^tripRow/.test(p.key)), h = Math.min(...vals.map((p) => p.h));
    vals.forEach((p) => { p.y += Math.round((p.h - h) / 2); p.h = h; });
    return out;
}

const READOUTS = {
    iat: { short: 'IAT', long: 'INTAKE AIR', num: tempOf('iat'), frac: (d) => (isNum(d.iat) ? d.iat / 80 : 0), needs: ['iat'] },
    gearbox: { short: 'TRANS', long: 'TRANS OIL', num: tempOf('gearbox'), frac: (d) => (isNum(d.gearbox) ? (d.gearbox - 40) / 90 : 0), needs: ['gearbox'] },
    // (a plug-in hybrid's, 0.36.1: set as any other on either kind of car; '--' on a car without them)
    soc: { short: 'SOC', long: 'BATTERY', num: (o, d) => (isNum(d.soc) ? Math.round(d.soc) + '%' : '--'), frac: (d) => (isNum(d.soc) ? d.soc / 100 : 0) },
    battTemp: { short: 'BATT', long: 'BATTERY TEMP', num: tempOf('battTemp'), frac: (d) => (isNum(d.battTemp) ? (d.battTemp + 10) / 60 : 0) },
    kw: { short: 'kW', long: 'BATTERY POWER', num: (o, d) => (isNum(d.kw) ? (d.kw > 0.05 ? '+' : '') + (Math.abs(d.kw) < 10 ? d.kw.toFixed(1) : String(Math.round(d.kw))) : '--'), unit: () => 'kW', frac: (d) => (isNum(d.kw) ? Math.min(1, Math.abs(d.kw) / kwRange(d).out) : 0) },
    erange: { short: 'E-RNG', long: 'ELECTRIC RANGE', num: (o, d) => erangeText(o, d), frac: (d) => (isNum(d.erange) ? Math.min(1, d.erange / (d.erangeFull || 50)) : 0) },   // (full at Electric range when full)
    oil: { short: 'OIL', long: 'ENGINE OIL', num: tempOf('oil'), frac: (d) => (isNum(d.oil) ? (d.oil - 40) / 100 : 0) },
    coolant: { short: 'CLT', long: 'COOLANT', num: tempOf('coolant'), frac: (d) => (isNum(d.coolant) ? (d.coolant - 40) / 90 : 0) },
    boost: { short: 'BST', long: 'BOOST', num: numOrOff((o, d) => pressNum(o, d.boostActual)), unit: (o) => pressLabel(o), frac: (d) => boostFrac(d), needs: ['boostActual', 'boostTarget'] },
    power: { short: (o) => powerUnitText(o).toUpperCase(), long: 'ENGINE POWER', num: (o, d) => powerNum(o, d.enginePower), unit: (o) => powerUnitText(o), frac: (d) => (isNum(d.enginePower) ? d.enginePower / powerTop() : 0) },
    torque: { short: 'TQ', long: 'ENGINE TORQUE', num: (o, d) => torqueNum(o, d.torque), unit: (o) => torqueUnit(o), frac: (d) => (isNum(d.torque) ? d.torque / torqueTop() : 0) },
    throttle: { short: 'THR', long: 'THROTTLE', num: (o, d) => (isNum(d.throttle) ? Math.round(d.throttle) + '%' : '--'), frac: (d) => (isNum(d.throttle) ? d.throttle / 100 : 0), needs: ['throttle'] },
    pedal: { short: 'PDL', long: 'PEDAL', num: (o, d) => (isNum(d.pedal) ? Math.round(d.pedal) + '%' : '--'), frac: (d) => (isNum(d.pedal) ? d.pedal / 100 : 0), needs: ['pedal'] },
    timing: { short: 'TIM', long: 'TIMING', num: (o, d) => timingText(d), frac: (d) => (isNum(d.timing) ? (d.timing + 10) / 50 : 0), needs: ['timing'] },
    // the gear as the selector has it: P R N, or D / S / M with its number (gearText; '-' while unknown)
    // (no name: D1, S2, M3, R, P say what they are)
    gear: { short: '', long: '', num: (o, d) => gearText(d), frac: (d) => (isNum(d.gear) && d.gear > 0 ? d.gear / 8 : 0) },
    // the car's trip computer (0.45.0): its average fuel economy (with its unit), distance and driving time
    avgFuel: { short: 'AVG', long: 'AVG', num: econText, frac: econFrac },
    trip: { short: 'TRIP', long: 'TRIP', num: tripText, frac: (d) => (isNum(d.tripKm) ? Math.min(1, d.tripKm / 1000) : 0) },
    tripTime: { short: 'TIME', long: 'TIME', num: (o, d) => tripTimeText(d), frac: (d) => (isNum(d.tripMin) ? Math.min(1, d.tripMin / 600) : 0) },
    // (0.48.8) the odometer: the trip since delivery, whatever the head unit's trip data shows
    odo: { short: 'ODO', long: 'ODO', num: (o, d) => distText(o, d.odometer), frac: () => 0 },
    // (0.45.0) the fuel range (the car's, as the strip shows it) and the time of day (the car's own clock), anywhere
    frange: { short: 'RANGE', long: 'RANGE', num: (o, d) => distText(o, d.frange), frac: (d) => (isNum(d.frange) ? Math.min(1, d.frange / 800) : 0) },
    // (no name: '7:37 PM' says what it is)
    clock: { short: '', long: '', num: () => clock(), frac: () => 0 },
    rpm: { short: 'RPM', long: 'ENGINE SPEED', num: (o, d) => { const v = rpmShown(d); return v === null ? '--' : String(v); }, unit: () => 'rpm', frac: (d) => (isNum(d.rpm) ? d.rpm / 8000 : 0) },
    // the speed in the other unit (km/h under mph, mph under km/h), its unit for its name
    speed2: { short: (o) => (o.speedUnit === 'kmh' ? 'MPH' : 'KM/H'), long: (o) => (o.speedUnit === 'kmh' ? 'MPH' : 'KM/H'),
        num: (o, d) => (isNum(d.speed) ? String(Math.round(Math.max(0, o.speedUnit === 'kmh' ? d.speed / KMH_PER_MPH : d.speed))) : '--'), frac: (d) => (isNum(d.speed) ? d.speed / scales.speedKmh : 0) },
    outside: { short: 'OUT', long: 'OUTSIDE', num: tempOf('outside'), frac: (d) => (isNum(d.outside) ? (d.outside + 20) / 60 : 0) },
    fuel: { short: 'FUEL', long: 'FUEL', num: (o, d) => (isNum(d.fuelPct) ? Math.round(d.fuelPct) + '%' : '--'), frac: (d) => (isNum(d.fuelPct) ? d.fuelPct / 100 : 0) },
    oilPress: { short: 'OILP', long: 'OIL PRESSURE', num: (o, d) => pressNum(o, d.oilPress), unit: (o) => pressLabel(o), frac: (d) => (isNum(d.oilPress) ? d.oilPress / 10 : 0), needs: ['oilPress'] },
    volts: { short: 'VOLT', long: 'BATTERY VOLTS', num: (o, d) => (isNum(d.volts) ? d.volts.toFixed(1) : '--'), unit: () => 'V', frac: (d) => (isNum(d.volts) ? (d.volts - 10) / 6 : 0), needs: ['volts'] },
    hpfp: { short: 'HPFP', long: 'HIGH FUEL PRESS', num: (o, d) => pressNum(o, d.hpfp), unit: (o) => pressLabel(o), frac: (d) => (isNum(d.hpfp) ? d.hpfp / 350 : 0), needs: ['hpfp'] },
    lpfp: { short: 'LPFP', long: 'LOW FUEL PRESS', num: (o, d) => pressNum(o, d.lpfp), unit: (o) => pressLabel(o), frac: (d) => (isNum(d.lpfp) ? d.lpfp / 8 : 0), needs: ['lpfp'] },
    boostTarget: { short: 'TGT', long: 'BOOST TARGET', num: numOrOff((o, d) => pressNum(o, d.boostTarget)), unit: (o) => pressLabel(o), frac: (d) => (isNum(d.boostTarget) ? boostShare(d.boostTarget, 1.6) : 0), needs: ['boostActual', 'boostTarget'] },
    // this drive's figures (driveSample)
    boostPeak: { short: 'PKBST', long: 'PEAK BOOST', num: (o, d) => pressNum(o, d.boostPeak), unit: (o) => pressLabel(o), frac: (d) => (isNum(d.boostPeak) ? boostShare(d.boostPeak, 1.6) : 0), needs: ['boostActual', 'boostTarget'] },
    powerPeak: { short: (o) => 'PK ' + powerUnitText(o).toUpperCase(), long: 'PEAK POWER', num: (o, d) => powerNum(o, d.powerPeak), unit: (o) => powerUnitText(o), frac: (d) => (isNum(d.powerPeak) ? d.powerPeak / powerTop() : 0) },
    zero100: { short: (o) => (o.speedUnit === 'kmh' ? '0-100' : '0-60'), long: (o) => (o.speedUnit === 'kmh' ? '0-100 KM/H' : '0-60 MPH'),
        num: (o, d) => (isNum(d.zero100) ? d.zero100.toFixed(1) : '--'), unit: () => 's', frac: () => 0 },
    lastShift: { short: 'SHIFT', long: 'LAST SHIFT', num: (o, d) => (d.lastShift ? String(d.lastShift.rpm) : '--'), unit: () => 'rpm', frac: (d) => (d.lastShift ? d.lastShift.rpm / 8000 : 0) },
};
/*
 * This drive's figures (main.js data(): each reading as it comes), kept while the app runs: the highest boost (the
 * engine running), engine power and battery power (kW out of it); the 0-100 km/h (0-60 mph) time, started on leaving
 * a stop and stopped at that speed (given up after 30 s), and the best of them; the last upshift (one gear up) at the
 * highest rpm in the 0.6 s before it (under 2500 rpm: not counted), with the oil's temperature then. Written into the
 * data: boostPeak (bar), powerPeak, kwPeak (kW), zero100 (s: running while zero100Live), zero100Best,
 * lastShift { from, to, rpm, oil, at }. The demo data: the peaks only.
 */
const drive = { at: 0, boostPeak: null, powerPeak: null, kwPeak: null, armed: false, t0: 0, last: null, best: null, recent: [], gear: null, shift: null };
function driveSample(d, speedUnit) {
    if (!d) return d;
    const s = drive, now = Date.now();
    if (now - s.at >= 10) {
        s.at = now;
        if (isNum(d.kw) && d.kw > 0 && (s.kwPeak === null || d.kw > s.kwPeak)) s.kwPeak = d.kw;
        if (d.engineOn !== false && isNum(d.boostActual) && (s.boostPeak === null || d.boostActual > s.boostPeak)) s.boostPeak = d.boostActual;
        if (isNum(d.enginePower) && (s.powerPeak === null || d.enginePower > s.powerPeak)) s.powerPeak = d.enginePower;
        if (!d.demo) driveRun(s, d, now, speedUnit);
    }
    const run = s.t0 ? (now - s.t0) / 1000 : null;
    return Object.assign(d, { boostPeak: nn(s.boostPeak), powerPeak: nn(s.powerPeak), kwPeak: nn(s.kwPeak), zero100: run !== null ? run : nn(s.last), zero100Live: run !== null,
        zero100Best: nn(s.best), lastShift: s.shift || undefined });
}
const nn = (v) => (v === null ? undefined : v);
function driveRun(s, d, now, speedUnit) {
    if (isNum(d.rpm)) { s.recent.push([now, d.rpm]); while (s.recent.length && now - s.recent[0][0] > 1200) s.recent.shift(); }
    const g = d.gear;
    if (isNum(g) && g > 0 && isNum(s.gear) && s.gear > 0 && g === s.gear + 1) {
        const win = s.recent.filter((x) => now - x[0] < 600), rpm = win.length ? Math.max.apply(null, win.map((x) => x[1])) : 0;
        if (rpm > 2500) s.shift = { from: s.gear, to: g, rpm: Math.round(rpm), oil: d.oil, at: now };
    }
    if (isNum(g)) s.gear = g;
    if (!isNum(d.speed)) return;
    if (d.speed < 1) { s.armed = true; s.t0 = 0; return; }
    if (s.armed && !s.t0) s.t0 = now;
    if (!s.t0) return;
    if (d.speed >= (speedUnit === 'kmh' ? 100 : 96.56)) {
        s.last = (now - s.t0) / 1000;
        if (s.best === null || s.last < s.best) s.best = s.last;
        s.t0 = 0; s.armed = false;
    } else if (now - s.t0 > 30000) { s.t0 = 0; s.armed = false; }
}
const readoutOf = (k) => READOUTS[k] || null;
/*
 * Temperatures in colour (Settings > Temperature colours): blue while cold, the oil amber while warming, red when too
 * hot, as Cluster Centre's tiles (readings.js: oil and coolant cold under 60 °C, the gearbox oil under 50; the oil
 * warming up to Oil warm at; hot from Settings > Too hot: oil, coolant, gearbox (130, 118, 115 °C; the Car profile's
 * when it sets them: hotAt); the intake air from 60). toneOf: 'cold', 'warm', 'hot' or null for a reading now; toned: a
 * piece's colours with it. The same temperatures start the red on every layout's temperature gauges and figures.
 */
/*
 * Temperature gauges as the car's own (Settings > Temperature gauges: C-H, the default): C at the cold end, H at the hot
 * end, the needle in the middle across the range an engine runs at once warm (as BMW's coolant gauge stays in the
 * middle), climbing towards H only above it; red from CH_RED. chOf(o, k): k when that reading is shown so; chFrac:
 * a temperature (°C) as 0..1 on that gauge.
 */
const CH = { coolant: { c: 40, lo: 80, hi: 105, h: 125 }, oil: { c: 40, lo: 85, hi: 115, h: 140 }, gearbox: { c: 30, lo: 65, hi: 95, h: 125 } };
const CH_RED = 0.85;
const chOf = (o, k) => (o && o.tempGauge !== 'scale' && CH[k] ? k : null);
function chFrac(k, v) {
    const r = CH[k];
    if (!r || !isNum(v) || v <= r.c) return 0;
    if (v < r.lo) return 0.45 * (v - r.c) / (r.lo - r.c);
    if (v <= r.hi) return 0.45 + 0.1 * (v - r.lo) / (r.hi - r.lo);
    return v < r.h ? 0.55 + 0.45 * (v - r.hi) / (r.h - r.hi) : 1;
}
/** C and H at a small gauge's ends: two text pieces at radius r round (cx, cy), at angles a0 and a1 (degrees from
 * twelve o'clock, clockwise), letters size high; H in the red. */
function chMarks(key, cx, cy, r, a0, a1, size, colors) {
    const pos = (a) => [cx + Math.sin(a * Math.PI / 180) * r, cy - Math.cos(a * Math.PI / 180) * r];
    const w = Math.round(size * 1.6), mk = (k, a, s, c) => { const [x, y] = pos(a); return text(key + k, Math.round(x - w / 2), Math.round(y - size / 2), w, size, s, c); };
    return [mk('C', a0, 'C', colors), mk('H', a1, 'H', (t) => ({ color: [t.red || '#ff3b30', 1], glow: [t.red || '#ff3b30', 0.3] }))];
}
const TEMP_TONES = { oil: { cold: 60, hot: 130 }, coolant: { cold: 60, hot: 118 }, gearbox: { cold: 50, hot: 115 }, iat: { hot: 60 } };
// too hot from (°C): the setting's, else TEMP_TONES' (the settings' defaults)
const HOT_KEY = { oil: 'hotOil', coolant: 'hotCoolant', gearbox: 'hotGearbox' };
const hotAt = (o, k) => {
    const s = HOT_KEY[k], v = o && s ? Number(o[s]) : NaN;
    if (o && s && o[s] !== '' && o[s] !== null && o[s] !== undefined && isFinite(v) && v > 0) return v;
    return TEMP_TONES[k] && isNum(TEMP_TONES[k].hot) ? TEMP_TONES[k].hot : NaN;
};
/** Where the red starts on a C-H gauge of k (0..1): at its too-hot temperature (CH_RED for any other reading). */
const chRed = (o, k) => (CH[k] && isNum(hotAt(o, k)) ? chFrac(k, hotAt(o, k)) : CH_RED);
const TONE_RGB = { cold: '#4ab4ff', warm: '#ffc21a', hot: '#ff3b30' };
// (the oil amber from cold up to Settings > Cold engine: oil warm at (warmOil), as the Redline app's HUD and Cluster
// Centre's tiles: the cold-engine guard still lowering the shift point)
const toneOf = (k, d, o) => {
    const r = TEMP_TONES[k], v = d && d[k], hot = hotAt(o, k);
    if (!r || !isNum(v)) return null;
    if (isNum(hot) && v >= hot) return 'hot';
    if (isNum(r.cold) && v < r.cold) return 'cold';
    const warm = k === 'oil' && o ? setNum(o, 'warmOil') : NaN;      // (unset: 80, as the shift point's)
    return isFinite(warm) && v < warm ? 'warm' : null;
};
const toned = (colors, k, o) => (t, d) => {
    const c = typeof colors === 'function' ? colors(t, d) : colors, tone = toneOf(k, d, o);
    if (!tone || !c || !c.color) return c;
    const col = TONE_RGB[tone];
    return Object.assign({}, c, { color: [col, c.color[1]] }, c.glow ? { glow: [col, Math.min(0.3, c.glow[1])] } : {});
};
/**
 * A text piece made to hold its widest figures (READOUT_SAMPLES, below): its glyphs smaller, centred in the same
 * box, where they would run over it (the font sets glyphs at most 15% closer). room: the share of the box's width
 * to fill (under 1: a gap kept, for two texts side by side). fam: the layout's glyph family.
 */
function fitText(p, fam, room) {
    const a = require('./font').atlas(fam || 'bold');
    const width = (t) => Array.from(t).reduce((x, ch) => { const c = a.code(ch); return x + (c < 0 ? 0.3 : ch === ' ' ? Math.max(a.adv[c], 0.32) : a.adv[c]); }, 0);
    const texts = READOUT_SAMPLES.map((d) => { try { return String(typeof p.text === 'function' ? p.text(d) : p.text); } catch (e) { return ''; } });
    const need = Math.max(0, ...texts.map(width)) * 0.85, w = p.w * (room || 1);
    if (!need || need * p.h <= w) return p;
    const h = Math.max(10, Math.floor(w / need));
    return Object.assign({}, p, { y: p.y + Math.round((p.h - h) / 2), h });
}
/** The readings at their widest figures (three-figure temperatures, the most negative timing and boost ...): what a
 * readout's box is sized to hold (layouts.js), and what tools/check_fit.js measures every text with. */
const READOUT_SAMPLES = [
    { soc: 100, battTemp: 59, kw: -125, kwIn: 50, erange: 188, oil: 150, coolant: 130, iat: 79, gearbox: 140, boostActual: 1.6, enginePower: 199, torque: 449, pedal: 100, throttle: 100, timing: -10, fuelPct: 100, rpm: 7000, speed: 250, engineOn: true, outside: -20, stage: 'D', mode: 'M', gear: 8, avgCons: 25.5, avgConsUnit: 'l100', tripKm: 999999, tripMin: 599999, odometer: 999999, frange: 1999,
        oilPress: 6.5, volts: 15.9, hpfp: 350, lpfp: 7.9, boostTarget: 1.6, boostPeak: 1.6, powerPeak: 299, zero100: 29.9, lastShift: { from: 7, to: 8, rpm: 7250, oil: 150, at: 1 } },
    { soc: 5, battTemp: -9, kw: 125, kwOut: 130, erange: 0, oil: 8, coolant: 8, iat: -9, gearbox: 8, boostActual: -0.65, enginePower: 0, torque: 0, pedal: 0, throttle: 0, timing: 8.5, fuelPct: 5, rpm: 800, speed: 0, engineOn: true, outside: 9, stage: 'P', avgCons: 99.9, avgConsUnit: 'kml', tripKm: 0, tripMin: 0, odometer: 0, frange: 0,
        oilPress: 0.8, volts: 11.2, hpfp: 5, lpfp: 0.5, boostTarget: 0, boostPeak: 0, powerPeak: 0, zero100: 3.1, lastShift: { from: 1, to: 2, rpm: 2600, oil: 8, at: 2 } },
];
const nameOf = (r, o, long) => { const n = long ? r.long : r.short; return typeof n === 'function' ? n(o) : n; };
/** A readout on one line, its name first: 'IAT 31°', 'BST 14.5' ('INTAKE AIR 31°', 'BOOST 14.5 psi' where it
 * fits: a box with room for its longest form). key 'off': nothing. */
function readout(o, key, box, longAlways) {
    const r = readoutOf(key);
    if (!r) return '';
    // (about 0.6 of the height a character, as the bold face sets capitals and figures)
    const room = box && box.w && box.h ? box.w / (box.h * 0.6) : 0;
    const long = longAlways || room >= nameOf(r, o, true).length + 10;
    const name = nameOf(r, o, long);
    return (d) => (name ? name + ' ' : '') + r.num(o, d) + (long && r.unit && r.num(o, d) !== '--' && r.num(o, d) !== 'OFF' ? ' ' + r.unit(o) : '');
}
/*
 * The small gauges set into the analog dials (Settings > Speedometer gauge / Tach gauge; 'auto': the layout's
 * own): each reading's scale (in the data's units: °C, bar, kW, Nm, %), its red zone from `red` up (none: null; the
 * temperatures' from Settings > Too hot: gaugeOf),
 * its label and its figures. frac 0..1 on the scale; redFrac where the red zone starts (over 1: none).
 */
const GAUGES = {
    coolant: { label: 'COOLANT', min: 40, max: 140, red: 118, v: (d) => d.coolant, text: tempOf('coolant') },
    oil: { label: 'OIL', min: 40, max: 140, red: 130, v: (d) => d.oil, text: tempOf('oil') },
    iat: { label: 'INTAKE', min: 0, max: 80, red: 60, v: (d) => d.iat, text: tempOf('iat'), needs: ['iat'] },
    gearbox: { label: 'TRANS', min: 40, max: 140, red: 115, v: (d) => d.gearbox, text: tempOf('gearbox'), needs: ['gearbox'] },
    boost: { label: 'BOOST', min: 0, max: 1.6, red: null, v: (d) => (d.engineOn === false ? 0 : d.boostActual), text: (o, d) => { const n = numOrOff((o2, d2) => pressNum(o2, d2.boostActual))(o, d); return n === '--' || n === 'OFF' ? n : n + ' ' + pressLabel(o); }, needs: ['boostActual', 'boostTarget'] },
    power: { label: 'POWER', min: 0, get max() { return powerTop(); }, red: null, v: (d) => d.enginePower, text: (o, d) => { const n = powerNum(o, d.enginePower); return n === '--' ? n : n + ' ' + powerUnitText(o); } },
    torque: { label: 'TORQUE', min: 0, get max() { return torqueTop(); }, red: null, v: (d) => d.torque, text: (o, d) => { const n = torqueNum(o, d.torque); return n === '--' ? n : n + ' ' + torqueUnit(o); } },
    throttle: { label: 'THROTTLE', min: 0, max: 100, red: null, v: (d) => d.throttle, text: (o, d) => (isNum(d.throttle) ? Math.round(d.throttle) + '%' : '--'), needs: ['throttle'] },
    pedal: { label: 'PEDAL', min: 0, max: 100, red: null, v: (d) => d.pedal, text: (o, d) => (isNum(d.pedal) ? Math.round(d.pedal) + '%' : '--'), needs: ['pedal'] },
    timing: { label: 'TIMING', min: -10, max: 40, red: null, v: (d) => d.timing, text: (o, d) => timingText(d), needs: ['timing'] },
    soc: { label: 'BATTERY', min: 0, max: 100, red: null, low: LOW_SOC, v: (d) => d.soc, text: (o, d) => (isNum(d.soc) ? Math.round(d.soc) + '%' : '--') },
    battTemp: { label: 'BATT', min: 0, max: 60, red: 45, v: (d) => d.battTemp, text: tempOf('battTemp') },
    fuel: { label: 'FUEL', min: 0, max: 100, red: null, v: (d) => d.fuelPct, text: (o, d) => (isNum(d.fuelPct) ? Math.round(d.fuelPct) + '%' : '--') },
    oilPress: { label: 'OIL P', min: 0, max: 10, red: null, v: (d) => d.oilPress, text: (o, d) => (isNum(d.oilPress) ? pressNum(o, d.oilPress) + ' ' + pressLabel(o) : '--'), needs: ['oilPress'] },
    volts: { label: 'VOLTS', min: 10, max: 16, red: null, low: 11.8, v: (d) => d.volts, text: (o, d) => (isNum(d.volts) ? d.volts.toFixed(1) + ' V' : '--'), needs: ['volts'] },
    hpfp: { label: 'HPFP', min: 0, max: 350, red: null, v: (d) => d.hpfp, text: (o, d) => (isNum(d.hpfp) ? pressNum(o, d.hpfp) + ' ' + pressLabel(o) : '--'), needs: ['hpfp'] },
    lpfp: { label: 'LPFP', min: 0, max: 8, red: null, v: (d) => d.lpfp, text: (o, d) => (isNum(d.lpfp) ? pressNum(o, d.lpfp) + ' ' + pressLabel(o) : '--'), needs: ['lpfp'] },
};
/** The gauge picked for the speedometer ('speed') or the tach ('rpm'), or null for the layout's own. */
const gaugeOf = (o, which) => {
    const k = o && (which === 'speed' ? o.gaugeSpeed : o.gaugeRpm);
    const g0 = k && GAUGES[k];
    if (!g0) return null;
    // (a temperature's red zone from its too-hot temperature: hotAt)
    const g = HOT_KEY[k] ? Object.assign({}, g0, { red: hotAt(o, k) }) : g0;
    return Object.assign({ key: k }, g, {
        frac: (d) => { const v = g.v(d); return isNum(v) ? Math.max(0, Math.min(1, (v - g.min) / (g.max - g.min))) : 0; },
        redFrac: isNum(g.red) ? (g.red - g.min) / (g.max - g.min) : 1.01,
        // (or under its low mark: the battery's charge)
        hot: (d) => isNum(g.v(d)) && ((isNum(g.red) && g.v(d) >= g.red) || (isNum(g.low) && g.v(d) <= g.low)),
        txt: (d) => g.text(o, d),
    });
};
/*
 * A layout's own places, each set on the page for that layout alone (layouts.js PLACES: Settings > slotsBy, the
 * layout's id, the place's key; 'auto' or unset: the layout as designed). placeOf: the reading put there, or null.
 * A readout place shows a READOUTS reading (its name and figures, 'off': nothing); a gauge place a GAUGES one (its
 * scale, red zone, name, figures and unit, and three marks along it: the scale's start, middle and end).
 */
const placeOf = (o, k) => { const v = o && o.places && o.places[k]; return typeof v === 'string' && v && v !== 'auto' ? v : null; };
function placeReadout(o, key) {
    const r = readoutOf(key);
    if (!r) return { key, label: '', short: '', value: () => '', num: () => '', unit: '', tone: null };
    return { key, label: nameOf(r, o, true), short: nameOf(r, o, false), num: (d) => r.num(o, d), unit: r.unit ? r.unit(o) : '',
        value: (d) => { const n = r.num(o, d); return n + (r.unit && n !== '--' && n !== 'OFF' ? ' ' + r.unit(o) : ''); },
        tone: TEMP_TONES[key] ? key : null };
}
/** a gauge's reading in its unit, figures only (its marks too) */
const GAUGE_NUM = {
    temp: (o, v) => String(Math.round(tempIn(o, v))),
    boost: (o, v) => pressNum(o, v), power: (o, v) => powerNum(o, v), torque: (o, v) => torqueNum(o, v),
    pct: (o, v) => String(Math.round(v)), timing: (o, v) => String(Math.round(v)),
    volts: (o, v) => (Math.round(v) === v ? String(v) : v.toFixed(1)),
};
const GAUGE_KIND = { coolant: 'temp', oil: 'temp', iat: 'temp', gearbox: 'temp', boost: 'boost', power: 'power', torque: 'torque', throttle: 'pct', pedal: 'pct', timing: 'timing', fuel: 'pct', soc: 'pct', battTemp: 'temp',
    oilPress: 'boost', hpfp: 'boost', lpfp: 'boost', volts: 'volts' };
/** each gauge's icon: the cluster's own icons (ICON_FS) and bimmer-lab's (bimmer.js ICON) */
const GAUGE_ICON = { coolant: [0, 'therm'], oil: [1, 'oilcan'], iat: [3, 'therm'], gearbox: [2, 'cog'], boost: [5, 'turbo'], power: [7, 'bolt'], torque: [13, 'torque'], throttle: [13, 'gauge'], pedal: [13, 'gauge'], timing: [9, 'gauge'], fuel: [4, 'fuel'], soc: [6, 'battery'], battTemp: [6, 'battery'],
    oilPress: [1, 'oilcan'], volts: [6, 'battery'], hpfp: [4, 'fuel'], lpfp: [4, 'fuel'] };
function placeGauge(o, key0) {
    // a value this build doesn't know (a stale saved setting) draws the coolant gauge rather than failing the layout
    const known = (k) => !!(GAUGE_KIND[k] && GAUGE_ICON[k] && gaugeOf(Object.assign({}, o, { gaugeSpeed: k }), 'speed'));
    const key = known(key0) ? key0 : 'coolant';
    const g = gaugeOf(Object.assign({}, o, { gaugeSpeed: key }), 'speed');
    if (!g) return null;
    const kind = GAUGE_KIND[key], f = GAUGE_NUM[kind];
    const unit = kind === 'temp' ? '°' + (o.tempUnit === 'c' ? 'C' : 'F') : kind === 'boost' ? pressLabel(o) : kind === 'power' ? powerUnitText(o)
        : kind === 'torque' ? torqueUnit(o) : kind === 'pct' ? '%' : kind === 'volts' ? 'V' : '°';
    const num = (d) => { const v = g.v(d); return key === 'boost' && d.engineOn === false ? 'OFF' : isNum(v) ? f(o, v) : '--'; };
    return Object.assign({}, g, { unit, num, icon: GAUGE_ICON[key][0], bIcon: GAUGE_ICON[key][1],
        // (the fuel's as the car's own gauge: 0, 1/2, 1)
        marks: key === 'fuel' ? ['0', '1/2', '1'] : [g.min, (g.min + g.max) / 2, g.max].map((v) => f(o, v)), tone: TEMP_TONES[key] ? key : null });
}
/*
 * Settings > Readout 1 / 2, Main readout, Centre readout: bottom line: 'Auto' (0.36.1, the default) by the car (Settings >
 * Vehicle, the Car profile's Engine): on a petrol or diesel car the intake air, the gearbox oil, the torque, the
 * coolant; on a plug-in hybrid each layout's own eDrive reading there (the battery's temperature, its power, its
 * charge), as before. Any other value: that reading, on either kind of car. layouts.js applies it to what a layout
 * gets; focus.needs too.
 */
const AUTO_READOUT = { infoA: 'iat', infoB: 'gearbox', infoMain: 'torque', infoLow: 'coolant' };
function resolveReadouts(o) {
    if (!o) return o;
    const ice = o.vehicle === 'ice' || o.focus === 'engine', r = Object.assign({}, o);
    Object.keys(AUTO_READOUT).forEach((k) => { if (r[k] === 'auto' || r[k] === undefined || r[k] === null) r[k] = ice ? AUTO_READOUT[k] : undefined; });
    return r;
}
/** a plug-in hybrid's readout set by hand (not Auto): shown in place of the layout's own eDrive reading */
const phevPick = (o, k) => !!o && !engineFocus(o) && o[k] !== undefined && o[k] !== null && o[k] !== 'auto';
const mainKey = (o) => (readoutOf(o && o.infoMain) ? o.infoMain : 'torque');
/** Settings > Centre readout: under the speed is Nothing: the main readout's figures, name and bar left empty */
const mainOff = (o) => !!(o && o.infoMain === 'off');
const focus = {
    /** a petrol or diesel car's main readout (Settings > Main readout: the engine torque by default), with its unit */
    power: (o) => {
        if (!engineFocus(o) && !phevPick(o, 'infoMain')) return kwText;
        if (mainOff(o)) return '';
        const r = readoutOf(mainKey(o));
        return (d) => { const n = r.num(o, d); return n + (r.unit && n !== '--' && n !== 'OFF' ? ' ' + r.unit(o) : ''); };
    },
    powerLabel: (o, long) => (engineFocus(o) || phevPick(o, 'infoMain') ? mainOff(o) ? '' : nameOf(readoutOf(mainKey(o)), o, true).replace('ENGINE ', long ? 'ENGINE ' : '') : (long ? 'BATTERY POWER' : 'POWER')),
    /** 0..1 for the main readout's bar (the torque to 450 Nm by default), or none (the eDrive layouts draw their own centre-zero bar) */
    mainFrac: (o) => { if (mainOff(o)) return () => 0; const r = readoutOf(mainKey(o)); return (d) => Math.max(0, Math.min(1, r.frac(d) || 0)); },
    torqueFrac: (d) => (isNum(d.torque) ? Math.max(0, Math.min(1, d.torque / torqueTop())) : 0),
    // (a diesel has no ignition timing: the intake air temperature in its place, Settings > Vehicle: Diesel)
    charge: (o) => (!engineFocus(o) ? socText : diesel(o) ? (d) => tempOf('iat')(o, d) : timingText),
    chargeLabel: (o) => (!engineFocus(o) ? 'CHARGE' : diesel(o) ? 'INTAKE' : 'TIMING'),
    range: (o) => (engineFocus(o) ? (d) => boostText(o, d) : (d) => erangeText(o, d)),
    rangeLabel: (o) => (engineFocus(o) ? 'BOOST' : 'ELECTRIC'),
    /** the electric range and charge on one line, or the boost and timing */
    both: (o) => (engineFocus(o) ? (d) => boostText(o, d) + '  ' + focus.charge(o)(d) : (d) => erangeText(o, d) + '  ' + socText(d)),
    bar: (o) => (engineFocus(o) ? boostFrac : (d) => (isNum(d.soc) ? d.soc / 100 : 0)),
    /** what the engine readings need read from the engine unit */
    // (a plug-in hybrid: the pedal for the Power % meter)
    needs: (o0) => { const o = resolveReadouts(o0); return (o && o.vehicle !== 'ice' && !engineFocus(o) ? ['pedal'] : []).concat(engineFocus(o) ? ['boostActual', 'boostTarget', diesel(o) ? 'iat' : 'timing', 'hpfp'].concat(...[o.infoA || 'iat', o.infoB || 'gearbox', mainKey(o), o.infoLow || 'coolant'].map((k) => (readoutOf(k) && readoutOf(k).needs) || []),
        ...[o.gaugeSpeed, o.gaugeRpm].map((k) => (GAUGES[k] && GAUGES[k].needs) || [])) : []).concat(
        // (and what a layout's own places show: set on the page)
        ...Object.keys((o && o.places) || {}).map((k) => { const v = o.places[k], r = READOUTS[v] || GAUGES[v]; return (r && r.needs) || []; })).concat(
        // (a plug-in hybrid's readouts set by hand: what they read)
        ...['infoA', 'infoB', 'infoMain', 'infoLow'].filter((k) => phevPick(o, k)).map((k) => (readoutOf(o[k]) && readoutOf(o[k]).needs) || [])); },
};
/** Outside temperature with its unit letter: '48°F'. */
const outsideText = (o, c) => (isNum(c) ? Math.round(tempIn(o, c)) + '°' + (o.tempUnit === 'c' ? 'C' : 'F') : '--');
const socText = (d) => (isNum(d.soc) ? Math.round(d.soc) + '%' : '--');
const kwText = (d) => (isNum(d.kw) ? (d.kw > 0.05 ? '+' : '') + (Math.abs(d.kw) < 10 ? d.kw.toFixed(1) : Math.round(d.kw)) + ' kW' : '--');

/** A reading with its label small above it: two text pieces, together as high as the value, a gap and the label. */
function reading(key, x, y, w, h, value, label, colors, labelColors) {
    const lh = Math.max(18, Math.round(h * 0.4));
    return [
        text(key + 'Lbl', x, y, w, lh, label, labelColors, { tracking: 0.12 }),
        text(key, x, y + lh + Math.round(h * 0.14), w, h, value, colors),
    ];
}
/** A reading with its label above it (where the row must end above the warning lights): label 16 px, then the
 * value h high. */
function readingUp(key, x, y, w, h, value, label, colors, labelColors) {
    return [
        text(key + 'Lbl', x, y, w, 16, label, labelColors, { tracking: 0.1 }),
        text(key, x, y + 18, w, h, value, colors),
    ];
}
/** A straight bar (band shader in bar mode): value(d) 0..1. */
function bar(key, x, y, w, h, value, colors, segments) {
    return { key, kind: 'band', x, y, w, h, params: { u_geo: [4, h / 2, 0, Math.max(4, h - 8)], u_span: [0, 0, segments || 0, 0.25], u_marks: [0, 0, 0, 0], u_red: [2] },
        colors, value, max: 1, sweep: true };
}

/** A text piece. */
const text = (key, x, y, w, h, txt, colors, extra) => Object.assign({ key, kind: 'text', x, y, w, h, text: txt, colors, align: 0.5 }, extra || {});
/** A flat rectangle. */
const flat = (key, x, y, w, h, colour) => ({ key, kind: 'flat', x, y, w, h, colors: (t, d) => ({ color: [typeof colour === 'function' ? colour(t, d) : t[colour], 1] }) });

/*
 * Settings > Speed limit sign (sliSign, off by default, 0.62.0): a round sign of our own, a red ring round a light disc
 * with the limit in figures, in room the layout leaves. BMW's own sign is drawn under the apps' layers (the owner,
 * 2026-11-26: not seen over Layouts; on the car's own screen at x 472-583, y 553-660, over the clock). Its place:
 * of the points nearest BMW's (SLI_HOME, or the layout's own sliHome), the first where the sign keeps SLI_GAP from
 * every piece the layout draws now (a round dial as its circle, the rest as their boxes; the backgrounds aside), the
 * KOMBI's lights over us (SIDE_LIGHTS, TURN_ARROWS), the map's window, the glass's slanted corners and the car's
 * strip; a smaller sign where the full one has no room, none where neither has. The figure: d.speedLimit,
 * the last limit recognised, kept till another (data.js sliStep, 0.67.0), '--' before the first.
 */
const SLI_R = [46, 38], SLI_GAP = 14, SLI_HOME = { x: 528, y: 590 }, SLI_STEP = 8;
/* the warning signs the camera reads (KO 1, KO 2; warnPieces below): every sign this high, at most 1.2 x as wide, in
 * sign_atlas.js (tools/make_sign_art.py) */
const WARN = { h: 76, gap: 12, max: 2 };
const SLI_ROUND = { dial: 1, e9x: 1, mround: 1, jdm: 1, rmdial: 1, ring: 1, aclock: 1, rtach: 1 };
/* the points a sign of radius r may stand at, nearest `home` first (made once per radius and home) */
const sliSpots = {};
function sliPoints(r, home) {
    const k = r + ':' + home.x + ':' + home.y;
    if (sliSpots[k]) return sliSpots[k];
    const pts = [], top = r + 8, foot = STRIP_Y - 6 - r;
    for (let y = top; y <= foot; y += SLI_STEP) {
        for (let x = r + 8; x <= 1912 - r; x += SLI_STEP) {
            // (the glass's slanted top corners: the circle's top and its upper sides clear of them)
            if (inCorner(x, y - r) || inCorner(x - r * 0.72, y - r * 0.72) || inCorner(x + r * 0.72, y - r * 0.72) || inCorner(x - r, y) || inCorner(x + r, y)) continue;
            pts.push({ x, y, d: (x - home.x) * (x - home.x) + (y - home.y) * (y - home.y) });
        }
    }
    pts.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    sliSpots[k] = pts;
    return pts;
}
/* a piece the sign may lie over: a background (bg*, the whole-screen kinds, anything over half the screen) */
const sliUnder = (p) => /^bg/.test(p.key) || p.kind === 'bg' || p.kind === 'rmbg' || p.w * p.h > 1920 * 720 / 2;
/* what the sign keeps clear of: [{ c: [x, y, r] } | { r: [x, y, w, h] }]; skip: keys of pieces whose box is mostly
   empty and drawn round (a layout's sliSkip: JDM 1's tach's top, its fine lines only) */
function sliObstacles(list, map, skip) {
    const out = [];
    list.forEach((p) => {
        if (!p || sliUnder(p) || !(p.w > 0 && p.h > 0) || (skip && skip.indexOf(p.key) >= 0)) return;
        const g = p.params && p.params.u_geo;
        if (SLI_ROUND[p.kind] && p.w === p.h) out.push({ c: [p.x + p.w / 2, p.y + p.h / 2, p.w / 2] });
        // (an arc band, KO 1's and KO 2's dials: drawn only where its box and its circle meet - centre u_geo.xy in the
        // piece, radius u_geo.z, u_geo.w thick - so in the way only where both are; its box alone, a dial's square with
        // the arc's open foot, would keep the sign far off)
        else if (p.kind === 'band' && g && g[2] > 0) out.push({ r: [p.x, p.y, p.w, p.h], c: [p.x + g[0], p.y + g[1], g[2] + Math.abs(g[3]) / 2], both: true });
        else out.push({ r: [p.x, p.y, p.w, p.h] });
    });
    SIDE_LIGHTS.concat(TURN_ARROWS).forEach((q) => out.push({ r: [q.x, q.y, q.w, q.h] }));
    // (the driver camera's cowl over the top middle: nothing under it is seen - the owner, 2026-11-28)
    out.push({ r: [NOTCH.x, NOTCH.y, NOTCH.w, NOTCH.h] });
    // (with the map: its window, and the KOMBI's own speed readout at its left, STOCK_SPEED - KO 1's warning signs
    // stood over it, 0.69.0)
    if (map) out.push({ r: [map.x, map.y, map.w, map.h] }, { r: [STOCK_SPEED.x, STOCK_SPEED.y, STOCK_SPEED.w, STOCK_SPEED.h] });
    return out;
}
function sliFree(x, y, r, obs, gap) {
    const R = r + (gap == null ? SLI_GAP : gap);
    const inC = (c) => { const dx = x - c[0], dy = y - c[1], q = R + c[2]; return dx * dx + dy * dy < q * q; };
    const inR = (b) => { const dx = Math.max(b[0] - x, 0, x - (b[0] + b[2])), dy = Math.max(b[1] - y, 0, y - (b[1] + b[3])); return dx * dx + dy * dy < R * R; };
    for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        if (o.both ? inC(o.c) && inR(o.r) : o.c ? inC(o.c) : inR(o.r)) return false;
    }
    return true;
}
/** Where the sign goes among the pieces in list: { x, y, r } (its centre and radius), or null where it has no room. */
function sliPlace(list, opts) {
    opts = opts || {};
    const obs = sliObstacles(list, opts.map, opts.skip), home = opts.home || SLI_HOME;
    for (let k = 0; k < SLI_R.length; k++) {
        const r = SLI_R[k], pts = sliPoints(r, home);
        for (let i = 0; i < pts.length; i++) if (sliFree(pts[i].x, pts[i].y, r, obs)) return { x: pts[i].x, y: pts[i].y, r };
    }
    return null;
}
/** The speed limit sign in a speedometer's open foot (KO 1's and KO 2's sliAt, the owner's place): between the dial's
 * unit (speedUnit) and its foot's reading (speedSubNum), in the dial's middle, the smaller sign, where they leave it
 * room (SLI_GAP / 2 each side); null where they don't (the smaller dials beside the map: the sign as elsewhere). */
function sliInFoot(list) {
    const u = list.find((p) => p.key === 'speedUnit'), f = list.find((p) => p.key === 'speedSubNum');
    if (!u || !f) return null;
    const r = SLI_R[SLI_R.length - 1], top = u.y + u.h, room = f.y - top;
    if (room < 2 * r + SLI_GAP) return null;
    return { x: Math.round(u.x + u.w / 2), y: Math.round(top + room / 2), r };
}
/** The sign's figures piece made to hold three wide figures ('888') in the layout's glyph family (fitText's way): JDM 1's
 * wide face ran over the ring. */
function sliFit(p, fam) {
    const a = require('./font').atlas(fam || 'bold');
    const need = Array.from('888').reduce((x, ch) => { const c = a.code(ch); return x + (c < 0 ? 0.6 : a.adv[c]); }, 0) * 0.85;
    if (!need || need * p.h <= p.w) return p;
    const h = Math.max(10, Math.floor(p.w / need));
    return Object.assign({}, p, { y: p.y + Math.round((p.h - h) / 2), h });
}
/** The limit's figures: the car's (d.speedLimit, once read), else '--'. */
const sliText = (d) => (isNum(d.speedLimit) && d.speedLimit > 0 ? String(Math.round(d.speedLimit)) : '--');
/** The sign's two pieces at place s ({ x, y, r }): the disc with its red ring, the figures; over everything (z: a
 * dial's square quad, its corners drawn too, Retro M's, would hide a panel at the kinds' own order). */
function sliPieces(s) {
    // (the figures as large as three wide ones fit the disc, sliFit; the ring a little thinner: the owner, too small to
    // read at a glance - 20 to 24 px tall at first, now about 30)
    const r = s.r, ring = Math.round(r * 0.16);
    return [
        { key: 'sliDisc', kind: 'panel', z: 30, x: s.x - r, y: s.y - r, w: 2 * r, h: 2 * r, params: { u_box: [r, ring, 0, 1] },
            colors: () => ({ top: '#f4f4f2', bottom: '#d8d8d4', border: '#e0303a' }) },
        text('sliNum', s.x - r * 0.78, s.y - r * 0.53, r * 1.56, r * 1.06, sliText, () => ({ color: ['#151515', 1], glow: ['#000000', 0] }), { z: 31 }),
    ];
}

/*
 * The warning signs the front camera reads (KO 1, KO 2: a layout's warnSigns; shared/road_signs.js, data.js's
 * d.roadSigns, their pictures' names, each shown 10 s after the camera last read it): South Korea's own signs
 * (sign_atlas.js), WARN.h high, beside the speed limit sign - the first in the free place nearest it (WARN.gap from
 * every piece, the sign, the KOMBI's lights over us and the camera's cowl), the second mirrored across the middle
 * (or the next free place). Only the warning signs (the owner: one on most roads, two at most), each a triangle
 * point up at most 1.2 h wide: kept clear along its outline, not its box.
 */
const WARN_W = Math.round(WARN.h * 1.2);
/* points along a sign's outline (its middle at x, y): a warning sign's triangle, point up, and a round sign's circle
   (no passing), WARN.h across */
function warnOutline(x, y) {
    const h = WARN.h, w = WARN_W, top = [x, y - h / 2], l = [x - w / 2, y + h / 2], r = [x + w / 2, y + h / 2], out = [];
    [[top, r], [r, l], [l, top]].forEach(([a, b]) => { for (let i = 0; i < 8; i++) out.push([a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8]); });
    for (let i = 0; i < 16; i++) { const q = i * Math.PI / 8; out.push([x + h / 2 * Math.cos(q), y + h / 2 * Math.sin(q)]); }
    return out;
}
function warnFree(x, y, obs, gap) {
    const g = gap == null ? WARN.gap : gap;
    if (y + WARN.h / 2 > STRIP_Y - 4 || y - WARN.h / 2 < 0 || x - WARN_W / 2 < 0 || x + WARN_W / 2 > 1920) return false;
    return warnOutline(x, y).every(([px, py]) => {
        if (inCorner(px, py)) return false;
        return obs.every((o) => {
            const inC = (c) => { const dx = px - c[0], dy = py - c[1], q = g + c[2]; return dx * dx + dy * dy < q * q; };
            const inR = (b) => px > b[0] - g && px < b[0] + b[2] + g && py > b[1] - g && py < b[1] + b[3] + g;
            return !(o.both ? inC(o.c) && inR(o.r) : o.c ? inC(o.c) : inR(o.r));
        });
    });
}
/** The warning signs in a row with the speed limit sign (the owner: beside it, on along a line, across or down): of
 * right, left, up and down from it, the way with the most of WARN.max free places in a row (WARN.gap apart);
 * [] where none is free. */
function warnRow(list, obs) {
    const sign = list.find((p) => p.key === 'sliDisc');
    if (!sign) return [];
    const cx = sign.x + sign.w / 2, cy = sign.y + sign.h / 2, r = sign.w / 2, g = WARN.gap;
    let best = [];
    // (across, only to its right: in a row the speed limit sign is the leftmost, the owner)
    [[1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
        const out = [];
        for (let i = 0; i < WARN.max; i++) {
            const at = dx ? { x: Math.round(cx + dx * (r + g + WARN_W / 2 + i * (WARN_W + g))), y: Math.round(cy) }
                : { x: Math.round(cx), y: Math.round(cy + dy * (r + g + WARN.h / 2 + i * (WARN.h + g))) };
            if (!warnFree(at.x, at.y, obs)) break;
            out.push(at);
        }
        if (out.length > best.length) best = out;
    });
    return best;
}
/** Where the warning signs go among the pieces in list (the speed limit sign's among them, or none): up to WARN.max
 * centres [{ x, y }], nearest opts.warnHome (a layout's own), else beside the limit sign (or home where there is none). */
function warnPlace(list, opts) {
    opts = opts || {};
    const sign = list.find((p) => p.key === 'sliDisc');
    const home = opts.warnHome || (sign ? { x: sign.x + sign.w / 2, y: sign.y + sign.h / 2 } : (opts.home || SLI_HOME));
    // (a layout's sliSkip aside: a sign is filled, over a tach's fine lines too - JDM 1's)
    const obs = sliObstacles(list, opts.map, null);
    // (in a row with the speed limit sign where they fit - a layout without its own place)
    if (!opts.warnHome) {
        const row = warnRow(list, obs);
        if (row.length === WARN.max) return row;
        if (row.length) {
            const first = row[0], box0 = { r: [first.x - WARN_W / 2, first.y - WARN.h / 2, WARN_W, WARN.h] };
            const more = [];
            for (let y = WARN.h / 2 + 4; y <= STRIP_Y - 4 - WARN.h / 2; y += 4) for (let x = WARN_W / 2 + 4; x <= 1916 - WARN_W / 2; x += 4) {
                const d = (x - first.x) * (x - first.x) + (y - first.y) * (y - first.y);
                if ((!more.length || d < more[0].d) && warnFree(x, y, obs.concat([box0]))) more[0] = { x, y, d };
            }
            return more.length ? [first, { x: more[0].x, y: more[0].y }] : [first];
        }
    }
    const nearest = (h, extra, row) => {
        let best = null;
        // (within 480 px of it: a sign further off is beside nothing)
        for (let y = Math.max(WARN.h / 2 + 4, h.y - 480); y <= Math.min(STRIP_Y - 4 - WARN.h / 2, h.y + 480); y += 4) {
            for (let x = Math.max(WARN_W / 2 + 4, h.x - 480); x <= Math.min(1916 - WARN_W / 2, h.x + 480); x += 4) {
                if (row && Math.abs(y - h.y) > 8) continue;
                const d = (x - h.x) * (x - h.x) + (y - h.y) * (y - h.y);
                if ((!best || d < best.d) && warnFree(x, y, obs.concat(extra || []))) best = { x, y, d };
            }
        }
        return best;
    };
    const first = nearest(home);
    if (!first) return [];
    const box = (s) => ({ r: [s.x - WARN_W / 2, s.y - WARN.h / 2, WARN_W, WARN.h] });
    const mirror = { x: 1920 - first.x, y: first.y };
    // (the second: mirrored across the middle, else beside the first in its row, else the nearest free place)
    const second = warnFree(mirror.x, mirror.y, obs.concat([box(first)])) ? mirror : nearest(first, [box(first)], true) || nearest(first, [box(first)]);
    return [{ x: first.x, y: first.y }].concat(second ? [{ x: second.x, y: second.y }] : []).slice(0, WARN.max);
}
/*
 * The speed limit sign and the warning signs lined up as one (the owner, 2026-11-28: in a row or a column with the
 * sign): of the places nearest home (a layout's signHome, else its sign's home), the first where the sign and two
 * warning signs fit in a row - right of it, the sign leftmost - or a column - below, above, one each side
 * (a layout's signDirs: 'h', 'v' or both), each clear as it would be alone. { sli: { x, y, r }, warns: [{ x, y }] }
 * (the first warning sign next to the limit sign), or null where none fits (then each on its own, as before).
 */
const LINE_GAP = 2;
function signGroup(list, opts) {
    opts = opts || {};
    // (WARN.gap first; then half of it, where that's all the room there is - 20's column between its speedometer and
    // the middle panel)
    return groupAt(list, opts, WARN.gap) || groupAt(list, opts, Math.round(WARN.gap / 2));
}
function groupAt(list, opts, gap) {
    const obs = sliObstacles(list, opts.map, opts.skip), home = opts.groupHome || opts.home || SLI_HOME;
    const dirs = opts.dirs || ['h', 'v'];
    for (let k = 0; k < SLI_R.length; k++) {
        const r = SLI_R[k], pts = sliPoints(r, home);
        const dx1 = Math.ceil(r + gap + LINE_GAP + WARN_W / 2), dx2 = dx1 + WARN_W + gap + LINE_GAP;
        const dy1 = Math.ceil(r + gap + LINE_GAP + WARN.h / 2), dy2 = dy1 + WARN.h + gap + LINE_GAP;
        const ways = [];
        // (a row: the speed limit sign leftmost, the warning signs right of it - the owner, 2026-11-28)
        if (dirs.indexOf('h') >= 0) ways.push([[dx1, 0], [dx2, 0]]);
        if (dirs.indexOf('v') >= 0) ways.push([[0, dy1], [0, dy2]], [[0, -dy1], [0, -dy2]], [[0, -dy1], [0, dy1]]);
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (p.d > 640 * 640) break;     // (beside nothing further off)
            if (!sliFree(p.x, p.y, r, obs)) continue;
            for (let j = 0; j < ways.length; j++) {
                const w = ways[j].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));
                const o1 = obs.concat([{ c: [p.x, p.y, r] }]);
                if (!warnFree(w[0].x, w[0].y, o1, gap)) continue;
                if (!warnFree(w[1].x, w[1].y, o1.concat([{ r: [w[0].x - WARN_W / 2, w[0].y - WARN.h / 2, WARN_W, WARN.h] }]), gap)) continue;
                return { sli: { x: p.x, y: p.y, r }, warns: w };
            }
        }
    }
    return null;
}

/** On with Settings > Speed limit sign (layouts.js signOn's test): a layout makes room for the signs only then. */
const signsOn = (o) => !!o && (o.sliSign === 'on' || o.sliSign === true);
/** A layout's own places for the signs (its signAt, the owner's, 2026-11-28): the speed limit sign (the smaller one)
 * at sli { x, y }, the warning signs at warns [{ x, y }], as signGroup gives them, where each is clear (half
 * WARN.gap) of the layout, the glass's edges and the others; else null (then signGroup's search). */
function fixedGroup(list, where, sli, warns) {
    where = where || {};
    const obs = sliObstacles(list, where.map, where.skip), r = SLI_R[SLI_R.length - 1], g = Math.round(WARN.gap / 2);
    if (sli.y - r < 8 || sli.y + r > STRIP_Y - 6 || sli.x - r < 8 || sli.x + r > 1912 || !sliFree(sli.x, sli.y, r, obs, g)) return null;
    const taken = obs.concat([{ c: [sli.x, sli.y, r] }]);
    for (let i = 0; i < warns.length; i++) {
        const w = warns[i];
        if (!warnFree(w.x, w.y, taken, g)) return null;
        taken.push({ r: [w.x - WARN_W / 2, w.y - WARN.h / 2, WARN_W, WARN.h] });
    }
    return { sli: { x: sli.x, y: sli.y, r }, warns: warns.map((w) => ({ x: w.x, y: w.y })) };
}

let atlasImg = null;
/** The signs' atlas as the cluster takes a texture: { w, h, px } (unpacked once). */
function signAtlas() {
    if (!atlasImg) {
        const A = require('./sign_atlas');
        atlasImg = { w: A.w, h: A.ah, px: require('zlib').inflateSync(Buffer.from(A.z, 'base64')) };
    }
    return atlasImg;
}
/** The warning signs' pieces at places [{ x, y }]: the i-th shows d.roadSigns[i] (a picture's name), hidden while none. */
function warnPieces(spots) {
    const A = require('./sign_atlas');
    const cell = (n) => A.cells[n] || A.cells.danger;
    return spots.map((s, i) => ({
        key: 'warn' + i, kind: 'sign', z: 30, x: Math.round(s.x - WARN_W / 2), y: Math.round(s.y - WARN.h / 2), w: WARN_W, h: WARN.h,
        textures: { u_signs: signAtlas },
        visible: (d) => !!(d && d.roadSigns && d.roadSigns[i]),
        dyn: (d) => ({ u_cell: d && d.roadSigns && d.roadSigns[i] ? cell(d.roadSigns[i]) : [0, 0, 0, 0] }),
    }));
}

module.exports = {
    isNum, speedIn, speedUnit, tempIn, tempText, speedShown, speedText, rpmShown, scales, setScales, powerTop, torqueTop, boostTop, boostShare, boostTicks, snapBoost, BOOST_GAUGES, speedScale, rpmScale, shiftPoint, yellowAt, tempFrac, gearText, selectorLit, clock, modeText, text, flat,
    TRIP_OWN, tripShown, tripPlaces, tripRows, ECON_UNITS, econ, econNum, econText, econUnitOf, econFrac, tripText, tripTimeText, LOW_SOC, socLow, resolveReadouts, phevPick, AUTO_READOUT, STRIP_Y, strip, stripGauges, STRIP_DROP, electric, sportNow, PCT, POWER_UNIT, EBOOST_AT, powerPct, powerFrac, powerLabels, KW_ZERO, KW_FLOOR, REGEN_RGB, kwRange, kwFrac, kwDialScale, powerMeter, tachDyn, tachValue, tachRange, stripInfoA, stripInfoB, MAP, MAP_VIEW, STOCK_SPEED, aroundMap, overMap, cut, NOTCH, GEARBOX_HOLE, boxBezel, EDRIVE_HOLE, M_BOXES, M_HOLES, mCar, holes, TELLTALES, TURN_ARROWS, SIDE_LIGHTS, inCorner, distText, erangeText, outsideText, socText, kwText, reading, readingUp, bar, engineFocus, focus, pressUnitOf, pressNum, pressLabel, boostText, torqueText, torqueNum, torqueUnit, timingText, boostFrac, READOUTS, READOUT_SAMPLES, driveSample, fitText, placeOf, placeReadout, placeGauge, TEMP_TONES, HOT_KEY, hotAt, mainOff, toneOf, toned, CH, CH_RED, chRed, chOf, chFrac, chMarks, readout, powerNum, powerUnitText, GAUGES, gaugeOf,
    SLI_R, SLI_GAP, SLI_HOME, sliPlace, sliInFoot, sliPieces, sliFit, sliText, sliObstacles, sliFree,
    WARN, WARN_W, warnPlace, warnRow, warnPieces, warnFree, signAtlas, signGroup, signsOn, fixedGroup,
};
