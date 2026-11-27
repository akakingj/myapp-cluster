'use strict';
/**
 * layouts.js - the layouts this app offers, by id. A layout is one file, layout_<id>.js, next to this one
 * (the build ships only top-level .js files); list it here and in app.json's "layout" setting (README.md).
 */
const LAYOUTS = [require('./layout_retro'), require('./layout_analog_sport'), require('./layout_retro_m'), require('./layout_classic'), require('./layout_id6m'), require('./layout_m'), require('./layout_arc_tach'), require('./layout_jdm2'), require('./layout_twin_cowl'), require('./layout_track'), require('./layout_pulse'), require('./layout_simple'), require('./layout_gt3'), require('./layout_ko1'), require('./layout_ko2')];
const C0 = require('./layout_common');
/** A readout put in the time's or the outside temperature's place, two side by side: made to hold its widest
 * figures ('TRANS 140°') with a gap to the other (layout_common.fitText). */
const fitted = (L, p) => C0.fitText(p, L.font, 0.8);
/* the main readout's pieces (layout_common.focus.power), the small gauges' figures (and which dial each is in) */
const MAIN_KEYS = ['kwNow', 'power', 'powerBig', 'kw'];
const SMALL_KEYS = { coolantNum: 'speed', oilNum: 'rpm', coolantTxt: 'speed', oilTxt: 'rpm', speedSubNum: 'speed', rpmSubNum: 'rpm', speedSub1: 'speed', rpmSub1: 'rpm' };
const SMALL_OWN = { coolantNum: 'coolant', oilNum: 'oil', coolantTxt: 'coolant', oilTxt: 'oil' };
/* the layouts with their own shift warning (the gear, the blades or the figures red at the shift point) */
const OWN_SHIFT = ['m', 'gt3', 'track', 'simple'];
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
    // (Simple with the map or the stock centre: Pulse's pieces, without a warning of their own)
    const own = OWN_SHIFT.indexOf(L.id) >= 0 && !(L.id === 'simple' && (o.centre === 'map' || o.centre === 'stock'));
    const tones = o.tempTone !== 'off', warn = o.shiftWarn === 'on' && !own;
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
/*
 * Below the layout, Settings > BMW's bottom strip ("bottomExtra", as AK Cluster ID8 has it). The car's strip (y 646 - 720:
 * range, clock, street, drive mode, gear, outside temperature) is under our layers, and whatever we lay over it hides it,
 * with one exception the KOMBI enforces: the gear. Cover its window (GEAR_WINDOW) and the KOMBI draws a black fallback
 * gear box in the rev dial, which can stay until the cluster restarts (measured by others on their cars, seen on the
 * owner's X3 M40i; the same rule as AK Cluster ID8's docs/CLUSTER-CONSTRAINTS.md section 2). So:
 *   "on"            shown: a black band 18 px below CUT_Y, over the stock dials' edges and the separator the KOMBI
 *                   draws above its strip (less leaves pieces of them at the sides: a photo of the car, 2026-11-26),
 *                   ending on the row above the gear's window (STRIP_TRIM_MAX). Over the strip's drive mode and gear
 *                   (x BG_NOTCH) only to BG_NOTCH_Y, short of the drive mode's tops at 660 (to 662 clipped them: a photo
 *                   of the car, 2026-11-09; the notch's left end at 1196 for the E of ELECTRIC INDIVIDUAL, the longest mode)
 *   "off"           hidden: the band at 18 right across, and from there to the screen's foot two black covers, one each side of
 *                   GEAR_KEEP (the left one ends a column short of the gear's window): BMW's gear letter is all that is
 *                   left of the strip
 * At most 3 pieces; the KOMBI's warning lights are drawn over them all.
 */
