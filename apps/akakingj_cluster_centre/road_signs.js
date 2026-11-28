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
    return list.map((s) => (s && typeof s === 'object' ? s.type : undefined))
        .filter((t) => typeof t === 'string' && t).map((t) => t.toUpperCase());
}

/** Whether a type is drawn: the danger signs and give way (the HUD shows the speed limit and no passing itself). */
const shownByHud = (t) => /SPEED_LIMIT|NO_PASSING|OVERTAK|(^|_)END(_|$)/.test(t);
const wanted = (t) => !shownByHud(t) && (/^DS_/.test(t) || artOf(t) !== 'danger');

/** The signs seen lately: add(types, t), current(t) -> the types to show, oldest first; keep (wanted: the head-up
 * display's) which types it takes. */
function makeTracker(showMs, max, keep) {
    showMs = showMs || SHOW_MS; max = max || 4; keep = keep || wanted;
    const seen = new Map();      // type -> { first, last }
    return {
        add(types, t) {
            types.filter(keep).forEach((ty) => {
                const s = seen.get(ty);
                if (s && t - s.last < showMs) s.last = t; else seen.set(ty, { first: t, last: t });
            });
        },
        current(t) {
            const out = [];
            seen.forEach((s, ty) => { if (t - s.last < showMs) out.push([s.first, ty]); else seen.delete(ty); });
            return out.sort((a, b) => a[0] - b[0]).slice(-max).map((e) => e[1]);
        },
    };
}

const side = (l, r) => (t) => (/LEFT/.test(t) ? l : r);
const ART_OF = [
    // regulatory and instruction signs first (NO_LEFT_TURN is no bend)
    [/NO_PASSING|OVERTAK/, 'no_passing'], [/GIVE_WAY|YIELD/, 'give_way'], [/^STOP/, 'stop'], [/NO_ENTRY|DO_NOT_ENTER/, 'no_entry'],
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
    [/BICYC|CYCLE/, 'bicycle'], [/HUMP|SPEED_BUMP/, 'speed_hump'], [/UNEVEN|BUMP/, 'bumpy_road'],
    [/ROCK|FALLING/, 'falling_rocks'], [/WIND/, 'crosswind'], [/TUNNEL/, 'tunnel'], [/BRIDGE/, 'bridge'],
    [/RAIL|TRAIN|LEVEL_CROSS/, 'railway'], [/LIGHT|SIGNAL/, 'traffic_lights'], [/ROUNDABOUT|CIRCLE/, 'roundabout'],
    [/MERGE|JOIN/, side('merge_left', 'merge_right')], [/RIVER|QUAY|BANK/, 'riverside'],
];
/** Which sign a type gets: 'danger' (140, "!") for a warning with none of its own. */
function artOf(t) {
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
/** Names in lines of at most n letters (the log keeps 200 a line). */
function chunk(list, n) {
    const out = [];
    let line = '';
    list.forEach((x) => { if (line && line.length + x.length + 2 > n) { out.push(line); line = ''; } line += (line ? ', ' : '') + x; });
    if (line) out.push(line);
    return out;
}

module.exports = { CAM_IFACE, CAM_EVENT, SHOW_MS, parseSigns, shownByHud, wanted, makeTracker, artOf, ART_OF, typeNames, chunk };
