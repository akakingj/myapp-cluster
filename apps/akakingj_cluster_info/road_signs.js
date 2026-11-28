'use strict';
/**
 * road_signs.js - the road signs the front camera reads (AK Cluster Info's HUD, signs.js; AK Cluster Layouts' KO 1 and
 * KO 2, layout_common.warnPieces): the camera's event, which signs are shown and for how long, the South Korean sign
 * each type gets (the pictures: Info's sign_art.js, Layouts' sign_atlas.js, both from tools/make_sign_art.py) and the
 * car's own list of the camera's types. Shared (shared/, tools/sync_shared.js): Info takes it by name.
 *
 * The camera's sign event (de.bmw.environmentalmodel.SignRecognitionFrontCamera, TrafficSignRecognitionFrontCamera):
 * found by the signal survey (a drive on 2026-11-26), it comes once as the car passes a sign, not at a rate:
 *   trafficSignRecognition.numberSigns=1  trafficSign[0].type="DS_ANIMAL_CROSSING"  trafficSign[0].value=0
 * Types seen: SPEED_LIMIT, NO_PASSING_SIGN, GIVE_WAY, DS_TRAFFIC_JAM, DS_SPLIPPERY_ROAD (BMW's spelling),
 * DS_RIGHT_DOWNWARDS, DS_ANIMAL_CROSSING. The speed limit and no passing are shown by the car itself, so left out.
 */
const CAM_IFACE = 'de.bmw.environmentalmodel.SignRecognitionFrontCamera';
const CAM_EVENT = 'TrafficSignRecognitionFrontCamera';
const SHOW_MS = 10000;

/** The sign types in one of the camera's values: ['GIVE_WAY', ...] (as many as numberSigns says, if it says). */
function parseSigns(v) {
    return parseSignsAt(v).map((s) => s.type);
}
/*
 * The same with where each sign stands (Nov 28 2026, the owner's drive): [{ type, value, x, y, valid, pos, sup }] -
 * location.x metres ahead, y metres to the side (+ left, - right), valid when location.locationInvalidFlags is 0; pos
 * 'left' / 'right' / 'overhead' (position.*), sup the first supplemental type. Signs on the car's own road stood at y
 * -7.6 ... +2.2 m (overhead or the right verge), the central reserve's at +9.3; a side road's no entry at x 58, y -28.1.
 */
const SIDE_M = 12;
const num = (n) => (typeof n === 'number' && isFinite(n) ? n : null);
function parseSignsAt(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    if (!v || typeof v !== 'object') return [];
    const find = (o, key, d) => {
        if (!o || typeof o !== 'object' || d > 5) return undefined;
        if (key in o) return o[key];
        for (const k of Object.keys(o)) { const r = find(o[k], key, d + 1); if (r !== undefined) return r; }
        return undefined;
    };
    let list = find(v, 'trafficSign', 0);
    if (!Array.isArray(list)) list = list && typeof list === 'object' ? Object.keys(list).map((k) => list[k]) : [];
    const n = find(v, 'numberSigns', 0);
    if (typeof n === 'number' && n >= 0) list = list.slice(0, n);
    return list.filter((s) => s && typeof s === 'object' && typeof s.type === 'string' && s.type)
        .map((s) => {
            const l = s.location && typeof s.location === 'object' ? s.location : {}, p = s.position && typeof s.position === 'object' ? s.position : {};
            return { type: s.type.toUpperCase(), value: s.value, x: num(l.x), y: num(l.y), valid: l.locationInvalidFlags === 0 && num(l.y) !== null,
                pos: p.overhead === true ? 'overhead' : p.left === true ? 'left' : p.right === true ? 'right' : null,
                sup: typeof s.firstSupplementalType === 'string' ? s.firstSupplementalType : null };
        })
        // (the event's 20 places: an empty one is SIGNAL_UNFILLED, the car's catalog; never a sign)
        .filter((s) => !/^(SIGNAL_UNFILLED|UNKNOWN|INITIALIZATION_STATUS_UNKNOWN)$/.test(s.type));
}
/** A sign by a side road (across a junction, at a side street's mouth): its place known and more than SIDE_M aside. */
const sideRoad = (s) => !!s && s.valid === true && Math.abs(s.y) > SIDE_M;
/** The types of the signs on the car's own road, and those left out as a side road's (for the logs). */
function ownRoad(signs) {
    const near = [], side = [];
    signs.forEach((s) => (sideRoad(s) ? side : near).push(s));
    return { types: near.map((s) => s.type), side: side };
}
/** One line of a side road's sign for a log: "NO_ENTRY x=58 y=-28". */
const sideLine = (s) => s.type + ' x=' + Math.round(s.x) + ' y=' + Math.round(s.y);

