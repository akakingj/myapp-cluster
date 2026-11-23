'use strict';
/**
 * custom.js - Custom 1, 2 and 3 (layout_custom1-3.js): layouts made in the layout editor of the MGU demo (myapp-id7's
 * demo/, "레이아웃 편집"), kept as data, drawn with the pieces every layout here uses (layout_common: the dials,
 * readouts, bars, boxes; the Car profile's units, red zone and temperature colours with them). Only the kinds and
 * shaders the layouts already run on the car: nothing new reaches the KOMBI.
 *
 * Where a design comes from, the newest first:
 *   - custom_layouts.json in the app's data folder (the demo writes it while you edit; later a USB stick), and
 *   - custom_layouts.js next to this file (the designs shipped with the app: the repository's).
 * A design that is missing or broken draws a plain layout saying so: never an error that stops the app.
 *
 * A design (version 1):
 *   { v: 1, slot: 1, title, font: 'bold' | 'light' | 'wide' | 'orb', colors: { role: '#rrggbb' }, looks: { sport: {...}, efficient: {...} },
 *     pieces: [ { type, x, y, w, h, ... } ] }   (layout px: the panel is 1920 x 720, the car's strip from y 646)
 *   type 'dial'    a round gauge in the box (x, y, w = h): src 'speed' | 'rpm' | a small gauge's reading (layout_common.GAUGES:
 *                  coolant, oil, boost, ...); numerals (speed / rpm), arc [from, to] degrees from twelve o'clock
 *   type 'readout' a reading's figures: src 'speed' | 'rpm' | 'gear' | 'outside' | a readout (layout_common.READOUTS); unit,
 *                  name ('none' | 'short' | 'long': in front), color (a role or '#rrggbb'), align 0..1; rpmColors: the
 *                  engine speed yellow and red at Settings > Yellow / Red light
 *   type 'label'   fixed text: text, color, align, tracking
 *   type 'bar'     a straight bar filling with src (speed, rpm or a readout's 0..1), segments, fill / track colours
 *   type 'box'     a panel: fill (top, bottom), edge, radius, border
 *   type 'line'    a flat rectangle in one colour
 */
const fs = require('fs');
const path = require('path');
const C = require('./layout_common');

const MAX_PIECES = 36;          // (with the background, the strip's band and the sweep: well under the service's 60 layers)
const FONTS = ['bold', 'light', 'wide', 'orb'];
/** the colours a design sets (its roles), and what they are when it doesn't */
const BASE = {
    bg: '#000000', text: '#f2f3f4', dim: '#9ea3a9', glow: '#d8e2ec', accent: '#ff8a2a', red: '#f0301c', track: '#1a1b1d', ev: '#4ab4ff',
    face0: '#121314', face1: '#030303', bezel: '#eef0f2', bezel2: '#4a4d52', tick: '#ffffff', minor: '#a4a8ad', num: '#f4f5f6', needle: '#f6f6f4', hub: '#1b1c1e',
    boxTop: '#0b0b0c', boxBottom: '#040404', boxEdge: '#3c3f44', line: '#3c3f44', yellow: '#ffc83d',
};
const ROLES = Object.keys(BASE);
const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
const num = (v, lo, hi, d) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max || 40) : '');

/* ---------------- the designs ---------------- */
let shipped = [];
try { shipped = require('./custom_layouts'); } catch (e) { shipped = []; }
let dataFile = null, fileDesigns = [], fileStamp = '';
/** The app's data folder (main.js, at start): its custom_layouts.json is read, and read again when it changes. */
function useDataDir(dir) { dataFile = dir ? path.join(dir, 'custom_layouts.json') : null; reload(); }
/** Read the data folder's designs again if the file changed; true when it did. */
function reload() {
    if (!dataFile) return false;
    let st = null;
    try { st = fs.statSync(dataFile); } catch (e) { st = null; }
    const stamp = st ? st.mtimeMs + ':' + st.size : '';
    if (stamp === fileStamp) return false;
    fileStamp = stamp;
    try { const j = st ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : []; fileDesigns = Array.isArray(j) ? j : Array.isArray(j.layouts) ? j.layouts : [j]; } catch (e) { fileDesigns = []; }
    return true;
}
const designOf = (slot) => {
    const ok = (d) => d && typeof d === 'object' && Number(d.slot) === slot && Array.isArray(d.pieces);
    return fileDesigns.find(ok) || (Array.isArray(shipped) ? shipped.find(ok) : null) || null;
};

/* ---------------- colours ---------------- */
function paletteOf(design, lookId) {
    const out = Object.assign({}, BASE);
    const put = (src) => { if (src && typeof src === 'object') ROLES.forEach((k) => { if (isHex(src[k])) out[k] = src[k]; }); };
    put(design && design.colors);
    if (design && design.looks && lookId) put(design.looks[lookId]);
    return out;
}
/** a piece's colour: a role of the palette, or its own '#rrggbb' */
const colourOf = (t, c, dflt) => (isHex(c) ? c : t[c] || t[dflt] || '#ffffff');
const dialColours = (t) => ({ face0: t.face0, face1: t.face1, bezel: t.bezel, bezel2: t.bezel2, tick: t.tick, minor: t.minor, num: t.num, red: t.red, needle: t.needle, hub: t.hub, accent: t.accent, glow: t.glow });
const textColours = (c, glow) => (t) => { const k = colourOf(t, c, 'text'); return { color: [k, 1], glow: [t.glow, glow] }; };

