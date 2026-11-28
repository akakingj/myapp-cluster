'use strict';
/**
 * research.js - the Test log's recorder for no passing's end (1.13.0): while a test runs (the signal survey's values,
 * survey.js onValue; the head-up display's data, adas_probe.js onHud), each change of every field of the sign
 * services' events (TrafficSignRecognition, the camera's, TrafficSignDisplayControl, the navigation's look ahead) - a
 * time's or a counter's left out, so a value that only ticks is no change - and of the head-up display data's fields
 * about passing, tunnels, lane changes and restrictions (BMW's own no passing sign shows there with its distance from
 * the car's map, the owner, 2026-11-28), with the car's speed; and the head-up display data's field names. Read only.
 *
 * (1.13.2) South Korea has no end of no passing sign: the car's map ends it (the owner, 2026-11-28). The fields that may
 * carry that (the car's catalog): TrafficSignDisplayControl.displaySpeedLimitAndNoPassingRestriction's
 * displayNoPassingRestriction and displayRemainingDistanceNoPassingRestriction, TrafficSignRecognition's
 * recognitionNoPassing, displayTextMessageNpi and displaySpeedNPIDistance, and DisplayDataServer2's
 * functionalLibraryData.npiData and vnpiDistance (the head-up display's own NPI). Every change of a no passing field
 * of these is kept on its own (the last KEEP_NP), so the camera's many events do not push it out; and each service's
 * changes are kept apart (the last KEEP each).
 *
 * (1.14.1) And every event of the camera's signs, the whole test (at most KEEP_SIGNS lines), one line each:
 *   HH:MM:SS 50 km/h | NO_STANDING_ANYTIME 0 right 23.1 -6.2 NONE; SPEED_LIMIT 50 overhead 40.0 -1.5 -
 * (type, value, where it stands - left / right / overhead -, metres ahead and aside, the first supplemental sign) and,
 * since 1.14.6, every other field of the sign as it came: [z=height flags=l r o set sup2= form= info= var=]; one
 * a side road's (road_signs.js sideRoad: more than SIDE_M aside, left off the HUD and the cluster) as
 * "side road: NO_ENTRY x=58 y=-28". The changes above kept only the last 30, so a drive's first signs were lost.
 *
 * (1.14.2) The camera's traffic lights (TrafficLightRecognitionFrontCameraLegacy.RecognitionTrafficLightCamera, the
 * survey's group trafficLight; never yet read on the car): each change, the whole test (at most KEEP_SIGNS lines),
 *   HH:MM:SS 50 km/h | id color status arrow dir x y z q
 * the figures as they come (what a colour's number means: a drive's log will tell; the catalog's defaults - id 63, place
 * 255, the rest 15 - are "no traffic light"), and, to compare, the head-up display's TRAFFIC_LIGHT_ symbols as "hud:".
 *
 * (1.14.7) Speed cameras without BMW's route (the owner's QR log study, Nov 28 2026: wanted where the car's own
 * navigation is not used - CarPlay, no destination): the map's look ahead, MapApiLinksSD and MapApiLinksSDLow (survey
 * groups mapLinks, mapLinksLow; events only, read only), and RICServiceGuidance's ric_sendEvent (ricGuidance). Section
 * "map and guidance": a header with how many of each came and the map matching's last status, then lines (the whole
 * test, at most KEEP_SIGNS):
 *   HH:MM:SS km/h | SD links: 42 links, 7 warnings (SLOW_DOWN 3, 85 1, ...); cameras: SPEED_CAMERA link#3 id=... len=120m
 *     off=35.2m dir=FORWARD [same link as the car: 20.1 m ahead]          (when the warnings or the cameras change)
 *   HH:MM:SS km/h | SD position: ON_ROAD link=... off=12.3m fwd mpp=9 route=0       (on a status change, else every 30 s)
 *   HH:MM:SS km/h | RIC: <the event's fields, 300 letters>                           (each change)
 * Warning 85 SPEED_CAMERA, 86 TRAFFIC_ENFORCEMENT_CAMERA (MapApiLinkTypes.Warning); offsets in cm (LengthInCm) as the
 * catalog says, shown in m - not yet seen on a drive. Only the members named here are read: the frames are large.
 *
 * (1.14.8) Marks, to line the drive up with the log (the owner: BMW's map opened, the driving assistant on or off):
 * [Mark] during a test puts "=== mark N ===" with the time and the speed in the camera signs, the traffic lights and the
 * map and guidance; and the driving assistant's state from the head-up display's data (activeCruiseControl.symbolACC,
 * trafficJamAssist.steeringWheel / ldmHandsSymbol) goes to the map and guidance by itself at each change ("assist:").
 *
 *   const r = startResearch({ kmh: () => speed })
 *   r.onValue(iface, member, v, t)   r.onHud(v, t)   r.reset()   r.sections() -> [[title, text], ...]
 */