/** Whether a type is drawn: the danger signs and give way (the HUD shows the speed limit and no passing itself). */
const shownByHud = (t) => /SPEED_LIMIT|NO_PASSING|OVERTAK|(^|_)END(_|$)/.test(t);
/*
 * (1.13.3) The 79 types of the car's catalog (G20 320i, someip-interfaces.json, 2026-11-28; tools/known_sign_types.json
 * the owner's mapping to South Korea's signs, 도로교통법 시행규칙 별표 6): name -> [picture or null, shown]. A name in
 * it is decided by it alone; another (another firmware) by the rules below it. The ones whose Korean sign has no
 * picture here yet ("new picture to come") show 위험 ("!") till it is made; ALL_VEHICLES_PROHIBITED (통행금지) stays
 * hidden till its own. The instruction signs (blue) and Germany's zone signs are hidden: no warning on the cluster.
 */
const KNOWN = {
    NO_PASSING_SIGN: ["no_passing", false],
    WITHDRAWAL_NO_PASSING_SIGN: [null, false],
    WITHDRAWAL_SPEED_LIMIT: [null, false],
    GENERAL_WITHDRAWAL: [null, false],
    SPEED_LIMIT: [null, false],
    WITHDRAWAL_SPEED_LIMIT_2_DIGITS: [null, false],
    WITHDRAWAL_SPEED_LIMIT_3_DIGITS: [null, false],
    MANDATORY_PASSING_LEFT: [null, false],
    MANDATORY_PASSING_RIGHT: [null, false],
    MANDATORY_PASSING_STRAIGHT: [null, false],
    ROUNDABOUT_SIGN: ["roundabout", true],
    NO_ENTRY: ["no_entry", true],
    VEHICLES_PROHIBITED: ["no_cars", true],
    MOTORWAY_START_OF: [null, false],
    MOTORWAY_END_OF: [null, false],
    EXPRESSWAY_START_OF: [null, false],
    EXPRESSWAY_END_OF: [null, false],
    TRAFFIC_CALMING_ZONE_START_OF: [null, false],
    TRAFFIC_CALMING_ZONE_END_OF: [null, false],
    STOP_SIGN: ["stop", true],
    GIVE_WAY: ["give_way", true],
    PRIORITY_ROAD_START_OF: [null, false],
    PRIORITY_ROAD_END_OF: [null, false],
    DS_BEND_LEFT: ["curve_left", true],
    DS_BEND_RIGHT: ["curve_right", true],
    DS_DOUBLE_BEND_LEFT_FIRST: ["double_bend_left", true],
    DS_DOUBLE_BEND_RIGHT_FIRST: ["double_bend_right", true],
    DS_ROAD_NARROW_BOTH_SIDES: ["danger", true],   // narrow_both (new picture to come)
    DS_ROAD_NARROW_LEFT_SIDE: ["danger", true],   // narrow_left (new picture to come)
    DS_ROAD_NARROW_RIGHT_SIDE: ["danger", true],   // narrow_right (new picture to come)
    DS_CROSS_ROAD: ["danger", true],   // crossroad (new picture to come)
    DS_CROSS_ROAD_SMALL_ROAD: ["danger", true],   // priority_road (new picture to come)
    DS_ROAD_FROM_LEFT__DEGREE: ["danger", true],   // junction_left (new picture to come)
    DS_ROAD_FROM_RIGHT__DEGREE: ["danger", true],   // junction_right (new picture to come)
    DS_ONE_BUMP: ["speed_hump", true],
    DS_TWO_BUMP: ["bumpy_road", true],
    DS_CONCAVE: ["bumpy_road", true],
    DS_TRAFFIC_JAM: ["traffic_jam", true],
    DS_ROAD_WORKS: ["road_works", true],
    DS_RIGHT_DOWNWARDS: ["downhill", true],
    DS_RIGHT_UPWARDS: ["uphill", true],
    DS_TRAFFIC_LIGHT: ["traffic_lights", true],
    DS_ANIMAL_CROSSING: ["wild_animal", true],
    DS_CHILDREN: ["children", true],
    DS_SNOW: ["danger", true],
    DS_SPLIPPERY_ROAD: ["slippery", true],
    DS_GIVE_WAY_ROUNDABOUT: ["roundabout", true],
    DS_WIND_FROM_SIDE: ["crosswind", true],
    DS_PEDESTRIAN_CROSSING: ["crosswalk", true],
    DS_BYCICLE_CROSSING: ["bicycle", true],
    DS_TRAIN_CROSS_WITHOUT_BARRIER: ["railway", true],
    DS_TRAIN_CROSS_WITH_BARRIER: ["railway", true],
    DS_GRAVEL: ["danger", true],
    DS_TWO_WAY_TRAFFIC: ["danger", true],   // two_way (new picture to come)
    CITY_LIMIT_START_OF: [null, false],
    CITY_LIMIT_END_OF: [null, false],
    CITY_LIMIT_START_END_OF: [null, false],
    ENVIRONMENTAL_ZONE_START_OF: [null, false],
    ENVIRONMENTAL_ZONE_END_OF: [null, false],
    UNKNOWN: [null, false],
    ALL_VEHICLES_PROHIBITED: ["danger", false],   // no_through (new picture to come)
    MANDATORY_PASSING_HERE_LEFT: [null, false],
    MANDATORY_PASSING_HERE_RIGHT: [null, false],
    MANDATORY_PASSING_LEFT_ALONG: [null, false],
    MANDATORY_PASSING_RIGHT_ALONG: [null, false],
    MANDATORY_PASSING_STRAIGHT_LEFT: [null, false],
    MANDATORY_PASSING_STRAIGHT_RIGHT: [null, false],
    DS_PEDESTRIAN: ["crosswalk", true],
    DS_DOMESTIC_ANIMAL_CROSSING: ["wild_animal", true],
    DS_GENERAL: ["danger", true],
    DS_DRAW_BRIDGE: ["bridge", true],
    DS_LOW_FLYING_AIRCRAFT: ["danger", true],   // aircraft (new picture to come)
    DS_RIVER_BANK: ["riverside", true],
    DS_TRAIN_CROSS: ["railway", true],
    STOPPING_RESTRICTION: ["no_stopping", true],
    NO_STANDING_ANYTIME: ["no_stopping", true],
    DRIVING_EMERGANCY_LANE_ALLOWED: [null, false],
    DRIVING_EMERGANCY_LANE_CANCELLATION: [null, false],
    SIGNAL_UNFILLED: [null, false],
};
const known = (t) => (Object.prototype.hasOwnProperty.call(KNOWN, t) ? KNOWN[t] : null);
/* opts (AK Cluster Layouts' and ID8's settings; none: as before, AK Cluster Info and Centre): { noStopping: false } leaves
   out the no stopping signs (NO_STANDING_ANYTIME, STOPPING_RESTRICTION: read every half minute in town, the owner) */
