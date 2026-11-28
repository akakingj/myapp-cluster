'use strict';
/**
 * research.js - the Test log's recorder for no passing's end (1.13.0): while a test runs (the signal survey's values,
 * survey.js onValue; the head-up display's data, adas_probe.js onHud), each change of every field of the sign
 * services' events (TrafficSignRecognition, the camera's, TrafficSignDisplayControl, the navigation's look ahead) - a
 * time's or a counter's left out, so a value that only ticks is no change - and of the head-up display data's fields
 * about passing, tunnels, lane changes and restrictions (BMW's own no passing sign shows there with its distance from
 * the car's map, the owner, 2026-11-28), with the car's speed; and the head-up display data's field names. Read only.
 *
 *   const r = startResearch({ kmh: () => speed })
 *   r.onValue(iface, member, v, t)   r.onHud(v, t)   r.reset()   r.sections() -> [[title, text], ...]
 */
const RS = require('./road_signs');

const SIGN_IFACE = /TrafficSignRecognition|SignRecognitionFrontCamera|TrafficSignDisplayControl|navigation|horizon|adasis/i;
const KEEP = 30;

function startResearch(opts) {
    opts = opts || {};
    const kmh = () => { try { const v = opts.kmh && opts.kmh(); return typeof v === 'number' && isFinite(v) ? Math.round(v) : null; } catch (e) { return null; } };
    let last = {}, hudNpLast = null, hudKeys = [], sign = [], hud = [];
    const stamp = (t) => new Date(t).toISOString().slice(11, 19);
    const linesOf = (list) => list.reduce((out, c) => out.concat(RS.chunk(c.f.split(' '), 150)
        .map((l, i) => (i ? '  ' : stamp(c.at) + ' ' + (c.kmh === null ? '?' : c.kmh) + ' km/h ' + (c.what ? c.what + ': ' : '')) + l)), []);
    return {
        onValue(iface, member, v, t) {
            if (!SIGN_IFACE.test(iface)) return;
            const what = iface.split('.').pop() + '.' + member, f = RS.fields(v).join(' ') || '(empty)';
            if (last[what] === f) return;
            last[what] = f;
            sign.push({ at: t || Date.now(), kmh: kmh(), what, f });
            if (sign.length > KEEP) sign.shift();
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
        reset() { last = {}; hudNpLast = null; sign = []; hud = []; },
        sections: () => [
            ['sign services, every field as it changed (the last ' + KEEP + ')', sign.length ? linesOf(sign).join('\n') : '(none yet)'],
            ['head-up display data, its fields', hudKeys.length ? RS.chunk(hudKeys, 150).join('\n') : '(none yet)'],
            ['head-up display data, its no passing fields as they changed (the last ' + KEEP + ')', hud.length ? linesOf(hud).join('\n') : '(none yet)'],
        ],
    };
}

module.exports = { startResearch, SIGN_IFACE };