const GEAR_WINDOW = { x: 1385, y: 665, w: 78, h: 56 };
const STRIP_TRIM_MAX = GEAR_WINDOW.y - 1 - CUT_Y;                    // 18
const GEAR_KEEP = { x: GEAR_WINDOW.x - 1, w: 116 };
const BG_NOTCH = [1196, 1424], BG_NOTCH_Y = 658;
const STRIP_COVERS = ['on', 'off'];
const stripCover = (o) => (o && STRIP_COVERS.indexOf(String(o.bottomExtra)) >= 0 ? String(o.bottomExtra) : 'on');
const stripOn = (o) => C0.strip(o);
const black = (key, x, y, w, h) => ({ key, kind: 'flat', x, y, w, h, colors: () => ({ color: ['#000000', 1] }) });
function blackBand(o) {
    const foot = CUT_Y + STRIP_TRIM_MAX, k = GEAR_KEEP;
    if (stripCover(o) === 'off') {
        return [black('bgBand0', 0, CUT_Y, 1920, foot - CUT_Y), black('bgBand1', 0, foot, k.x, 720 - foot),
            black('bgBand2', k.x + k.w, foot, 1920 - (k.x + k.w), 720 - foot)];
    }
    return [[0, BG_NOTCH[0], foot], [BG_NOTCH[0], BG_NOTCH[1], BG_NOTCH_Y], [BG_NOTCH[1], 1920, foot]]
        .map(([x0, x1, y1], i) => black('bgBand' + i, x0, CUT_Y, x1 - x0, y1 - CUT_Y));
}
/*
 * The Waze centre's window (the layout's own, M's, else the view the layouts leave open): a clear layer over it, with
 * the backgrounds, which the map is hosted under (map_host.js; cluster-render hosts another target only where the
 * host has a layer drawn over the rect, and draws it just under the lowest such layer). It draws nothing.
 */
const mapAnchor = (L, o) => {
    if (o.centre !== 'map') return [];
    const W = L.mapWindow || C0.MAP_VIEW;
    return [{ key: 'bgMapHost', kind: 'flat', x: W.x, y: W.y, w: W.w, h: W.h, colors: () => ({ color: ['#000000', 0] }) }];
};
/* does a rectangle reach into the gear's window? */
const overGear = (r) => r.x < GEAR_WINDOW.x + GEAR_WINDOW.w && r.x + r.w > GEAR_WINDOW.x && r.y < GEAR_WINDOW.y + GEAR_WINDOW.h && r.y + r.h > GEAR_WINDOW.y;
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

/*
 * Settings > Speed limit sign (layout_common.sliPlace): over the layout as drawn now, in the room it leaves; with the
 * map in the centre (or the stock centre over the car's strip) its window kept clear too. Its place is worked out
 * again whenever the layout is (a setting changes), so a readout put somewhere else moves it on.
 */