const wanted = (t, opts) => {
    if (CAMERAS[t]) return true;
    if (opts && opts.noStopping === false && artOf(t) === 'no_stopping') return false;
    const k = known(t); return k ? k[1] : !shownByHud(t) && (/^DS_/.test(t) || artOf(t) !== 'danger');
};

/*
 * Speed cameras (Nov 28 2026, the owner: on the HUD and the cluster, fixed or mobile). Not the front camera's: BMW's
 * navigation lists them among a route's events (GuidanceEventList, Guidance.conclusiveDart: speedCamera,
 * speedSectionCamera), so only while a route runs. Cluster Info decodes them (nav.js) and shares the one to show in
 * /dev/shm/cluster-info (camera.json: { t, app, camera: { type, m } }) for AK Cluster Layouts and AK Cluster ID8.
 * Fixed or mobile: the car's catalog has no field for it, only the camera's icon (speedCameraInfo.cameraIcon, a
 * resource id and url) - one whose name says mobile is taken for mobile, any other for fixed (not yet seen on a drive:
 * the logs keep the icons' ids). A section camera (구간단속) is its own. The pictures: tools/make_sign_art.py.
 */
const CAMERAS = { SPEED_CAMERA_FIXED: 'camera_fixed', SPEED_CAMERA_MOBILE: 'camera_mobile', SPEED_CAMERA_SECTION: 'camera_section' };
const CAM_TYPE = { fixed: 'SPEED_CAMERA_FIXED', mobile: 'SPEED_CAMERA_MOBILE', section: 'SPEED_CAMERA_SECTION' };
const CAM_M = 1000;               // shown from this far ahead (m) until passed
const MOBILE_RE = /mobil|movable|portable|temporar|이동/i;
/** 'fixed' | 'mobile' | 'section' from the union's kind and the icons' ids. */
function cameraKind(kind, icons) {
    if (kind === 'speedSectionCamera') return 'section';
    return (icons || []).some((s) => MOBILE_RE.test(String(s))) ? 'mobile' : 'fixed';
}
/** A provider file's camera (camera.json), as a type to show, or null. */
function cameraType(entry) {
    const c = entry && entry.camera;
    return c && typeof c === 'object' && CAMERAS[c.type] ? c.type : null;
}

