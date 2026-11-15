'use strict';
/**
 * layouts.js - the layouts this app offers, by id. A layout is one file, layout_<id>.js, next to this one
 * (the build ships only top-level .js files); list it here and in app.json's "layout" setting (README.md).
 */
const LAYOUTS = [require('./layout_retro'), require('./layout_analog_sport'), require('./layout_classic'), require('./layout_id6m'), require('./layout_m'), require('./layout_sport'), require('./layout_arc_tach'), require('./layout_jdm2'), require('./layout_twin_cowl'), require('./layout_track'), require('./layout_pulse'), require('./layout_gt3')];
const C0 = require('./layout_common');
/** A readout put in the time's or the outside temperature's place, two side by side: made to hold its widest
 * figures ('TRANS 140°') with a gap to the other (layout_common.fitText). */
const fitted = (L, p) => C0.fitText(p, L.font, 0.8);
/* the main readout's pieces (layout_common.focus.power), the small gauges' figures (and which dial each is in) */
const MAIN_KEYS = ['kwNow', 'power', 'powerBig', 'kw'];
const SMALL_KEYS = { coolantNum: 'speed', oilNum: 'rpm', coolantTxt: 'speed', oilTxt: 'rpm', speedSubNum: 'speed', rpmSubNum: 'rpm', speedSub1: 'speed', rpmSub1: 'rpm' };
const SMALL_OWN = { coolantNum: 'coolant', oilNum: 'oil', coolantTxt: 'coolant', oilTxt: 'oil' };
/* the layouts with their own shift warning (the gear or the blades red at the shift point) */
const OWN_SHIFT = ['m', 'sport', 'gt3', 'track'];
/**
 * Every layout's last step, on a petrol or diesel car: the temperatures in colour (Settings > Temperature colours: the
 * readouts and the small gauges' figures) and, with Settings > Shift warning, the digital speed and the gear red
 * at the shift point (layout_common.shiftPoint) in the layouts without their own.
 */
function finish(L, o, list) {
    if (!o || !C0.engineFocus(o)) return list;
    const strip = stripOn(o);
    const readingOf = (p) => {
        if (p.tone) return p.tone;   // (a piece naming its own temperature: 20's coolant figures)
        if (strip && p.key === 'clock') return o.infoA || 'iat';
        if (strip && p.key === 'outside') return o.infoB || 'gearbox';
        if (MAIN_KEYS.indexOf(p.key) >= 0) return o.infoMain || 'torque';
        if (L.id === 'classic' && p.key === 'socTxt') return o.infoLow || 'coolant';
        if (SMALL_KEYS[p.key]) { const g = C0.gaugeOf(o, SMALL_KEYS[p.key]); return g ? g.key : SMALL_OWN[p.key] || null; }
        return null;
    };
    const tones = o.tempTone !== 'off', warn = o.shiftWarn === 'on' && OWN_SHIFT.indexOf(L.id) < 0;
    return list.map((p) => {
        if (p.kind !== 'text') return p;
        const k = tones ? readingOf(p) : null;
        if (k && C0.TEMP_TONES[k] && p.colors) return Object.assign({}, p, { colors: C0.toned(p.colors, k, o) });
        if (warn && (p.key === 'speedDigits' || p.key === 'gear') && p.colors) {
            const base = p.colors;
            return Object.assign({}, p, { colors: (t, d) => {
                const c = typeof base === 'function' ? base(t, d) : base;
                if (!c || !c.color || !C0.isNum(d.rpm) || d.rpm < C0.shiftPoint(o, d).rpm) return c;
                const red = t.red || '#ff3b30';
                return Object.assign({}, c, { color: [red, c.color[1]] }, c.glow ? { glow: [red, c.glow[1]] } : {});
            } });
        }
        return p;
    });
}
/*
 * Every layout keeps the car's own bottom strip (since 0.34.0 the only way: the full-screen form, which covered the
 * strip and worked round the KOMBI's dark boxes, is gone; layout_common.STRIP_Y, found on cars by thatgrayg22): the
 * layout ends above the KOMBI's own strip (gear, drive mode, ranges, time, street, outside temperature, warnings),
 * and the KOMBI leaves none of its boxes. Each layout takes its centred places there itself (C.strip(o)); here
 * its range numbers are left out (the strip shows both), the fuel and charge gauges go above the strip's ranges,
 * and anything still reaching below the line is cut short (backgrounds), moved up (a small piece) or left out
 * (wholly below). Bigger pieces (a dial's arc open at the bottom) stay.
 */
const CUT_Y = C0.STRIP_Y;
/* Below the layout, to BG_Y, a black band over the stock dials' edges and the separator the KOMBI draws above its
 * strip (seen at 646 on the car); over the strip's drive mode and gear (x BG_NOTCH) only to BG_NOTCH_Y, short of
 * their tops at 660 (to 662 clipped them; a notch the band's whole height showed the separator's grey line, and
 * reached past the gear on the right: from a photo of the car, 2026-11-09). */