const signOn = (o) => !!o && (o.sliSign === 'on' || o.sliSign === true);
function withSign(L, o, list) {
    // (a layout made from another's pieces, Simple's from Pulse's: that one's sign left out, this one's placed)
    list = list.filter((p) => !/^(sli|warn\d)/.test(p.key));
    if (!signOn(o)) return list;
    const mapForm = o.centre === 'map' || (stripOn(o) && o.centre === 'stock');
    const where = { map: mapForm ? (L.mapWindow || C0.MAP_VIEW) : null, home: typeof L.sliHome === 'function' ? L.sliHome(o) : L.sliHome, skip: L.sliSkip };
    // (a layout's own place for it, sliAt: KO 1's and KO 2's inside the speedometer; else the free one nearest home)
    const own = typeof L.sliAt === 'function' ? L.sliAt(list, o) : null;
    const at = own || C0.sliPlace(list, where);
    const out = at ? list.concat(C0.sliPieces(at).map((p) => (p.key === 'sliNum' ? C0.sliFit(p, L.font || 'bold') : p))) : list;
    // the warning signs the camera reads beside it (KO 1, KO 2: warnSigns; with the speed limit sign, its setting)
    return L.warnSigns ? out.concat(C0.warnPieces(C0.warnPlace(out, Object.assign({ warnHome: L.warnHome }, where)))) : out;
}
LAYOUTS.forEach((L) => {
    const own = L.pieces;
    // (Settings > Bottom strip, Cluster: M car and Frame behind the gear box are gone: always the car's strip, which
    // leaves none of the KOMBI's boxes)
    L.pieces = (o0) => {
        // (the readouts' Auto by the car: layout_common.resolveReadouts)
        const o = C0.resolveReadouts(Object.assign({}, o0 || {}, { bottomStrip: 'stock', cluster: 'standard', boxBezel: false }));
        // a setting this build can't draw (a stale saved value) must not stop the app (the main app deletes an app
        // that keeps failing): the layout as designed, its places and readouts on their defaults
        try { return withSign(L, o, finish(L, o, withPowerWords(o, built(o)))); } catch (e) {
            const safe = Object.assign({}, o, { places: {}, infoMain: undefined, infoA: undefined, infoB: undefined, infoLow: undefined, gaugeSpeed: 'auto', gaugeRpm: 'auto', leftDial: 'gmeter' });
            return finish(L, safe, built(safe));
        }
    };
    const built = (o) => {
        // over the car's own strip there is no dark box to work round: the stock centre content shows in the
        // map's window, so the layout takes the same form as with the map (its window left clear for it)
        const oo = stripOn(o) && o.centre === 'stock' ? Object.assign({}, o, { centre: 'map' }) : o;
        // (a layout made from another's pieces, Simple's from Pulse's: the map's anchor below for this one's centre)
        let list = (own(oo) || []).filter((p) => p.key !== 'bgMapHost');
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
            const pair0 = { clock: list.find((p) => p.key === 'clock'), outside: list.find((p) => p.key === 'outside') };
            const hasGbox = has(/^gbox$/) && (ice || !C0.phevPick(o, 'infoB') ? (o.infoB || 'gearbox') === 'gearbox' : o.infoB === 'gearbox'), hasBatt = o.vehicle !== 'ice' && !C0.engineFocus(o) && !C0.phevPick(o, 'infoA') && has(/^(battT|c_battV|batt)$/);
            list = list.filter((p) => !((p.key === 'outside' && hasGbox) || (p.key === 'clock' && hasBatt)))
                .map((p) => (p.key === 'clock' ? fitted(L, Object.assign({}, p, { text: C0.stripInfoA(o, p) })) : p.key === 'outside' ? fitted(L, Object.assign({}, p, { text: C0.stripInfoB(o, p) })) : p));
            // (0.37.2) one of the two side by side alone - the other readout off, or the layout shows that reading
            // already: the one left in the middle of both places, at the size it had; none: both places go
            list = list.filter((p) => !((p.key === 'clock' || p.key === 'outside') && p.text === ''));
            const left = list.filter((p) => p.key === 'clock' || p.key === 'outside'), A = pair0.clock, B = pair0.outside;
            if (left.length === 1 && A && B && Math.abs(A.y + A.h / 2 - B.y - B.h / 2) < 6) {
                const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x + A.w, B.x + B.w), one = left[0], src = one.key === 'clock' ? A : B;
                list = list.map((p) => (p === one ? fitted(L, Object.assign({}, p, { x: x0, w: x1 - x0, y: src.y, h: src.h, align: 0.5 })) : p));
            }
            // (the two side by side at one size: the smaller of the two)
            const pair = list.filter((p) => p.key === 'clock' || p.key === 'outside');
            if (pair.length === 2 && pair[0].h !== pair[1].h && Math.abs(pair[0].y + pair[0].h / 2 - pair[1].y - pair[1].h / 2) < 4) {
                const h = Math.min(pair[0].h, pair[1].h);
                list = list.map((p) => (pair.indexOf(p) >= 0 && p.h > h ? Object.assign({}, p, { y: p.y + Math.round((p.h - h) / 2), h }) : p));
            }
            // the gauges above everything but the backgrounds
            // (only with the readings in the centre: with the map or the stock centre the side columns reach
            // down to the strip, and keep their own charge and fuel bars)
            // (Settings > Fuel and charge bars at the bottom: off, none, 0.41.7)
            if (!L.ownStripGauges && (o.centre || 'info') === 'info' && o.stripBars !== 'off') list = list.concat(C0.stripGauges(o, { fuel: typeof L.stripFuel === 'function' ? L.stripFuel(o) : L.stripFuel !== false }));
            list = bottomCut(list);
            // the band goes in with the backgrounds (under everything)
            let i = 0;
            while (i < list.length && /^bg/.test(list[i].key)) i++;
            list.splice(i, 0, ...blackBand(o), ...mapAnchor(L, o));
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
const SLOT_KEYS = ['infoMain', 'infoA', 'infoB', 'infoLow', 'gaugeSpeed', 'gaugeRpm', 'leftDial', 'jdmCup', 'centreView'];
// (0.36.1: a plug-in hybrid sets them too: Auto, the default, keeps each layout's own eDrive reading there)
const ALWAYS = () => true, ENGINE = ALWAYS, STRIP = (o) => stripOn(o), ENGINE_STRIP = STRIP;
const MAPFORM = (o) => o.centre === 'map' || (STRIP(o) && o.centre === 'stock');
const DIALS = { gaugeSpeed: ALWAYS, gaugeRpm: ALWAYS }, STRIP2 = { infoA: ENGINE_STRIP, infoB: ENGINE_STRIP };
const SLOTS = {
    analog_sport: Object.assign({ infoMain: ENGINE, centreView: (o) => !MAPFORM(o) }, DIALS, STRIP2),
    retro: Object.assign({}, DIALS, STRIP2),
    // (its window and every small gauge its own places, set on the page)
    retro_m: {},
    track: Object.assign({}, STRIP2),
    pulse: { infoMain: ENGINE },
    // (Pulse's pieces with the map or the stock centre: its main readout there)
    simple: { infoMain: (o) => o.centre === 'map' || o.centre === 'stock' },
    gt3: {}, m: {},
    classic: Object.assign({ infoMain: ENGINE, infoLow: ENGINE, centreView: (o) => !MAPFORM(o) }, DIALS),
    // (no readouts beside its dials; with the map, readouts 1 and 2 above it over the car's strip)
    // (0.41.0: the display between the dials, as 20's)
    id6m: Object.assign({ infoMain: (o) => !MAPFORM(o), centreView: (o) => !MAPFORM(o) }, DIALS, STRIP2),
    // (0.40.0: the main readout under the speed, the boxes' first and last bars; with the map, readouts 1 and 2
    // above it over the car's strip)
    arc_tach: Object.assign({ infoMain: ALWAYS, infoA: (o) => ENGINE_STRIP(o) && MAPFORM(o), infoB: (o) => ENGINE_STRIP(o) && MAPFORM(o), jdmCup: (o) => !MAPFORM(o) }, DIALS),
    // (its left dial: the G meter, a speedometer, the tyres or the temperatures; not with the map or the stock centre)
    // (0.37.0: no readouts at the right beside the strip; with the map, readouts 1 and 2 above it over the car's strip)
    jdm2: Object.assign({ infoA: (o) => ENGINE_STRIP(o) && MAPFORM(o), infoB: (o) => ENGINE_STRIP(o) && MAPFORM(o), leftDial: (o) => (o.centre || 'info') === 'info' }, DIALS),
    twin_cowl: Object.assign({}, DIALS, STRIP2, { infoLow: STRIP, centreView: (o) => !MAPFORM(o) }),
    // (0.44.0: the display between the dials, as 20's; the arcs across the dials' feet)
    ko1: Object.assign({ infoMain: (o) => !MAPFORM(o) }, DIALS, STRIP2),
    ko2: Object.assign({ infoMain: (o) => !MAPFORM(o) }, DIALS, STRIP2),
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
/*
 * Each readout's place as the page names it (0.37.4), where the setting's own name (Settings: "Centre readout: top
 * left", "under the speed", "Small gauge in the speedometer" ...) is not where that layout puts it. With the map in
 * the centre, readouts 1 and 2 stand above it in these layouts (or in Track's right column).
 */
const ABOVE_MAP = { analog_sport: 1, retro: 1, id6m: 1, jdm2: 1, arc_tach: 1, ko1: 1, ko2: 1 };
const SLOT_LABELS = {
    analog_sport: { gaugeSpeed: 'Small gauge by the speedometer', gaugeRpm: 'Small gauge by the tach' },
    id6m: { infoA: 'Centre display: top left', infoB: 'Centre display: top right', infoMain: 'Centre display: under the speed',
        gaugeSpeed: 'Small gauge by the speedometer', gaugeRpm: 'Small gauge by the tach' },
    classic: { infoMain: 'Centre readout: above the speed', infoLow: 'Centre readout: under the speed' },
    arc_tach: { infoMain: 'Centre readout: under the speed', gaugeSpeed: 'Left box: first bar', gaugeRpm: 'Right box: second bar', jdmCup: 'Cup of water' },
    jdm2: { gaugeSpeed: 'Small gauge: right', gaugeRpm: 'Small gauge: below' },
    twin_cowl: { infoA: 'Centre display: bottom left', infoB: 'Centre display: bottom right', infoLow: 'Centre display: under the speed',
        gaugeSpeed: 'Small gauge between the dials: right', gaugeRpm: 'Small gauge between the dials: left' },
    track: { infoA: 'Under the speed: left', infoB: 'Under the speed: right' },
    ko1: { infoA: 'Centre display: top left', infoB: 'Centre display: top right', infoMain: 'Centre display: bottom',
        gaugeSpeed: 'Arc under the speedometer', gaugeRpm: 'Arc under the tach' },
    ko2: { infoA: 'Centre display: top left', infoB: 'Centre display: top right', infoMain: 'Centre display: under the speed',
        gaugeSpeed: 'Arc under the speedometer', gaugeRpm: 'Arc under the tach' },
};
/** The page's name for readout k of layout id with options o; null: the setting's own. */
function slotLabel(id, k, o) {
    const map = o && (o.centre === 'map' || (stripOn(o) && o.centre === 'stock'));
    if (map && (k === 'infoA' || k === 'infoB')) {
        if (ABOVE_MAP[id]) return k === 'infoA' ? 'Above the map: left' : 'Above the map: right';
        if (id === 'track') return k === 'infoA' ? 'Right column: top line' : 'Right column: second line';
    }
    if (k === 'centreView') return 'Centre display';
    return (SLOT_LABELS[id] && SLOT_LABELS[id][k]) || null;
}
/** A readout's value for layout id: its own (slotsBy[id][k], when it is one of the setting's values), else the Settings'. */
function slotValue(get, item, id, k) {
    const by = get('slotsBy'), own = by && typeof by === 'object' && by[id] ? by[id][k] : undefined;
    const s = item(k), ok = own !== undefined && s && (s.options || []).some((x) => x[0] === own);
    return ok ? own : get(k);
}
/** The layout for the drive mode now (Settings > Layout in Sport / in ECO PRO; 'same': Layout): the car's own drive
 * mode switch (FES), not the gear selector's S. get(key): the setting; d: the data (its driveMode). */
/* A plug-in hybrid's round tach as a Power % meter (layout_common.electric): its words, eBOOST, eDRIVE and CHARGE,
 * round the dial (0.35.9). The tach: the piece 'rpm' of a round dial's kind, its sweep in u_arc. */
const ROUND_TACH = { dial: 1, e9x: 1, mround: 1, jdm: 1 };
function withPowerWords(o, list) {
    if (!o || o.vehicle === 'ice' || C0.engineFocus(o)) return list;
    const t = list.find((p) => p.key === 'rpm' && ROUND_TACH[p.kind] && p.params && p.params.u_arc && p.w === p.h);
    if (t) return list.concat(C0.powerLabels(o, 'pw', t.x + t.w / 2, t.y + t.h / 2, t.w / 2, t.params.u_arc[0], t.params.u_arc[1]));
    // (Retro M's: its scale's sweep in u_g1, about its pivot; the words out towards the ticks, clear of the hanging scale)
    const m = list.find((p) => p.key === 'rpm' && p.kind === 'rmdial' && p.params && p.params.u_g1);
    if (!m) return list;
    const P = m.params, R = P.u_rings[0];
    return list.concat(C0.powerLabels(o, 'pw', m.x + P.u_c[0] + P.u_g1[0], m.y + P.u_c[1] + P.u_g1[1], R, P.u_g1[2], P.u_g1[3], 0.66));
}
function layoutFor(get, d) {
    const m = (d && d.driveMode) || '';
    const k = /SPORT|XTRABOOST/.test(m) ? get('layoutSport') : /ECO|ELECTRIC/.test(m) && !/HYBRID|BATTERY/.test(m) ? get('layoutEco') : null;
    return k && k !== 'same' && LAYOUTS.some((l) => l.id === k) ? k : get('layout');
}
module.exports = { LAYOUTS, withSign, signOn, byId, layoutFor, SLOTS, SLOT_KEYS, slotsFor, slotLabel, slotValue, placesFor, placeItem, CUT_Y, BG_NOTCH, BG_NOTCH_Y, GEAR_WINDOW, GEAR_KEEP, STRIP_TRIM_MAX, STRIP_COVERS, stripCover, blackBand, overGear, bottomCut };