/** The signs to show (the owner, 2026-11-28: on when the camera reads one, off a while after; a new one read takes
 * its place): add(types, t) - the types keep (wanted: the head-up display's) takes from one of the camera's events
 * become the ones shown, in place of those before (one event may carry two); current(t) -> them, at most max, while
 * showMs has not passed since. */
function makeTracker(showMs, max, keep, opts) {
    showMs = showMs || SHOW_MS; max = max || 4; keep = keep || wanted;
    // opts: keep's options (wanted's { noStopping }), or a function giving them now (a setting changed: taken at once)
    const o = () => (typeof opts === 'function' ? opts() : opts);
    let cur = [], at = -Infinity;
    return {
        add(types, t) {
            const op = o(), f = Array.from(new Set(types.filter((x) => keep(x, op))));
            if (f.length) { cur = f; at = t; }
        },
        current(t) {
            if (t - at >= showMs) { cur = []; return []; }
            const op = o();
            return (op ? cur.filter((x) => keep(x, op)) : cur).slice(0, max);
        },
    };
}

/*
 * No passing on the cluster (AK Cluster Layouts, AK Cluster ID8; the head-up display has its own): on from the
 * camera's no passing sign until the zone ends (the owner, 2026-11-28: no distance as BMW's own shows, but gone when the
 * zone ends) - an end sign (NP_END) read by the camera; or, while what tells the end is not known (the camera sent no
 * end sign on the drives logged so far; the TrafficSignRecognition event may carry it: the Logs keep its every field
 * now), NP_KM driven since the sign was last read.
 * (2026-11-28, the car's catalog: the camera's own end sign is WITHDRAWAL_NO_PASSING_SIGN, and GENERAL_WITHDRAWAL the
 * end of every restriction; before, the first was taken for a no passing sign and started the zone again.)
 */
const NP_KM = 3;
const NP_END = /(NO_PASSING|OVERTAK|PASSING).*(END|CANCEL|LIFT|RELEASE)|(END|CANCEL|LIFT)_.*(NO_PASSING|OVERTAK|PASSING)|END_OF_ALL|ALL_RESTRICTIONS?_END|DERESTRICT|WITHDRAWAL_NO_PASSING|^GENERAL_WITHDRAWAL$/;
const npEnd = (t) => NP_END.test(t);
const npStart = (t) => /NO_PASSING|OVERTAK/.test(t) && !npEnd(t) && !/(^|_)END(_|$)/.test(t);
/** add(types, t): a no passing sign starts (or keeps on) the zone, an end sign ends it; step(t, kmh): the distance
 * driven (gaps over 2 s counted as 2 s); on() -> whether no passing is shown; km() -> driven since its sign. */
