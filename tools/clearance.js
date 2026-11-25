'use strict';
/**
 * clearance.js - what a layout's pieces must keep clear of on the glass (see the test in test_engine.js), and a
 * report of every clash: node tools/clearance.js. With --lights it also names the pieces under the KOMBI's turn
 * signal arrows and its warning lights along the glass's sides (layout_common TURN_ARROWS, SIDE_LIGHTS), which
 * the test does not hold the layouts to yet.
 */
const LIGHTS = process.argv.indexOf('--lights') >= 0;
require('./scene');
const path = require('path');
const C0 = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layout_common'));
/** What piece p clashes with. o: the layout's options (Settings > Cluster: M car adds the M KOMBI's two boxes).
 * (A piece marked hairline - JDM 1's thin lines run on to the panel's top, 0.40.4 - may go under the camera cowl and
 * into the rounded corners: they only hide it there, as on a dash under its hood.) */
function clashes(p, o) {
    const c = clashesOf(p, o);
    return p.hairline ? c.filter((x) => x !== 'under the cowl' && x !== 'in a corner') : c;
}
function clashesOf(p, o) {
    const C = C0, out = [];
    // (M's whole-view backdrop, bimmer-lab's, count as backgrounds: over the car's strip their layer
    // ends at it, and the KOMBI's own boxes show over them)
    const isBg = /^bg|^boxBezel$/.test(p.key) || (p.kind === 'flat' && /bg/.test(String(p.colour || p.key))) || /^mdash$/.test(p.kind);
    if (isBg) return out;
    // a band along an arc (u_geo: centre in the layer, radius, thickness): the points of its ink, every 3 degrees
    const g = (p.kind === 'band' || p.kind === 'ring') && p.params && p.params.u_geo, sp = p.params && p.params.u_span;
    if (g && g[2] > 0 && sp) {
        const pts = [];
        const a0 = Math.min(sp[0], sp[1]), a1 = Math.max(sp[0], sp[1]);
        for (let a = a0; a <= a1; a += 3) for (const rr of [g[2] - g[3] / 2, g[2] + g[3] / 2]) {
            const t = a * Math.PI / 180; pts.push([p.x + g[0] + rr * Math.sin(t), p.y + g[1] - rr * Math.cos(t)]);
        }
        const inB = (b) => pts.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
        if (inB(C.NOTCH)) out.push('under the cowl');
        if (!C.strip(o) && inB(C.GEARBOX_HOLE)) out.push('in the gear box');
        if (!C.strip(o) && inB(C.EDRIVE_HOLE)) out.push('under the eDrive box');
        if (C.strip(o) && pts.some(([, y]) => y > C.STRIP_Y)) out.push('over the strip');
        if (C.mCar(o) && C.M_HOLES.some(inB)) out.push('in an M box');
        if (inB(C.TELLTALES)) out.push('over the warning lights');
        if (LIGHTS && C.TURN_ARROWS.some(inB)) out.push('under a turn arrow');
        if (LIGHTS && C.SIDE_LIGHTS.some(inB)) out.push('under a side warning light');
        if (pts.some(([x, y]) => C.inCorner(x, y))) out.push('in a corner');
        return out;
    }
    // JDM 1's rev bar (RTACH_FS): the points of its ink, every 6 px along it, from inside the bar out to its ticks (its
    // geometry in design px from u_off, drawn u_k times; its lines under and over it are hairlines, as the panel's)
    if (p.kind === 'rtach' && p.params && p.params.u_geo && !p.hairline) {
        const [gx, gy, R, a0d] = p.params.u_geo, [xe, T] = p.params.u_geo2, [ox, oy] = p.params.u_off, k = (p.params.u_k || [1])[0];
        const a0 = a0d * Math.PI / 180, arcL = -a0 * R, L = arcL + (xe - gx), pts = [];
        for (let sAt = 0; sAt <= L; sAt += 6) for (const off of [-T / 2, T / 2 + 4 + 18]) {
            const q = sAt >= arcL ? [gx + (sAt - arcL), gy - R - off] : ((a) => [gx + Math.sin(a) * (R + off), gy - Math.cos(a) * (R + off)])(a0 + sAt / R);
            pts.push([p.x + (q[0] - ox) * k, p.y + (q[1] - oy) * k]);
        }
        const inB = (b) => pts.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
        if (inB(C.NOTCH)) out.push('under the cowl');
        if (C.strip(o) && pts.some(([, y]) => y > C.STRIP_Y)) out.push('over the strip');
        if (inB(C.TELLTALES)) out.push('over the warning lights');
        if (LIGHTS && C.TURN_ARROWS.some(inB)) out.push('under a turn arrow');
        if (LIGHTS && C.SIDE_LIGHTS.some(inB)) out.push('under a side warning light');
        if (pts.some(([x, y]) => C.inCorner(x, y))) out.push('in a corner');
        if (o && o.centre === 'map' && inB(C.MAP)) out.push('over the map');
        return out;
    }
    // a cup (JDM 1's, CUP_FS): the points of its outline - its rim's and bottom's ellipses and its sides - every 6 degrees
    if (p.kind === 'cup' && p.params && p.params.u_cup) {
        const [cx, ry, aR, aB] = p.params.u_cup, [H, e] = p.params.u_cup2, pts = [];
        for (let a = 0; a < 360; a += 6) {
            const t = a * Math.PI / 180;
            pts.push([p.x + cx + (aR + 1) * Math.cos(t), p.y + ry + e * (aR + 1) * Math.sin(t)], [p.x + cx + (aB + 1) * Math.cos(t), p.y + ry + H + e * (aB + 1) * Math.sin(t)]);
        }
        const inB = (b) => pts.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
        if (inB(C.NOTCH)) out.push('under the cowl');
        if (C.strip(o) && pts.some(([, y]) => y > C.STRIP_Y)) out.push('over the strip');
        if (inB(C.TELLTALES)) out.push('over the warning lights');
        if (LIGHTS && C.TURN_ARROWS.some(inB)) out.push('under a turn arrow');
        if (LIGHTS && C.SIDE_LIGHTS.some(inB)) out.push('under a side warning light');
        if (pts.some(([x, y]) => C.inCorner(x, y))) out.push('in a corner');
        return out;
    }
    const round = p.kind === 'dial' || p.kind === 'e9x' || p.kind === 'aclock' || p.kind === 'rmdial' || (p.kind === 'jdm' && p.params && p.params.u_mode[0] > 0) || (p.kind === 'mround' && p.params && p.params.u_mode[0] < 1.5);
    // (Retro M's dials: round at u_c in their layer, to their outer ring; the panel's plastic round them a background)
    const rm = p.kind === 'rmdial' && p.params && p.params.u_c && p.params.u_rings;
    const cx = rm ? p.x + p.params.u_c[0] : p.x + p.w / 2, cy = rm ? p.y + p.params.u_c[1] : p.y + p.h / 2, r = rm ? p.params.u_rings[2] + 6 : Math.min(p.w, p.h) / 2;
    const hit = (b) => (round
        ? (() => { const nx = Math.max(b.x, Math.min(cx, b.x + b.w)), ny = Math.max(b.y, Math.min(cy, b.y + b.h)); return (nx - cx) ** 2 + (ny - cy) ** 2 < (r - 6) ** 2; })()
        : p.x < b.x + b.w && p.x + p.w > b.x && p.y < b.y + b.h && p.y + p.h > b.y);
    if (hit(C.NOTCH)) out.push('under the cowl');
    // with the car's own bottom strip the KOMBI shows neither box (layout_common.STRIP_Y)
    if (!C.strip(o) && hit(C.GEARBOX_HOLE)) out.push('in the gear box');
    if (!C.strip(o) && hit(C.EDRIVE_HOLE)) out.push('under the eDrive box');
    if (C.strip(o) && !round && p.y + p.h > C.STRIP_Y) out.push('over the strip');
    if (C.strip(o) && round && cy + r - 6 > C.STRIP_Y + 4) out.push('over the strip');
    if (C.mCar(o) && C.M_HOLES.some(hit)) out.push('in an M box');
    if (hit(C.TELLTALES)) out.push('over the warning lights');
    if (LIGHTS && C.TURN_ARROWS.some(hit)) out.push('under a turn arrow');
    if (LIGHTS && C.SIDE_LIGHTS.some(hit)) out.push('under a side warning light');
    const pts = round ? [[cx - r * 0.7, cy - r * 0.7], [cx + r * 0.7, cy - r * 0.7], [cx, cy - r]] : [[p.x, p.y], [p.x + p.w, p.y]];
    if (pts.some(([x, y]) => C.inCorner(x, y))) out.push('in a corner');
    return out;
}
module.exports = { clashes };

if (require.main === module) {
    const { LAYOUTS } = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layouts'));
    let n = 0;
    LAYOUTS.forEach((L) => ['info', 'map', 'stock'].forEach((centre) => ['phev', 'ice'].forEach((vehicle) => [['standard', 'stock']].forEach(([cluster, bottomStrip]) => {
        const o = { speedUnit: 'mph', tempUnit: 'f', centre, redline: 7000, rpmMax: 8000, vehicle, cluster, bottomStrip };
        L.pieces(o).forEach((p) => {
            const c = clashes(p, o);
            if (c.length) { n++; console.log(L.id + ' ' + centre + ' ' + vehicle + ' ' + cluster + (bottomStrip === 'stock' ? ' strip' : '') + ': ' + p.key + ' (' + p.kind + ' ' + [p.x, p.y, p.w, p.h].map(Math.round).join(',') + ') ' + c.join(', ')); }
        });
    }))));
    console.log(n ? n + ' clashes' : 'all clear');
}
