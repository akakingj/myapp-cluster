'use strict';
/**
 * menu.js - the page's layout picker (0.29.0): each layout's picture, made beforehand with demo readings
 * (tools/make_previews.py: previews.wad, 600 x 225 deflated RGB a layout, with its own bottom strip and with the
 * car's: Settings > Bottom strip picks which, 0.29.1), large for the one chosen and small on
 * a row of cards to tap; and the list a readout's value is picked from (a sheet over the page).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PW = 600, PH = 225;           // the large picture (previews.wad's size)
const TW = 216, TH = 81;            // a card's

/** The pictures in previews.wad: { has(id), big(id, strip), thumb(id, strip) } (RGBA buffers, made once each; null if
 * none). strip: with the car's own bottom strip (a file without that one: the layout's). */
function loadPreviews(dir, log) {
    let head = { list: [] }, buf = null, data = 0;
    try {
        buf = fs.readFileSync(path.join(dir || __dirname, 'previews.wad'));
        if (buf.slice(0, 4).toString() !== 'LPV1') throw new Error('not a previews file');
        const hl = buf.readUInt32LE(4);
        head = JSON.parse(buf.slice(8, 8 + hl).toString());
        data = 8 + hl;
    } catch (e) { if (log) log.warn('previews: ' + e.message); buf = null; }
    const rgbOf = (id, strip) => {
        const want = strip ? 1 : 0;
        const e = buf && (head.list.find((x) => x.id === id && (x.strip || 0) === want) || head.list.find((x) => x.id === id));
        if (!e) return null;
        try { return zlib.inflateSync(buf.slice(data + e.off, data + e.off + e.len)); } catch (err) { if (log) log.warn('preview ' + id + ': ' + err.message); return null; }
    };
    const bigs = {}, thumbs = {};
    return {
        has: (id) => !!(buf && head.list.some((x) => x.id === id)),
        /** The large picture of layout id, RGBA PW x PH. */
        big(id, strip) {
            const key = id + (strip ? ':strip' : '');
            if (bigs[key] !== undefined) return bigs[key];
            const rgb = rgbOf(id, strip);
            let out = null;
            if (rgb) { out = Buffer.alloc(PW * PH * 4); for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { out[j] = rgb[i]; out[j + 1] = rgb[i + 1]; out[j + 2] = rgb[i + 2]; out[j + 3] = 255; } }
            // (only the last two large ones kept: 540 KB each)
            const keys = Object.keys(bigs);
            if (keys.length >= 2) delete bigs[keys[0]];
            bigs[key] = out;
            return out;
        },
        /** The card's picture of layout id, RGBA TW x TH (each pixel the average of the large one's under it). */
        thumb(id, strip) {
            const key = id + (strip ? ':strip' : '');
            if (thumbs[key] !== undefined) return thumbs[key];
            const rgb = rgbOf(id, strip);
            let out = null;
            if (rgb) {
                out = Buffer.alloc(TW * TH * 4);
                const fx = PW / TW, fy = PH / TH;
                for (let y = 0; y < TH; y++) {
                    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
                    for (let x = 0; x < TW; x++) {
                        const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
                        let r = 0, g = 0, b = 0, n = 0;
                        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const k = (yy * PW + xx) * 3; r += rgb[k]; g += rgb[k + 1]; b += rgb[k + 2]; n++; }
                        const o = (y * TW + x) * 4;
                        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
                    }
                }
            }
            thumbs[key] = out;
            return out;
        },
    };
}

/**
 * A sheet listing values to pick one from (kit/sheet.js's rows): title, heading, options [[value, label]], current,
 * pick(value). Tapping one (or pressing the controller on it) picks it and closes the sheet.
 */
function pickSheet(S, title, heading, options, current, pick) {
    const sh = {
        title: title,
        focus: Math.max(0, options.findIndex((o) => o[0] === current)),
        controller: false,
        draw(r, t) {
            r.clear(t.bg);
            r.text(heading, 44, S.TOP + 40, 32, t.text, { font: 'bold' });
            const targets = [];
            const bw = 150, bx = 1600 - 40 - bw, by = S.TOP + 8;
            S.pill(r, t, bx, by, bw, 46, 'Back', this.controller && this.focus === -1);
            targets.push({ x: bx - 10, y: by - 6, w: bw + 20, h: 58, act: () => 'close' });
            const rows = options.map((o) => ({ label: o[1], kind: 'radio', on: o[0] === current }));
            S.list(r, t, 'pick_' + heading, rows, Math.max(0, this.focus), S.TOP + 74, this.controller)
                .forEach((q) => targets.push(Object.assign(q, { act: () => { this.focus = q.i; return this.choose(); } })));
            return targets;
        },
        choose() {
            const o = options[this.focus];
            if (o) pick(o[0]);
            return 'close';
        },
        move(d) { this.controller = true; this.focus = Math.max(-1, Math.min(options.length - 1, this.focus + d)); },
        press() { this.controller = true; return this.focus === -1 ? 'close' : this.choose(); },
        back() { return 'close'; },
        top() { return this.focus === -1; },
        scroll(dy) { const st = S.list.scroll['pick_' + heading]; if (st) { st.y += dy; st.drag = true; } },
        release() { const st = S.list.scroll['pick_' + heading]; if (st) st.drag = false; },
    };
    return sh;
}

module.exports = { loadPreviews, pickSheet, PW, PH, TW, TH };