function makeZone(maxKm) {
    maxKm = maxKm || NP_KM;
    let on = false, km = 0, last = null;
    return {
        add(types) {
            if (types.some(npEnd)) on = false;
            else if (types.some(npStart)) { on = true; km = 0; }
        },
        step(t, kmh) {
            if (last !== null && on && typeof kmh === 'number' && kmh > 0) km += kmh * Math.min(2000, Math.max(0, t - last)) / 3600000;
            last = t;
            if (km >= maxKm) on = false;
        },
        on: () => on,
        km: () => km,
    };
}
/** A field's name that may be about no passing (the head-up display's data: BMW's own no passing sign there, and its
 * distance from the car's map - the owner, 2026-11-28). */
const NP_FIELD = /pass|overtak|npi|ueberhol|tunnel|lanechange|lane_change|restrict/i;
/** Every field of a value as ['a.b=v', ...] (arrays: each element; a counter's or a time's left out: they change with
 * every event), for the Logs (what TrafficSignRecognition carries). */
function fields(v) {
    const out = [];
    const walk = (o, p, d) => {
        if (/time|stamp|counter|crc|alive|sequence/i.test(p.split('.').pop() || '')) return;
        if (o === null || typeof o !== 'object') { out.push(p + '=' + (typeof o === 'string' ? o : String(o))); return; }
        if (d > 5) return;
        Object.keys(o).forEach((k) => walk(o[k], p ? p + '.' + k : k, d + 1));
    };
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return [v]; } }
    walk(v, '', 0);
    return out;
}

const side = (l, r) => (t) => (/LEFT/.test(t) ? l : r);
const ART_OF = [
    // regulatory and instruction signs first (NO_LEFT_TURN is no bend)
    [/NO_PASSING|OVERTAK/, 'no_passing'], [/GIVE_WAY(?!_ROUNDABOUT)|YIELD/, 'give_way'], [/STOPPING|STANDING/, 'no_stopping'], [/^STOP(_SIGN)?$/, 'stop'], [/NO_ENTRY|DO_NOT_ENTER/, 'no_entry'],
    [/U_TURN/, 'no_u_turn'], [/NO_.*LEFT|LEFT_TURN_PROHIB|TURN_LEFT_PROHIB/, 'no_left_turn'],
    [/NO_.*RIGHT|RIGHT_TURN_PROHIB|TURN_RIGHT_PROHIB/, 'no_right_turn'], [/NO_.*STRAIGHT|STRAIGHT_PROHIB/, 'no_straight'],
    [/NO_.*(STOPPING|WAITING|STANDING)/, 'no_stopping'], [/NO_.*PARK|PARKING_PROHIB/, 'no_parking'],
    [/NO_.*(CAR|MOTOR|VEHICLE)/, 'no_cars'], [/DISTANCE|HEADWAY/, 'keep_distance_50m'], [/ONE_WAY/, 'one_way'],
    [/UNPROTECTED/, 'unprotected_left'], [/^SLOW|_SLOW/, 'slow'],
    [/SLIP|SPLIP|SKID/, 'slippery'], [/JAM|QUEUE|CONGEST/, 'traffic_jam'], [/ANIMAL|DEER|WILD/, 'wild_animal'],
    [/DOWNWARD|DESCENT|DOWNHILL/, 'downhill'], [/UPWARD|ASCENT|UPHILL/, 'uphill'],
    [/DOUBLE|SERIES|WINDING|(^|[^A-Z])S_(CURVE|BEND)/, (t) => (/LEFT.*RIGHT|LEFT_FIRST|^DS_LEFT/.test(t) ? 'double_bend_left' : 'double_bend_right')],
    [/CURVE|BEND/, side('curve_left', 'curve_right')],
    [/WORK|CONSTRUCTION/, 'road_works'], [/PEDESTRIAN|CROSSWALK|ZEBRA/, 'crosswalk'], [/CHILD|SCHOOL/, 'children'],
    [/BICYC|BYCIC|CYCLE/, 'bicycle'], [/HUMP|SPEED_BUMP/, 'speed_hump'], [/UNEVEN|BUMP/, 'bumpy_road'],
    [/ROCK|FALLING/, 'falling_rocks'], [/WIND/, 'crosswind'], [/TUNNEL/, 'tunnel'], [/BRIDGE/, 'bridge'],
    [/RAIL|TRAIN|LEVEL_CROSS/, 'railway'], [/LIGHT|SIGNALS?$/, 'traffic_lights'], [/ROUNDABOUT|CIRCLE/, 'roundabout'],
    [/MERGE|JOIN/, side('merge_left', 'merge_right')], [/RIVER|QUAY|BANK/, 'riverside'],
];
/** Which sign a type gets: 'danger' (140, "!") for a warning with none of its own. */
function artOf(t) {
    if (CAMERAS[t]) return CAMERAS[t];
    const k = known(t);
    if (k && k[0]) return k[0];
    for (const [re, n] of ART_OF) if (re.test(t)) return typeof n === 'function' ? n(t) : n;
    return 'danger';
}

