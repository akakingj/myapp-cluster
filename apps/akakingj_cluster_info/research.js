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
 * (type, value, where it stands - left / right / overhead -, metres ahead and aside, the first supplemental sign); one
 * a side road's (road_signs.js sideRoad: more than SIDE_M aside, left off the HUD and the cluster) as
 * "side road: NO_ENTRY x=58 y=-28". The changes above kept only the last 30, so a drive's first signs were lost.
 *
 *   const r = startResearch({ kmh: () => speed })
 *   r.onValue(iface, member, v, t)   r.onHud(v, t)   r.reset()   r.sections() -> [[title, text], ...]
 */
const RS = require('./road_signs');

const SIGN_IFACE = /TrafficSignRecognition|SignRecognitionFrontCamera|TrafficSignDisplayControl|navigation|horizon|adasis/i;
const HUD2 = /DisplayDataServer2/;
const KEEP = 30, KEEP_NP = 80, KEEP_SIGNS = 300;
const CAM = /SignRecognitionFrontCamera$/;
const f1 = (n) => (n === null ? '-' : String(Math.round(n * 10) / 10));
/** One camera event's signs for the Test log (see above). */
function signsLine(v) {
    const all = RS.parseSignsAt(v);
    if (!all.length) return '(no sign)';
    return all.map((s) => (RS.sideRoad(s) ? 'side road: ' + RS.sideLine(s)
        : s.type + ' ' + (s.value === undefined ? '-' : s.value) + ' ' + (s.pos || '-') + ' ' + (s.valid ? f1(s.x) + ' ' + f1(s.y) : '- -') + ' ' + (s.sup || '-'))).join('; ');
}

function startResearch(opts) {
    opts = opts || {};
    const kmh = () => { try { const v = opts.kmh && opts.kmh(); return typeof v === 'number' && isFinite(v) ? Math.round(v) : null; } catch (e) { return null; } };
    let last = {}, hudNpLast = null, hudKeys = [], sign = {}, hud = [], np = [], npLast = {}, cam = [];
    const stamp = (t) => new Date(t).toISOString().slice(11, 19);
    const linesOf = (list) => list.reduce((out, c) => out.concat(RS.chunk(c.f.split(' '), 150)
        .map((l, i) => (i ? '  ' : stamp(c.at) + ' ' + (c.kmh === null ? '?' : c.kmh) + ' km/h ' + (c.what ? c.what + ': ' : '')) + l)), []);
    return {
        onValue(iface, member, v, t) {
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
            const f = all.join(' ') || '(empty)';
            if (last[what] === f) return;
            last[what] = f;
            const list = sign[what] || (sign[what] = []);
            list.push({ at: t || Date.now(), kmh: kmh(), what, f });
            if (list.length > KEEP) list.shift();
        },
        onHud(v, t) {
            const all = RS.fields(v);
            hudKeys = Array.from(new Set(all.map((f) => f.split('=')[0].split('.').slice(0, 2).join('.'))));
            const np = all.filter((f) => RS.NP_FIELD.test(f.split('=')[0])).join(' ') || '(none)';
            if (np === hudNpLast) return;
            hudNpLast = np;
            hud.push({ at: t || Date.now(), kmh: kmh(), what: '', f: np });
            if (hud.length > KEEP) hud.shift();
        },
        reset() { last = {}; hudNpLast = null; sign = {}; hud = []; np = []; npLast = {}; cam = []; },
        sections: () => [
            ['no passing fields as they changed (TrafficSignDisplayControl, TrafficSignRecognition, the camera, DisplayDataServer2; the last ' + KEEP_NP + ')',
                np.length ? linesOf(np).join('\n') : '(none yet)'],
            ['camera signs, every event (type value place x y supplemental; the whole test, at most ' + KEEP_SIGNS + ')',
                cam.length ? cam.join('\n') : '(none yet)'],
            ['sign services, every field as it changed (the last ' + KEEP + ' of each)',
                Object.keys(sign).length ? linesOf([].concat(...Object.keys(sign).map((k) => sign[k])).sort((a, b) => a.at - b.at)).join('\n') : '(none yet)'],
            ['head-up display data, its fields', hudKeys.length ? RS.chunk(hudKeys, 150).join('\n') : '(none yet)'],
            ['head-up display data, its no passing fields as they changed (the last ' + KEEP + ')', hud.length ? linesOf(hud).join('\n') : '(none yet)'],
        ],
    };
}

module.exports = { startResearch, SIGN_IFACE, signsLine, KEEP_SIGNS };
