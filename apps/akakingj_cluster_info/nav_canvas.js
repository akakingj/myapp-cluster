'use strict';
/*
 * The canvas the directions are drawn on (nav_draw.js, lane_draw.js, nav_text.js): the kit's, with Cluster Redline's
 * sharper small text (jaimeen77's Cluster Redline 1.3.9, apps/cluster_redline/crisp-text.js at 07d7925, MIT licence:
 * LICENSE-MIT in this repository) on this subclass only, so the panel's text stays as it is.
 *
 * The kit bakes Korean glyphs at one size (36 px, regular weight) and scales them bilinearly; below half size that
 * skips source pixels and breaks thin strokes. A glyph drawn smaller is area-averaged instead, and Korean text asking
 * for the bold face is thickened (the Korean atlas has no bold weight).
 */
const Kit = require('./kit/canvas');

const KOREAN = /[ᄀ-ᇿ㄰-㆏가-힣]/;

class Canvas extends Kit.Canvas {
    _blit(f, gx, gy, gw, gh, dx, dy, scale, c) {
        if (!(scale < 0.95)) return super._blit(f, gx, gy, gw, gh, dx, dy, scale, c);
        const A = f.alpha, AW = f.atlasW, inv = 1 / scale, norm = scale * scale;
        const py0 = Math.max(0, Math.floor(dy)), py1 = Math.min(this.h, Math.ceil(dy + gh * scale));
        const px0 = Math.max(0, Math.floor(dx)), px1 = Math.min(this.w, Math.ceil(dx + gw * scale));
        for (let py = py0; py < py1; py++) {
            const y0 = (py - dy) * inv, y1 = y0 + inv, sy0 = Math.max(0, Math.floor(y0)), sy1 = Math.min(gh, Math.ceil(y1));
            for (let px = px0; px < px1; px++) {
                const x0 = (px - dx) * inv, x1 = x0 + inv, sx0 = Math.max(0, Math.floor(x0)), sx1 = Math.min(gw, Math.ceil(x1));
                let sum = 0;
                for (let sy = sy0; sy < sy1; sy++) {
                    const wy = Math.min(y1, sy + 1) - Math.max(y0, sy), row = (gy + sy) * AW + gx;
                    for (let sx = sx0; sx < sx1; sx++) sum += A[row + sx] * wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
                }
                const v = sum * norm;
                if (v > 0) this._blend(px, py, c, v >= 255 ? 1 : v / 255);
            }
        }
        return undefined;
    }
    text(str, x, y, size, c, opts) {
        const w = super.text(str, x, y, size, c, opts);
        if (opts && opts.font === 'bold' && KOREAN.test(String(str))) super.text(str, x + Math.max(0.5, size * 0.045), y, size, c, opts);
        return w;
    }
}

module.exports = { Canvas, KOREAN, withAlpha: Kit.withAlpha };