/* ---------------- what a source reads ---------------- */
/** the engine speed's level: 0, 1 yellow (Settings > Yellow light at), 2 red (the red zone) */
function rpmLevel(o, d) {
    if (!C.isNum(d.rpm) || d.engineOn === false) return 0;
    const red = C.shiftPoint(o, d).red, yellow = Math.min(C.yellowAt(o, d), red);
    return d.rpm >= red ? 2 : d.rpm >= yellow ? 1 : 0;
}
const rpmNum = (d) => (d.engineOn === false ? 'OFF' : C.isNum(d.rpm) ? String(C.rpmShown(d)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--');
/** A readout's text: { text(d), tone } for src, with its unit and name as the piece asks. */
function readoutText(o, p) {
    const unit = p.unit !== false, name = p.name === 'short' || p.name === 'long' ? p.name : 'none';
    if (p.src === 'speed') return { text: (d) => C.speedText(o, d) + (unit ? ' ' + C.speedUnit(o) : '') };
    if (p.src === 'rpm') return { text: (d) => rpmNum(d) + (unit ? ' rpm' : '') };
    if (p.src === 'gear') return { text: C.gearText };
    if (p.src === 'outside') return { text: (d) => (unit ? C.outsideText(o, d.outside) : C.tempText(o, d.outside)) };
    const r = C.placeReadout(o, C.READOUTS[p.src] ? p.src : 'oil');
    const label = name === 'long' ? r.label : name === 'short' ? r.short : '';
    return { text: (d) => (label ? label + ' ' : '') + (unit ? r.value(d) : r.num(d)), tone: r.tone };
}
/** A source as 0..1 (bars) */
function fracOf(o, src) {
    if (src === 'speed') { const s = C.speedScale(o); return (d) => (C.isNum(d.speed) ? Math.max(0, Math.min(1, C.speedIn(o, d.speed) / s.max)) : 0); }
    if (src === 'rpm') { const s = C.rpmScale(o); return (d) => (C.isNum(d.rpm) ? Math.max(0, Math.min(1, d.rpm / 1000 / s.max)) : 0); }
    const r = C.READOUTS[src] || C.READOUTS.boost;
    return (d) => { const v = r.frac(d); return C.isNum(v) ? Math.max(0, Math.min(1, v)) : 0; };
}

/* ---------------- the pieces ---------------- */
function dial(o, p, key) {
    const size = num(p.w, 60, 720, 400), x = num(p.x, 0, 1920 - size, 0), y = num(p.y, 0, 720 - size, 0), k = size / 640;
    const a0 = num(p.arc && p.arc[0], -180, 0, -135), a1 = num(p.arc && p.arc[1], 0, 180, 135);
    if (p.src === 'speed' || p.src === 'rpm') {
        const speed = p.src === 'speed', s = speed ? C.speedScale(o) : C.rpmScale(o), red = speed ? s.max + 1 : s.red;
        const numerals = p.numerals !== false, dense = speed && o.speedUnit === 'kmh';
        return [{
            key, kind: 'dial', x, y, w: size, h: size,
            params: { u_scale: [s.max, s.major, s.minor, red], u_arc: [a0, a1, numerals ? Math.round((dense ? 33 : 40) * k + 2) : 0, numerals ? (dense ? 226 : 218) * k : 0],
                u_needle_dim: [290 * k, 56 * k, 14 * k, 4], u_look: [0.22, 1, 0, 0], u_look2: [p.bezel === false ? 0 : Math.round(20 * k), k, 0.9, 1] },
            colors: dialColours, max: s.max, sweep: true,
            value: speed ? (d) => (C.isNum(d.speed) ? C.speedIn(o, d.speed) : 0) : (d) => (C.isNum(d.rpm) ? d.rpm / 1000 : 0),
            dyn: speed ? undefined : (d) => ({ u_scale: [s.max, s.major, s.minor, Math.min(red, C.shiftPoint(o, d).red / 1000)] }),
        }];
    }
    // a small gauge's reading: its scale 0..100 with its red zone (a temperature's from the Car profile's too hot)
    const g = C.placeGauge(o, p.src), ch = C.chOf(o, g.key);
    return [{
        key, kind: 'dial', x, y, w: size, h: size,
        params: { u_scale: [100, 50, 12.5, ch ? C.chRed(o, ch) * 100 : Math.min(101, g.redFrac * 100)], u_arc: [a0, a1, 0, 0], u_needle_dim: [size * 0.37, size * 0.09, Math.max(4, size * 0.03), 2],
            u_look: [0.2, 1, 0, 0], u_look2: [p.bezel === false ? 0 : Math.max(5, Math.round(size * 0.055)), k, 0.6, 0.7] },
        colors: dialColours, value: ch ? (d) => C.chFrac(ch, d[ch]) * 100 : (d) => g.frac(d) * 100, max: 100, sweep: true,
    }];
}
function piecesOf(o, design) {
    const out = [];
    (design.pieces || []).slice(0, MAX_PIECES).forEach((p, i) => {
        if (!p || typeof p !== 'object') return;
        const key = 'c' + i + '_' + str(p.type, 8);
        // (inside the panel, always: a layer past its edge is refused)
        const w = num(p.w, 1, 1920, 100), h = num(p.h, 1, 720, 40), x = num(p.x, 0, 1920 - w, 0), y = num(p.y, 0, 720 - h, 0);
        if (p.type === 'dial') out.push(...dial(o, p, key));
        else if (p.type === 'readout') {
            const r = readoutText(o, p), base = textColours(p.color || 'text', num(p.glow, 0, 1, 0.25));
            const colors = p.src === 'rpm' && p.rpmColors !== false ? (t, d) => { const l = rpmLevel(o, d), c = l === 2 ? t.red : l === 1 ? t.yellow : null; return c ? { color: [c, 1], glow: [c, 0.5] } : base(t); }
                : p.src === 'gear' ? (t, d) => (C.gearText(d) === 'R' ? { color: [t.red, 1], glow: [t.red, 0.3] } : base(t)) : base;
            out.push(Object.assign(C.text(key, x, y, w, h, r.text, colors, { align: num(p.align, 0, 1, 0.5), tracking: num(p.tracking, -0.2, 1, 0) }), r.tone ? { tone: r.tone } : {}));
        } else if (p.type === 'label') {
            out.push(C.text(key, x, y, w, h, str(p.text, 40) || ' ', textColours(p.color || 'dim', num(p.glow, 0, 1, 0.1)), { align: num(p.align, 0, 1, 0.5), tracking: num(p.tracking, -0.2, 1, 0.1) }));
        } else if (p.type === 'bar') {
            const f = fracOf(o, p.src), fill = p.fill || 'accent', track = p.track || 'track';
            out.push(C.bar(key, x, y, w, h, f, (t) => ({ track: colourOf(t, track, 'track'), fill0: colourOf(t, fill, 'accent'), fill1: colourOf(t, p.fill2 || fill, 'accent'), redc: t.red, tip: t.glow, tick: t.dim, num: t.num }), Math.round(num(p.segments, 0, 60, 0))));
        } else if (p.type === 'box') {
            const top = p.fill || 'boxTop', bottom = p.fill2 || p.fill || 'boxBottom', edge = p.edge || 'boxEdge';
            out.push({ key, kind: 'panel', x, y, w, h, params: { u_box: [num(p.radius, 0, 200, 12), num(p.border, 0, 12, 1.5), 0, 1] },
                colors: (t) => ({ top: colourOf(t, top, 'boxTop'), bottom: colourOf(t, bottom, 'boxBottom'), border: colourOf(t, edge, 'boxEdge') }) });
        } else if (p.type === 'line') {
            const c = p.color || 'line';
            out.push(C.flat(key, x, y, w, h, (t) => colourOf(t, c, 'line')));
        }
    });
    return out;
}
/** an empty slot: the background and a line saying where its layout comes from */
function empty(slot) {
    return [C.text('cEmpty', 460, 300, 1000, 44, 'CUSTOM ' + slot, (t) => ({ color: [t.text, 1], glow: [t.glow, 0.2] }), { tracking: 0.2 }),
        C.text('cEmpty2', 360, 370, 1200, 28, 'MAKE IT IN THE MGU DEMO: LAYOUT EDITOR', (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] }), { tracking: 0.12 })];
}