/* ---------- the car's own list of the camera's sign types ----------
 * The camera's value comes with its type as a name (the head unit's interface config holds the enumeration): this
 * app's own config for the camera's service (someipInterfaces/, made at install from the car's catalog) is read for
 * the list of names, so what this car's camera can say is known without driving past every sign - logged once in
 * lines the Logs' codes keep whole, and on the app's page. */
const NAME_RE = /^[A-Z][A-Z0-9_]{2,}$/;
/** The sign type names in an interface config: the enumeration holding GIVE_WAY or SPEED_LIMIT, [] if none. */
function typeNames(cfg) {
    let best = [];
    const seen = new Set();
    const names = (o) => {
        const out = [];
        const add = (v) => { if (typeof v === 'string' && NAME_RE.test(v)) out.push(v); };
        if (Array.isArray(o)) o.forEach((e) => { add(e); if (e && typeof e === 'object') { add(e.name); add(e.Name); add(e.value && typeof e.value === 'string' ? e.value : null); } });
        else Object.keys(o).forEach((k) => { add(k); add(o[k]); if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) { add(o[k].name); add(o[k].Name); } });
        return out;
    };
    const walk = (o, d) => {
        if (!o || typeof o !== 'object' || d > 12 || seen.has(o)) return;
        seen.add(o);
        const n = names(o);
        if (n.length > best.length && (n.indexOf('GIVE_WAY') >= 0 || n.indexOf('SPEED_LIMIT') >= 0 || n.some((x) => /^DS_/.test(x)))) best = n;
        (Array.isArray(o) ? o : Object.keys(o).map((k) => o[k])).forEach((v) => walk(v, d + 1));
    };
    walk(cfg, 0);
    return Array.from(new Set(best));
}
/** Every name in an interface config, in order, once: its members', its data's fields', its enumerations' values -
 * what an event can carry (for the Logs: where no passing's end may be, 2026-11-28). */
function defNames(cfg) {
    const out = [], seen = new Set(), objs = new Set();
    const add = (v) => { if (typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(v) && !seen.has(v)) { seen.add(v); out.push(v); } };
    const walk = (o, d) => {
        if (!o || typeof o !== 'object' || d > 14 || objs.has(o)) return;
        objs.add(o);
        if (Array.isArray(o)) o.forEach((e) => { add(e); walk(e, d + 1); });
        else Object.keys(o).forEach((k) => { add(k); add(o[k]); walk(o[k], d + 1); });
    };
    walk(cfg, 0);
    return out;
}
/** Names in lines of at most n letters (the log keeps 200 a line). */
function chunk(list, n) {
    const out = [];
    let line = '';
    list.forEach((x) => { if (line && line.length + x.length + 2 > n) { out.push(line); line = ''; } line += (line ? ', ' : '') + x; });
    if (line) out.push(line);
    return out;
}

module.exports = { SIDE_M, parseSignsAt, sideRoad, ownRoad, sideLine, CAMERAS, CAM_TYPE, CAM_M, cameraKind, cameraType, CAM_IFACE, CAM_EVENT, SHOW_MS, parseSigns, shownByHud, wanted, KNOWN, makeTracker, NP_KM, npStart, npEnd, makeZone, fields, NP_FIELD, defNames, artOf, ART_OF, typeNames, chunk };