// (the notch's left end at 1196: from 1236 the band still covered the top of the E of ELECTRIC INDIVIDUAL, the longest
// drive mode, car photo Nov 9 2026)
const BG_Y = 662, BG_NOTCH = [1196, 1424], BG_NOTCH_Y = 658;
const stripOn = (o) => C0.strip(o);
const blackBand = () => [[0, BG_NOTCH[0], BG_Y], [BG_NOTCH[0], BG_NOTCH[1], BG_NOTCH_Y], [BG_NOTCH[1], 1920, BG_Y]].map(([x0, x1, y1], i) =>
    ({ key: 'bgBand' + i, kind: 'flat', x: x0, y: CUT_Y, w: x1 - x0, h: y1 - CUT_Y, colors: () => ({ color: ['#000000', 1] }) }));
function bottomCut(list) {
    const out = [];
    list.forEach((p) => {
        if (p.y >= CUT_Y) return;
        if (p.y + p.h <= CUT_Y) return out.push(p);
        if (p.kind === 'flat' || p.kind === 'panel' || p.kind === 'flag' || p.kind === 'bg' || /^bg/.test(p.key)) return out.push(Object.assign({}, p, { h: CUT_Y - p.y }));
        if (p.h <= 80) return out.push(Object.assign({}, p, { y: CUT_Y - p.h }));
        out.push(p);
    });
    return out;
}

LAYOUTS.forEach((L) => {
    const own = L.pieces;
    // (Settings > Bottom strip, Cluster: M car and Frame behind the gear box are gone: always the car's strip, which
    // leaves none of the KOMBI's boxes)
    L.pieces = (o0) => {
        const o = Object.assign({}, o0 || {}, { bottomStrip: 'stock', cluster: 'standard', boxBezel: false });
        // a setting this build can't draw (a stale saved value) must not stop the app (the main app deletes an app
        // that keeps failing): the layout as designed, its places and readouts on their defaults
        try { return finish(L, o, built(o)); } catch (e) {
            const safe = Object.assign({}, o, { places: {}, infoMain: undefined, infoA: undefined, infoB: undefined, infoLow: undefined, gaugeSpeed: 'auto', gaugeRpm: 'auto', leftDial: 'gmeter' });
            return finish(L, safe, built(safe));
        }
    };
    const built = (o) => {
        // over the car's own strip there is no dark box to work round: the stock centre content shows in the
        // map's window, so the layout takes the same form as with the map (its window left clear for it)
        const oo = stripOn(o) && o.centre === 'stock' ? Object.assign({}, o, { centre: 'map' }) : o;
        let list = (own(oo) || []).slice();
        if (stripOn(o)) {
            list = list.filter((p) => !C0.STRIP_DROP.test(p.key));
            // the strip shows the gear and the drive mode: no second drive mode, and no second gear but in the
            // layouts made round a big gear (L.stripGear: Track, Pulse); the others fill its place
            list = list.filter((p) => !/^(sel[PRND]?|mode|selChip)$/.test(p.key) && (L.stripGear || !/^(gear|gearCard|gearChip)$/.test(p.key)));
            // the strip shows the time and the outside temperature: their places get the battery's temperature
            // (intake air on a petrol or diesel car) and the gearbox oil's
            // (each only where the layout doesn't show it already)
            const has = (re) => list.some((p) => re.test(p.key));
            const ice = o.vehicle === 'ice' || C0.engineFocus(o);
            const hasGbox = has(/^gbox$/) && (!ice || (o.infoB || 'gearbox') === 'gearbox'), hasBatt = o.vehicle !== 'ice' && !C0.engineFocus(o) && has(/^(battT|c_battV|batt)$/);
            list = list.filter((p) => !((p.key === 'outside' && hasGbox) || (p.key === 'clock' && hasBatt)))
                .map((p) => (p.key === 'clock' ? fitted(L, Object.assign({}, p, { text: C0.stripInfoA(o, p) })) : p.key === 'outside' ? fitted(L, Object.assign({}, p, { text: C0.stripInfoB(o, p) })) : p));
            // (the two side by side at one size: the smaller of the two)
            const pair = list.filter((p) => p.key === 'clock' || p.key === 'outside');
            if (pair.length === 2 && pair[0].h !== pair[1].h && Math.abs(pair[0].y + pair[0].h / 2 - pair[1].y - pair[1].h / 2) < 4) {
                const h = Math.min(pair[0].h, pair[1].h);
                list = list.map((p) => (pair.indexOf(p) >= 0 && p.h > h ? Object.assign({}, p, { y: p.y + Math.round((p.h - h) / 2), h }) : p));
            }
            // the gauges above everything but the backgrounds
            // (only with the readings in the centre: with the map or the stock centre the side columns reach
            // down to the strip, and keep their own charge and fuel bars)
            if (!L.ownStripGauges && (o.centre || 'info') === 'info') list = list.concat(C0.stripGauges(o, { fuel: typeof L.stripFuel === 'function' ? L.stripFuel(o) : L.stripFuel !== false }));
            list = bottomCut(list);
            // the band goes in with the backgrounds (under everything)
            let i = 0;
            while (i < list.length && /^bg/.test(list[i].key)) i++;
            list.splice(i, 0, ...blackBand());
            return list;   // (no frame for the gear box: the KOMBI shows none over the strip)
        }
        return list;
    };
});
const byId = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
/*
 * The readout places each layout has, set per layout since 0.29.0 (Settings > slotsBy: the page's picker; the
 * Settings' readouts are every layout's default): when(o), whether it shows with options o. ENGINE: only on a petrol
 * or diesel car (or the engine's focus); STRIP: only with Settings > Bottom strip: the cluster's own (the time's and
 * outside's places). tools/test_slots.js checks the table against what each layout draws.
 */