const RS = require('./road_signs');

const SIGN_IFACE = /TrafficSignRecognition|SignRecognitionFrontCamera|TrafficSignDisplayControl|navigation|horizon|adasis/i;
const HUD2 = /DisplayDataServer2/;
const KEEP = 30, KEEP_NP = 80, KEEP_SIGNS = 300;
const CAM = /SignRecognitionFrontCamera$/;
const TL = /TrafficLightRecognitionFrontCamera/, LIGHT_MS = 2000;
const MAPSD = /navigation\.foresight\.MapApiLinksSD(Low)?$/, RIC = /remoteinstrumentcluster\.RICServiceGuidance/;
const WARN_NAMES = { 85: 'SPEED_CAMERA', 86: 'TRAFFIC_ENFORCEMENT_CAMERA' };
const camWarn = (t) => t === 85 || t === 86 || /CAMERA|ENFORCE/i.test(String(t));
/** A member by name, at most d levels down (the frames' members as the catalog names them; wrappers allowed). */
function pick(o, key, d) {
    if (!o || typeof o !== 'object' || d < 0) return undefined;
    if (Object.prototype.hasOwnProperty.call(o, key)) return o[key];
    for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { const r = pick(v, key, d - 1); if (r !== undefined) return r; } }
    return undefined;
}
const list = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).map((k) => x[k]) : []);
const cm = (n) => (typeof n === 'number' && isFinite(n) ? String(Math.round(n / 10) / 10) + 'm' : '?');
/** A linksFrame's warnings: { key, text } (key: what to log on a change of). */
function linksText(v, car) {
    const la = pick(v, 'linkAttributes', 2) || {}, pool = list(la.warningSignPool), refs = list(la.warningSignRefs), links = list(pick(v, 'links', 2));
    const types = {};
    pool.forEach((w) => { const t = w && w.type !== undefined ? (WARN_NAMES[w.type] || w.type) : '?'; types[t] = (types[t] || 0) + 1; });
    const cams = [];
    pool.forEach((w, i) => {
        if (!w || !camWarn(w.type)) return;
        let li = -1;
        refs.forEach((r, j) => { if (r && typeof r.first === 'number' && r.first <= i && i <= r.last) li = j; });
        const L = links[li], id = L && L.linkId !== undefined ? String(L.linkId) : null;
        let c = (WARN_NAMES[w.type] || w.type) + ' link#' + li + (id ? ' id=' + id + ' len=' + cm(L.length) : '') + ' off=' + cm(w.offset) + ' dir=' + w.directionAlongLink;
        if (car && id && car.link === id && typeof car.off === 'number' && typeof w.offset === 'number') c += ' [same link as the car: ' + cm(w.offset - car.off) + (car.fwd === false ? ', the car against the link' : '') + ']';
        cams.push(c);
    });
    const ty = Object.keys(types).map((k) => k + ' ' + types[k]).join(', ');
    return { key: ty + '|' + cams.map((c) => c.replace(/ \[same link.*$/, '')).join(';'), text: links.length + ' links, ' + pool.length + ' warnings' + (ty ? ' (' + ty + ')' : '') + '; cameras: ' + (cams.join('; ') || 'none') };
}
/** sdMapMatchedPositionAndMPP: the status and where the car is matched. */
function positionOf(v) {
    const pm = pick(v, 'positionsAndMpp', 2) || {}, p0 = list(pm.positions)[0] || {};
    return { status: pick(v, 'mapMatchingStatus', 2), link: p0.link_matched !== undefined ? String(p0.link_matched) : null, off: p0.offset, fwd: p0.in_link_direction,
        prob: p0.probability, mpp: list(pm.mostProbablePath).length, route: pm.routeLinksCount };
}
const TL_KEYS = ['trafficLightID', 'trafficLightColor', 'trafficLightStatus', 'trafficLightArrow', 'trafficLightIndicateDirection',
    'trafficLightPositionX', 'trafficLightPositionY', 'trafficLightPositionZ', 'qualityRecognitionTrafficLight'];
/** The traffic light event's figures in the line's order (id color status arrow dir x y z q), '-' for one missing. */
function lightLine(v) {
    const got = {};
    RS.fields(v).forEach((f) => { const i = f.indexOf('='), k = f.slice(0, i).split('.').pop(); if (TL_KEYS.indexOf(k) >= 0 && got[k] === undefined) got[k] = f.slice(i + 1); });
    return TL_KEYS.map((k) => (got[k] === undefined ? '-' : got[k])).join(' ');
}
const f1 = (n) => (n === null ? '-' : String(Math.round(n * 10) / 10));
/** One camera event's signs for the Test log (see above). */
function signsLine(v) {
    const all = RS.parseSignsAt(v);
    if (!all.length) return '(no sign)';
    const rest = (s) => ' [z=' + f1(s.z) + ' flags=' + (s.flags || '-') + ' sup2=' + (s.sup2 || '-') + ' form=' + (s.form || '-') + ' info=' + (s.info || '-')
        + ' var=' + (s.variable === null || s.variable === undefined ? '-' : s.variable) + ']';
    return all.map((s) => (RS.sideRoad(s) ? 'side road: ' + RS.sideLine(s) + ' ' + (s.value === undefined ? '-' : s.value) + ' ' + (s.sup || '-') + rest(s)
        : s.type + ' ' + (s.value === undefined ? '-' : s.value) + ' ' + (s.pos || '-') + ' ' + (s.valid ? f1(s.x) + ' ' + f1(s.y) : '- -') + ' ' + (s.sup || '-') + rest(s))).join('; ');
}

function startResearch(opts) {
    opts = opts || {};
    const kmh = () => { try { const v = opts.kmh && opts.kmh(); return typeof v === 'number' && isFinite(v) ? Math.round(v) : null; } catch (e) { return null; } };
    // (1.14.7) the map's look ahead and RIC guidance
    const mapN = {}, mapLast = {};
    let mapLines = [], carAt = null, posAt = -Infinity, posKey = '', assistLast = null, marks = 0;
    const mapPush = (t, text) => { if (mapLines.length >= KEEP_SIGNS) return; const k = kmh(); mapLines.push(stamp(t || Date.now()) + ' ' + (k === null ? '?' : k) + ' km/h | ' + text); };
    let last = {}, hudNpLast = null, sign = {}, hud = [], np = [], npLast = {}, cam = [], lights = [], lightLast = null, hudLightLast = null, lightFull = null, lightAt = -Infinity, lightN = 0;
    const lightPush = (t, text) => { if (lights.length >= KEEP_SIGNS) return; const k = kmh(); lights.push(stamp(t || Date.now()) + ' ' + (k === null ? '?' : k) + ' km/h | ' + text); };
    const stamp = (t) => new Date(t).toISOString().slice(11, 19);
    const linesOf = (list) => list.reduce((out, c) => out.concat(RS.chunk(c.f.split(' '), 150)
        .map((l, i) => (i ? '  ' : stamp(c.at) + ' ' + (c.kmh === null ? '?' : c.kmh) + ' km/h ' + (c.what ? c.what + ': ' : '')) + l)), []);
    return {
        onValue(iface, member, v, t) {
            if (MAPSD.test(iface) || RIC.test(iface)) {
                const src = RIC.test(iface) ? 'RIC' : /Low$/.test(iface) ? 'SDLow' : 'SD', what = src + ' ' + member;
                mapN[what] = (mapN[what] || 0) + 1;
                if (src === 'RIC') {
                    const f = RS.fields(v).join(' ').slice(0, 300);
                    if (mapLast[what] !== f) { mapLast[what] = f; mapPush(t, 'RIC ' + member + ': ' + f); }
                } else if (member === 'sdMapMatchedPositionAndMPP') {
                    const p = positionOf(v), now = t || Date.now(), k = src + '|' + p.status;
                    carAt = p;
                    if (k !== posKey || now - posAt >= 30000) {
                        posKey = k; posAt = now;
                        mapPush(t, src + ' position: ' + p.status + ' link=' + p.link + ' off=' + cm(p.off) + (p.fwd === false ? ' back' : p.fwd === true ? ' fwd' : '') + ' p=' + p.prob + ' mpp=' + p.mpp + ' route=' + p.route);
                    }
                } else if (member === 'linksFrame') {
                    const l = linksText(v, carAt);
                    if (mapLast[what] !== l.key) { mapLast[what] = l.key; mapPush(t, src + ' links: ' + l.text); }
                }
                return;
            }
            if (TL.test(iface)) {
                // (1.14.9) a line when the light, its colour, state, arrow or direction change; its place alone (it moves at
                // each of its ~24 a second: the 300 lines were full in 23 s on Nov 28) at most every LIGHT_MS
                const l = lightLine(v), key = l.split(' ').slice(0, 5).join(' '), now = t || Date.now();
                lightN++;
                if (key !== lightLast || (l !== lightFull && now - lightAt >= LIGHT_MS)) { lightLast = key; lightFull = l; lightAt = now; lightPush(t, l); }
                return;
            }
            const hud2 = HUD2.test(iface);
            if (!hud2 && !SIGN_IFACE.test(iface)) return;
            const what = iface.split('.').pop() + '.' + member, all = RS.fields(v);
            // its no passing fields, on their own
            const n = all.filter((x) => RS.NP_FIELD.test(x.split('=')[0])).join(' ');
            if (n && npLast[what] !== n) {
                npLast[what] = n;
                np.push({ at: t || Date.now(), kmh: kmh(), what, f: n });
                if (np.length > KEEP_NP) np.shift();
            }
            if (hud2) return;      // (the head-up display's whole data changes with the speed: its no passing fields only)
            // the camera's every event (its signs, where they stand), the whole test
            if (CAM.test(iface) && member === RS.CAM_EVENT && cam.length < KEEP_SIGNS) {
                const k = kmh();
                cam.push(stamp(t || Date.now()) + ' ' + (k === null ? '?' : k) + ' km/h | ' + signsLine(v));
            }
            // (1.14.5) the camera's own: in the camera signs above, a line an event (its 20 places' every field were most of
            // the Test log: 37 of its codes)
            if (CAM.test(iface)) return;
            const f = all.join(' ') || '(empty)';
            if (last[what] === f) return;
            last[what] = f;
            const list = sign[what] || (sign[what] = []);
            list.push({ at: t || Date.now(), kmh: kmh(), what, f });
            if (list.length > KEEP) list.shift();
        },
        onHud(v, t) {
            const all = RS.fields(v);
            // the driving assistant on or off (1.14.8), at each change, to the map and guidance
            const as = all.filter((f) => /^(activeCruiseControl\.symbolACC|trafficJamAssist\.(steeringWheel|ldmHandsSymbol))=/.test(f)).join(' ');
            if (as && as !== assistLast) { assistLast = as; mapPush(t, 'assist: ' + as); }
            // the head-up display's traffic light symbols (DisplayDataTypes.VSLISign TRAFFIC_LIGHT_...), to compare
            const tl = all.filter((f) => /=["']?TRAFFIC_LIGHT_/.test(f)).join(' ');
            if (tl !== (hudLightLast || '')) { if (tl || hudLightLast) lightPush(t, 'hud: ' + (tl || '(none)')); hudLightLast = tl; }
            const np = all.filter((f) => RS.NP_FIELD.test(f.split('=')[0])).join(' ') || '(none)';
            if (np === hudNpLast) return;
            hudNpLast = np;
            hud.push({ at: t || Date.now(), kmh: kmh(), what: '', f: np });
            if (hud.length > KEEP) hud.shift();
        },
        /** [Mark] (1.14.8): a numbered line in the camera signs, the traffic lights and the map and guidance. */
        mark(t) {
            marks++;
            const k = kmh(), line = stamp(t || Date.now()) + ' ' + (k === null ? '?' : k) + ' km/h === mark ' + marks + ' ===';
            if (cam.length < KEEP_SIGNS) cam.push(line);
            if (lights.length < KEEP_SIGNS) lights.push(line);
            if (mapLines.length < KEEP_SIGNS) mapLines.push(line);
            return marks;
        },
        marks: () => marks,
        reset() { marks = 0; assistLast = null; mapLines = []; Object.keys(mapN).forEach((k) => delete mapN[k]); Object.keys(mapLast).forEach((k) => delete mapLast[k]); carAt = null; posAt = -Infinity; posKey = '';
            last = {}; hudNpLast = null; sign = {}; hud = []; np = []; npLast = {}; cam = []; lights = []; lightLast = null; lightFull = null; lightAt = -Infinity; lightN = 0; hudLightLast = null; },
        sections: () => [
            ['no passing fields as they changed (TrafficSignDisplayControl, TrafficSignRecognition, the camera, DisplayDataServer2; the last ' + KEEP_NP + ')',
                np.length ? linesOf(np).join('\n') : '(none yet)'],
            ['camera signs, every event (type value place x y supplemental; the whole test, at most ' + KEEP_SIGNS + ')',
                cam.length ? cam.join('\n') : '(none yet)'],
            ['sign services, every field as it changed (the last ' + KEEP + ' of each)',
                Object.keys(sign).length ? linesOf([].concat(...Object.keys(sign).map((k) => sign[k])).sort((a, b) => a.at - b.at)).join('\n') : '(none yet)'],
            ['head-up display data, its no passing fields as they changed (the last ' + KEEP + ')', hud.length ? linesOf(hud).join('\n') : '(none yet)'],
            ['map and guidance (speed cameras without BMW\'s route)', 'came: ' + (Object.keys(mapN).map((k) => k + ' ' + mapN[k]).join(', ') || 'nothing (MapApiLinksSD, MapApiLinksSDLow, RICServiceGuidance)')
                + (carAt ? '; map matching ' + carAt.status : '') + '\n' + (mapLines.length ? mapLines.join('\n') : '(none yet)')],
            ['traffic lights', '(id color status arrow dir x y z q: a change of the first five, the place alone every ' + LIGHT_MS / 1000 + ' s at most; hud: the head-up display\'s symbol; the whole test, at most ' + KEEP_SIGNS + '; ' + lightN + ' values came)\n'
                + (lights.length ? lights.join('\n') : '(none yet)')],
        ],
    };
}

module.exports = { startResearch, SIGN_IFACE, signsLine, lightLine, linksText, positionOf, KEEP_SIGNS };