/** Custom `slot`'s layout module (layouts.js: as any layout_*.js). */
function layout(slot) {
    const d = () => designOf(slot);
    return {
        id: 'custom' + slot,
        get title() { const x = d(); return (x && str(x.title, 24)) || 'Custom ' + slot; },
        get font() { const x = d(); return x && FONTS.indexOf(x.font) >= 0 ? x.font : 'bold'; },
        custom: true,
        // (its readouts are its own: no places on the page, no strip gauges added, no second gear filtered out)
        places: [],
        ownStripGauges: true,
        stripGear: true,
        speedGauge: false,
        palette: (lookId) => paletteOf(d(), lookId),
        gearText: C.gearText,
        needs: () => { const x = d(); const n = []; ((x && x.pieces) || []).forEach((p) => { const r = p && C.READOUTS[p.src]; if (r && r.needs) n.push(...r.needs); }); return n; },
        pieces(o) {
            const x = d();
            const bg = { key: 'bg', kind: 'flat', x: 0, y: 0, w: 1920, h: 720, colors: (t) => ({ color: [t.bg, 1] }) };
            if (!x) return [bg].concat(empty(slot));
            try { return [bg].concat(piecesOf(o, x)); } catch (e) { return [bg].concat(empty(slot)); }
        },
    };
}

module.exports = { layout, useDataDir, reload, designOf, paletteOf, BASE, ROLES, MAX_PIECES, FONTS };
