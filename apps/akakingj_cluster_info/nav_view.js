'use strict';
/**
 * Cluster Info's directions on the HUD, as one picture: Cluster Redline's design (jaimeen77-cmyk/apps: the
 * instruction text on top, the turn arrow or junction diagram with its distance, the lane board under it:
 * nav_text.js, nav_draw.js, lane_draw.js) for the turn Redline's tracker reads (nav.js's object: { kind, dir, exit,
 * dist, unit, road, lanes }).
 *
 * The three parts are Cluster Redline's 240 x 48 / 112 / 72 designs, painted at SCALE (no resampling) and stacked
 * with their empty margins cut, into W x H (149 x 120): the part a turn hasn't (no text, no lanes) left empty.
 */
const { Canvas } = require('./nav_canvas');
const fonts = require('./kit/fonts');
const navDraw = require('./nav_draw'), laneDraw = require('./lane_draw'), navText = require('./nav_text');

const SCALE = 0.62;
// the rows of each 240-wide design that hold its drawing (the rest is margin)
const PARTS = [
    { key: 'text', draw: navText, top: 8, h: 32, gap: 4 },     // (a gap: a highway diagram's label is at its top)
    { key: 'turn', draw: navDraw, top: 14, h: 98 },
    { key: 'lanes', draw: laneDraw, top: 6, h: 56 },
];
const W = Math.round(240 * SCALE), H = PARTS.reduce((n, p) => n + Math.round(p.h * SCALE) + (p.gap || 0), 0);

/** Every character drawable: printable ASCII, or a Hangul syllable the Korean build's atlas has. */
function drawable(t) {
    let f = null;
    for (const ch of t) {
        const c = ch.codePointAt(0);
        if (c >= 0x20 && c < 0x7f) continue;
        if (c < 0xac00 || c > 0xd7a3) return false;
        if (f === null) { try { f = fonts.get('bold', 34, '가'); } catch (e) { f = false; } }
        if (!f || f.family !== 'korean' || !f.glyphs[c]) return false;
    }
    return true;
}

/** nav.js's turn as Cluster Redline's navigation state, or null when its design has no picture for it. */
function stateOf(m) {
    if (!m) return null;
    let maneuver = null, branchType = null, exitNumber = null;
    const d = String(m.dir || '');
    if (m.kind === 'turn') maneuver = d !== 'NONE' ? d : null;
    else if (m.kind === 'branch') {
        branchType = d;
        maneuver = /LEFT$/.test(d) ? 'SLIGHT_LEFT' : /RIGHT$/.test(d) ? 'SLIGHT_RIGHT' : /STRAIGHT$/.test(d) ? 'STRAIGHT_ON' : null;
    } else if (m.kind === 'roundabout' && m.exit) { maneuver = 'ROUNDABOUT'; exitNumber = m.exit; }
    else if (m.kind === 'keep' && /^(LEFT|RIGHT)$/.test(d)) maneuver = 'KEEP_' + d;
    else if (m.kind === 'lanechange' && /^(LEFT|RIGHT)$/.test(d)) maneuver = 'LANE_' + d;
    else if (m.kind === 'destination') maneuver = 'ARRIVAL_' + (/^(LEFT|RIGHT)$/.test(d) ? d : 'CENTER');
    if (!maneuver || !m.dist) return null;
    const description = typeof m.road === 'string' && m.road && drawable(m.road) ? m.road : '';
    let lanes = null;
    if (m.lanes && Array.isArray(m.lanes.lanes) && m.lanes.lanes.length) {
        lanes = { visible: true, lanes: m.lanes.lanes.map((l) => {
            const dirs = (l.follows || [l.follow]).filter((x) => x && x !== 'NONE');
            return { directions: dirs, other: (l.others || []).filter((x) => x && x !== 'NONE'), highlighted: !!l.hi && l.info !== 'BLOCKED', blocked: l.info === 'BLOCKED' };
        }) };
    }
    return { visible: true, maneuver, branchType, exitNumber, kind: m.kind, distanceText: m.dist + ' ' + (m.unit || ''), description, lanes };
}

/** Everything the picture depends on (the same key: the same picture); '' for nothing to show. */
function key(m) {
    const s = stateOf(m);
    return s ? JSON.stringify([s.maneuver, s.branchType, s.exitNumber, s.distanceText, s.description, s.lanes]) : '';
}

/** Draws the turn into cv (W x H, cleared); false when there is nothing to show. */
function draw(cv, m) {
    cv.clear();
    const s = stateOf(m);
    if (!s) return false;
    let y = 0;
    PARTS.forEach((p) => {
        const h = Math.round(p.h * SCALE);
        const value = p.key === 'lanes' ? (s.lanes ? Object.assign({ color: 'blue' }, s.lanes) : null) : p.key === 'turn' ? Object.assign({ color: 'blue' }, s) : s;
        if (value) {
            // (only its own rows: a junction diagram reaches the bottom of its box)
            const part = p.draw.drawSized(value, W), top = Math.round(p.top * SCALE), rows = Math.min(h, part.h - top);
            if (rows > 0) {
                const cut = new Canvas(W, rows);
                cut.d.set(part.d.subarray(top * part.w * 4, (top + rows) * part.w * 4));
                cv.blit(cut, 0, y);
            }
        }
        y += h + (p.gap || 0);
    });
    return true;
}

module.exports = { W, H, SCALE, stateOf, key, draw, drawable, Canvas };