const SLOT_KEYS = ['infoMain', 'infoA', 'infoB', 'infoLow', 'gaugeSpeed', 'gaugeRpm', 'leftDial'];
const ALWAYS = () => true, ENGINE = (o) => C0.engineFocus(o), STRIP = (o) => stripOn(o), ENGINE_STRIP = (o) => ENGINE(o) && STRIP(o);
const MAPFORM = (o) => o.centre === 'map' || (STRIP(o) && o.centre === 'stock');
const DIALS = { gaugeSpeed: ALWAYS, gaugeRpm: ALWAYS }, STRIP2 = { infoA: ENGINE_STRIP, infoB: ENGINE_STRIP };
const SLOTS = {
    analog_sport: Object.assign({ infoMain: ENGINE }, DIALS, STRIP2),
    retro: Object.assign({}, DIALS, STRIP2),
    track: Object.assign({}, STRIP2),
    pulse: { infoMain: ENGINE },
    gt3: {}, m: {}, sport: {},
    classic: Object.assign({ infoMain: ENGINE, infoLow: ENGINE }, DIALS),
    // (no readouts beside its dials; with the map, readouts 1 and 2 above it over the car's strip)
    id6m: Object.assign({ infoA: (o) => ENGINE_STRIP(o) && MAPFORM(o), infoB: (o) => ENGINE_STRIP(o) && MAPFORM(o) }, DIALS),
    // (its own strip's middle: the main readout; a plug-in's, with the cluster's strip, its battery's power)
    arc_tach: Object.assign({ infoMain: (o) => ENGINE(o) || !STRIP(o) }, DIALS, STRIP2),
    // (its left dial: the G meter, a speedometer, the tyres or the temperatures; not with the map or the stock centre)
    jdm2: Object.assign({ infoMain: ENGINE, leftDial: (o) => (o.centre || 'info') === 'info' }, DIALS, STRIP2),
    twin_cowl: Object.assign({}, DIALS, STRIP2, { infoLow: STRIP }),
};
/** The readout places layout id has (all: whatever the car and settings; else those that show with options o). */
/*
 * Every other place a layout has (since 0.35.0 each can be set on the page, for that layout alone): its module's
 * places, [{ key, kind: 'readout' | 'gauge', label }], set in Settings > slotsBy under the layout's id ('auto' or
 * unset: as designed; layout_common.placeOf). PLACE_OPTIONS: what each kind can show (as Settings' readouts and small
 * gauges: the app.json lists); tools/test_slots.js checks each place changes what its layout draws.
 */
const placesFor = (id) => (byId(id).places || []);
function placeItem(id, k, spec) {
    const p = placesFor(id).find((x) => x.key === k);
    if (!p) return null;
    const src = (spec && spec.settings || []).find((s) => s.key === (p.kind === 'gauge' ? 'gaugeSpeed' : 'infoA'));
    const opts = ((src && src.options) || []).filter((x) => x[0] !== 'auto');
    // (and a place's own extra values: 90's middle gauge as an analog clock)
    return { key: k, label: p.label, kind: p.kind, default: 'auto', options: [['auto', "The layout's own"]].concat(opts, p.extra || []) };
}
function slotsFor(id, o, all) {
    const t = SLOTS[id] || {};
    return SLOT_KEYS.filter((k) => k in t && (all || t[k](o)));
}
/** A readout's value for layout id: its own (slotsBy[id][k], when it is one of the setting's values), else the Settings'. */
function slotValue(get, item, id, k) {
    const by = get('slotsBy'), own = by && typeof by === 'object' && by[id] ? by[id][k] : undefined;
    const s = item(k), ok = own !== undefined && s && (s.options || []).some((x) => x[0] === own);
    return ok ? own : get(k);
}
/** The layout for the drive mode now (Settings > Layout in Sport / in ECO PRO; 'same': Layout): the car's own drive
 * mode switch (FES), not the gear selector's S. get(key): the setting; d: the data (its driveMode). */
function layoutFor(get, d) {
    const m = (d && d.driveMode) || '';
    const k = /SPORT|XTRABOOST/.test(m) ? get('layoutSport') : /ECO|ELECTRIC/.test(m) ? get('layoutEco') : null;
    return k && k !== 'same' && LAYOUTS.some((l) => l.id === k) ? k : get('layout');
}
module.exports = { LAYOUTS, byId, layoutFor, SLOTS, SLOT_KEYS, slotsFor, slotValue, placesFor, placeItem, CUT_Y, BG_Y, BG_NOTCH, BG_NOTCH_Y, bottomCut };
