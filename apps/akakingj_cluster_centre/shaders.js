'use strict';
/**
 * shaders.js - the GLSL ES 1.00 fragment shaders the instrument cluster runs to draw a layout.
 *
 * The cluster render service publishes a RAMSES scene; the KOMBI's own renderer subscribes to it and draws
 * it on the cluster's GPU. So nothing here is drawn on the head unit and no picture is sent: each piece of
 * a layout is an effect layer (one of these shaders over a rectangle), and what changes while driving is a
 * uniform (a needle's value: one number) or a few glyph codes. The only pixels ever sent are the glyph
 * atlas (font.js), once.
 *
 * Coordinates: v_uv runs 0..1 from the layer's top-left (the service's quad vertex shader); the shaders work
 * in the layer's pixels (u_size). Angles are degrees clockwise from 12 o'clock. The glyph atlas holds signed
 * distance fields (0.5 at the outline), so numerals stay sharp at any size and can glow.
 *
 * Kinds (engine.js makes the layers): FLAT a colour; PANEL a rounded card with a gradient and an edge; DIAL a
 * round dial with its needle; BAND a gauge along an arc of a circle (segmented or solid); CHEVRON a gauge along
 * two straight segments; TEXT a line of glyphs.
 */

const HIGHP = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

const COMMON = `
const float DEG = 0.017453293;
/* 1 inside a..b, with a pixel's soft edge */
float span(float x, float a, float b) { return clamp(x - a + 0.5, 0.0, 1.0) * clamp(b - x + 0.5, 0.0, 1.0); }
/* straight-alpha "over": c at coverage a over acc */
vec4 over(vec4 acc, vec3 c, float a) {
    float oa = a + acc.a * (1.0 - a);
    if (oa <= 0.0) return vec4(0.0);
    return vec4((c * a + acc.rgb * acc.a * (1.0 - a)) / oa, oa);
}
`;

/* Glyph lookup: code (cell) and a point in its box (g.x glyph heights from its centre line, g.y 0..1 from
 * the top) -> the distance field value, 0 outside the glyph's cell. */
const GLYPH = `
uniform sampler2D u_font;
uniform vec3 u_font_cells;        /* cells a row, a cell's width in glyph heights, rows */
float sdf(float code, vec2 g) {
    float u = 0.5 + g.x / u_font_cells.y;
    if (code < 0.0 || u < 0.0 || u > 1.0 || g.y < 0.0 || g.y > 1.0) return 0.0;
    float row = floor(code / u_font_cells.x + 0.001), col = code - row * u_font_cells.x;
    return texture2D(u_font, vec2((col + u) / u_font_cells.x, (row + g.y) / u_font_cells.z)).r;
}
/* a number's digit i (0 = leftmost) of n digits */
float digitOf(float v, float i, float n) {
    float p = n - 1.0 - i;
    float div = p < 0.5 ? 1.0 : p < 1.5 ? 10.0 : 100.0;
    return mod(floor(v / div + 0.001), 10.0);
}
`;
/* NUMERAL: the dials' numerals' place (after GLYPH, in the dial programs only - not the texts': each piece sends its
 * own program, a text's some 30 times a layout, against the 600 KB start-up; so no comments in the GLSL either)
 *   figuresOf(v): how many figures v has (up to three)
 *   numeralIn(dir, n, adv, h): how far a numeral's centre goes in from its ring (dir: the unit direction out from the
 *     dial's centre; n figures of advance adv, the cell h tall) so the side of its box towards the ticks keeps the gap
 *     twelve o'clock's has: its half width along dir's sideways part, less what its half height there gives back (the
 *     figures' ink about 0.6 h tall) - a wide '220' at three o'clock in from its tick, a '4' at twelve where it was.
 *     Only for the narrow faces (IBM Plex: a figure 0.5 wide): the wide ones' layouts - JDM 1's Michroma, 0.88 - are
 *     drawn for their own figures, kept as they are. */
const NUMERAL = `
float figuresOf(float v) { return v >= 99.5 ? 3.0 : v >= 9.5 ? 2.0 : 1.0; }
float numeralIn(vec2 dir, float n, float adv, float h) { return adv > 0.6 ? 0.0 : max(0.0, abs(dir.x) * n * adv * 0.5 - (1.0 - abs(dir.y)) * 0.3) * h; }
`;

/** A flat colour over the layer. */
const FLAT_FS = `#version 100
precision mediump float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

/**
 * A rounded card of glass: a vertical gradient, a faint diagonal sheen, a light along its top edge, a border
 * brighter at the top than the bottom, and a soft shadow inside its lower edge.
 *   u_box     corner radius, border width, top light (0..1), opacity
 */
const PANEL_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_box;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_border;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size, h = u_size * 0.5, q = abs(p - h) - (h - u_box.x);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_box.x;   /* < 0 inside */
    float inside = clamp(0.5 - dist, 0.0, 1.0);
    if (inside <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec3 col = mix(u_top, u_bottom, v_uv.y);
    col += vec3(1.0) * 0.022 * u_box.z * smoothstep(0.55, 0.0, abs(v_uv.x - v_uv.y * 0.6 - 0.15));
    col += u_border * u_box.z * 0.45 * clamp(1.0 - p.y / 22.0, 0.0, 1.0);
    col *= 1.0 - 0.25 * u_box.z * smoothstep(0.75, 1.0, v_uv.y);
    vec3 edge = mix(u_border * 1.7, u_border * 0.6, v_uv.y);
    col = mix(col, edge, clamp(dist + u_box.y + 0.5, 0.0, 1.0) * (u_box.y > 0.0 ? 1.0 : 0.0));
    gl_FragColor = vec4(col, inside * u_box.w);
}`;

/**
 * A round dial with its needle, all in one square quad: the face (shaded, with depth near the rim), a
 * metal bezel, an optional value arc (a lit band from the start to the needle), the red zone, minor and
 * major ticks, numerals at the major ticks (digits from the atlas), a backlight glow round the markings, the
 * needle with its shadow and glow, the hub and a faint glass reflection.
 *   u_scale   max, major step, minor step, red zone start (>= max: none)
 *   u_min     the scale's start (0 unless set; below 0: a power gauge's regeneration, from u_zero of the sweep
 *             down to its start, its zone in u_regen, marks at its half and quarters, no numerals there)
 *   u_zero    where 0 sits along the sweep (0..1) while u_min is below 0: each side on its own scale
 *   u_arc     start and end angle, numeral height px (0: none), numeral radius px
 *   u_needle_dim  length, tail, width at the hub, width at the tip (px)
 *   u_look    backlight glow 0..1, metal 0..1, value arc 0/1, value arc radius (px from the face's edge in)
 *   u_look2   bezel width px, size scale (1 for a 640 px dial: ticks and hub scale with it), needle
 *             shadow 0..1, glass 0..1
 *   u_value   the reading on the scale
 */
const DIAL_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}${NUMERAL}
uniform vec2 u_size;
uniform vec4 u_scale;
uniform float u_min;
uniform float u_zero;
uniform vec3 u_regen;
uniform vec4 u_arc;
uniform vec4 u_needle_dim;
uniform vec4 u_look;
uniform vec4 u_look2;
uniform float u_value;
uniform float u_digit_adv;
uniform vec3 u_face0;
uniform vec3 u_face1;
uniform vec3 u_bezel;
uniform vec3 u_bezel2;
uniform vec3 u_tick;
uniform vec3 u_minor;
uniform vec3 u_num;
uniform vec3 u_red;
uniform vec3 u_needle;
uniform vec3 u_hub;
uniform vec3 u_accent;
uniform vec3 u_glow;
varying vec2 v_uv;

float zeroAt() { return u_min < 0.0 ? clamp(u_zero, 0.05, 0.95) : 0.0; }
/* the place along the sweep (0..1) of value v: 0 at zeroAt(), the scale's end at 1, its start (u_min) at 0 */
float fracOf(float v) { float z = zeroAt(); return v >= 0.0 ? z + (1.0 - z) * v / u_scale.x : z * (1.0 - v / u_min); }
float angleOf(float v) { return mix(u_arc.x, u_arc.y, clamp(fracOf(v), 0.0, 1.0)); }
/* a radial tick at value v: r0..r1, half width hw; soft adds a glow falloff that wide */
float tick(float v, float ang, float r, float r0, float r1, float hw, float soft) {
    float off = abs(ang - angleOf(v)) * DEG * r;
    float a = soft > 0.0 ? clamp((hw + soft - off) / soft, 0.0, 1.0) : clamp(hw - off + 0.5, 0.0, 1.0);
    return a * span(r, r0 - soft, r1 + soft);
}
/* the needle's blade at offset d from the pivot: coverage (soft: a blurred edge that wide) */
float blade(vec2 d, float soft) {
    float na = angleOf(u_value) * DEG;
    vec2 dir = vec2(sin(na), -cos(na)), perp = vec2(cos(na), sin(na));
    float along = dot(d, dir), side = abs(dot(d, perp));
    float len = u_needle_dim.x, tail = u_needle_dim.y;
    float hw = along >= 0.0 ? mix(u_needle_dim.z, u_needle_dim.w, clamp(along / len, 0.0, 1.0)) * 0.5 : u_needle_dim.z * 0.5;
    float s = max(soft, 0.5);
    return clamp((hw - side) / s + 0.5, 0.0, 1.0) * clamp((along + tail) / s + 0.5, 0.0, 1.0) * clamp((len - along) / s + 0.5, 0.0, 1.0);
}

void main() {
    vec2 d = (v_uv - 0.5) * u_size;
    float r = length(d);
    float k = u_look2.y;
    float Ro = u_size.x * 0.5 - 2.0, bw = u_look2.x, R = Ro - bw;
    float disc = clamp(Ro - r + 0.5, 0.0, 1.0);
    if (disc <= 0.0) { gl_FragColor = vec4(0.0); return; }
    float ang = atan(d.x, -d.y) / DEG;
    float a0 = min(u_arc.x, u_arc.y), a1 = max(u_arc.x, u_arc.y);

    /* the face: lighter in the middle, deeper towards the rim, fine machined rings */
    float f = r / R;
    vec3 col = mix(u_face0, u_face1, smoothstep(0.15, 1.0, f));
    col *= 1.0 - 0.38 * smoothstep(0.78, 1.0, f);
    col *= 1.0 + 0.018 * sin(r * 2.1);

    float z = zeroAt(), fa = (clamp(ang, a0, a1) - u_arc.x) / (u_arc.y - u_arc.x);
    float v = fa >= z ? (fa - z) / (1.0 - z) * u_scale.x : u_min * (1.0 - fa / max(z, 0.001));
    float sc = v >= 0.0 ? u_scale.x / (1.0 - z) : -u_min / max(z, 0.001);     /* the scale's units a whole sweep, here */
    bool inArc = ang >= a0 - 3.0 && ang <= a1 + 3.0;
    /* the value arc: a lit band from 0 to the reading (either way), brighter towards the needle */
    if (u_look.z > 0.5 && inArc) {
        float rr0 = R - u_look.w - 8.0 * k, rr1 = R - u_look.w;
        float on = v >= min(0.0, u_value) && v <= max(0.0, u_value) ? 1.0 : 0.0;
        float frac = clamp(abs(v) / max(abs(u_value), 0.001), 0.0, 1.0);
        vec3 ac = v < 0.0 ? u_regen : u_accent;
        col = mix(col, u_minor * 0.35, span(r, rr0, rr1) * 0.5);
        col = mix(col, ac * (0.45 + 0.55 * frac), on * span(r, rr0, rr1));
        col += ac * 0.25 * on * clamp(1.0 - abs(r - (rr0 + rr1) * 0.5) / (14.0 * k), 0.0, 1.0) * frac;
    }
    if (inArc) {
        /* (below 0 marks at its half and quarters) */
        float stm = v < 0.0 ? -u_min / 4.0 : u_scale.z, stM = v < 0.0 ? -u_min / 2.0 : u_scale.y;
        float vm = clamp(floor(v / stm + 0.5) * stm, u_min, u_scale.x);
        float vM = clamp(floor(v / stM + 0.5) * stM, u_min, u_scale.x);
        /* the red zone */
        if (u_scale.w < u_scale.x) {
            float zone = clamp((v - u_scale.w) / sc * (a1 - a0) * DEG * r + 0.5, 0.0, 1.0);
            col = mix(col, u_red, zone * span(r, R - 34.0 * k, R - 14.0 * k));
        }
        /* the regeneration zone, below 0 */
        if (u_min < 0.0) {
            float zone = clamp(-v / sc * (a1 - a0) * DEG * r + 0.5, 0.0, 1.0);
            col = mix(col, u_regen * 0.8, zone * span(r, R - 34.0 * k, R - 14.0 * k));
        }
        /* backlight round the ticks */
        float gl = max(tick(vM, ang, r, R - 46.0 * k, R - 14.0 * k, 3.0 * k, 7.0 * k), tick(vm, ang, r, R - 30.0 * k, R - 14.0 * k, 1.5 * k, 5.0 * k) * 0.6);
        col += u_glow * gl * u_look.x * 0.35;
        col = mix(col, u_minor, tick(vm, ang, r, R - 30.0 * k, R - 14.0 * k, 1.4 * k, 0.0));
        col = mix(col, vM >= u_scale.w - 0.001 && u_scale.w < u_scale.x ? u_red : u_tick, tick(vM, ang, r, R - 46.0 * k, R - 14.0 * k, 3.0 * k, 0.0));
    }
    /* the numerals, upright, at the nearest major tick, with their backlight */
    if (u_arc.z > 0.0) {
        float vk = clamp(floor(v / u_scale.y + 0.5) * u_scale.y, 0.0, u_scale.x);
        float ak = angleOf(vk) * DEG;
        float h = u_arc.z, adv = u_digit_adv;
        float n = vk >= 99.5 ? 3.0 : vk >= 9.5 ? 2.0 : 1.0;
        vec2 dk = vec2(sin(ak), -cos(ak));
        vec2 pc = dk * (u_arc.w - numeralIn(dk, n, adv, h));
        vec2 q = (d - pc) / h;
        float x = q.x + n * adv * 0.5;
        float i = floor(x / adv);
        if (i >= 0.0 && i < n && v > -0.5 * u_scale.y) {
            float s = sdf(digitOf(vk, i, n), vec2(x - (i + 0.5) * adv, q.y + 0.5));
            float ink = smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s);
            float halo = smoothstep(0.22, 0.5, s) * (1.0 - ink);
            bool red = vk >= u_scale.w - 0.001 && u_scale.w < u_scale.x;
            col += (red ? u_red : u_glow) * halo * u_look.x * 0.55;
            col = mix(col, red ? u_red : u_num, ink);
        }
    }
    /* the needle: its shadow on the face, a glow, the blade (the tail darker) */
    {
        float sh = blade(d - vec2(5.0, 8.0) * k, 7.0 * k);
        col *= 1.0 - 0.55 * sh * u_look2.z;
        float na = angleOf(u_value) * DEG;
        float along = dot(d, vec2(sin(na), -cos(na)));
        col += u_needle * 0.45 * blade(d, 6.0 * k) * (along > 0.0 ? 1.0 : 0.3);
        float b = blade(d, 0.0);
        vec3 nc = along >= 0.0 ? mix(u_needle * 0.8, u_needle * 1.15, clamp(along / u_needle_dim.x, 0.0, 1.0)) : u_needle * 0.35;
        col = mix(col, nc, b);
    }
    /* the hub: a metal cap, lit from the top left */
    {
        float hr = 34.0 * k;
        float lit = 0.5 + 0.5 * dot(d / max(r, 1.0), vec2(-0.6, -0.8));
        col = mix(col, mix(u_bezel2, u_bezel, lit * 0.8 + 0.1), clamp(hr - r + 0.5, 0.0, 1.0));
        col = mix(col, mix(u_hub, u_hub * 1.6, (1.0 - r / hr) * 0.6), clamp(hr * 0.78 - r + 0.5, 0.0, 1.0));
    }
    /* the bezel: a metal ring, its light following the angle (brushed), a bevel across it */
    if (r > R - 1.0) {
        float t = clamp((r - R) / bw, 0.0, 1.0);
        float sheen = 0.5 + 0.5 * cos(2.0 * (ang + 40.0) * DEG);
        float bevel = sin(t * 3.14159);
        vec3 m = mix(u_bezel2, u_bezel, clamp(sheen * u_look.y + bevel * 0.35 + (1.0 - u_look.y) * 0.6, 0.0, 1.0));
        m *= 0.85 + 0.15 * (1.0 - t);
        col = mix(col, m, clamp(r - R + 0.5, 0.0, 1.0));
        col = mix(col, u_bezel2 * 0.4, span(r, R - 2.0, R));          /* the dark seam inside it */
    }
    /* glass: a faint reflection across the upper left of the face */
    col += vec3(1.0) * u_look2.w * 0.05 * smoothstep(0.1, 0.7, dot(d / R, vec2(-0.55, -0.83))) * clamp(R - r, 0.0, 1.0);
    gl_FragColor = vec4(col, disc);
}`;

/**
 * A gauge along an arc of a circle: a track, the fill from the start to u_value (0..1) in a gradient, red
 * from u_red, a glowing tip, ticks and numerals outside it. Transparent elsewhere.
 *   u_geo     the circle's centre (px in this layer, may be outside it), radius, the band's thickness; radius 0:
 *             a straight bar instead (x: its inset from each end, y: its centre line, w: its thickness;
 *             u_span.x < 0: filled from the right)
 *   u_span    start and end angle, segments (0: solid), gap (of a segment)
 *   u_marks   major marks (0: none), numeral step (the value at each mark), numeral height px (0: none),
 *             numeral distance px from the band's centre line (- inside, + outside)
 *   u_zero    (an arc) where the fill starts, 0..1 (0 unless set): a power gauge's 0, lit from it to u_value either
 *             way, below it in u_neg (regeneration); its marks counted from it, one more at the start
 */
/*
 * (Layouts 0.40.0) JDM 1's parts, after an 80s Japanese digital dash (an original drawing of the idea): one colour
 * on black, panels lit in it with their readings dark on them as a lit LCD's.
 *
 * RTACH_FS: the rev bar along a curve - a quarter of a circle (centre u_geo.xy, radius u_geo.z, from u_geo.w degrees
 * left of its top round to the top), then straight on to x u_geo2.x - lit in segments from 0 to u_value (0..1), the
 * amber run-up from u_orange and the red zone from u_red brighter, ticks outside it every segment (the thousands
 * longer), and the dash's lines: radial under the bar down to y u_geo2.z, over it (from the third thousand) up to
 * y u_geo2.w. u_off: the layer's place on the panel (the geometry is in panel px).
 */
const RTACH_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec2 u_off;
uniform float u_k;        // the layer's scale: its geometry in the layout's design px (0.40.2: JDM 1 drawn bigger)
uniform vec4 u_geo;
uniform vec4 u_geo2;      // x of the straight part's end, the bar's thickness, the lines' bottom y, their top y
uniform vec2 u_ticks;     // thousands on the scale, segments a thousand
uniform float u_value;
uniform float u_red;
uniform float u_orange;
uniform float u_shift;
uniform vec3 u_ink;
uniform vec3 u_dim;
uniform vec3 u_line;      // the dash's lines and the small ticks
uniform vec3 u_ld1;       // two leader lines (panel px): from x, at y, along to x; then down at 45 degrees for 18 px
uniform vec3 u_ld2;
varying vec2 v_uv;
float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
float segd(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float lead(vec2 p, vec3 l) { return l.z <= l.x ? 1e3 : min(segd(p, l.xy, vec2(l.z, l.y)), segd(p, vec2(l.z, l.y), vec2(l.z + 18.0, l.y + 18.0))); }
vec4 put(vec4 c, vec3 col, float a) { return vec4(col * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
void main() {
    vec2 p = v_uv * u_size / u_k + u_off;
    vec2 C = u_geo.xy;
    float R = u_geo.z, a0 = u_geo.w * DEG, T = u_geo2.y;
    float arcL = -a0 * R, L = arcL + (u_geo2.x - C.x);
    float s, dist, k = 1.0;                  // along the bar from 0 (px at its middle line), out from it, px a px of s here
    if (p.x < C.x) {
        vec2 v = p - C;
        float r = length(v);
        s = (atan(v.x, -v.y) - a0) * R;
        dist = r - R;
        k = r / R;
    } else {
        s = arcL + (p.x - C.x);
        dist = C.y - R - p.y;
    }
    float t = s / L;
    vec4 c = vec4(0.0);
    // the bar: thin slats with a dark gap between (a vacuum display's), lit to the value
    float n = u_ticks.x * u_ticks.y, segL = L / n;
    float along = clamp(s + 0.5, 0.0, 1.0) * clamp(L - s + 0.5, 0.0, 1.0);
    float sg = fract(s / segL) * segL;
    float bar = cov(abs(dist) - T * 0.5) * along * clamp(min(sg, segL - sg) * k - segL * 0.21, 0.0, 1.0);
    float lit = step(t, u_value);
    vec3 col = mix(u_dim, u_shift > 0.5 ? vec3(1.0, 0.28, 0.2) : u_ink, lit);
    if (t >= u_orange && t < u_red) col = mix(mix(u_dim, vec3(0.55, 0.33, 0.06), 0.6), u_shift > 0.5 ? vec3(1.0, 0.28, 0.2) : vec3(1.0, 0.68, 0.16), lit);
    if (t >= u_red) col = mix(mix(u_dim, vec3(0.62, 0.1, 0.08), 0.7), vec3(1.0, 0.2, 0.16), lit);
    c = put(c, col, bar);
    // ticks outside it: the thousands long and white, the halves short in the lines' colour
    float j = floor(s / segL + 0.5), dj = abs(s - j * segL) * k;
    float major = step(mod(j + 0.5, u_ticks.y), 1.0), hk = step(mod(j + 0.5, u_ticks.y * 0.5), 1.0);
    float tl = mix(9.0, 18.0, major), tw = mix(0.9, 2.2, major);
    float tick = cov(dj - tw) * step(T * 0.5 + 4.0, dist) * step(dist, T * 0.5 + 4.0 + tl) * step(-0.5, j) * step(j, n + 0.5) * hk;
    c = put(c, j * segL / L >= u_red - 0.001 ? vec3(1.0, 0.2, 0.16) : mix(u_line, u_ink, major), tick);      // (red over the red zone)
    // the dash's lines from the third thousand: under the bar down to the bottom line (into the speed's frame), over it up to the top
    float m = floor(s / (segL * u_ticks.y) + 0.5), dm = abs(s - m * segL * u_ticks.y) * k;
    float under = step(dist, -T * 0.5 - 8.0) * step(p.y, u_geo2.z) * step(2.5, m) * step(m, u_ticks.x + 0.5);
    float overB = step(T * 0.5 + 74.0, dist) * step(u_geo2.w, p.y) * step(2.5, m) * step(m, u_ticks.x + 0.5);
    c = put(c, u_line, cov(dm - 0.9) * max(under, overB));
    // the leader lines from the left box to the figures
    c = put(c, u_line, cov(min(lead(p, u_ld1), lead(p, u_ld2)) - 0.9));
    gl_FragColor = vec4(c.rgb / max(c.a, 0.0001), c.a);
}`;

/*
 * RBOX_FS: a rounded box (u_box: corner radius, border width) filled u_fill (rgba), its border u_line; and in it, when
 * u_win.z > 0, a bar gauge's window (u_win: x, y, w, h in the layer): outlined in u_wcol, filled with it from the bottom
 * to u_value (0..1) in segments u_seg px apart (0: solid).
 */
const RBOX_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform float u_k;        // the layer's scale (its geometry in design px)
uniform vec4 u_box;
uniform vec4 u_fill;
uniform vec3 u_line;
uniform vec4 u_win;
uniform float u_value;
uniform float u_seg;
uniform vec3 u_wcol;
varying vec2 v_uv;
void main() {
    vec2 sz = u_size / u_k, p = v_uv * sz, h = sz * 0.5, q = abs(p - h) - (h - u_box.x - 1.0);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_box.x;      // < 0 inside
    float inside = clamp(0.5 - dist, 0.0, 1.0);
    vec4 c = u_fill;
    if (u_box.y > 0.0) c = mix(c, vec4(u_line, 1.0), clamp(dist + u_box.y + 0.5, 0.0, 1.0));
    if (u_win.z > 0.0) {
        vec2 w = p - u_win.xy;
        float inW = clamp(w.x + 0.5, 0.0, 1.0) * clamp(u_win.z - w.x + 0.5, 0.0, 1.0) * clamp(w.y + 0.5, 0.0, 1.0) * clamp(u_win.w - w.y + 0.5, 0.0, 1.0);
        float edge = inW * (1.0 - clamp(w.x - 2.5, 0.0, 1.0) * clamp(u_win.z - 2.5 - w.x, 0.0, 1.0) * clamp(w.y - 2.5, 0.0, 1.0) * clamp(u_win.w - 2.5 - w.y, 0.0, 1.0));
        float top = u_win.w * (1.0 - clamp(u_value, 0.0, 1.0));
        float fill = inW * clamp(w.y - top + 0.5, 0.0, 1.0);
        if (u_seg > 0.0) { float g = mod(u_win.w - w.y, u_seg); fill *= clamp(g - 2.0, 0.0, 1.0) * clamp(u_seg - g, 0.0, 1.0); }
        c = mix(c, vec4(u_wcol, 1.0), max(edge, fill * clamp(w.x - 5.5, 0.0, 1.0) * clamp(u_win.z - 5.5 - w.x, 0.0, 1.0)));
    }
    gl_FragColor = vec4(c.rgb, c.a * inside);
}`;

/*
 * RSEG_FS: a lit LCD (a rounded box in u_fill) with u_num in seven-segment figures, dark (u_on) over the unlit
 * segments' faint shape (u_off): the figures right-aligned to x u_dig.x, from y u_dig.y, each u_dig.z wide and u_dig.w
 * high, u_seg2: the segments' thickness, their slant, how many figures (leading zeros left blank).
 */
const RSEG_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform float u_k;        // the layer's scale (its geometry in design px)
uniform float u_num;
uniform vec4 u_dig;
uniform vec3 u_seg2;
uniform vec3 u_fill;
uniform vec3 u_on;
uniform vec3 u_off;
varying vec2 v_uv;
float segD(vec2 q, vec2 a, vec2 b, float th) {
    vec2 d = b - a; float L = length(d); vec2 u = d / L;
    float al = dot(q - a, u), ac = abs(dot(q - a, vec2(-u.y, u.x)));
    return max(ac - th * 0.5, abs(al - L * 0.5) - L * 0.5 + ac);      // a long hexagon, pointed ends
}
float bit(float m, float i) { return mod(floor(m / pow(2.0, i)), 2.0); }
void main() {
    vec2 sz = u_size / u_k, p = v_uv * sz, h = sz * 0.5, q0 = abs(p - h) - (h - 13.0);
    float inside = clamp(0.5 - (length(max(q0, 0.0)) + min(max(q0.x, q0.y), 0.0) - 12.0), 0.0, 1.0);
    vec3 c = u_fill;
    float cw = u_dig.z, ch = u_dig.w, th = u_seg2.x, gap = cw * 0.28;
    // (the slant taken out before the figure is picked: picked from the upright x, a figure's slanted top ran into
    // its neighbour's cell and was cut off there, 0.40.1)
    float xu = p.x - (ch - (p.y - u_dig.y)) * u_seg2.y;
    float idx = floor((u_dig.x - xu) / (cw + gap));                     // 0: the rightmost figure
    if (idx >= 0.0 && idx < u_seg2.z && p.y > u_dig.y - 4.0 && p.y < u_dig.y + ch + 4.0) {
        vec2 q = vec2(xu - (u_dig.x - (idx + 1.0) * (cw + gap) + gap), p.y - u_dig.y);
        float n = floor(u_num + 0.5), dg = mod(floor(n / pow(10.0, idx)), 10.0);
        float show = (idx == 0.0 || n >= pow(10.0, idx)) ? 1.0 : 0.0;
        float m = dg < 0.5 ? 63.0 : dg < 1.5 ? 6.0 : dg < 2.5 ? 91.0 : dg < 3.5 ? 79.0 : dg < 4.5 ? 102.0 : dg < 5.5 ? 109.0 : dg < 6.5 ? 125.0 : dg < 7.5 ? 7.0 : dg < 8.5 ? 127.0 : 111.0;
        float e = th * 0.5 + 1.0, mid = ch * 0.5;
        float d[7];
        d[0] = segD(q, vec2(e, th * 0.5), vec2(cw - e, th * 0.5), th);
        d[1] = segD(q, vec2(cw - th * 0.5, e), vec2(cw - th * 0.5, mid - 1.0), th);
        d[2] = segD(q, vec2(cw - th * 0.5, mid + 1.0), vec2(cw - th * 0.5, ch - e), th);
        d[3] = segD(q, vec2(e, ch - th * 0.5), vec2(cw - e, ch - th * 0.5), th);
        d[4] = segD(q, vec2(th * 0.5, mid + 1.0), vec2(th * 0.5, ch - e), th);
        d[5] = segD(q, vec2(th * 0.5, e), vec2(th * 0.5, mid - 1.0), th);
        d[6] = segD(q, vec2(e, mid), vec2(cw - e, mid), th);
        for (int i = 0; i < 7; i++) {
            float a = clamp(0.5 - d[i], 0.0, 1.0);
            c = mix(c, u_off, a * 0.55);
            c = mix(c, u_on, a * bit(m, float(i)) * show);
        }
    }
    gl_FragColor = vec4(c, inside);
}`;

/**
 * (Layouts 0.39.5) A ring along an arc, as BAND_FS draws one full in a single colour (u_soft 1): brighter at its
 * middle, soft edges; for the rims round JDM 1's dials. The band's whole shader (fill, glow, tip, marks, numerals)
 * ran over every pixel of each ring's box for this.
 *   u_geo   the circle's centre (px in this layer), radius, the ring's thickness
 *   u_span  start and end angle (degrees, clockwise from the top; end > start)
 */
/*
 * CUP_FS (kind 'cup', JDM 1 0.41.0): a paper cup (u_clear: a clear one, 0.41.9) of water seen a little from above,
 * the water sloshing with the car's sideways G: the paper cup white and opaque, the water seen through its mouth - its surface a tilted ellipse, the cup's
 * inside above it - the water's edge riding up the inner wall on the high side.
 *   u_cup:  the cup's middle x, its rim's y, the rim's half width, the bottom's half width (px in the layer)
 *   u_cup2: its height, the ellipses' height to width, the water's level (of the height, from the bottom), the
 *           surface's tilt sideways (radians; > 0: higher on the right)
 *   u_lon:  its tilt fore and aft (0.41.4: the tangent; > 0 higher at the far side, braking): its ellipse taller
 */
const CUP_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform vec4 u_cup;
uniform vec4 u_cup2;
uniform float u_lon;
uniform float u_clear;     // 1: a clear glass cup (0.41.9), the water seen through its wall
uniform vec3 u_wall;
uniform vec3 u_inner;
uniform vec3 u_edge;
uniform vec3 u_water;
uniform vec3 u_foam;
varying vec2 v_uv;
float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
/* an ellipse's signed distance, near enough for its edge's antialiasing (< 0 inside) */
float ell(vec2 q, float a, float b) { return (length(q / vec2(a, b)) - 1.0) * min(a, b); }
vec4 put(vec4 c, vec3 col, float a) { return vec4(col * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
void main() {
    vec2 p = v_uv * u_size;
    float cx = u_cup.x, ry = u_cup.y, aR = u_cup.z, aB = u_cup.w, H = u_cup2.x, e = u_cup2.y, by = ry + H;
    float x = p.x - cx, t = clamp((p.y - ry) / H, 0.0, 1.0), w = mix(aR, aB, t);
    // the cup: its sides, its bottom's ellipse, its rim's; its mouth inside the rolled lip
    float dTrap = max(abs(x) - w, max(ry - p.y, p.y - by));
    float dBot = ell(vec2(x, p.y - by), aB, e * aB), dRim = ell(vec2(x, p.y - ry), aR, e * aR);
    float dBody = min(min(dTrap, dBot), dRim), dMouth = ell(vec2(x, p.y - ry), aR - 5.0, e * (aR - 5.0));
    // the water: its surface a level ellipse at its depth, tilted (sheared) by the slosh
    float yw = by - u_cup2.z * H, aw = mix(aR, aB, (yw - ry) / H) - 2.0, bw = (e + u_lon) * aw, ys = yw - x * tan(u_cup2.w);
    float far = ys - bw * sqrt(max(0.0, 1.0 - (x / aw) * (x / aw)));
    float dSurf = ell(vec2(x, p.y - ys), aw, bw);
    vec4 c = vec4(0.0);
    if (u_clear > 0.5) {
        // a clear cup: its far wall a faint tint, the water body under its surface's far edge (inside the glass, a
        // little in from it), the surface, a veil and a sheen for the near wall, the lip a ring, the outline
        float dIn = min(min(dTrap, dBot), dMouth) + 3.0, wi = cov(dIn);
        c = put(c, u_edge * 0.5, 0.1 * cov(dBody));
        c = put(c, u_water, 0.85 * wi * cov(far - p.y));
        c = put(c, u_foam, 0.9 * wi * cov(dSurf));
        c = put(c, mix(u_foam, vec3(1.0), 0.5), 0.8 * wi * cov(abs(dSurf) - 0.9) * step(p.y, ys));
        c = put(c, vec3(1.0), 0.06 * cov(dBody) * step(ry, p.y));
        c = put(c, vec3(1.0), 0.22 * cov(abs(x + 0.55 * w) - 3.0) * cov(dBody) * step(ry + e * aR, p.y));
        c = put(c, u_edge, 0.9 * cov(abs(dRim + 2.0) - 1.6));
        c = put(c, u_edge, 0.85 * cov(abs(dBody) - 0.8));
        gl_FragColor = vec4(c.rgb / max(c.a, 0.0001), c.a);
        return;
    }
    // the paper, a little darker towards its sides
    c = put(c, u_wall * (0.8 + 0.2 * (1.0 - abs(x / w + 0.3))), cov(dBody));
    // through the mouth: the far inner wall (darker deeper), the water under its surface's far edge, the surface
    float m = cov(dMouth);
    c = put(c, u_inner * (1.0 - 0.3 * clamp((p.y - ry) / (e * aR * 2.0 + 0.6 * H), 0.0, 1.0)), m);
    c = put(c, u_water, m * cov(far - p.y));
    c = put(c, u_foam, m * cov(dSurf));
    c = put(c, mix(u_foam, vec3(1.0), 0.5), 0.8 * m * cov(abs(dSurf) - 0.9) * step(p.y, ys));   // the far edge's glint
    c = put(c, u_edge, 0.6 * cov(abs(dMouth) - 0.7));                    // the lip's inner edge
    c = put(c, u_edge, cov(abs(dBody) - 1.0));                           // the outline
    gl_FragColor = vec4(c.rgb / max(c.a, 0.0001), c.a);
}`;

/*
 * WAKABA_FS (kind 'wakaba', JDM 2 0.41.0): the beginner driver's mark (shoshinsha, "wakaba": a young leaf, yellow
 * and green, in a thick black edge; a traffic sign of Japan's), from its outline traced off the owner's picture: each
 * leaf a polygon in the picture's px (its edge's box 1901 x 2121), the edge the leaves' outline grown 92 px.
 *   u_s: the picture's px a layer px
 */
const WAKABA_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform float u_s;
uniform vec3 u_yellow;
uniform vec3 u_green;
uniform vec3 u_edge;
varying vec2 v_uv;
/* a polygon's signed distance, edge by edge (after Inigo Quilez's): ds.x the nearest squared, ds.y the inside's sign
 * (handed back, not through out-parameters: 0.41.5, only the plainest GLSL on the KOMBI) */
vec2 edge(vec2 p, vec2 a, vec2 b, vec2 ds) {
    vec2 e = b - a, w = p - a, q = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float c1 = step(a.y, p.y), c2 = 1.0 - step(b.y, p.y), c3 = 1.0 - step(e.x * w.y, e.y * w.x);
    float flip = c1 * c2 * c3 + (1.0 - c1) * (1.0 - c2) * (1.0 - c3);
    return vec2(min(ds.x, dot(q, q)), ds.y * (1.0 - 2.0 * flip));
}
float yLeaf(vec2 p) {
    vec2 ds = vec2(1e12, 1.0);
    ds = edge(p, vec2(841.0, 100.0), vec2(771.0, 94.0), ds);
    ds = edge(p, vec2(771.0, 94.0), vec2(709.0, 130.0), ds);
    ds = edge(p, vec2(709.0, 130.0), vec2(94.0, 941.0), ds);
    ds = edge(p, vec2(94.0, 941.0), vec2(94.0, 2025.0), ds);
    ds = edge(p, vec2(94.0, 2025.0), vec2(947.0, 908.0), ds);
    ds = edge(p, vec2(947.0, 908.0), vec2(908.0, 169.0), ds);
    ds = edge(p, vec2(908.0, 169.0), vec2(886.0, 132.0), ds);
    ds = edge(p, vec2(886.0, 132.0), vec2(841.0, 100.0), ds);
    return ds.y * sqrt(ds.x);
}
float gLeaf(vec2 p) {
    vec2 ds = vec2(1e12, 1.0);
    ds = edge(p, vec2(1788.0, 821.0), vec2(1740.0, 782.0), ds);
    ds = edge(p, vec2(1740.0, 782.0), vec2(1687.0, 774.0), ds);
    ds = edge(p, vec2(1687.0, 774.0), vec2(949.0, 906.0), ds);
    ds = edge(p, vec2(949.0, 906.0), vec2(96.0, 2024.0), ds);
    ds = edge(p, vec2(96.0, 2024.0), vec2(1097.0, 1790.0), ds);
    ds = edge(p, vec2(1097.0, 1790.0), vec2(1799.0, 924.0), ds);
    ds = edge(p, vec2(1799.0, 924.0), vec2(1808.0, 878.0), ds);
    ds = edge(p, vec2(1808.0, 878.0), vec2(1788.0, 821.0), ds);
    return ds.y * sqrt(ds.x);
}
void main() {
    vec2 p = v_uv * u_size * u_s;
    float dy = yLeaf(p), dg = gLeaf(p), du = min(dy, dg), aa = u_s;
    vec4 c = vec4(u_edge, clamp((92.0 - du) / aa + 0.5, 0.0, 1.0));
    c.rgb = mix(c.rgb, u_yellow, clamp(0.5 - dy / aa, 0.0, 1.0));
    c.rgb = mix(c.rgb, u_green, clamp(0.5 - dg / aa, 0.0, 1.0));
    gl_FragColor = c;
}`;

const RING_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_geo;
uniform vec4 u_span;
uniform vec3 u_fill1;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    vec2 d = p - u_geo.xy;
    float r = length(d), R = u_geo.z, T = u_geo.w;
    float sweep = u_span.y - u_span.x;
    float da = atan(d.x, -d.y) / DEG - u_span.x;
    if (da < -180.0) da += 360.0;
    if (da > 180.0 + sweep) da -= 360.0;
    float lenPx = sweep * DEG * r;
    float inBand = span(r, R - T * 0.5, R + T * 0.5) * span(da / sweep * lenPx, 0.0, lenPx);
    float across = 1.0 - abs(r - R) / (T * 0.5);
    gl_FragColor = vec4(u_fill1 * (0.75 + 0.35 * across), inBand);
}`;

const BAND_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}${NUMERAL}
uniform vec2 u_size;
uniform vec4 u_geo;
uniform vec4 u_span;
uniform vec4 u_marks;
uniform float u_value;
uniform float u_red;
uniform float u_yellow;            /* the straight bar: where its fill starts turning from u_fill0 to u_fill1 (0: along the fill) */
uniform float u_soft;              /* 0: glows as drawn, 1: none (a quieter look) */
uniform float u_zero;
uniform float u_digit_adv;
uniform vec3 u_neg;
uniform vec3 u_track;
uniform vec3 u_fill0;
uniform vec3 u_fill1;
uniform vec3 u_redc;
uniform vec3 u_tip;
uniform vec3 u_tick;
uniform vec3 u_num;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    if (u_geo.z <= 0.0) {
        /* a straight capsule along x: inset u_geo.x each end, u_geo.w thick, centred on y u_geo.y; filled with a
         * gradient to u_value (or, with u_yellow, u_fill0 up to it and turning to u_fill1 by u_red), a glow round the
         * fill, a marker at u_red (from there the fill turns red);
         * segmented when u_span.z > 0; filled from the right when u_span.x < 0 */
        float x0 = u_geo.x, len = u_size.x - 2.0 * u_geo.x, T = u_geo.w, r = T * 0.5;
        float t = (p.x - x0) / len;
        if (u_span.x < 0.0) t = 1.0 - t;
        float cx = clamp(p.x, x0 + r, x0 + len - r);
        float dist = length(vec2(p.x - cx, p.y - u_geo.y)) - r;            /* < 0 inside the capsule */
        vec4 acc = vec4(0.0);
        float v = clamp(u_value, 0.0, 1.0);
        float fx = u_span.x < 0.0 ? x0 + len * (1.0 - v) : x0 + len * v;   /* the fill's edge */
        float lit = u_span.x < 0.0 ? clamp(p.x - fx + 0.5, 0.0, 1.0) : clamp(fx - p.x + 0.5, 0.0, 1.0);
        vec3 fc = u_yellow > 0.0 ? mix(u_fill0, u_fill1, clamp((t - u_yellow) / max(u_red - u_yellow, 0.001), 0.0, 1.0))
                                 : mix(u_fill0, u_fill1, clamp(t / max(v, 0.001), 0.0, 1.0));
        if (t >= u_red) fc = u_redc;
        /* the glow round the fill, under everything */
        float gl = exp(-max(dist, 0.0) * max(dist, 0.0) / (T * T * 0.6)) * (dist > 0.0 ? 1.0 : 0.0) * lit;
        acc = over(acc, fc, gl * 0.35 * (1.0 - u_soft) * (v > 0.003 ? 1.0 : 0.0));
        float seg = 1.0;
        if (u_span.z > 0.0) { float sl = len / u_span.z, sx = fract(t * u_span.z) * sl, g = sl * u_span.w * 0.5; seg = span(sx, g, sl - g); }
        float body = clamp(0.5 - dist, 0.0, 1.0) * seg;
        float across = clamp(1.0 - abs(p.y - u_geo.y) / r, 0.0, 1.0);
        acc = over(acc, u_track * (0.85 + 0.3 * across), body);
        acc = over(acc, fc * (0.8 + 0.35 * across), body * lit * (v > 0.003 ? 1.0 : 0.0));
        /* the warning marker */
        if (u_red < 1.0) {
            float mx = u_span.x < 0.0 ? x0 + len * (1.0 - u_red) : x0 + len * u_red;
            acc = over(acc, u_redc, clamp(1.2 - abs(p.x - mx) + 0.5, 0.0, 1.0) * span(p.y, u_geo.y - r - 3.0, u_geo.y + r + 3.0));
        }
        float dt = length(p - vec2(fx, u_geo.y));
        acc = over(acc, u_tip, exp(-dt * dt / (T * T * 0.7)) * 0.75 * (1.0 - u_soft) * (v > 0.003 ? 1.0 : 0.0));
        gl_FragColor = acc;
        return;
    }
    vec2 d = p - u_geo.xy;
    float r = length(d), R = u_geo.z, T = u_geo.w;
    float ang = atan(d.x, -d.y) / DEG;
    float a0 = u_span.x, a1 = u_span.y, sweep = a1 - a0;
    /* angle relative to the start, unwrapped towards the sweep */
    float da = ang - a0;
    if (sweep > 0.0 && da < -180.0) da += 360.0;
    if (sweep > 0.0 && da > 180.0 + sweep) da -= 360.0;
    if (sweep < 0.0 && da > 180.0) da -= 360.0;
    if (sweep < 0.0 && da < -180.0 + sweep) da += 360.0;
    float t = da / sweep;
    float lenPx = abs(sweep) * DEG * r;
    vec4 acc = vec4(0.0);
    /* lit from the zero (the start unless u_zero) to the value; below the zero in u_neg */
    float z = u_zero, lo = min(z, u_value), hi = max(z, u_value), on = abs(u_value - z) > 0.003 ? 1.0 : 0.0;
    float litT = clamp((hi - t) * lenPx + 0.5, 0.0, 1.0) * clamp((t - lo) * lenPx + 0.5, 0.0, 1.0);
    vec3 fillT = t < z ? u_neg : mix(u_fill0, u_fill1, clamp((t - z) / max(u_value - z, 0.001), 0.0, 1.0));

    float inBand = span(r, R - T * 0.5, R + T * 0.5) * span(t * lenPx, 0.0, lenPx);
    {
        /* a soft glow round the lit part, under the band */
        float outside = abs(r - R) - T * 0.5;
        vec3 hc = t >= u_red ? u_redc : fillT;
        float halo = outside > 0.0 ? exp(-outside * outside / (T * T * 0.35)) : 0.0;
        acc = over(acc, hc, halo * 0.32 * (1.0 - u_soft) * litT * span(t * lenPx, 0.0, lenPx) * on);
    }
    if (inBand > 0.0) {
        float seg = 1.0;
        if (u_span.z > 0.0) {
            float sl = lenPx / u_span.z, sx = fract(t * u_span.z) * sl, g = sl * u_span.w * 0.5;
            seg = span(sx, g, sl - g);
        }
        float lit = litT * (z > 0.0 ? on : 1.0);
        vec3 fc = fillT;
        if (t >= u_red) fc = u_redc;
        /* across the band: brighter at its middle */
        float across = 1.0 - abs(r - R) / (T * 0.5);
        vec3 c = mix(u_track * (t >= u_red ? 1.6 : 1.0), fc * (0.75 + 0.35 * across), lit);
        acc = over(acc, c, inBand * seg);
    }
    /* the tip's glow */
    {
        float ta = (a0 + sweep * clamp(u_value, 0.0, 1.0)) * DEG;
        vec2 tp = u_geo.xy + vec2(sin(ta), -cos(ta)) * R;
        float dist = length(p - tp);
        float g = exp(-dist * dist / (T * T * 0.9)) * on;
        acc = over(acc, u_tip, g * 0.85 * (1.0 - u_soft * 0.8));
    }
    /* major marks outside the band, numerals beside them */
    if (u_marks.x > 0.0) {
        float st = (1.0 - z) / u_marks.x;
        float m = floor((clamp(t, 0.0, 1.0) - z) / st + 0.5);
        float tm = max(z + m * st, 0.0);                  /* (below the zero: one mark, at the start) */
        float off = abs(t - tm) * lenPx;
        float r0 = R + T * 0.5 + 4.0, r1 = R + T * 0.5 + 14.0;
        if (u_marks.w < 0.0) { r0 = R - T * 0.5 - 14.0; r1 = R - T * 0.5 - 4.0; }
        acc = over(acc, u_tick, clamp(1.6 - off + 0.5, 0.0, 1.0) * span(r, r0, r1));
        if (u_marks.z > 0.0) {
            float vk = m * u_marks.y;
            float am = (a0 + sweep * tm) * DEG;
            float h = u_marks.z, adv = u_digit_adv;
            float n = vk >= 99.5 ? 3.0 : vk >= 9.5 ? 2.0 : 1.0;
            vec2 dm = vec2(sin(am), -cos(am));
            vec2 pc = u_geo.xy + dm * (R + u_marks.w + sign(u_marks.w) * numeralIn(dm, n, adv, h));
            vec2 q = (p - pc) / h;
            float x = q.x + n * adv * 0.5;
            float i = floor(x / adv);
            if (i >= 0.0 && i < n && m >= 0.0) {
                float s = sdf(digitOf(vk, i, n), vec2(x - (i + 0.5) * adv, q.y + 0.5));
                acc = over(acc, tm >= u_red ? u_redc : u_num, smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s));
            }
        }
    }
    gl_FragColor = acc;
}`;

/**
 * A line of up to 32 glyphs, the height of the layer, in u_color, with an optional glow (u_glow: colour,
 * strength 0..1): their codes (u_text) and centres (u_x) come from font.js line(), so each glyph keeps its
 * own width.
 */
const TEXT_FS = `#version 100
${HIGHP}${GLYPH}
uniform vec2 u_size;
uniform vec4 u_text[8];           /* glyph codes, 4 to a vec4, -1 none (up to 32) */
uniform vec4 u_x[8];              /* each glyph's centre, glyph heights from the left (font.js line) */
uniform vec4 u_color;
uniform vec4 u_glow;
varying vec2 v_uv;
void main() {
    float h = u_size.y;
    float x = v_uv.x * u_size.x / h;
    /* the two glyphs whose centres are nearest, the more inked of them: a wide letter beside a narrow one
       (the m of 'mi') reaches past the half-way point between their centres */
    float best = 1e4, code = -1.0, cx = 0.0, best2 = 1e4, code2 = -1.0, cx2 = 0.0;
    for (int i = 0; i < 8; i++) {
        vec4 c = u_x[i], k = u_text[i];
        for (int j = 0; j < 4; j++) {
            float cj = j == 0 ? c.x : j == 1 ? c.y : j == 2 ? c.z : c.w;
            float kj = j == 0 ? k.x : j == 1 ? k.y : j == 2 ? k.z : k.w;
            float dj = abs(x - cj);
            if (dj < best) { best2 = best; code2 = code; cx2 = cx; best = dj; code = kj; cx = cj; }
            else if (dj < best2) { best2 = dj; code2 = kj; cx2 = cj; }
        }
    }
    float s = max(sdf(code, vec2(x - cx, v_uv.y)), sdf(code2, vec2(x - cx2, v_uv.y)));
    float ink = smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, s);
    float halo = smoothstep(0.18, 0.5, s) * (1.0 - ink) * u_glow.a;
    float a = ink * u_color.a + halo * 0.7;
    vec3 c = a > 0.0 ? (u_color.rgb * ink * u_color.a + u_glow.rgb * halo * 0.7) / a : u_color.rgb;
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}`;


/**
 * The centre's background: a vertical gradient, a soft glow of the accent colour behind the top, a faint grid
 * of dots and a vignette.
 *   u_look    accent glow 0..1, dots 0..1, vignette 0..1, dot spacing px
 */
const BG_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_look;
uniform float u_feather;           /* px at the left and right edges fading to see-through */
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_accent;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    vec3 col = mix(u_top, u_bottom, v_uv.y);
    vec2 g = (p - vec2(u_size.x * 0.5, 40.0)) / vec2(u_size.x * 0.32, 120.0);
    col += u_accent * u_look.x * 0.16 * exp(-dot(g, g));
    vec2 c = fract(p / u_look.w) - 0.5;
    col += vec3(1.0) * u_look.y * 0.035 * clamp(1.6 - length(c) * u_look.w, 0.0, 1.0);
    vec2 v = (v_uv - 0.5) * vec2(1.0, 1.4);
    col *= 1.0 - u_look.z * 0.55 * smoothstep(0.35, 0.8, length(v));
    float a = u_feather > 0.0 ? smoothstep(0.0, u_feather, min(p.x, u_size.x - p.x)) : 1.0;
    gl_FragColor = vec4(col, a);
}`;

/**
 * A small icon, drawn from shapes (each inside its square with a pixel to spare: 0.44.0 drew the battery's nub in from
 * the edge, where it was cut off): u_icon picks it (0 thermometer, 1 oil drop, 2 gear, 3 air, 4 fuel pump,
 * 5 turbo, 6 battery, 7 bolt, 8 steering wheel, 9 stopwatch, 10 car, 11 engine, 12 snowflake, 13 gauge).
 */
const ICON_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform float u_icon;
uniform float u_line;              /* 0: filled; > 0: outlined, this many px wide */
uniform vec4 u_color;
varying vec2 v_uv;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float ring(vec2 p, float r, float w) { return abs(length(p) - r) - w; }
void main() {
    vec2 p = (v_uv - 0.5) * 2.0;
    p.y = -p.y;                                   /* y up, -1..1 */
    float px = 2.0 / u_size.y, d = 1e3, id = floor(u_icon + 0.5);
    if (id < 0.5) { d = min(length(p - vec2(0.0, -0.55)) - 0.3, seg(p, vec2(0.0, -0.4), vec2(0.0, 0.7), 0.13)); d = max(d, -seg(p, vec2(0.0, -0.1), vec2(0.0, 0.62), 0.04)); }
    else if (id < 1.5) { vec2 q = p - vec2(0.0, -0.22); d = max(length(q) - 0.52, -(q.y - 0.0) - 1.0); d = min(d, max(abs(p.x) * 1.35 + (p.y - 0.85) * 0.75, -p.y + 0.0)); }
    else if (id < 2.5) { float a = atan(p.y, p.x), r = length(p); float tooth = step(0.5, fract(a / 6.2832 * 8.0)); d = max(r - 0.62 - 0.2 * tooth, -(r - 0.24)); }
    else if (id < 3.5) { d = min(min(seg(p, vec2(-0.8, 0.4), vec2(0.5, 0.4), 0.09), seg(p, vec2(-0.8, 0.0), vec2(0.8, 0.0), 0.09)), seg(p, vec2(-0.8, -0.4), vec2(0.3, -0.4), 0.09)); d = min(d, ring(p - vec2(0.5, 0.6), 0.2, 0.09) + step(0.6, p.y) * 0.0); }
    else if (id < 4.5) { d = min(box(p - vec2(-0.2, -0.05), vec2(0.42, 0.8), 0.1), seg(p, vec2(0.25, 0.3), vec2(0.7, 0.0), 0.08)); d = min(d, seg(p, vec2(0.7, 0.0), vec2(0.7, -0.6), 0.08)); d = max(d, -box(p - vec2(-0.2, 0.35), vec2(0.24, 0.2), 0.04)); }
    else if (id < 5.5) { float a = atan(p.y, p.x), r = length(p); float sp = fract((a / 6.2832) * 3.0 + r * 0.9); d = max(r - 0.85, -(r - 0.18)); d = max(d, -(abs(sp - 0.5) - 0.32) * r * 2.0); d = min(d, ring(p, 0.85, 0.07)); }
    else if (id < 6.5) { d = min(ring(vec2(box(p - vec2(-0.06, 0.0), vec2(0.78, 0.48), 0.12), 0.0), 0.0, 0.08), box(p - vec2(0.84, 0.0), vec2(0.05, 0.2), 0.03)); d = min(d, box(p - vec2(-0.34, 0.0), vec2(0.36, 0.28), 0.05)); }
    else if (id < 7.5) { vec2 a = vec2(0.15, 0.95), b = vec2(-0.45, -0.05), c = vec2(0.05, -0.05), e = vec2(-0.15, -0.95), f = vec2(0.45, 0.05), g = vec2(-0.05, 0.05);
        d = min(min(seg(p, a, b, 0.09), seg(p, b, f, 0.09)), seg(p, f, e, 0.09)); d = min(d, seg(p, c, g, 0.09)); }
    else if (id < 8.5) { d = min(ring(p, 0.78, 0.1), length(p) - 0.2); d = min(d, min(seg(p, vec2(-0.75, 0.05), vec2(0.75, 0.05), 0.08), seg(p, vec2(0.0, 0.0), vec2(0.0, -0.75), 0.08))); }
    else if (id < 9.5) { d = min(ring(p - vec2(0.0, -0.1), 0.72, 0.1), box(p - vec2(0.0, 0.85), vec2(0.18, 0.08), 0.03)); d = min(d, seg(p, vec2(0.0, -0.1), vec2(0.3, 0.25), 0.08)); }
    else if (id < 10.5) { d = min(box(p - vec2(0.0, -0.05), vec2(0.9, 0.32), 0.18), box(p - vec2(0.05, 0.35), vec2(0.5, 0.25), 0.14)); d = max(d, -min(length(p - vec2(-0.5, -0.4)) - 0.22, length(p - vec2(0.5, -0.4)) - 0.22)); d = min(d, min(ring(p - vec2(-0.5, -0.4), 0.16, 0.06), ring(p - vec2(0.5, -0.4), 0.16, 0.06))); }
    else if (id < 11.5) { d = min(box(p, vec2(0.6, 0.42), 0.08), box(p - vec2(0.0, 0.55), vec2(0.3, 0.1), 0.03)); d = min(d, min(box(p - vec2(-0.75, 0.0), vec2(0.12, 0.2), 0.03), box(p - vec2(0.75, 0.1), vec2(0.12, 0.25), 0.03))); d = max(d, -box(p - vec2(0.0, 0.0), vec2(0.35, 0.18), 0.04)); }
    else if (id < 12.5) { float a = atan(p.y, p.x); float k = mod(a + 0.2618, 1.0472) - 0.5236; vec2 q = length(p) * vec2(cos(k), sin(k)); d = seg(q, vec2(0.0), vec2(0.85, 0.0), 0.08); d = min(d, seg(q, vec2(0.55, 0.0), vec2(0.75, 0.2), 0.06)); }
    else { d = max(ring(p - vec2(0.0, -0.15), 0.8, 0.1), -(p.y + 0.35)); d = min(d, seg(p, vec2(0.0, -0.15), vec2(0.45, 0.35), 0.08)); d = min(d, length(p - vec2(0.0, -0.15)) - 0.14); }
    float a = u_line > 0.0 ? clamp(0.5 - (abs(d) - u_line * px * 0.5) / px, 0.0, 1.0) : clamp(0.5 - d / px, 0.0, 1.0);
    gl_FragColor = vec4(u_color.rgb, u_color.a * a);
}`;

/**
 * A trend line: up to 64 samples (u_hist, 0..1 each, -1 none, oldest first; u_count of them), drawn across
 * the layer with a glow and the area under it filled, the last sample marked.
 */
const SPARK_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform vec4 u_hist[16];
uniform float u_count;
uniform vec3 u_line;
uniform vec3 u_fill;
varying vec2 v_uv;
float sampleAt(float i) {
    float slot = floor(i / 4.0), lane = i - slot * 4.0;
    vec4 v = u_hist[0];
    for (int k = 1; k < 16; k++) if (float(k) == slot) v = u_hist[k];
    return lane < 0.5 ? v.x : lane < 1.5 ? v.y : lane < 2.5 ? v.z : v.w;
}
void main() {
    if (u_count < 2.0) { gl_FragColor = vec4(0.0); return; }
    vec2 p = v_uv * u_size;
    float pad = 4.0, h = u_size.y - 2.0 * pad;
    float f = clamp(v_uv.x, 0.0, 1.0) * (u_count - 1.0), i = floor(f);
    float a = sampleAt(i), b = sampleAt(min(i + 1.0, u_count - 1.0));
    if (a < 0.0 || b < 0.0) { gl_FragColor = vec4(0.0); return; }
    float yv = pad + h * (1.0 - mix(a, b, f - i));
    float slope = (b - a) * h / (u_size.x / (u_count - 1.0));
    float dist = abs(p.y - yv) / sqrt(1.0 + slope * slope);
    vec4 acc = vec4(0.0);
    acc = over(acc, u_fill, (p.y > yv ? 1.0 : 0.0) * 0.28 * (1.0 - (p.y - yv) / max(1.0, u_size.y - yv)));
    acc = over(acc, u_line, exp(-dist * dist / 18.0) * 0.35);
    acc = over(acc, u_line, clamp(1.4 - dist, 0.0, 1.0));
    float last = sampleAt(u_count - 1.0);
    float dl = length(p - vec2(u_size.x - 1.0, pad + h * (1.0 - last)));
    acc = over(acc, u_line, clamp(3.5 - dl, 0.0, 1.0));
    gl_FragColor = acc;
}`;

/**
 * The car from above for the xDrive split: body, glasshouse, wheels, the axles lit by their share and the
 * torque flowing from the gearbox to each axle (chevrons moving at a speed set by the share, on the
 * renderer's clock: nothing is sent to move them).
 *   u_value   the rear share 0..1 (u_valid 0: no data, nothing lit)
 */
const CAR_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
uniform float u_valid;
uniform vec3 u_body;
uniform vec3 u_edge;
uniform vec3 u_accent;
uniform vec3 u_wheel;
varying vec2 v_uv;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
    vec2 p = (v_uv - 0.5) * u_size;               /* px from the centre, y down (front at the top) */
    float W = u_size.x, H = u_size.y;
    float rear = clamp(u_value, 0.0, 1.0) * u_valid, front = (1.0 - clamp(u_value, 0.0, 1.0)) * u_valid;
    vec4 acc = vec4(0.0);
    float fy = -H * 0.30, ry = H * 0.30, track = W * 0.30;
    /* the axles, lit by their share, with a glow */
    float fa = box(p - vec2(0.0, fy), vec2(track, 5.0), 5.0), ra = box(p - vec2(0.0, ry), vec2(track, 5.0), 5.0);
    acc = over(acc, u_accent, exp(-max(fa, 0.0) * max(fa, 0.0) / 120.0) * front * 0.6);
    acc = over(acc, u_accent, exp(-max(ra, 0.0) * max(ra, 0.0) / 120.0) * rear * 0.6);
    /* the body: wider at the back, rounded at both ends */
    float taper = mix(0.86, 1.0, clamp((p.y + H * 0.45) / (H * 0.9), 0.0, 1.0));
    float bd = box(vec2(p.x / taper, p.y), vec2(W * 0.24, H * 0.46), W * 0.12);
    acc = over(acc, mix(u_body * 1.25, u_body * 0.75, v_uv.y), clamp(0.5 - bd, 0.0, 1.0));
    acc = over(acc, u_edge, clamp(1.6 - abs(bd), 0.0, 1.0) * 0.9);
    /* the glasshouse */
    float gd = box(p - vec2(0.0, H * 0.02), vec2(W * 0.17, H * 0.2), W * 0.07);
    acc = over(acc, mix(u_edge * 0.55, u_body * 0.6, v_uv.y), clamp(0.5 - gd, 0.0, 1.0) * 0.9);
    /* the drive shaft and the torque flowing out of the gearbox (just behind the front axle) to each axle */
    float gy = fy + H * 0.12;
    float shaft = abs(p.x) - 3.0;
    if (shaft < 6.0) {
        float toFront = p.y < gy ? 1.0 : 0.0, share = toFront > 0.5 ? front : rear;
        float dir = toFront > 0.5 ? -1.0 : 1.0;
        float s = fract((p.y - gy) * dir / 22.0 - u_time * (0.4 + 2.4 * share));
        float chev = clamp(1.0 - abs(s - 0.5 - abs(p.x) / 22.0) * 7.0, 0.0, 1.0);
        float within = toFront > 0.5 ? span(p.y, fy, gy) : span(p.y, gy, ry);
        acc = over(acc, u_edge * 0.6, clamp(0.5 - shaft, 0.0, 1.0) * within * 0.6);
        acc = over(acc, u_accent, chev * share * within * clamp(1.0 - abs(p.x) / 8.0, 0.0, 1.0));
    }
    acc = over(acc, u_accent * 0.9, clamp(0.5 - fa, 0.0, 1.0) * (0.25 + 0.75 * front));
    acc = over(acc, u_accent * 0.9, clamp(0.5 - ra, 0.0, 1.0) * (0.25 + 0.75 * rear));
    /* the wheels, their rims catching the axle's light */
    for (int i = 0; i < 4; i++) {
        float sx = i == 0 || i == 2 ? -1.0 : 1.0, ax = i < 2 ? fy : ry, lit = i < 2 ? front : rear;
        float wd = box(p - vec2(sx * (track + 12.0), ax), vec2(13.0, 30.0), 7.0);
        acc = over(acc, u_wheel, clamp(0.5 - wd, 0.0, 1.0));
        acc = over(acc, mix(u_edge, u_accent, lit), clamp(1.4 - abs(wd), 0.0, 1.0));
    }
    gl_FragColor = acc;
}`;

/**
 * The shift light: u_count round lights in a row, lit up to u_value (0..1), green, then yellow, then red; at
 * the shift point (u_flash 1) all of them red and blinking on the renderer's clock.
 */
const LEDS_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_value;
uniform float u_count;
uniform float u_flash;
uniform float u_soft;
uniform float u_shape;             /* 0: round lights, 1: thin segments */
uniform vec3 u_off;
uniform vec3 u_green;
uniform vec3 u_yellow;
uniform vec3 u_red;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    float cell = u_size.x / u_count, i = floor(p.x / cell), f = (i + 0.5) / u_count;
    vec2 c = vec2((i + 0.5) * cell, u_size.y * 0.5);
    float r = min(cell * 0.32, u_size.y * 0.3), d = length(p - c);
    if (u_shape > 0.5) {
        /* thin segments instead of round lights: d measured to a slim rounded bar, its "radius" half its height */
        vec2 q = abs(p - c) - vec2(cell * 0.36 - 2.0, 0.0);
        r = max(2.0, u_size.y * 0.16);
        d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    }
    bool on = f <= u_value || u_flash > 0.5;
    vec3 col = f < 0.5 ? u_green : f < 0.8 ? u_yellow : u_red;
    if (u_flash > 0.5) col = u_red;
    float blink = u_flash > 0.5 ? 1.0 - step(0.5, fract(u_time * 7.0)) : 1.0;
    vec4 acc = vec4(0.0);
    float lit = on ? blink : 0.0;
    /* the glow, faded out before the light's own cell ends so the lights don't sit in squares */
    float fade = smoothstep(cell * 0.5, cell * 0.28, abs(p.x - c.x)) * smoothstep(u_size.y * 0.5, u_size.y * 0.25, abs(p.y - c.y));
    acc = over(acc, col, exp(-max(d - r, 0.0) * max(d - r, 0.0) / (r * r * 0.5)) * 0.6 * (1.0 - u_soft * 0.7) * lit * fade);
    acc = over(acc, mix(u_off, col * (1.0 + 0.25 * (1.0 - d / r)), lit), clamp(r - d + 0.5, 0.0, 1.0));
    acc = over(acc, u_off * 1.8, clamp(1.2 - abs(d - r), 0.0, 1.0) * (1.0 - lit));
    gl_FragColor = acc;
}`;

/*
 * Freedom (layout_freedom.js): the waving flag, the eagles and the fireworks. Each animates on the renderer's own
 * clock (u_time): nothing is sent to move them. Small loops, no uniform arrays (a merged shader with big arrays
 * once rebooted the KOMBI).
 */
const HASH = `
float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`;

/**
 * The stars and stripes, waving, dimmed under the readings.
 *   u_dim     the flag's brightness 0..1
 *   u_red, u_white, u_blue
 */
const FLAG_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_time;
uniform float u_dim;
uniform vec3 u_red;
uniform vec3 u_white;
uniform vec3 u_blue;
varying vec2 v_uv;
float star5(vec2 p, float r, float rf) {
    vec2 k1 = vec2(0.809016994, -0.587785252), k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
void main() {
    vec2 p = v_uv * u_size;
    float t = u_time;
    /* the wave: the cloth's rise and its light */
    float w = sin(p.x * 0.006 - t * 1.4 + p.y * 0.002);
    p.y += w * 10.0;
    float shade = 0.72 + 0.28 * sin(p.x * 0.006 - t * 1.4 + 0.9 + p.y * 0.002);
    float sh = u_size.y / 13.0;
    float stripe = mod(floor(p.y / sh), 2.0);           /* 0: red, 1: white */
    vec3 col = stripe < 0.5 ? u_red : u_white * 0.55;
    /* the canton: 7 stripes deep, 0.4 of the width, 50 stars */
    if (p.x < u_size.x * 0.4 && p.y < sh * 7.0) {
        col = u_blue;
        vec2 cs = vec2(u_size.x * 0.4 / 12.0, sh * 7.0 / 10.0);
        vec2 c = floor(p / cs), f = (fract(p / cs) - 0.5) * cs;
        float on = mod(c.x + c.y, 2.0) < 0.5 ? 1.0 : 0.0;
        float d = star5(f * vec2(1.0, -1.0), min(cs.x, cs.y) * 0.42, 0.45);
        float twinkle = 0.75 + 0.25 * sin(t * 3.0 + c.x * 1.7 + c.y * 2.3);
        col = mix(col, u_white * twinkle, clamp(0.5 - d, 0.0, 1.0) * on);
    }
    gl_FragColor = vec4(col * shade * u_dim, 1.0);
}`;

/**
 * Bald eagles flying across: two, at their own speeds and heights, wings beating.
 *   u_body, u_head (and tail), u_beak, u_rim (a light edge, to read on the dark flag)
 */
const EAGLE_FS = `#version 100
${HIGHP}${COMMON}${HASH}
uniform vec2 u_size;
uniform highp float u_time;
uniform vec3 u_body;
uniform vec3 u_head;
uniform vec3 u_beak;
uniform vec3 u_rim;
varying vec2 v_uv;
float seg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - mix(ra, rb, h);
}
float ell(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
void main() {
    vec2 p = v_uv * u_size;
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float speed = 0.045 + 0.02 * fi, sc = 1.7 - 0.45 * fi;   /* the near one bigger */
        float x = fract(u_time * speed + fi * 0.47) * (u_size.x + 520.0) - 260.0;
        float y = u_size.y * (0.42 + 0.22 * fi) + sin(u_time * 0.8 + fi * 2.0) * 10.0;
        vec2 q = (p - vec2(x, y)) / sc;
        if (abs(q.x) > 130.0 || abs(q.y) > 110.0) continue;   /* (in the eagle's own units) */
        float flap = sin(u_time * 5.0 + fi * 1.3);
        /* the wings: the far one darker, from the shoulders to the tips, primaries spread */
        vec2 tipN = vec2(-30.0 + 18.0 * flap, -82.0 * flap - 12.0), tipF = vec2(-22.0 + 14.0 * flap, -64.0 * flap - 6.0);
        float wf = seg(q, vec2(4.0, -2.0), tipF, 15.0, 3.0);
        float wn = min(seg(q, vec2(-2.0, 0.0), tipN, 17.0, 3.0), min(seg(q, vec2(-2.0, 0.0), tipN + vec2(-14.0, 6.0), 12.0, 2.0), seg(q, vec2(-2.0, 0.0), tipN + vec2(10.0, 8.0), 12.0, 2.0)));
        float body = ell(q - vec2(0.0, 4.0), vec2(42.0, 13.0));
        float tail = seg(q, vec2(-36.0, 5.0), vec2(-62.0, 9.0), 8.0, 11.0);
        float head = length(q - vec2(44.0, -2.0)) - 11.0;
        float beak = seg(q, vec2(50.0, 0.0), vec2(62.0, 4.0), 4.0, 1.0);
        float eye = length(q - vec2(48.0, -5.0)) - 1.6;
        float dark = min(min(body, wn), wf);
        acc = over(acc, u_rim, clamp(1.5 - abs(min(dark, min(head, tail))), 0.0, 1.0) * 0.55);
        acc = over(acc, u_body * 0.7, clamp(0.5 - wf, 0.0, 1.0));
        acc = over(acc, u_body, clamp(0.5 - min(body, wn), 0.0, 1.0));
        acc = over(acc, u_head, clamp(0.5 - min(head, tail), 0.0, 1.0));
        acc = over(acc, u_beak, clamp(0.5 - beak, 0.0, 1.0));
        acc = over(acc, vec3(0.05), clamp(0.5 - eye, 0.0, 1.0));
    }
    gl_FragColor = acc;
}`;

/**
 * Fireworks: three bursts in turn, each a rising trail, a flash and 14 sparks falling and fading, in red,
 * white or blue.
 *   u_red, u_white, u_blue; u_value: none (they go off on their own)
 */
const FIREWORKS_FS = `#version 100
${HIGHP}${COMMON}${HASH}
uniform vec2 u_size;
uniform highp float u_time;
uniform vec3 u_red;
uniform vec3 u_white;
uniform vec3 u_blue;
varying vec2 v_uv;
void main() {
    vec2 p = v_uv * u_size;
    vec3 col = vec3(0.0);
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
        float fi = float(i), P = 2.9 + 0.4 * fi;
        float tt = u_time + fi * 1.13, n = floor(tt / P), f = fract(tt / P);
        float seed = n * 7.31 + fi * 3.17;
        vec2 c = vec2(mix(0.2, 0.8, hash1(seed)), mix(0.25, 0.55, hash1(seed + 1.0))) * u_size;
        float pick = hash1(seed + 2.0);
        vec3 k = pick < 0.34 ? u_red : pick < 0.67 ? u_white : u_blue;
        if (f < 0.22) {
            /* the rocket going up, a short trail */
            float g = f / 0.22;
            vec2 r = vec2(c.x, mix(u_size.y + 10.0, c.y, g * (2.0 - g)));
            float d = length((p - r) * vec2(1.0, 0.35));
            float s = exp(-d * d / 6.0);
            col += vec3(1.0, 0.85, 0.6) * s; a += s;
        } else {
            float g = (f - 0.22) / 0.78, R = 130.0 + 70.0 * hash1(seed + 3.0);
            float fade = pow(1.0 - g, 1.6);
            float fl = exp(-length(p - c) / 40.0) * max(0.0, 1.0 - g * 6.0);   /* the flash */
            col += k * fl * 1.4; a += fl;
            for (int j = 0; j < 14; j++) {
                float fj = float(j), ang = fj * 0.4488 + hash1(seed + fj) * 0.3;
                vec2 sp = c + vec2(cos(ang), sin(ang)) * R * (1.0 - pow(1.0 - g, 2.2)) * (0.75 + 0.25 * hash1(seed + fj + 9.0)) + vec2(0.0, 60.0 * g * g);
                float d = length(p - sp);
                float s = exp(-d * d / 10.0) * fade * 1.3 + exp(-d / 9.0) * fade * 0.25;
                col += k * s; a += s;
            }
        }
    }
    a = clamp(a, 0.0, 1.0);
    gl_FragColor = vec4(a > 0.0 ? min(col / max(a, 0.001), vec3(1.0)) : vec3(0.0), a);
}`;

/**
 * The road ahead in perspective, drawn as the car's driving assistant sees it: three lanes converging to a point
 * above the layer, the car seen from behind at the bottom, and from the assistant (u_dap valid) the car it
 * follows, the nearest car in each lane beside, the lane held by the steering assist (its edges lit), lane
 * departure (that edge in the warning colour) and lane change warnings (that car in it), and the cruise control's
 * gap as bars ahead of the car. The ego lane's edges are dashed and go by with the car when nothing is held (by
 * the distance driven, worked out on the head unit each frame from the speed: u_run).
 *   u_run     metres driven, mod 1200
 *   u_value   the speed 0..1
 *   u_dap     valid, steering assist, cruise control on, its gap (bars)
 *   u_lead    present, depth (0 at the horizon, 1 at the car), lanes to the left, brake lights
 *   u_side    the left lane's car's depth (0: none), the right's, lane change warning left, right
 *   u_ldw     lane departure warning left, right
 */
const ROAD_FS = `#version 100
${HIGHP}${COMMON}
uniform vec2 u_size;
uniform highp float u_run;         /* metres driven (mod 1200): the lane dashes go by with the car */
uniform float u_value;
uniform vec4 u_dap;
uniform vec4 u_lead;
uniform vec4 u_side;
uniform vec2 u_ldw;
uniform vec3 u_line;
uniform vec3 u_glow;
uniform vec3 u_surface;
uniform vec3 u_assist;
uniform vec3 u_acc;
uniform vec3 u_warn;
uniform vec3 u_car;
uniform vec3 u_ego;
uniform sampler2D u_cars;
uniform vec2 u_cars_size;
uniform vec4 u_anchor;             /* the car in its frame: centre, bottom, body width (fractions), 0 */
varying vec2 v_uv;
float lineA(float dx, float w) { return clamp(w - abs(dx) + 0.5, 0.0, 1.0); }
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
/* a car from behind, its bottom centre at b, its body w wide: the car rendered once (tools/render_cars.py) and
 * sampled from u_cars at the level nearest its size (R the shading, G the tail lights, B the glass, A coverage
 * with its shadow), its body in the colour asked, the glass dark with the light on it, the tail lights brighter
 * and glowing when braking; a soft pool of colour under it (followed, warned) */
vec4 car(vec4 acc, vec2 p, vec2 b, float w, vec3 body, float brake, vec3 halo, float haloA) {
    float S = w / u_anchor.z, Hs = S * 0.75;
    vec2 tl = vec2(b.x - S * u_anchor.x, b.y - Hs * u_anchor.y);
    vec2 uv = (p - tl) / vec2(S, Hs);
    vec2 e = (p - vec2(b.x, b.y - Hs * 0.02)) / vec2(w * 0.62, w * 0.16);
    acc = over(acc, halo, haloA * exp(-dot(e, e)) * 0.8);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return acc;
    float k = clamp(floor(log2(256.0 / max(S, 1.0))), 0.0, 4.0), lw = 256.0, xo = 0.0;
    for (int i = 0; i < 4; i++) { if (float(i) < k) { xo += lw + 2.0; lw *= 0.5; } }
    float lh = lw * 0.75;
    vec2 tc = vec2(xo, 0.0) + clamp(uv * vec2(lw, lh), vec2(0.5), vec2(lw, lh) - 0.5);
    vec4 s = texture2D(u_cars, tc / u_cars_size);
    vec3 col = body * s.r * 1.35;
    col = mix(col, vec3(0.03, 0.045, 0.06) + vec3(0.42, 0.5, 0.58) * s.r * 0.9, s.b);
    col = mix(col, vec3(1.0, 0.13, 0.09) * (0.7 + 0.55 * brake), s.g);
    acc = over(acc, col, s.a);
    vec2 g = (p - vec2(b.x, tl.y + Hs * 0.53)) / vec2(w * 0.55, w * 0.12);
    acc = over(acc, vec3(1.0, 0.15, 0.1), brake * 0.45 * exp(-dot(g, g)));
    return acc;
}
void main() {
    vec2 p = v_uv * u_size;
    float H = u_size.y, W = u_size.x, h0 = H * 0.22;
    float t = (p.y + h0) / (H + h0);                       /* 0 at the vanishing point, 1 at the bottom */
    float cx = W * 0.5, hw = t * W * 0.155, dx = p.x - cx, ax = abs(dx);
    float z = 1.0 / max(t, 0.05);
    /* the lane line's dashes where they are on the road: 3 m painted in every 12 m, x metres ahead at depth t
     * (t = 1/(1 + x/16)), moved by the distance driven */
    float xm = 16.0 * (z - 1.0);
    float run = fract((xm + u_run) / 12.0);
    float aa = 0.012 + 0.05 * (1.0 - t);
    float dash = smoothstep(0.0, aa, run) * (1.0 - smoothstep(0.25, 0.25 + aa, run));
    float w = 0.8 + 2.4 * t;
    float fade = smoothstep(0.04, 0.34, t);
    float valid = u_dap.x, assist = u_dap.y * valid;
    /* the surface: three lanes, the held one tinted */
    float onRoad = 1.0 - smoothstep(3.0 * hw - 1.5, 3.0 * hw + 1.5, ax);
    vec4 acc = vec4(u_surface, onRoad * (0.08 + 0.26 * t) * fade);
    acc = over(acc, u_assist, assist * (1.0 - smoothstep(hw - 1.0, hw + 1.0, ax)) * 0.16 * fade);
    /* the outer edges, solid and dim; the ego lane's: held (lit), warning, or dashed and running */
    float outer = lineA(ax - 3.0 * hw, w * 0.8);
    acc = over(acc, u_line, outer * 0.45 * fade);
    float left = dx < 0.0 ? 1.0 : 0.0;
    float warn = valid * mix(u_ldw.y, u_ldw.x, left);
    float egoE = lineA(ax - hw, w);
    vec3 ec = warn > 0.5 ? u_warn : assist > 0.5 ? u_assist : u_line;
    float ea = (warn > 0.5 || assist > 0.5) ? egoE : egoE * dash;
    acc = over(acc, ec, exp(-abs(ax - hw) / (3.0 + 12.0 * t)) * (0.25 + 0.35 * max(warn, assist)) * fade);
    acc = over(acc, ec, ea * fade);
    /* the cruise control's gap: bars ahead of the car */
    if (u_dap.z * valid > 0.5) {
        for (int i = 0; i < 6; i++) {
            if (float(i) < u_dap.w) {
                float tb = 0.62 - float(i) * 0.045, yb = tb * (H + h0) - h0;
                float bar = clamp(1.6 + 1.8 * tb - abs(p.y - yb) + 0.5, 0.0, 1.0) * step(ax, tb * W * 0.155 * 0.62);
                acc = over(acc, u_acc, bar * 0.9);
            }
        }
    }
    /* the cars beside, then the one followed, then ours */
    float tL = u_side.x * valid, tR = u_side.y * valid;
    if (tL > 0.0) acc = car(acc, p, vec2(cx - 2.0 * tL * W * 0.155, tL * (H + h0) - h0), 1.08 * tL * W * 0.155, mix(u_car, u_warn, u_side.z), 0.0, u_warn, 0.6 * u_side.z);
    if (tR > 0.0) acc = car(acc, p, vec2(cx + 2.0 * tR * W * 0.155, tR * (H + h0) - h0), 1.08 * tR * W * 0.155, mix(u_car, u_warn, u_side.w), 0.0, u_warn, 0.6 * u_side.w);
    float tl = u_lead.y;
    if (u_lead.x * valid > 0.5) acc = car(acc, p, vec2(cx - u_lead.z * 2.0 * tl * W * 0.155, tl * (H + h0) - h0), 1.08 * tl * W * 0.155, u_car, u_lead.w, u_acc, 0.7 * u_dap.z);
    acc = car(acc, p, vec2(cx, H - 6.0), 0.98 * W * 0.155, u_ego, 0.0, u_glow, 0.35);
    gl_FragColor = acc;
}`;

/**
 * A chevron gauge (Sport, layout_sport.js): a band along two straight segments, A (the bottom, 0) to the corner B to
 * C (the top, 1), the corner pointing away from the screen's middle (rounded outside, sharp inside). The band
 * filled from A to u_value in a gradient over its track, a white marker across it at the value, a bright line along
 * its outer edge with a glow, a thin line inside it past a gap, short dashes in u_redc along its inner edge from
 * u_red (the shift zone), ticks and numerals
 * outside it. Transparent elsewhere.
 *   u_ab      A and B (px in this layer)
 *   u_c       C, the band's thickness, the outer line's glow 0..1
 *   u_lines   the outer line's width, the gap to the inner line, the inner line's width, where the scale ends
 *             (0..1 of the path: its marks spread to there; the value and u_red are of the whole path)
 *   u_marks   marks (0: none), numeral height px (0: none), numeral distance px from the centre line (outwards),
 *             tick length px
 *   u_nums    the numerals: marks 0..x at y apart, then z apart (200 at 120, 160, 200 over 0-100 in 20s); w: the
 *             highest a numeral's centre may sit (px in the layer: clear of the glass's slanted corners)
 */
const CHEVRON_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}
uniform vec2 u_size;
uniform vec4 u_ab;
uniform vec4 u_c;
uniform vec4 u_lines;
uniform vec4 u_marks;
uniform vec4 u_nums;
uniform float u_value;
uniform float u_red;
uniform float u_digit_adv;
uniform vec3 u_track;
uniform vec3 u_fill0;
uniform vec3 u_fill1;
uniform vec3 u_tip;
uniform vec3 u_line;
uniform vec3 u_redc;
uniform vec3 u_num;
varying vec2 v_uv;
/* the outward normal of P0->P1 (away from m, the chevron's inside) */
vec2 outward(vec2 p0, vec2 p1, vec2 m) {
    vec2 u = normalize(p1 - p0), n = vec2(-u.y, u.x);
    return dot(n, m - p0) > 0.0 ? -n : n;
}
void main() {
    vec2 p = v_uv * u_size;
    vec2 A = u_ab.xy, B = u_ab.zw, Cp = u_c.xy;
    float T = u_c.z, hw = T * 0.5;
    vec2 mid = (A + Cp) * 0.5;
    float L1 = length(B - A), L2 = length(Cp - B), L = L1 + L2;
    vec2 u1 = (B - A) / L1, u2 = (Cp - B) / L2;
    vec2 n1 = outward(A, B, mid), n2 = outward(B, Cp, mid);
    float h1 = dot(p - A, u1), h2 = dot(p - B, u2);
    vec2 q1 = A + u1 * clamp(h1, 0.0, L1), q2 = B + u2 * clamp(h2, 0.0, L2);
    float d1 = length(p - q1), d2 = length(p - q2);
    bool first = d1 <= d2;
    float sd = first ? sign(dot(p - A, n1) + 0.0001) * d1 : sign(dot(p - B, n2) + 0.0001) * d2;   /* + outside */
    float t = first ? clamp(h1, 0.0, L1) / L : (L1 + clamp(h2, 0.0, L2)) / L;
    /* past either end (square ends): nothing of the band or its lines */
    float beyond = first ? -h1 : h2 - L2;
    float ends = clamp(0.5 - beyond, 0.0, 1.0), scaleEnd = u_lines.w > 0.0 ? u_lines.w : 1.0;
    float v = clamp(u_value, 0.0, 1.0);
    vec4 acc = vec4(0.0);
    float ow = u_lines.x, oc = hw + ow * 0.5;
    /* the outer line's glow, under everything */
    float go = sd - oc;
    acc = over(acc, u_line, exp(-go * go / (T * T * 0.18)) * u_c.w * 0.55 * ends);
    /* the band: the track, the fill to the value, brighter across its middle */
    float body = span(sd, -hw, hw) * ends;
    float lit = clamp((v - t) * L + 0.5, 0.0, 1.0) * (v > 0.003 ? 1.0 : 0.0);
    float across = 1.0 - abs(sd) / hw;
    vec3 fc = mix(u_fill0, u_fill1, clamp(t / max(v, 0.001), 0.0, 1.0));
    acc = over(acc, mix(u_track * (0.8 + 0.3 * (1.0 - across)), fc * (0.85 + 0.25 * across), lit), body);
    /* the outer line and the inner one (dashed from u_red) */
    acc = over(acc, u_line, span(sd, hw, hw + ow) * ends);
    float i0 = -hw - u_lines.y - u_lines.z, i1 = -hw - u_lines.y;
    bool hot = t >= u_red;
    float dash = hot ? step(0.45, fract(t * L / 12.0)) : 1.0;
    acc = over(acc, u_line, span(sd, i0, i1) * ends);
    /* the shift zone: short dashes along the band's inner edge */
    if (hot) acc = over(acc, u_redc, span(sd, -hw + 3.0, -hw + 7.0) * dash * 0.9 * ends);
    /* the marker at the value */
    float off = abs(t - v) * L;
    acc = over(acc, u_tip, clamp(2.0 - off + 0.5, 0.0, 1.0) * span(sd, -hw, hw + ow) * (v > 0.003 ? 1.0 : 0.0));
    /* ticks and numerals outside */
    if (u_marks.x > 0.0) {
        float m = floor(clamp(t / scaleEnd, 0.0, 1.0) * u_marks.x + 0.5), tm = m / u_marks.x * scaleEnd;
        float r0 = hw + ow + 6.0;
        /* (not round the corner's outside, where every point is nearest the corner itself) */
        float inSeg = first ? step(h1, L1) : step(0.0, h2);
        acc = over(acc, u_num, clamp(1.4 - abs(t - tm) * L + 0.5, 0.0, 1.0) * span(sd, r0, r0 + u_marks.w) * ends * inSeg);
        if (u_marks.y > 0.0) {
            /* the numerals stand out sideways from their marks, so a pixel's own mark is found by its height (the
             * path climbs all the way: A at the bottom, C at the top), then that mark and its neighbours tried */
            float sy = p.y >= B.y ? L1 * (A.y - p.y) / max(A.y - B.y, 0.001) : L1 + L2 * (B.y - p.y) / max(B.y - Cp.y, 0.001);
            float m0 = floor(clamp(sy / L / scaleEnd, 0.0, 1.0) * u_marks.x + 0.5);
            float side = n1.x + n2.x >= 0.0 ? 1.0 : -1.0;
            float h = u_marks.y, adv = u_digit_adv;
            for (int k = -1; k <= 1; k++) {
                float mk = m0 + float(k);
                if (mk < 0.0 || mk > u_marks.x) continue;
                float tk = mk / u_marks.x * scaleEnd, sm = tk * L;
                vec2 pm = sm <= L1 ? A + u1 * sm : B + u2 * (sm - L1);
                /* (straight out sideways, as on a dial's edge; none above u_nums.w: the glass's slanted corners) */
                vec2 pc = pm + vec2(side, 0.0) * u_marks.z;
                pc.y = max(pc.y, u_nums.w);
                float vk = mk <= u_nums.x ? mk * u_nums.y : u_nums.x * u_nums.y + (mk - u_nums.x) * u_nums.z;
                float n = vk >= 99.5 ? 3.0 : vk >= 9.5 ? 2.0 : 1.0;
                vec2 g = (p - pc) / h;
                float x = g.x + n * adv * 0.5;
                float i = floor(x / adv);
                if (i >= 0.0 && i < n && abs(g.y) < 0.5) {
                    float sd2 = sdf(digitOf(vk, i, n), vec2(x - (i + 0.5) * adv, g.y + 0.5));
                    vec3 nc = abs(tk - v) < 0.5 * scaleEnd / u_marks.x ? u_tip : u_num;
                    acc = over(acc, nc, smoothstep(0.5 - 2.0 / h, 0.5 + 2.0 / h, sd2));
                }
            }
        }
    }
    gl_FragColor = acc;
}`;

/*
 * The M and Sport layouts' shaders (layout_m.js, layout_sport.js): bimmer-lab's Cluster Themes shaders (shared/shaders.js
 * of github.com/bimmer-lab/apps; MIT, Copyright (c) 2026 bimmer-lab: NOTICE), as they wrote them, so the two look as
 * theirs do on the car. MDASH the M backdrop (the cards, the centre line, the side dials, the M stripes; here each
 * part in its own small layer, u_part: theirs in one full-screen layer restarted the cluster), MTACH an M rev blade, SDASH the Sport view (here likewise in three layers: each bracket, the bottom line and strip; its engine speed here u_value, eased
 * by the engine as every gauge's). Their uniforms are set from the layouts' pieces (bimmer-lab's layout JSON's
 * numbers), the readings through dyn (60 a second, when they change).
 */
const MDASH_FS = `// The M theme's backdrop (GLSL ES 1.00), traced off a photo of a current M8's cluster (design/photos/ref-m8-cluster.png,
// warped to 1920x720): a near-black card either side whose inner edge follows the rev blade, whose top edge is the
// photo's curve and whose bottom outer corner is a big round; the centre line with its bright end caps and the
// tricolour mark. (Here each part in its own small layer, u_part, u_off; their tyre block, setup bars and side dials
// left out: the gauges are flat bars, MBAR_FS.) v_uv (0,0) is the top-left.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_card;      // left card: outer edge x, bottom y, bottom-outer corner radius, top-outer corner rounding (the right card is its mirror)
uniform vec3 u_cardCutR;  // the right card's lower outer corner, cut back on a circle (mirrored frame: cx, cy, r; r 0 = none): the M8's
                          // right card is cut further than its left one, so the oil dial's numbers sit on black
uniform vec3 u_cardTop;   // the left card's top edge, y = a x^2 + b x + c (traced off the M8 photo)
uniform float u_cardFill; // the card's grey level 0..1 (0 = black, outline only)
uniform vec4 u_blade;     // the left rev blade's outer edge: x at the bend, y of the bend, x per y px above / below it
uniform vec2 u_bladeB;    // the bend's roundness px, the card's gap from the blade px
uniform vec4 u_line;      // centre line x0, y, x1, cap length
uniform vec3 u_mark;      // tricolour mark x, y, scale (0 = none)
uniform vec3 u_red;
uniform vec2 u_off;       // (here) the layer's place on the panel: the parts are drawn each in its own small layer
uniform float u_part;     // (here) which part: 1 the cards, 2 the centre line, 4 the stripes

const float PI = 3.14159265;

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

float angOf(vec2 d) { float a = atan(d.x, -d.y); return a < 0.0 ? a + 2.0 * PI : a; }
// the left blade's outer edge x at y (mtach's curve)
float bladeX(float y) {
    float dy = y - u_blade.y;
    float k = dy < 0.0 ? u_blade.z : u_blade.w;
    return u_blade.x + k * (sqrt(dy * dy + u_bladeB.x * u_bladeB.x) - u_bladeB.x);
}
// smooth intersection of two signed distances (rounds the corner where they meet)
float smax(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0); return mix(b, a, h) + k * h * (1.0 - h); }
// the left card as the M8 draws it: a wedge whose top edge is the traced curve, outer edge at u_card.x, bottom at
// u_card.y, inner side along the blade; the bottom-outer corner is a big round (the fuel dial sits over it); < 0 inside
float cardD(vec2 p, float right) {
    float fx = u_cardTop.x * p.x * p.x + u_cardTop.y * p.x + u_cardTop.z;
    float slope = 2.0 * u_cardTop.x * p.x + u_cardTop.y;
    float dTop = (fx - p.y) / sqrt(1.0 + slope * slope);
    float dLeft = u_card.x - p.x;
    float dBot = p.y - u_card.y;
    float d = smax(dTop, dLeft, u_card.w);
    d = max(d, dBot);
    vec2 cc = vec2(u_card.x + u_card.z, u_card.y - u_card.z);
    if (p.x < cc.x && p.y > cc.y) d = max(d, length(p - cc) - u_card.z);
    d = max(d, p.x - (bladeX(p.y) - u_bladeB.y));
    if (right > 0.5 && u_cardCutR.z > 0.0) d = max(d, length(p - u_cardCutR.xy) - u_cardCutR.z);
    return d;
}
// the card: near-black (the panel brightens every dark tint, so the fill stays tiny), a shade lighter and bluer at
// the top, with a faint lighter rim
vec4 card(vec2 p, float right, vec4 c) {
    float d = cardD(p, right);
    if (d > 2.0) return c;
    float top = u_cardTop.z - u_cardTop.y * u_cardTop.y / (4.0 * u_cardTop.x);   // the curve's lowest y (its vertex)
    float fy = clamp((p.y - top) / max(u_card.y - top, 1.0), 0.0, 1.0);
    float grey = u_cardFill * mix(1.3, 0.75, fy);
    c = over(vec4(vec3(grey, grey, grey * 1.18), cov(d)), c);
    c = over(vec4(0.5, 0.53, 0.58, 0.3 * cov(abs(d + 1.2) - 0.9)), c);
    return c;
}

void main() {
    // (here) one part in its own small layer, over the panel's own background (a flat): the whole backdrop in one
    // full-screen layer, as theirs, restarted the cluster on the car (twice, 2026-11-09)
    vec2 p = v_uv * u_size + u_off;
    vec2 pm = vec2(1920.0 - p.x, p.y);          // the right half, mirrored into the left frame
    vec4 c = vec4(0.0);
    if (u_part < 1.5) {
        // the two cards: the left one as laid out, the right one its mirror
        if (p.x < 960.0) c = card(p, 0.0, c);
        else c = card(pm, 1.0, c);
    } else if (u_part < 2.5) {
        // centre line, bright caps at both ends
        c = over(vec4(0.62, 0.66, 0.73, 0.8 * cov(segD(p, u_line.xy, u_line.zy) - 1.6)), c);
        float l = segD(p, u_line.xy + vec2(6.0, 0.0), u_line.xy + vec2(u_line.w, 0.0)) - 2.0 - 1.2 * clamp((p.x - u_line.x) / u_line.w, 0.0, 1.0);
        float r = segD(p, u_line.zy - vec2(u_line.w, 0.0), u_line.zy - vec2(6.0, 0.0)) - 2.0 - 1.2 * clamp((u_line.z - p.x) / u_line.w, 0.0, 1.0);
        c = over(vec4(0.95, 0.96, 0.98, cov(min(l, r))), c);
    } else {
        // tricolour mark: three slanted bars
        vec2 m = (p - u_mark.xy) / u_mark.z;
        if (m.y > -1.0 && m.y < 21.0 && m.x > -2.0 && m.x < 60.0) {
            float lx = m.x - 7.0 * (1.0 - m.y / 20.0);
            float i = floor(lx / 16.0);
            float fx = lx - i * 16.0;
            float inside = cov((max(abs(fx - 6.5) - 6.5, abs(m.y - 10.0) - 10.0)) * u_mark.z);
            vec3 mc = i < 0.5 ? vec3(0.31, 0.71, 1.0) : (i < 1.5 ? vec3(0.17, 0.29, 0.78) : vec3(0.9, 0.13, 0.17));
            if (i >= 0.0 && i <= 2.0) c = over(vec4(mc, inside), c);
        }
    }
    gl_FragColor = c;
}
`;
const MTACH_FS = `// The M theme's rev bar (GLSL ES 1.00), after the M8's: a bowed glass blade (the curve bends at u_geoA.z with a
// large roundness, so it reads as one arc), wide at 0 rpm and narrow at the top, with a bright silver outer
// edge and bright ticks running in from it every 1000 rpm. The part below the rpm is lit dim grey, a glowing red
// block rides the blade at the rpm (the M8's marker), an outlined grey foot block fills the bottom 20 px, orange dashes sit before
// the redline and a solid red line past it. Drawn as the left bar; u_side 1 mirrors it. v_uv (0,0) is the top-left.
// (Here, as a power gauge in an electric drive: u_zero above 0, the glass lit from the 0 to the value, below the 0
// regeneration in u_regen; the marker in u_mark.)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_side;
uniform vec4 u_geoA;      // y at 0 rpm, y at max, y of the bend, outer-edge x at the bend (layer px, left frame)
uniform vec3 u_geoB;      // slope above the bend, slope below it, bend roundness px
uniform vec3 u_wid;       // blade width at 0 rpm, at max, extra at the bend
uniform float u_ticks;    // max / 1000
uniform float u_value;    // 0..1
uniform float u_orange;   // 0..1, orange dashes from here
uniform float u_redFrom;  // 0..1, red dashes from here (the redline)
uniform float u_shiftNow;
uniform float u_zero;     // 0..1: where 0 sits (a power gauge; 0 for the engine speed)
uniform vec3 u_red;
uniform vec3 u_mark;      // the marker's colour
uniform vec3 u_regen;
uniform vec3 u_lit;       // the lit glass (the look's: comfort white, sport red, efficient teal, as ID8 M's)
uniform vec3 u_band;      // (0.39.5) the glass not lit: dark, in the look's tint (ID8 M's band)

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
vec4 over(vec4 top, vec4 under) {
    float a = top.a + under.a * (1.0 - top.a);
    if (a <= 0.0) return vec4(0.0);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

void main() {
    vec2 p = v_uv * u_size;
    if (u_side > 0.0) p.x = u_size.x - p.x;
    float y0 = u_geoA.x, y8 = u_geoA.y, ym = u_geoA.z, xm = u_geoA.w;
    float dy = p.y - ym;
    float k = dy < 0.0 ? u_geoB.x : u_geoB.y;
    float sq = sqrt(dy * dy + u_geoB.z * u_geoB.z);
    float xo = xm + k * (sq - u_geoB.z);
    float slope = k * dy / sq;
    float d = (p.x - xo) / sqrt(1.0 + slope * slope);      // + = into the blade, towards the middle
    float t = (y0 - p.y) / (y0 - y8);
    float w = mix(u_wid.x, u_wid.y, clamp(t, 0.0, 1.0)) + u_wid.z * exp(-dy * dy / 22000.0);
    vec4 c = vec4(0.0);
    if (t >= 0.0 && t <= 1.0) {
        float inBand = clamp(d + 0.5, 0.0, 1.0) * clamp(w - d + 0.5, 0.0, 1.0);
        float across = clamp(d / w, 0.0, 1.0);
        float yn = y0 - u_value * (y0 - y8);
        /*
         * (0.39.5) As ID8 M's band: the glass dark in the look's tint, lit from the 0 to the value in the look's colour
         * (comfort white, sport red, efficient teal; brighter towards the outer edge), the amber run-up and the red
         * zone dim until the rpm reaches them, bright where it has. Before: grey glass barely lit, and the amber gone
         * at the shift point (the whole lit part red then, the amber cells grey).
         */
        vec4 g = vec4(mix(u_band * 1.25, u_band, across), mix(0.92, 0.72, across));      // the glass not lit
        if (t < u_zero) g = vec4(mix(u_regen * 0.35, u_band, 0.4), mix(0.85, 0.65, across));   // the regeneration's part
        // lit from the 0 (the foot, or a power gauge's 0) to the value; at the shift point red (the shift light)
        bool lit = t >= min(u_zero, u_value) && t <= max(u_zero, u_value);
        vec3 lc = u_shiftNow > 0.5 ? vec3(1.0, 0.16, 0.12) : u_lit;
        if (lit) g = t < u_zero ? vec4(u_regen, mix(0.95, 0.8, across)) : vec4(mix(lc + (vec3(1.0) - lc) * 0.3, lc, across), mix(0.98, 0.88, across));
        // the run-up to the redline amber, the red zone red: dim, bright where the rpm has reached them (an engine
        // speed only: a power gauge's are off)
        bool reached = lit && u_zero <= 0.0;
        if (t >= u_orange && t < u_redFrom) g = reached ? vec4(mix(vec3(1.0, 0.92, 0.55), vec3(1.0, 0.76, 0.12), across), mix(0.98, 0.9, across))
            : vec4(mix(vec3(0.8, 0.6, 0.08), vec3(0.55, 0.4, 0.04), across), mix(0.9, 0.7, across));
        if (t >= u_redFrom) g = reached ? vec4(mix(vec3(1.0, 0.5, 0.45), vec3(0.95, 0.12, 0.12), across), mix(0.98, 0.9, across))
            : vec4(mix(vec3(0.85, 0.1, 0.1), vec3(0.62, 0.04, 0.05), across), mix(0.9, 0.7, across));
        // the foot: the bottom 20 px as an outlined grey block, as the M8 draws it
        if (p.y > y0 - 20.0) g = over(vec4(0.7, 0.72, 0.78, 0.22), g);
        g = over(vec4(0.9, 0.92, 0.95, 0.7 * cov(min(abs(p.y - (y0 - 19.0)), abs(p.y - (y0 - 1.5))) - 0.8)), g);
        // the marker: a white line at the rpm (ID8 M's), a soft glow either side (on electricity in its colour)
        float dm = abs(p.y - yn);
        g = over(vec4(u_mark, 0.35 * exp(-dm / 18.0)), g);
        g = over(vec4(mix(u_mark, vec3(1.0), 0.5), cov(dm - 3.0)), g);
        c = vec4(g.rgb, g.a * inBand);
        c = over(vec4(0.93, 0.95, 0.98, cov(abs(d) - 1.6)), c);               // outer edge
        c = over(vec4(1.0, 1.0, 1.0, 0.3 * cov(abs(d - 4.0) - 0.6)), c);       // its bevel
        c = over(vec4(0.66, 0.7, 0.76, 0.75 * cov(abs(d - w) - 0.8)), c);      // inner edge
        // (the run-up to the redline and the red zone: filled across the glass, above)
    }
    // ticks every 1000 rpm: bright, from the outer edge 24 px into the glass, as the M8 draws them
    float kk = floor(t * u_ticks + 0.5);
    float yk = y0 - kk / u_ticks * (y0 - y8);
    if (kk >= 0.0 && kk <= u_ticks && d > -2.0 && d < 24.0) {
        float ty = abs(p.y - yk) - 1.5;
        // (0.39.5) dark on the lit glass, white on the dark: seen on both
        bool onLit = d > 2.0 && t >= min(u_zero, u_value) && t <= max(u_zero, u_value);
        c = over(vec4(onLit ? vec3(0.08, 0.09, 0.11) : vec3(0.93, 0.95, 0.98), onLit ? 0.55 * cov(ty) : cov(ty)), c);
    }
    gl_FragColor = c;
}
`;
const SDASH_FS = `// The Sport theme in one cluster-render "effect" layer (GLSL ES 1.00), after BMW's Live Cockpit Sport view:
// a blue speed bracket left and a red rev bracket right (the left one mirrored). Each is a thin bright outer
// line, a band that fills from the bottom (white marker at the value), a dark gap and a thin inner line round a
// black middle: plain black, or the map through a see-through rounded hole (u_hole; only the bottom strip draws
// over it, the fuel and oil bars are off while it is open). Two-tone fuel and oil bars inside the brackets, a blue / red strip at the bottom. v_uv (0,0) is
// the top-left. The backdrop is pure black: the car brightens dark tints (seen Nov 5 2026), so no dark panels.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec2 u_size;
uniform vec4 u_geo;       // outer line: y at the top, y at the bend, y at the bottom, x at the bend (left side)
uniform vec3 u_k;         // x per y px above the bend, below it, bend roundness px
uniform float u_w;        // band width
uniform float u_inner;    // the inner line's distance from the outer line
uniform vec2 u_scale;     // y of the scale's 0 and of its top mark
uniform vec2 u_ticks;     // marks left (speed), right (rpm)
uniform float u_speed;    // 0..1 along the scale
uniform float u_value;    // 0..1, the engine speed (the engine's value: eased, every frame)
#define u_rpm u_value
uniform float u_redFrom;  // 0..1 (the redline)
uniform float u_orange;   // 0..1, yellow marks from here to the redline
uniform float u_fuel;     // 0..1
uniform float u_oil;      // 0..1
uniform vec4 u_fuelSeg;   // full end x, y, empty end x, y
uniform vec4 u_oilSeg;
uniform vec4 u_hole;      // map window x, y, w, h, already inset (w 0 = none)
uniform float u_holeR;    // the hole's corner radius px
uniform vec4 u_strip;     // bottom strip: left end x, top y, height, slant px
uniform float u_topEnd;   // the top lines run from the bracket to this x (left; mirrored on the right)
uniform vec2 u_off;       // (here) the layer's place on the panel
uniform float u_part;     // (here) 1 the speed bracket (and the fuel bar), 2 the rev bracket (and the oil bar), 3 the bottom line and strip
uniform vec2 u_stripFill; // (here) the bottom strip's halves as gauges: the left half lit from its left end to x, the right from the middle to y (0..1; negative: all lit)
uniform float u_regenR;   // (here) flags: 1 the bottom strip's right half is regeneration (green); 2 its left half red (a plug-in's charge low); in the rev bracket: 4 its bar with the fuel's zones (the fuel there), 8 without zones (a plug-in's charge), 12 that all red (the charge low)
uniform float u_zero;     // (here) the rev bracket's 0 (0..1 up it): above 0 a power gauge's regeneration below it, lit green
                          // from the 0 down to the value, its marks counted from the 0

const vec3 BLUE_LINE = vec3(0.36, 0.62, 1.0);
const vec3 BLUE_BAND = vec3(0.13, 0.3, 0.78);
const vec3 BLUE_LIT = vec3(0.62, 0.86, 1.0);
const vec3 BLUE_IN = vec3(0.2, 0.45, 0.98);
// (here) the rev bracket's colours are the look's (red in sport, as theirs; silver in comfort, teal in efficient)
uniform vec3 u_rline;
uniform vec3 u_rband;
uniform vec3 u_rlit;
uniform vec3 u_rin;
#define RED_LINE u_rline
#define RED_BAND u_rband
#define RED_LIT u_rlit
#define RED_IN u_rin
const vec3 REGEN_LIT = vec3(0.24, 0.86, 0.52);

const vec3 WHITE = vec3(1.0);
// (0.38.1) worked out once on the head unit (layout_sport.js): the outer line's x at its top and at its bottom, the
// inner line's x at its top run, 1 / the scale's height
uniform vec4 u_pts;

float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }
// (0.38.1) colour laid over the colour so far, premultiplied: no division a pixel (the old over() had one in each of
// its dozen calls); back to straight alpha once at the end
vec4 put(vec4 c, vec3 col, float a) { return vec4(col * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
// px from a level run at y from x0 to x1 (square ends)
float runD(vec2 q, float x0, float x1, float y) { return max(abs(q.y - y), max(x0 - q.x, q.x - x1)); }

// one bracket in the left frame (q mirrored for the right one)
vec4 bracket(vec2 q, float val, float zero, float redFrom, float orange, float ticks, vec3 line, vec3 band, vec3 lit, vec3 inner, vec4 c) {
    // px from the outer line, inwards (perpendicular): one square root and one inverse one
    float dy = q.y - u_geo.y;
    float k = dy < 0.0 ? u_k.x : u_k.y;
    float r = sqrt(dy * dy + u_k.z * u_k.z);
    float sl = k * dy / r;
    float d = (q.x - u_geo.w - k * (r - u_k.z)) * inversesqrt(1.0 + sl * sl);
    float yTopI = u_geo.x + 8.0;                              // the inner line's top run
    float t = (u_scale.x - q.y) * u_pts.w;                    // 0 at the scale's 0
    float inY = step(u_geo.x + 5.0, q.y) * step(q.y, u_geo.z - 4.0);
    // the band: lit from the 0 to the value (up from it, or below it, regeneration, down from it in green), white
    // marker on top; amber in the run-up to the redline, red from it (brighter where the value has reached them)
    float inB = inY * cov(5.0 - d) * cov(d - 5.0 - u_w);
    float f = clamp((d - 5.0) / u_w, 0.0, 1.0);
    float on = step(min(zero, val), t) * step(t, max(zero, val));
    float below = 1.0 - step(zero, t);
    vec3 lc = mix(lit, REGEN_LIT, below);
    vec3 litC = (lc + (WHITE - lc) * (0.25 * f)) * mix(0.8, 1.0, clamp(abs(t - zero) / max(abs(val - zero), 0.01), 0.0, 1.0));
    vec3 dimC = mix(band, mix(band, REGEN_LIT * 0.3, 0.6), below * step(0.0001, zero));
    float zr = step(redFrom, t) * step(t, 1.02), za = step(orange, t) * (1.0 - step(redFrom, t));
    vec3 zOn = mix(mix(vec3(1.0, 0.78, 0.12), vec3(1.0, 0.92, 0.55), f * 0.4), mix(vec3(0.95, 0.12, 0.12), vec3(1.0, 0.5, 0.45), f * 0.4), zr);
    vec3 zOff = mix(mix(vec3(0.55, 0.4, 0.04), vec3(0.8, 0.6, 0.08), f), mix(vec3(0.62, 0.04, 0.05), vec3(0.85, 0.1, 0.1), f), zr);
    vec3 col = mix(mix(dimC, litC, on), mix(zOff, zOn, on), za + zr);
    c = put(c, col, 0.96 * inB);
    float yv = u_scale.x - val / u_pts.w;
    c = put(c, WHITE, inB * cov(abs(q.y - yv) - 2.0) * max(step(0.002, val), step(0.0001, zero)));
    // marks at every label, on the band's outer half (counted from the 0; below it at its half and its end)
    float st = max(mix((1.0 - zero) / ticks, zero * 0.5, below), 0.001);
    float kk = floor((t - zero) / st + 0.5), tk = zero + kk * st;
    float yk = u_scale.x - tk / u_pts.w;
    float mk = inB * step(-0.001, tk) * step(kk, ticks) * step(7.0, d) * step(d, 19.0) * max(1.0 - below, step(0.0001, zero));
    c = put(c, mix(line, REGEN_LIT, step(kk, -0.5)), 0.9 * mk * cov(abs(q.y - yk) - 1.2));
    // the outer line with its glow outside it, its top run and its bottom run
    float o = max(inY, step(abs(q.y - u_geo.x), 6.0) + step(abs(q.y - u_geo.z), 6.0)) * cov(abs(d - 1.0) - 1.8);
    o = max(o, cov(runD(q, u_pts.x, u_topEnd, u_geo.x) - 2.2));
    o = max(o, cov(runD(q, u_pts.y, u_pts.y + u_inner + 40.0, u_geo.z) - 2.2));
    c = put(c, line, 0.35 * exp2(min(d, 0.0) * 0.2885) * inY * step(d, 0.0));
    c = put(c, line, min(o, 1.0));
    // the inner line: down the bracket from its top run to the bottom
    float il = step(yTopI, q.y) * step(q.y, u_geo.z - 6.0) * cov(abs(d - u_inner) - 1.6);
    il = max(il, cov(runD(q, u_pts.z, u_topEnd - 14.0, yTopI) - 1.6));
    return put(c, inner, 0.95 * il);
}

// a two-tone slanted bar from the empty end b to the full end a, with a thin rail beside it
vec4 bar(vec2 p, vec4 s, float val, float zones, vec4 c) {
    vec2 a = s.xy, b = s.zw, ba = a - b;
    float L = length(ba);
    vec2 dir = ba / L, nrm = vec2(-dir.y, dir.x);
    float side = dot(p - b, nrm), al = dot(p - b, dir);
    float sd = length(vec2(max(max(-al, al - L), 0.0), side));   // px from the bar's middle line
    float h = clamp(al / L, 0.0, 1.0);
    float body = cov(abs(side) - 7.0) * cov(sd - 7.5);
    // (here) in segments, as BMW's: white at the full end shading to blue at the empty one, the end zones coloured
    float sg = fract(h * 8.0) * L / 8.0;
    body *= clamp(sg - 1.5, 0.0, 1.0) * clamp(L / 8.0 - 1.5 - sg, 0.0, 1.0);
    vec3 col = mix(vec3(0.35, 0.6, 1.0), vec3(0.96, 0.97, 1.0), smoothstep(0.0, 0.6, h));
    if (zones < 0.5 && h < 0.125) col = vec3(1.0, 0.2, 0.22);
    if (zones > 0.5 && zones < 1.5 && h > 0.875) col = vec3(1.0, 0.2, 0.22);
    if (zones > 0.5 && zones < 1.5 && h < 0.125) col = vec3(0.25, 0.5, 1.0);
    // (2: no zones, a plug-in's charge; 3: the same, all red: the charge low)
    if (zones > 2.5) col = mix(vec3(0.8, 0.1, 0.12), vec3(1.0, 0.3, 0.3), smoothstep(0.0, 0.6, h));
    c = put(c, vec3(0.3, 0.32, 0.38), 0.9 * body);
    c = put(c, col, body * step(h, val + 0.0001) * step(0.001, val));
    return put(c, vec3(0.5, 0.52, 0.58), 0.8 * cov(abs(side + 12.0) - 1.0) * cov(sd - 13.0));
}

// (here) a flare where a bracket's outer line bends, as BMW's own: a soft glow and a four-pointed star. (0.38.1) Three
// exp2 a pixel (the streaks' two products each one exp2), the streaks shorter: all of it inside the bracket's layers
vec4 flare(vec2 q, vec2 c, vec3 col, float s, vec4 acc) {
    vec2 d = abs(q - c) / s;
    float star = exp2(-(d.x * 1.2 + d.y * 20.6)) + exp2(-(d.y * 1.44 + d.x * 20.6));
    float glow = exp2(-dot(d, d) * 2.885);
    acc = put(acc, col, glow * 0.55);
    return put(acc, mix(col, WHITE, 0.55), min(star * 0.9, 1.0));
}

void main() {
    // (here) one part in its own layer, over the panel's own background (a flat): the left bracket, the right one, the
    // bottom line and strip; the whole view in one full-screen layer, as theirs, is what restarted the cluster for M.
    // (0.38.1) Each bracket in four layers close round what it draws (layout_sport.js) and no early way out: a GPU
    // that runs both sides of a branch pays for it and the rest besides. ID8 M still restarted the car's cluster.
    vec2 p = v_uv * u_size + u_off;
    vec2 pm = vec2(1920.0 - p.x, p.y);
    vec4 c = vec4(0.0);
    float hole = 1.0;
    if (u_hole.z > 0.0) {
        vec2 hs = u_hole.zw * 0.5;
        vec2 q = abs(p - (u_hole.xy + hs)) - (hs - vec2(u_holeR));
        hole = clamp(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_holeR + 0.5, 0.0, 1.0);
    }
    if (u_part < 1.5) {
        c = bracket(p, u_speed, 0.0, 2.0, 2.0, u_ticks.x, BLUE_LINE, BLUE_BAND, BLUE_LIT, BLUE_IN, c);
        // (here) the flares at the bracket's bend and at its foot, where it meets the bottom line
        c = flare(p, vec2(u_geo.w - 1.0, u_geo.y), BLUE_LINE, 26.0, c);
        c = flare(p, vec2(u_pts.y, u_geo.z), BLUE_LINE, 18.0, c);
        // the map window: the fuel bar off while it is open (it ran across the map, car photos Nov 7 2026)
        if (u_hole.z <= 0.0) c = bar(p, u_fuelSeg, u_fuel, 0.0, c);
    } else if (u_part < 2.5) {
        c = bracket(pm, u_rpm, u_zero, u_redFrom, u_orange, u_ticks.y, RED_LINE, RED_BAND, RED_LIT, RED_IN, c);
        c = flare(pm, vec2(u_geo.w - 1.0, u_geo.y), RED_LINE, 26.0, c);
        c = flare(pm, vec2(u_pts.y, u_geo.z), RED_LINE, 18.0, c);
        if (u_hole.z <= 0.0) c = bar(p, u_oilSeg, u_oil, u_regenR > 11.5 ? 3.0 : u_regenR > 7.5 ? 2.0 : u_regenR > 3.5 ? 0.0 : 1.0, c);
    } else {
        // the bottom line between the brackets
        if (abs(p.y - u_geo.z) < 3.0 && abs(p.x - 960.0) < 960.0 - u_pts.y)
            c = put(c, mix(BLUE_LINE, RED_LINE, step(960.0, p.x)) * 0.8, cov(abs(p.y - u_geo.z) - 1.2));
        // bottom strip: slanted ends, blue left of the middle, red right, thin dividers
        float sy = p.y - u_strip.y;
        if (sy > -2.0 && sy < u_strip.z + 2.0) {
            float xl = u_strip.x + (u_strip.z - sy) / u_strip.z * u_strip.w;     // left end leans in at the top
            float dx = abs(p.x - 960.0), xe = 960.0 - xl;
            float inside = cov(dx - xe) * cov(-sy) * cov(sy - u_strip.z);
            float f = dx / xe;
            float fl0 = mod(u_regenR, 4.0);
            vec3 sc = p.x < 960.0 ? (fl0 > 1.5 ? mix(vec3(0.38, 0.04, 0.05), vec3(0.95, 0.14, 0.14), f) : mix(vec3(0.06, 0.2, 0.62), vec3(0.15, 0.36, 0.92), f))
                : mod(fl0, 2.0) > 0.5 ? mix(vec3(0.04, 0.3, 0.16), vec3(0.16, 0.72, 0.4), f) : mix(RED_LINE * 0.42, RED_LINE * 0.9, f);
            // (here) each half a gauge: lit to its reading, dim beyond
            float fl = p.x < 960.0 ? (p.x - xl) / xe : (p.x - 960.0) / xe;
            float lv = p.x < 960.0 ? u_stripFill.x : u_stripFill.y;
            if (lv >= 0.0) sc *= mix(0.32, 1.0, clamp((lv - fl) * xe + 0.5, 0.0, 1.0));
            c = put(c, sc, 0.95 * inside);
            float div = cov(abs(mod(p.x - (u_strip.z - sy) * 0.45, 150.0) - 75.0) - 73.8);
            c = put(c, vec3(0.02, 0.03, 0.08), 0.5 * inside * div);
            c = put(c, WHITE, 0.25 * inside * cov(abs(sy) - 1.0));
        }
    }
    gl_FragColor = vec4(c.rgb / max(c.a, 0.0001), c.a * hole);
}
`;

/**
 * bimmer-lab's line icons (shared/icons.js of github.com/bimmer-lab/apps, MIT), as distance functions in a 0..1 box
 * (y down), in one colour: u_icon 0 gauge, 1 shock, 2 wheel, 3 cog, 4 stack, 5 therm, 6 fuel, 7 tyre, 8 oilcan; and in their
 * manner 9 battery, 10 bolt, 11 turbo, 12 the battery's temperature, 13 torque.
 */
const LICON_FS = `#version 100
${HIGHP}
uniform vec2 u_size;
uniform float u_icon;
uniform vec4 u_color;
varying vec2 v_uv;
const float PI = 3.14159265;
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float ring(vec2 p, vec2 c, float r) { return abs(length(p - c) - r); }
float disc(vec2 p, vec2 c, float r) { return length(p - c) - r; }
float arc(vec2 p, vec2 c, float r, float a0, float a1) {
    float a = atan(p.x - c.x, -(p.y - c.y));
    if (a < a0) a += 2.0 * PI;
    if (a <= a1) return abs(length(p - c) - r);
    return min(length(p - (c + r * vec2(sin(a0), -cos(a0)))), length(p - (c + r * vec2(sin(a1), -cos(a1)))));
}
void main() {
    float s = min(u_size.x, u_size.y);
    vec2 px = v_uv * u_size;
    vec2 p = (px - (u_size - vec2(s)) * 0.5) / s;
    float id = floor(u_icon + 0.5), d = 1e3;
    if (id < 0.5) d = min(min(arc(p, vec2(0.5, 0.55), 0.36, -0.75 * PI, 0.75 * PI) - 0.045, seg(p, vec2(0.5, 0.55), vec2(0.7, 0.36)) - 0.045), disc(p, vec2(0.5, 0.55), 0.07));
    else if (id < 1.5) d = min(min(seg(p, vec2(0.24, 0.78), vec2(0.5, 0.52)) - 0.11, seg(p, vec2(0.5, 0.52), vec2(0.78, 0.24)) - 0.035), min(seg(p, vec2(0.14, 0.88), vec2(0.2, 0.82)) - 0.05, seg(p, vec2(0.8, 0.22), vec2(0.86, 0.16)) - 0.05));
    else if (id < 2.5) d = min(min(ring(p, vec2(0.5), 0.38) - 0.055, disc(p, vec2(0.5, 0.55), 0.1)), min(min(seg(p, vec2(0.14, 0.5), vec2(0.42, 0.55)) - 0.05, seg(p, vec2(0.58, 0.55), vec2(0.86, 0.5)) - 0.05), seg(p, vec2(0.5, 0.62), vec2(0.5, 0.86)) - 0.05));
    else if (id < 3.5) {
        d = min(ring(p, vec2(0.5), 0.27) - 0.06, ring(p, vec2(0.5), 0.1) - 0.04);
        for (int i = 0; i < 8; i++) { float a = float(i) * PI / 4.0; vec2 u = vec2(sin(a), -cos(a)); d = min(d, seg(p, vec2(0.5) + 0.3 * u, vec2(0.5) + 0.42 * u) - 0.06); }
    }
    else if (id < 4.5) d = min(min(seg(p, vec2(0.1, 0.22), vec2(0.62, 0.22)) - 0.055, seg(p, vec2(0.1, 0.5), vec2(0.78, 0.5)) - 0.06), seg(p, vec2(0.1, 0.8), vec2(0.92, 0.8)) - 0.075);
    else if (id < 5.5) d = min(min(seg(p, vec2(0.42, 0.14), vec2(0.42, 0.6)) - 0.07, disc(p, vec2(0.42, 0.74), 0.14)), min(seg(p, vec2(0.6, 0.24), vec2(0.76, 0.24)) - 0.035, seg(p, vec2(0.6, 0.4), vec2(0.76, 0.4)) - 0.035));
    else if (id < 6.5) {
        d = max(max(abs(p.x - 0.38) - 0.18, abs(p.y - 0.55) - 0.33), -max(abs(p.x - 0.38) - 0.1, abs(p.y - 0.36) - 0.08));
        d = min(d, min(seg(p, vec2(0.12, 0.9), vec2(0.64, 0.9)) - 0.04, seg(p, vec2(0.56, 0.36), vec2(0.76, 0.48)) - 0.04));
        d = min(d, min(seg(p, vec2(0.76, 0.48), vec2(0.76, 0.78)) - 0.04, seg(p, vec2(0.76, 0.78), vec2(0.66, 0.84)) - 0.04));
    }
    else if (id < 7.5) {
        d = min(ring(p, vec2(0.5), 0.4) - 0.075, ring(p, vec2(0.5), 0.17) - 0.04);
        for (int i = 0; i < 8; i++) { float a = float(i) * PI / 4.0 + PI / 8.0; vec2 u = vec2(sin(a), -cos(a)); d = min(d, seg(p, vec2(0.5) + 0.42 * u, vec2(0.5) + 0.49 * u) - 0.04); }
    }
    else if (id > 8.5 && id < 9.5) {   /* battery */
        d = abs(max(abs(p.x - 0.47) - 0.33, abs(p.y - 0.55) - 0.2)) - 0.04;
        d = min(d, max(abs(p.x - 0.86) - 0.04, abs(p.y - 0.55) - 0.08));
        d = min(d, min(seg(p, vec2(0.28, 0.55), vec2(0.4, 0.55)) - 0.035, min(seg(p, vec2(0.34, 0.49), vec2(0.34, 0.61)) - 0.035, seg(p, vec2(0.55, 0.55), vec2(0.67, 0.55)) - 0.035)));
    }
    else if (id > 9.5 && id < 10.5) {  /* bolt (electric power) */
        d = min(min(seg(p, vec2(0.58, 0.1), vec2(0.34, 0.54)) - 0.05, seg(p, vec2(0.34, 0.54), vec2(0.64, 0.46)) - 0.05), seg(p, vec2(0.64, 0.46), vec2(0.42, 0.9)) - 0.05);
    }
    else if (id > 10.5 && id < 11.5) { /* turbo: the housing and its wheel */
        d = min(ring(p, vec2(0.5), 0.34) - 0.05, ring(p, vec2(0.5), 0.12) - 0.04);
        d = min(d, seg(p, vec2(0.5, 0.16), vec2(0.88, 0.16)) - 0.05);
        for (int i = 0; i < 6; i++) { float a = float(i) * PI / 3.0; vec2 u = vec2(sin(a), -cos(a)), w = vec2(sin(a + 0.6), -cos(a + 0.6)); d = min(d, seg(p, vec2(0.5) + 0.13 * u, vec2(0.5) + 0.27 * w) - 0.03); }
    }
    else if (id > 11.5 && id < 12.5) { /* the battery's temperature: a battery and a thermometer */
        d = abs(max(abs(p.x - 0.36) - 0.26, abs(p.y - 0.62) - 0.16)) - 0.04;
        d = min(d, max(abs(p.x - 0.67) - 0.03, abs(p.y - 0.62) - 0.06));
        d = min(d, min(seg(p, vec2(0.84, 0.12), vec2(0.84, 0.52)) - 0.045, disc(p, vec2(0.84, 0.62), 0.09)));
    }
    else if (id > 12.5 && id < 13.5) { /* torque: a curved arrow round a shaft */
        d = min(arc(p, vec2(0.5), 0.32, -0.6 * PI, 0.55 * PI) - 0.05, disc(p, vec2(0.5), 0.08));
        d = min(d, min(seg(p, vec2(0.5 + 0.32 * sin(0.55 * PI), 0.5 - 0.32 * cos(0.55 * PI)), vec2(0.86, 0.38)) - 0.045, seg(p, vec2(0.5 + 0.32 * sin(0.55 * PI), 0.5 - 0.32 * cos(0.55 * PI)), vec2(0.66, 0.68)) - 0.045));
    }
    else d = min(min(seg(p, vec2(0.2, 0.62), vec2(0.6, 0.62)) - 0.12, seg(p, vec2(0.6, 0.58), vec2(0.9, 0.44)) - 0.04), min(disc(p, vec2(0.92, 0.66), 0.05), min(seg(p, vec2(0.3, 0.46), vec2(0.3, 0.34)) - 0.035, seg(p, vec2(0.22, 0.34), vec2(0.38, 0.34)) - 0.04)));
    float a = clamp(0.5 - d * s, 0.0, 1.0);
    gl_FragColor = vec4(u_color.rgb, u_color.a * a);
}`;

/**
 * A classic M dial (Classic M, layout_classic.js), drawn after a photo of an E92 M3's cluster at night: a black face,
 * a ring of cool white-blue light round the scale's sweep (none across the bottom, where the small gauge is) inside a
 * dark bezel, white bars and dots round the edge, white numerals inside them, the red zone in orange-red along the
 * ring, a thin glowing red needle over a
 * dark hub, and a small gauge across the bottom (the fuel, the oil temperature) with its own needle pivoting below the
 * centre. Sizes in the dial's radius R (the layer's half side).
 *   u_scale   max, numeral step, bar step, dot step
 *   u_arc     start and end angle (degrees clockwise from 12), the red zone's start (>= max: none), numeral size (of R)
 *   u_sub     the small gauge: start and end angle round its pivot, its marks (bars) and dots between
 *   u_subv    its reading 0..1 (dyn)
 *   u_min     the scale's start (0 unless set; below 0: a power gauge's regeneration, from u_zero of the sweep down
 *             to the start, its ring green (u_regen), bars at its half, dots at its quarters, no numerals)
 *   u_value   the reading on the scale (eased)
 */
const E9X_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}${NUMERAL}
uniform vec2 u_size;
uniform vec4 u_scale;
uniform vec4 u_arc;
uniform vec4 u_sub;
uniform float u_subv;
uniform float u_min;
uniform float u_zero;
uniform vec3 u_regen;
uniform float u_value;
uniform float u_digit_adv;
uniform vec3 u_face;
uniform vec3 u_ring;
uniform vec3 u_ring2;
uniform vec3 u_bezel;
uniform vec3 u_tick;
uniform vec3 u_needle;
uniform vec3 u_red;
varying vec2 v_uv;
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
/* an angle (degrees clockwise from 12) of d, within half a turn of am (the sweep's middle) */
float angOf(vec2 d, float am) { float a = atan(d.x, -d.y) / DEG; if (a < am - 180.0) a += 360.0; if (a > am + 180.0) a -= 360.0; return a; }
vec2 dirOf(float a) { return vec2(sin(a * DEG), -cos(a * DEG)); }
float zeroAt() { return u_min < 0.0 ? clamp(u_zero, 0.05, 0.95) : 0.0; }
/* the place along the sweep (0..1) of value v: 0 at zeroAt(), the scale's end at 1, its start (u_min) at 0 */
float fracOf(float v) { float z = zeroAt(); return v >= 0.0 ? z + (1.0 - z) * v / u_scale.x : z * (1.0 - v / u_min); }
/* a number of up to 3 figures centred at c, h high: its coverage */
float numeral(vec2 p, vec2 c, float h, float v) {
    float n = v >= 99.5 ? 3.0 : v >= 9.5 ? 2.0 : 1.0, adv = u_digit_adv;
    vec2 g = (p - c) / h;
    float x = g.x + n * adv * 0.5, i = floor(x / adv);
    if (i < 0.0 || i >= n || abs(g.y) > 0.5) return 0.0;
    float s = sdf(digitOf(v, i, n), vec2(x - (i + 0.5) * adv, g.y + 0.5));
    return smoothstep(0.5 - 1.5 / h, 0.5 + 1.5 / h, s);
}
/* a needle from the pivot c at angle a: length L, tail T, width w at the pivot tapering to w * 0.35 */
vec4 needle(vec4 acc, vec2 p, vec2 c, float a, float L, float T, float w) {
    vec2 u = dirOf(a), n = vec2(-u.y, u.x);
    float along = dot(p - c, u), side = abs(dot(p - c, n));
    float ww = mix(w, w * 0.35, clamp(along / L, 0.0, 1.0)) * 0.5;
    float inside = step(-T, along) * step(along, L);
    float d = side - ww;
    acc = over(acc, u_needle, exp(-max(d, 0.0) * max(d, 0.0) / (w * w * 1.6)) * 0.45 * inside);
    acc = over(acc, mix(u_needle, vec3(1.0, 0.75, 0.6), 0.25 * clamp(1.0 - side / max(ww, 0.5), 0.0, 1.0)), clamp(0.5 - d, 0.0, 1.0) * clamp(L - along + 0.5, 0.0, 1.0) * clamp(along + T + 0.5, 0.0, 1.0));
    return acc;
}
void main() {
    float R = min(u_size.x, u_size.y) * 0.5;
    vec2 c = u_size * 0.5, p = v_uv * u_size, d = p - c;
    float r = length(d) / R;
    vec4 acc = vec4(0.0);
    if (r > 1.0 + 1.5 / R) { gl_FragColor = acc; return; }
    float a0 = u_arc.x, a1 = u_arc.y, sw = a1 - a0, mx = u_scale.x;
    float ang = angOf(d, (a0 + a1) * 0.5), t = (ang - a0) / sw;                    /* 0..1 along the sweep (outside it < 0 or > 1) */
    float px = 1.0 / R;                                                /* a pixel, of R */
    /* the face: black, a touch lighter towards the middle; the bezel: a dark ring round it */
    acc = over(acc, u_face * (1.0 + 0.6 * (1.0 - r)), clamp((0.985 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_bezel * (0.7 + 0.5 * smoothstep(0.9, 1.0, r)), span(r / px, 0.945 / px, 1.0 / px));
    /* the ring of light along the sweep: a white inner edge, blue-violet out to the bezel, glowing into the face */
    float inArc = smoothstep(-0.015, 0.0, t) * smoothstep(1.015, 1.0, t);
    float rr = (r - 0.89) / 0.06;                                    /* 0 at its inner edge, 1 at its outer */
    vec3 rc = mix(vec3(1.0), mix(u_ring, u_ring2, clamp(rr, 0.0, 1.0)), smoothstep(0.0, 0.45, rr));
    float red = u_arc.z < mx ? step(fracOf(u_arc.z), t) : 0.0;
    rc = mix(rc, mix(u_red, vec3(1.0, 0.7, 0.5), 0.3 * (1.0 - clamp(rr * 2.0, 0.0, 1.0))), red);
    float z = zeroAt(), regen = z > 0.0 ? 1.0 - step(z, t) : 0.0;              /* the regeneration's part of the ring */
    rc = mix(rc, mix(u_regen, vec3(1.0), 0.3 * (1.0 - clamp(rr * 2.0, 0.0, 1.0))), regen);
    acc = over(acc, rc, span(r / px, 0.89 / px, 0.95 / px) * inArc);
    float gi = 0.89 - r;
    acc = over(acc, mix(mix(u_ring, u_red, red), u_regen, regen), exp(-max(gi, 0.0) * max(gi, 0.0) / 0.0009) * step(0.0, gi) * 0.55 * inArc);
    /* the bars and dots inside the ring, the numerals inside them */
    if (t > -0.08 && t < 1.08) {
        /* (no regeneration: the scale runs on past its ends, as drawn before) */
        bool neg = z > 0.0 && t < z;
        float v = neg ? u_min * (1.0 - t / z) : (t - z) / (1.0 - z) * mx;
        float sc = neg ? -u_min / z : mx / (1.0 - z);                                 /* the scale's units a sweep, here */
        float sb = neg ? -u_min / 2.0 : u_scale.z, sd = neg ? -u_min / 4.0 : u_scale.w;   /* (below 0: halves, quarters) */
        float lo = min(u_min, 0.0);
        float kb = floor(v / sb + 0.5) * sb, kd = floor(v / sd + 0.5) * sd;
        float ob = abs(v - kb) / sc * sw * DEG * r * R, od = abs(v - kd) / sc * sw * DEG * r * R;
        float hot = u_arc.z < mx && kb >= u_arc.z ? 1.0 : 0.0;
        if (kb >= lo - 0.001 && kb <= mx + 0.001 && t > -0.02 && t < 1.02) acc = over(acc, mix(u_tick, u_red, hot), clamp(R * 0.011 - ob + 0.5, 0.0, 1.0) * span(r / px, 0.775 / px, 0.885 / px));
        if (kd >= lo - 0.001 && kd <= mx + 0.001 && t > -0.02 && t < 1.02 && abs(mod(kd + 0.001, sb)) > 0.01) acc = over(acc, u_tick, clamp(R * 0.014 - length(vec2(od, (r - 0.855) * R)) + 0.5, 0.0, 1.0));
        float kn = clamp(floor(v / u_scale.y + 0.5) * u_scale.y, 0.0, floor(mx / u_scale.y + 0.001) * u_scale.y);
        if (kn >= 0.0 && kn <= mx + 0.001 && v > -0.5 * u_scale.y) {
            float an = a0 + sw * fracOf(kn), h = u_arc.w * R;
            vec2 cn = c + dirOf(an) * (R * (0.725 - u_arc.w * 0.45) - numeralIn(dirOf(an), figuresOf(kn), u_digit_adv, h));
            acc = over(acc, kn >= u_arc.z && u_arc.z < mx ? u_red : u_tick, numeral(p, cn, h, kn));
        }
    }
    /* the small gauge across the bottom: its marks, its needle round a pivot below the centre */
    if (u_sub.z > 0.0) {
        vec2 pv = c + vec2(0.0, R * 0.42);
        vec2 dq = p - pv;
        float rs = length(dq) / R, s0 = u_sub.x, s1 = u_sub.y;
        float as = atan(dq.x, -dq.y) / DEG; if (as < 0.0) as += 360.0;
        float ts = (as - s0) / (s1 - s0);
        if (ts > -0.05 && ts < 1.05) {
            float n = u_sub.z * u_sub.w;
            float kb = floor(ts * u_sub.z + 0.5) / u_sub.z, kd = floor(ts * n + 0.5) / n;
            float ob = abs(ts - kb) * abs(s1 - s0) * DEG * rs * R, od = abs(ts - kd) * abs(s1 - s0) * DEG * rs * R;
            if (kb >= 0.0 && kb <= 1.0) acc = over(acc, u_tick, clamp(R * 0.008 - ob + 0.5, 0.0, 1.0) * span(rs / px, 0.33 / px, 0.40 / px));
            if (kd >= 0.0 && kd <= 1.0) acc = over(acc, u_tick, clamp(R * 0.011 - length(vec2(od, (rs - 0.37) * R)) + 0.5, 0.0, 1.0));
        }
        acc = needle(acc, p, pv, s0 + (s1 - s0) * clamp(u_subv, 0.0, 1.0), R * 0.36, R * 0.0, R * 0.022);
    }
    /* the main needle over a dark hub */
    acc = over(acc, u_face * 1.8 + vec3(0.02), clamp((0.16 - r) / px + 0.5, 0.0, 1.0) * 0.9);
    acc = needle(acc, p, c, a0 + sw * clamp(fracOf(u_value), 0.0, 1.02), R * 0.86, R * 0.16, R * 0.026);
    acc = over(acc, vec3(0.03), clamp((0.07 - r) / px + 0.5, 0.0, 1.0));
    gl_FragColor = acc;
}`;

/**
 * An M8 side gauge's bar (layout_m.js), as on a photo of the M8's cluster: a thin grey track, a thicker fill from
 * u_zero to the reading (white fading to grey; below zero in u_neg, the battery charging), its ends cut on a slant,
 * a red zone (low end to u_zones.x, high end from u_zones.y) in the fill's thickness, a short red slanted tick at
 * the start, dark notches at the scale's labels (u_marks: up to three, 0..1; -1 none). The bar runs the layer's width.
 *   u_value   the reading 0..1 (eased)   u_zero   where the fill starts 0..1   u_zones   red to x, red from y
 */
const MBAR_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}
uniform vec2 u_size;
uniform float u_value;
uniform float u_zero;
uniform vec4 u_zones;
uniform vec4 u_marks;
uniform vec3 u_fill;
uniform vec3 u_neg;
uniform vec3 u_track;
uniform vec3 u_redc;
uniform vec4 u_lab;       /* the scale's three numbers (at u_marks.x, .y, .z: the first left-aligned at the start, the
                           * last right-aligned at the end, the middle one centred), w: decimals */
uniform vec4 u_glyph;     /* their glyphs: the figure 0's code, '-', '.', a figure's advance (glyph heights) */
uniform vec2 u_glyph2;    /* '-' and '.' advances; */
uniform float u_labH;     /* the numbers' glyph height px (0: none), their cells' top 34 px below the layer's top */
varying vec2 v_uv;
/* one of the scale's numbers: its coverage at p, the number v with dec decimals, its cell's top-left reference x
 * (align 0 left, 0.5 centre, 1 right), y top */
float label(vec2 p, float v, float dec, float x, float al, float y) {
    /* (no loop: the slot under p worked out directly, one glyph looked up. A loop that broke out early with a font
     * lookup in it was the one such construct in the app, and M - the one layout drawing it - restarted the
     * cluster: Nov 9 2026.) */
    float h = u_labH, neg = v < -0.0001 ? 1.0 : 0.0, av = abs(v);
    float sc = dec > 0.5 ? (dec > 1.5 ? 100.0 : 10.0) : 1.0;
    float iv = floor(av * sc + 0.5);
    float ip = floor(iv / sc + 0.0001), fp = iv - ip * sc;
    float ni = ip >= 99.5 ? 3.0 : ip >= 9.5 ? 2.0 : 1.0;
    float am = u_glyph2.x, ad = u_glyph.w, ap = u_glyph2.y, hasDec = dec > 0.5 ? 1.0 : 0.0;
    float w = neg * am + ni * ad + hasDec * (ap + dec * ad);
    float pen = x / h - w * al;
    vec2 g = vec2(p.x / h, (p.y - y) / h);
    float gx = g.x - pen;
    if (g.y < 0.0 || g.y > 1.0 || gx < -0.2 || gx > w + 0.2) return 0.0;
    float code = -1.0, cx = 0.0;
    float x1 = gx - neg * am, x2 = x1 - ni * ad, x3 = x2 - ap;
    if (neg > 0.5 && gx < am) { code = u_glyph.y; cx = am * 0.5; }
    else if (x1 < ni * ad || hasDec < 0.5) { float i = clamp(floor(x1 / ad), 0.0, ni - 1.0); code = u_glyph.x + digitOf(ip, i, ni); cx = neg * am + (i + 0.5) * ad; }
    else if (x2 < ap) { code = u_glyph.z; cx = neg * am + ni * ad + ap * 0.5; }
    else { float j = clamp(floor(x3 / ad), 0.0, dec - 1.0); code = u_glyph.x + digitOf(fp, j, dec); cx = neg * am + ni * ad + ap + (j + 0.5) * ad; }
    float s = sdf(code, vec2(gx - cx, g.y));
    return smoothstep(0.5 - 1.5 / h, 0.5 + 1.5 / h, s);
}
void main() {
    vec2 p = v_uv * u_size;
    float x0 = 6.0, x1 = u_size.x - 4.0, L = x1 - x0, yc = 13.0;
    float sl = 0.7;                                    /* the slant: x per y px (the top leans right) */
    float xs = p.x + (p.y - yc) * sl;                  /* x on the slant */
    float t = (xs - x0) / L;
    vec4 acc = vec4(0.0);
    /* the track: thin, its right end slanted */
    float tr = span(p.y, yc + 1.5, yc + 4.5) * span(xs, x0, x1);
    acc = over(acc, u_track, tr);
    /* the red zones, the fill's thickness */
    float thick = span(p.y, yc - 4.5, yc + 4.5);
    float redz = (t <= u_zones.x ? 1.0 : 0.0) + (t >= u_zones.y ? 1.0 : 0.0);
    acc = over(acc, u_redc, thick * span(xs, x0, x1) * min(redz, 1.0) * 0.95);
    /* the fill: zero to the reading */
    float v = clamp(u_value, 0.0, 1.0), lo = min(u_zero, v), hi = max(u_zero, v);
    float f = thick * span(xs, x0 + lo * L, x0 + hi * L) * step(0.002, hi - lo);
    vec3 fc = v >= u_zero ? mix(u_fill, u_fill * 0.62, clamp((t - u_zero) / max(v - u_zero, 0.05), 0.0, 1.0)) : u_neg;
    if (v >= u_zero && redz > 0.5) fc = mix(u_redc, vec3(1.0), 0.15);
    acc = over(acc, fc * (0.9 + 0.1 * clamp((yc - p.y) / 4.5, -1.0, 1.0)), f);
    /* dark notches at the labels (written out: no loop) */
    float nd = min(min(u_marks.x > 0.001 && u_marks.x < 0.999 ? abs(xs - (x0 + u_marks.x * L)) : 99.0,
                       u_marks.y > 0.001 && u_marks.y < 0.999 ? abs(xs - (x0 + u_marks.y * L)) : 99.0),
                   u_marks.z > 0.001 && u_marks.z < 0.999 ? abs(xs - (x0 + u_marks.z * L)) : 99.0);
    acc = over(acc, vec3(0.0), clamp(1.4 - nd + 0.5, 0.0, 1.0) * thick * 0.85);
    /* the start tick: short, red, slanted the other way */
    float tx = p.x - x0 + (p.y - yc) * 0.75;
    acc = over(acc, u_redc, clamp(1.6 - abs(tx) + 0.5, 0.0, 1.0) * span(p.y, yc - 11.0, yc + 4.5));
    /* the scale's numbers under it (one layer: not three text pieces each) */
    if (u_labH > 0.0 && p.y > 30.0) {
        float ly = 34.0, n = 0.0;
        n = max(n, label(p, u_lab.x, u_lab.w, x0 + u_marks.x * L, u_marks.x <= 0.0 ? 0.0 : 0.5, ly));
        if (u_marks.y >= 0.0) n = max(n, label(p, u_lab.y, u_lab.w, x0 + u_marks.y * L, u_marks.y >= 1.0 ? 1.0 : 0.5, ly));
        if (u_marks.z >= 0.0) n = max(n, label(p, u_lab.z, u_lab.w, x0 + u_marks.z * L, u_marks.z >= 1.0 ? 1.0 : 0.5, ly));
        acc = over(acc, u_fill, n);
    }
    gl_FragColor = acc;
}`;

/**
 * JDM 2 (layout_jdm2.js), its parts in one program, u_mode picking which: an original drawing after the idea of a
 * Japanese grand tourer's digital cluster.
 *   0  the background: a dark twill weave (carbon fibre), continuous across layers (u_origin: the layer's place)
 *   1  the G meter: a big round window in a thin chrome ring, the meter in its middle (0.6 R: an outer and a half
 *      ring, a cross past them, a small ring at the centre), the dot at u_g (screen x, y, of the outer ring), and
 *      behind it its trail as the iDrive G-Force app's: a thin line through up to 16 of its past places on to the dot,
 *      fading with age. u_trail: the places, four a vec4, each one number ((x * 100 + 128) * 256 + y * 100 + 128, x
 *      and y as u_g: the uniforms kept within what the cluster already runs), the oldest first; u_trail_np: (how
 *      many set, how far on to the next 0..1 - each piece fades smoothly and the oldest shrinks away just as a new
 *      one comes -, the trail's bounding circle: its centre packed as a place, its radius; outside it nothing is
 *      worked out: a parked car's trail is a point)
 *      (in the program, kept free of comments: trailAt(v) a place from its number, x and y in hundredths, 128 on, x
 *      the high byte; trailD the distance to a segment, a zero-length one from its end; the line from the oldest place
 *      on to the dot, worked out only inside the trail's bounding circle in the meter's units, each piece's age from
 *      its place and the phase - the newest 1 -, the oldest piece shrinking away from its old end once the trail is
 *      full; as G-Force's, 0.08 to 0.63)
 *   2  a disc for the gear: a chrome ring round a glossy disc of u_disc
 *   3  the tach: a chrome bezel, a broad band of u_band along the sweep with the numerals in it (below 0 u_regen: a
 *      plug-in's regeneration as E9X), a notched dark grey rim round its outside with the red line marked on it in
 *      u_warn (a line along its outer edge from u_scale.w), a dotted line inside the band, a glowing needle reaching
 *      the band, a ring hub
 *   4  a small gauge: a chrome ring, marks along u_arc (the hot or empty end's in u_warn from u_scale.w of 100), a
 *      glowing needle with a dark tail, a ring hub
 *   5  the big window as a speedometer: marks round its edge, the numerals inside them (u_scale, u_arc as the tach's),
 *      a long needle in u_warn, a ring hub
 *   6  the big window with the tyres: the car from above, each tyre lit by u_tyre (FL, FR, RL, RR: 0 no reading,
 *      1 fine, 2 low)
 *   7  the big window with four temperatures: an arc in each quarter (from the top left, clockwise) filled to u_t,
 *      red from u_tr
 *   u_scale, u_arc (start, end, numeral height of R), u_min, u_zero, u_regen, u_value: as E9X_FS
 */
const JDM_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}${NUMERAL}
uniform vec2 u_size;
uniform float u_mode;
uniform vec2 u_origin;
uniform vec4 u_scale;
uniform vec4 u_arc;
uniform float u_min;
uniform float u_zero;
uniform vec3 u_regen;
uniform float u_value;
uniform float u_digit_adv;
uniform vec2 u_g;
uniform vec4 u_trail[4];
uniform vec4 u_trail_np;
uniform vec3 u_face;
uniform vec3 u_bezel;
uniform vec3 u_band;
uniform vec3 u_red;
uniform vec3 u_tick;
uniform vec3 u_needle;
uniform vec3 u_dot;
uniform vec3 u_disc;
uniform vec3 u_warn;
uniform vec4 u_tyre;
uniform vec4 u_t;
uniform vec4 u_tr;
varying vec2 v_uv;
float angOf(vec2 d, float am) { float a = atan(d.x, -d.y) / DEG; if (a < am - 180.0) a += 360.0; if (a > am + 180.0) a -= 360.0; return a; }
vec2 dirOf(float a) { return vec2(sin(a * DEG), -cos(a * DEG)); }
float zeroAt() { return u_min < 0.0 ? clamp(u_zero, 0.05, 0.95) : 0.0; }
float fracOf(float v) { float z = zeroAt(); return v >= 0.0 ? z + (1.0 - z) * v / u_scale.x : z * (1.0 - v / u_min); }
float numeral(vec2 p, vec2 c, float h, float v) {
    float n = v >= 99.5 ? 3.0 : v >= 9.5 ? 2.0 : 1.0, adv = u_digit_adv;
    vec2 g = (p - c) / h;
    float x = g.x + n * adv * 0.5, i = floor(x / adv);
    if (i < 0.0 || i >= n || abs(g.y) > 0.5) return 0.0;
    float s = sdf(digitOf(v, i, n), vec2(x - (i + 0.5) * adv, g.y + 0.5));
    return smoothstep(0.5 - 1.5 / h, 0.5 + 1.5 / h, s);
}
/* the weave's light at a panel point: tows 14 px wide, two over two under, a soft round across each */
float weave(vec2 q) {
    vec2 g = q / 14.0, cell = floor(g), f = fract(g);
    float k = mod(cell.x + cell.y, 4.0);
    float across = k < 2.0 ? f.y : f.x, along = k < 2.0 ? f.x : f.y;
    float s = 0.35 + 0.65 * sin(across * 3.14159);
    s *= 0.8 + 0.2 * sin(along * 3.14159);
    return s * (k < 2.0 ? 1.0 : 0.62);
}
vec3 carbon(vec2 q) { return u_face * (0.55 + 0.9 * weave(q)); }
/* brushed chrome round a circle: light from above, the brushing's fine streaks round it */
vec3 chrome(vec2 d) {
    float up = clamp(0.5 - d.y / max(length(d), 1.0) * 0.5, 0.0, 1.0);
    float a = atan(d.x, -d.y);
    float streak = 0.92 + 0.08 * sin(a * 140.0) * sin(a * 37.0 + 1.3);
    return u_bezel * (0.35 + 0.75 * up) * streak;
}
/* a needle from c at angle a: glowing from f0 out to L, a dark tail T back */
vec4 needle(vec4 acc, vec2 p, vec2 c, float a, float f0, float L, float T, float w) {
    vec2 u = dirOf(a), n = vec2(-u.y, u.x);
    float along = dot(p - c, u), side = abs(dot(p - c, n));
    float ww = mix(w, w * 0.55, clamp(along / L, 0.0, 1.0)) * 0.5;
    float d = side - ww;
    float lit = clamp(L - along + 0.5, 0.0, 1.0) * clamp(along - f0 + 0.5, 0.0, 1.0);
    float tail = clamp(f0 - along + 0.5, 0.0, 1.0) * clamp(along + T + 0.5, 0.0, 1.0);
    acc = over(acc, u_needle, exp(-max(d, 0.0) * max(d, 0.0) / (w * w * 2.6)) * 0.6 * lit);
    acc = over(acc, mix(u_needle, vec3(1.0, 0.96, 0.88), 0.6 * clamp(1.0 - side / max(ww, 0.5), 0.0, 1.0)), clamp(0.5 - d, 0.0, 1.0) * lit);
    acc = over(acc, vec3(0.16, 0.16, 0.17), clamp(0.5 - d, 0.0, 1.0) * tail);
    return acc;
}
/* a chrome ring hub (ri..ro of R) round a dark well */
vec4 hub(vec4 acc, vec2 d, float r, float px, float ri, float ro) {
    acc = over(acc, chrome(d), span(r / px, ri / px, ro / px));
    acc = over(acc, vec3(0.015), clamp((ri - r) / px + 0.5, 0.0, 1.0));
    return acc;
}
/* one of the temperatures' arcs: centred at angle am, 64 degrees long, filled clockwise to f, red from fr */
vec4 tempArc(vec4 acc, vec2 d, float r, float px, float R, float am, float f, float fr) {
    float a = angOf(d, am), t = (a - am + 32.0) / 64.0;
    float on = span(r / px, 0.76 / px, 0.86 / px) * clamp(t * 64.0 * DEG * r * R + 0.5, 0.0, 1.0) * clamp((1.0 - t) * 64.0 * DEG * r * R + 0.5, 0.0, 1.0);
    vec3 c = t >= fr ? u_warn : u_tick;
    acc = over(acc, vec3(0.13), on);
    acc = over(acc, c * (0.8 + 0.2 * smoothstep(0.76, 0.86, r)), on * clamp((f - t) * 64.0 * DEG * r * R + 0.5, 0.0, 1.0));
    /* its ends' marks */
    float e = min(abs(t), abs(1.0 - t)) * 64.0 * DEG * r * R;
    acc = over(acc, u_tick * 0.6, clamp(1.2 - e, 0.0, 1.0) * span(r / px, 0.72 / px, 0.9 / px));
    return acc;
}
vec2 trailAt(float v) { float xi = floor(v / 256.0 + 0.001); return (vec2(xi, v - xi * 256.0) - 128.0) / 100.0; }
float trailD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
/* a box (centre c, half size b, corner k): < 0 inside */
float boxD(vec2 p, vec2 b, float k) { vec2 q = abs(p) - b + k; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - k; }
vec3 tyreCol(float st) { return st > 1.5 ? u_warn : st > 0.5 ? u_tick : vec3(0.3); }
void main() {
    vec2 p = v_uv * u_size;
    if (u_mode < 0.5) {
        vec2 q = p + u_origin;
        vec3 col = carbon(q);
        vec2 v = (q / vec2(1920.0, 720.0) - 0.5) * vec2(1.0, 1.3);
        col *= 1.0 - 0.45 * smoothstep(0.3, 0.85, length(v));
        gl_FragColor = vec4(col, 1.0);
        return;
    }
    float R = min(u_size.x, u_size.y) * 0.5, px = 1.0 / R;
    vec2 c = u_size * 0.5, d = p - c;
    float r = length(d) / R;
    vec4 acc = vec4(0.0);
    if (r > 1.0 + 1.5 / R) { gl_FragColor = acc; return; }
    float bw = u_mode < 1.5 || u_mode > 4.5 ? 0.028 : u_mode < 2.5 ? 0.06 : u_mode < 3.5 ? 0.07 : 0.1;    /* the bezel's width, of R */
    /* the face: the weave, darker towards the rim; the bezel round it with a dark seam inside */
    acc = over(acc, carbon(p + u_origin) * (u_mode > 3.5 && u_mode < 4.5 ? 0.55 : 0.75) * (1.0 - 0.35 * smoothstep(0.5, 1.0, r)), clamp((1.0 - bw - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, chrome(d), span(r / px, (1.0 - bw) / px, 1.0 / px));
    acc = over(acc, vec3(0.0), span(r / px, (1.0 - bw - 0.012) / px, (1.0 - bw) / px) * 0.85);
    if (u_mode < 1.5) {
        float gr = 0.6;     // (0.37.2: the meter larger in its window, was 0.46)
        float ring = max(span(r / px, gr / px - 1.3, gr / px + 1.3), span(r / px, gr * 0.5 / px - 1.0, gr * 0.5 / px + 1.0));
        ring = max(ring, span(r / px, 0.05 / px - 0.9, 0.05 / px + 0.9));
        float cross = max(span(d.x, -1.0, 1.0), span(d.y, -1.0, 1.0)) * step(r, gr + 0.07) * step(0.05, r);
        acc = over(acc, u_tick, max(ring, cross) * 0.92);
        acc = over(acc, vec3(0.0), clamp((gr - r) / px + 0.5, 0.0, 1.0) * 0.25);
        vec2 g = u_g;
        if (length(g) > 1.12) g = g / length(g) * 1.12;
        vec2 m = d / (gr * R);
        if (u_trail_np.x > 0.5 && length(m - trailAt(u_trail_np.z)) < u_trail_np.w + 0.05) {
            float tr = 0.0, n = u_trail_np.x, ph = u_trail_np.y;
            vec2 prev = vec2(0.0);
            for (int i = 0; i < 4; i++) {
                vec4 q = u_trail[i];
                for (int j = 0; j < 4; j++) {
                    float k = float(i * 4 + j);
                    vec2 pt = trailAt(j == 0 ? q.x : j == 1 ? q.y : j == 2 ? q.z : q.w);
                    if (k < n) {
                        if (k > 0.5) {
                            vec2 a = k < 1.5 && n > 15.5 ? mix(prev, pt, ph) : prev;
                            float age = clamp((k - ph) / n, 0.0, 1.0);
                            float sd = trailD(m, a, pt) * gr;
                            tr = max(tr, (0.08 + 0.55 * age) * clamp((0.009 - sd) / px + 0.5, 0.0, 1.0));
                        }
                        prev = pt;
                    }
                }
            }
            float sd = trailD(m, prev, g) * gr;
            tr = max(tr, 0.63 * clamp((0.009 - sd) / px + 0.5, 0.0, 1.0));
            acc = over(acc, u_dot, tr);
        }
        vec2 dc = c + g * gr * R;
        float dd = length(p - dc) / R;
        acc = over(acc, u_dot, exp(-dd * dd / 0.006) * 0.55);
        acc = over(acc, mix(u_dot, vec3(1.0), 0.25 * clamp(1.0 - dd / 0.036, 0.0, 1.0)), clamp((0.042 - dd) / px + 0.5, 0.0, 1.0));
        gl_FragColor = acc;
        return;
    }
    if (u_mode < 2.5) {
        float inner = 1.0 - bw - 0.02;
        vec2 l = d / R - vec2(-0.3, -0.38);
        vec3 col = u_disc * (0.5 + 0.8 * exp(-dot(l, l) * 1.5));
        col += vec3(1.0) * 0.07 * smoothstep(0.12, 0.0, abs(d.y / R + 0.48 - 0.25 * (d.x / R) * (d.x / R)));
        col *= 1.0 - 0.3 * smoothstep(0.75, inner, r);
        acc = over(acc, col, clamp((inner - r) / px + 0.5, 0.0, 1.0));
        gl_FragColor = acc;
        return;
    }
    if (u_mode > 5.5 && u_mode < 6.5) {
        /* the tyres: the car from above (front up), its four tyres lit as their pressures are */
        vec2 q = d / R;
        float body = boxD(q, vec2(0.17, 0.36), 0.1);
        acc = over(acc, vec3(0.06), clamp(-body / px + 0.5, 0.0, 1.0));
        acc = over(acc, u_bezel * 0.55, clamp(1.6 - abs(body) / px, 0.0, 1.0));
        float glass = min(boxD(q - vec2(0.0, -0.12), vec2(0.12, 0.05), 0.03), boxD(q - vec2(0.0, 0.2), vec2(0.11, 0.035), 0.03));
        acc = over(acc, u_bezel * 0.3, clamp(-glass / px + 0.5, 0.0, 1.0));
        vec2 tb = vec2(0.045, 0.085);
        acc = over(acc, tyreCol(u_tyre.x), clamp(-boxD(q - vec2(-0.22, -0.22), tb, 0.02) / px + 0.5, 0.0, 1.0));
        acc = over(acc, tyreCol(u_tyre.y), clamp(-boxD(q - vec2(0.22, -0.22), tb, 0.02) / px + 0.5, 0.0, 1.0));
        acc = over(acc, tyreCol(u_tyre.z), clamp(-boxD(q - vec2(-0.22, 0.24), tb, 0.02) / px + 0.5, 0.0, 1.0));
        acc = over(acc, tyreCol(u_tyre.w), clamp(-boxD(q - vec2(0.22, 0.24), tb, 0.02) / px + 0.5, 0.0, 1.0));
        gl_FragColor = acc;
        return;
    }
    if (u_mode > 6.5) {
        /* four temperatures: an arc in each quarter, a cross between them */
        acc = over(acc, u_tick * 0.25, max(span(d.x, -0.8, 0.8), span(d.y, -0.8, 0.8)) * step(r, 0.62) * step(0.3, r));
        acc = tempArc(acc, d, r, px, R, -45.0, u_t.x, u_tr.x);
        acc = tempArc(acc, d, r, px, R, 45.0, u_t.y, u_tr.y);
        acc = tempArc(acc, d, r, px, R, 135.0, u_t.z, u_tr.z);
        acc = tempArc(acc, d, r, px, R, 225.0, u_t.w, u_tr.w);
        gl_FragColor = acc;
        return;
    }
    float a0 = u_arc.x, a1 = u_arc.y, sw = a1 - a0;
    float ang = angOf(d, (a0 + a1) * 0.5), t = (ang - a0) / sw;
    float inArc = clamp(t * abs(sw) * DEG * r * R + 0.5, 0.0, 1.0) * clamp((1.0 - t) * abs(sw) * DEG * r * R + 0.5, 0.0, 1.0);
    if (u_mode > 4.5) {
        /* the speedometer: marks round the edge (the major ones long), the numerals inside, a long red needle */
        float mx5 = u_scale.x;
        float v5 = t * mx5, k5 = floor(v5 / u_scale.z + 0.5) * u_scale.z, o5 = abs(v5 - k5) / mx5 * abs(sw) * DEG * r * R;
        bool maj = abs(mod(k5 + 0.001, u_scale.y)) < 0.01;
        if (k5 >= -0.001 && k5 <= mx5 + 0.001) acc = over(acc, maj ? u_tick : u_tick * 0.6, clamp(R * (maj ? 0.011 : 0.007) - o5 + 0.5, 0.0, 1.0) * span(r / px, (maj ? 0.84 : 0.88) / px, 0.955 / px));
        float kn5 = clamp(floor(v5 / u_scale.y + 0.5) * u_scale.y, 0.0, floor(mx5 / u_scale.y + 0.001) * u_scale.y);
        if (t > -0.06 && t < 1.06) {
            vec2 d5 = dirOf(a0 + sw * kn5 / mx5);
            vec2 cn = c + d5 * (R * 0.74 - numeralIn(d5, figuresOf(kn5), u_digit_adv, u_arc.z * R));
            acc = over(acc, u_tick, numeral(p, cn, u_arc.z * R, kn5));
        }
        acc = needle(acc, p, c, a0 + sw * clamp(u_value / mx5, -0.01, 1.01), R * 0.1, R * 0.86, R * 0.2, R * 0.024);
        acc = hub(acc, d, r, px, 0.07, 0.1);
        gl_FragColor = acc;
        return;
    }
    if (u_mode > 3.5) {
        /* a small gauge: majors at the ends and the middle, quarters between, the warning end in u_warn */
        float k4 = floor(t * 8.0 + 0.5) / 8.0, ok4 = abs(t - k4) * abs(sw) * DEG * r * R;
        bool major = abs(mod(k4 * 8.0 + 0.01, 4.0)) < 0.1;
        vec3 mc = k4 * 100.0 >= u_scale.w - 0.01 && u_scale.w <= 100.0 ? u_warn : u_tick;
        float rIn = major ? 0.6 : 0.68;
        if (k4 >= -0.001 && k4 <= 1.001) acc = over(acc, mc, clamp(R * (major ? 0.022 : 0.016) - ok4 + 0.5, 0.0, 1.0) * span(r / px, rIn / px, 0.8 / px));
        acc = needle(acc, p, c, a0 + sw * clamp(u_value / u_scale.x, -0.02, 1.02), R * 0.12, R * 0.72, R * 0.36, R * 0.05);
        acc = hub(acc, d, r, px, 0.1, 0.15);
        gl_FragColor = acc;
        return;
    }
    /* the tach */
    float mx = u_scale.x;
    float b0 = 0.57, b1 = 0.86;                                   /* the band, of R */
    float z = zeroAt();
    float redAt = u_scale.w < mx ? fracOf(u_scale.w) : 2.0;
    vec3 bc = z > 0.0 && t < z ? u_regen : u_band;              /* the band one colour (red) to the end */
    float across = (r - b0) / (b1 - b0);
    vec3 band = bc * (0.72 + 0.4 * smoothstep(0.0, 1.0, across));
    acc = over(acc, band, span(r / px, b0 / px, b1 / px) * inArc);
    acc = over(acc, mix(bc, vec3(1.0), 0.3), span(r / px, b0 / px, b0 / px + 1.5) * inArc);
    /* the rim outside it: dark, notched at the quarter steps */
    if (t > -0.02 && t < 1.02) {
        bool neg = z > 0.0 && t < z;
        float v = neg ? u_min * (1.0 - t / z) : (t - z) / (1.0 - z) * mx;
        float sc = neg ? -u_min / z : mx / (1.0 - z);
        float sq = neg ? -u_min / 4.0 : u_scale.y * 0.25;
        float kq = floor(v / sq + 0.5) * sq, oq = abs(v - kq) / sc * abs(sw) * DEG * r * R;
        float rim = span(r / px, b1 / px, (b1 + 0.05) / px) * inArc;
        acc = over(acc, mix(vec3(0.16, 0.165, 0.18), vec3(0.02), clamp(R * 0.014 - oq + 0.5, 0.0, 1.0)), rim);
        /* the red line marked on the rim: a bright line along its outer edge from u_scale.w to the end */
        acc = over(acc, u_warn, span(r / px, (b1 + 0.02) / px, (b1 + 0.05) / px) * inArc * step(redAt, t));
        acc = over(acc, u_warn, clamp(R * 0.006 - abs(t - redAt) * abs(sw) * DEG * r * R + 0.5, 0.0, 1.0) * span(r / px, b1 / px, (b1 + 0.05) / px) * inArc * step(redAt, 1.0));
        /* the dotted line along the band's inside, every tenth of a step */
        float st = neg ? -u_min / 10.0 : u_scale.y * 0.1;
        float kt = floor(v / st + 0.5) * st, ot = abs(v - kt) / sc * abs(sw) * DEG * r * R;
        acc = over(acc, mix(bc, vec3(1.0), 0.45), clamp(R * 0.0065 - length(vec2(ot, (r - b0 + 0.035) * R)) + 0.5, 0.0, 1.0) * inArc);
        /* the numerals at the major steps, white on the band, a white dot inside each */
        float kn = clamp(floor(v / u_scale.y + 0.5) * u_scale.y, 0.0, floor(mx / u_scale.y + 0.001) * u_scale.y);
        if (!neg && v > -0.5 * u_scale.y) {
            float an = a0 + sw * fracOf(kn), h = u_arc.z * R;
            vec2 cn = c + dirOf(an) * R * ((b0 + b1) * 0.5 + 0.03);
            acc = over(acc, vec3(0.0), numeral(p - vec2(0.0, -1.5), cn, h, kn) * 0.35);
            acc = over(acc, u_tick, numeral(p, cn, h, kn));
            vec2 cd = c + dirOf(an) * R * (b0 + 0.045);
            acc = over(acc, u_tick, clamp(R * 0.016 - length(p - cd) + 0.5, 0.0, 1.0));
        }
    }
    acc = needle(acc, p, c, a0 + sw * clamp(fracOf(u_value), -0.01, 1.01), R * 0.15, R * 0.6, R * 0.34, R * 0.034);
    acc = hub(acc, d, r, px, 0.12, 0.155);
    gl_FragColor = acc;
}`;

/**
 * ID6 M (layout_id6m.js): round dials after the M cars' analog clusters of the mid 2010s, an original drawing. u_mode:
 *   0  a big dial: a thin white ring round the top (open at the bottom, u_arc's ends and 9 degrees past them), a dark
 *      band inside it, white marks (u_scale: max, numbered step, mark step, red from), the numerals inside them
 *      (u_arc.z: their height of R), a darker disc in the middle, a long red-orange needle over a dark hub; the shift
 *      lights along the outside of the tach's top end: amber from u_arc.w, red from u_scale.w (none past max). u_min,
 *      u_zero, u_regen: a plug-in's regeneration below 0 (as E9X: its marks in u_regen, no numerals)
 *   1  a small gauge: a white ring round a dark face, marks along u_arc (-110..110: majors at the ends and the middle,
 *      the red end from u_scale.w of 100), the needle from the middle
 *   2  the gear's arc under the tach: a white arc of a circle centred u_arc.xy in the layer, radius u_arc.z, u_arc.w
 *      degrees either side of six o'clock, fading at its ends
 */
const MROUND_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}${NUMERAL}
uniform vec2 u_size;
uniform float u_mode;
uniform vec4 u_scale;
uniform vec4 u_arc;
uniform float u_min;
uniform float u_zero;
uniform vec3 u_regen;
uniform float u_value;
uniform float u_digit_adv;
uniform vec3 u_face;
uniform vec3 u_ring;
uniform vec3 u_tick;
uniform vec3 u_needle;
uniform vec3 u_amber;
uniform vec3 u_red;
varying vec2 v_uv;
float angOf(vec2 d, float am) { float a = atan(d.x, -d.y) / DEG; if (a < am - 180.0) a += 360.0; if (a > am + 180.0) a -= 360.0; return a; }
vec2 dirOf(float a) { return vec2(sin(a * DEG), -cos(a * DEG)); }
float zeroAt() { return u_min < 0.0 ? clamp(u_zero, 0.05, 0.95) : 0.0; }
float fracOf(float v) { float z = zeroAt(); return v >= 0.0 ? z + (1.0 - z) * v / u_scale.x : z * (1.0 - v / u_min); }
float numeral(vec2 p, vec2 c, float h, float v) {
    float n = v >= 99.5 ? 3.0 : v >= 9.5 ? 2.0 : 1.0, adv = u_digit_adv;
    vec2 g = (p - c) / h;
    float x = g.x + n * adv * 0.5, i = floor(x / adv);
    if (i < 0.0 || i >= n || abs(g.y) > 0.5) return 0.0;
    float s = sdf(digitOf(v, i, n), vec2(x - (i + 0.5) * adv, g.y + 0.5));
    return smoothstep(0.5 - 1.5 / h, 0.5 + 1.5 / h, s);
}
/* a needle from c at angle a: L long, a tail T back, w wide at the hub tapering to a third */
vec4 needle(vec4 acc, vec2 p, vec2 c, float a, float L, float T, float w) {
    vec2 u = dirOf(a), n = vec2(-u.y, u.x);
    float along = dot(p - c, u), side = abs(dot(p - c, n));
    float ww = mix(w, w * 0.35, clamp((along + T) / (L + T), 0.0, 1.0)) * 0.5;
    float d = side - ww;
    float on = clamp(L - along + 0.5, 0.0, 1.0) * clamp(along + T + 0.5, 0.0, 1.0);
    acc = over(acc, vec3(0.0), exp(-max(side - ww - 2.0, 0.0) * max(side - ww - 2.0, 0.0) / (w * w)) * 0.35 * on);
    acc = over(acc, mix(u_needle, vec3(1.0, 0.8, 0.6), 0.25 * clamp(1.0 - side / max(ww, 0.5), 0.0, 1.0)), clamp(0.5 - d, 0.0, 1.0) * on);
    return acc;
}
void main() {
    vec2 p = v_uv * u_size;
    vec4 acc = vec4(0.0);
    if (u_mode > 1.5) {
        vec2 d = p - u_arc.xy;
        float a = angOf(d, 180.0), off = abs(a - 180.0);
        float fade = smoothstep(u_arc.w, u_arc.w - 8.0, off);
        acc = over(acc, u_ring, span(length(d), u_arc.z - 1.6, u_arc.z + 1.6) * fade);
        gl_FragColor = acc;
        return;
    }
    float R = min(u_size.x, u_size.y) * 0.5, px = 1.0 / R;
    vec2 c = u_size * 0.5, d = p - c;
    float r = length(d) / R;
    if (r > 1.0 + 1.5 / R) { gl_FragColor = acc; return; }
    float a0 = u_arc.x, a1 = u_arc.y, sw = a1 - a0;
    float ang = angOf(d, (a0 + a1) * 0.5), t = (ang - a0) / sw;
    if (u_mode > 0.5) {
        /* a small gauge */
        acc = over(acc, u_face * (1.25 - 0.45 * r), clamp((0.9 - r) / px + 0.5, 0.0, 1.0));
        acc = over(acc, u_ring, span(r / px, 0.9 / px, 1.0 / px));
        float k4 = floor(t * 8.0 + 0.5) / 8.0, o4 = abs(t - k4) * abs(sw) * DEG * r * R;
        bool major = abs(mod(k4 * 8.0 + 0.01, 4.0)) < 0.1;
        vec3 mc = k4 * 100.0 >= u_scale.w - 0.01 && u_scale.w <= 100.0 ? u_red : u_tick;
        if (k4 >= -0.001 && k4 <= 1.001) acc = over(acc, mc, clamp(R * (major ? 0.03 : 0.02) - o4 + 0.5, 0.0, 1.0) * span(r / px, (major ? 0.66 : 0.72) / px, 0.84 / px));
        acc = needle(acc, p, c, a0 + sw * clamp(u_value / u_scale.x, -0.02, 1.02), R * 0.78, R * 0.12, R * 0.06);
        acc = over(acc, u_face * 0.6, clamp((0.12 - r) / px + 0.5, 0.0, 1.0));
        acc = over(acc, u_tick * 0.35, span(r / px, 0.1 / px, 0.12 / px));
        gl_FragColor = acc;
        return;
    }
    /* a big dial: the face, its middle darker, the band round it */
    acc = over(acc, u_face * (1.15 - 0.25 * r), clamp((0.965 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_face * 0.72, clamp((0.52 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_face * 1.5, span(r / px, 0.52 / px - 1.0, 0.52 / px + 0.6));
    /* the white ring round the top, past the scale's ends */
    float pad = 9.0 / abs(sw);
    float ringOn = clamp((t + pad) * abs(sw) * DEG * R + 0.5, 0.0, 1.0) * clamp((1.0 + pad - t) * abs(sw) * DEG * R + 0.5, 0.0, 1.0);
    acc = over(acc, u_ring, span(r / px, 0.965 / px, 1.0 / px) * ringOn);
    if (t > -0.03 && t < 1.03) {
        float mx = u_scale.x, z = zeroAt();
        bool neg = z > 0.0 && t < z;
        float v = neg ? u_min * (1.0 - t / z) : (t - z) / (1.0 - z) * mx;
        float sc = neg ? -u_min / z : mx / (1.0 - z);
        float sm = neg ? -u_min / 4.0 : u_scale.z, sn = neg ? -u_min / 2.0 : u_scale.y;
        float km = floor(v / sm + 0.5) * sm, om = abs(v - km) / sc * abs(sw) * DEG * r * R;
        bool major = abs(mod(km + 0.001, sn)) < 0.01;
        if (km >= min(u_min, 0.0) - 0.001 && km <= mx + 0.001)
            acc = over(acc, neg ? u_regen : u_tick, clamp(R * (major ? 0.009 : 0.0055) - om + 0.5, 0.0, 1.0) * span(r / px, (major ? 0.8 : 0.86) / px, 0.93 / px));
        /* the shift lights: segments along the outside from u_arc.w (amber) and u_scale.w (red) */
        if (!neg && u_arc.w < mx && v >= u_arc.w) {
            float seg = mx / 40.0, ks = fract(v / seg);
            vec3 lc = v >= u_scale.w ? u_red : u_amber;
            acc = over(acc, lc, span(ks, 0.12, 0.88) * span(r / px, 0.875 / px, 0.955 / px));
        }
        if (!neg && v > -0.5 * sn) {
            float kn = clamp(floor(v / sn + 0.5) * sn, 0.0, floor(mx / sn + 0.001) * sn);
            vec2 dn = dirOf(a0 + sw * fracOf(kn));
            vec2 cn = c + dn * (R * (0.8 - u_arc.z * 0.62) - numeralIn(dn, figuresOf(kn), u_digit_adv, u_arc.z * R));
            acc = over(acc, u_tick, numeral(p, cn, u_arc.z * R, kn));
        }
    }
    acc = needle(acc, p, c, a0 + sw * clamp(fracOf(u_value), -0.01, 1.01), R * 0.92, R * 0.18, R * 0.032);
    acc = over(acc, vec3(0.05), clamp((0.085 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_face * 2.2, span(r / px, 0.085 / px, 0.1 / px));
    gl_FragColor = acc;
}`;

/**
 * An analog clock (90's, its middle gauge set to the clock: layout_retro.js), in the dials' look: the face from u_face0
 * at the middle to u_face1 at the rim inside a thin u_bezel ring, a mark each hour (the quarters longer) and a dot each
 * minute, 12, 3, 6 and 9 in figures, the hour and minute hands in u_needle with a glow of u_glow, over a u_hub cap.
 *   u_hm   the hour (0..12, its fraction the minutes) and the minute (0..60)
 */
const ACLOCK_FS = `#version 100
${HIGHP}${COMMON}${GLYPH}
uniform vec2 u_size;
uniform vec2 u_hm;
uniform float u_digit_adv;
uniform vec3 u_face0;
uniform vec3 u_face1;
uniform vec3 u_bezel;
uniform vec3 u_tick;
uniform vec3 u_minor;
uniform vec3 u_num;
uniform vec3 u_needle;
uniform vec3 u_hub;
uniform vec3 u_glow;
varying vec2 v_uv;
vec2 dirOf(float a) { return vec2(sin(a * DEG), -cos(a * DEG)); }
float numeral(vec2 p, vec2 c, float h, float v) {
    float n = v >= 9.5 ? 2.0 : 1.0, adv = u_digit_adv;
    vec2 g = (p - c) / h;
    float x = g.x + n * adv * 0.5, i = floor(x / adv);
    if (i < 0.0 || i >= n || abs(g.y) > 0.5) return 0.0;
    float s = sdf(digitOf(v, i, n), vec2(x - (i + 0.5) * adv, g.y + 0.5));
    return smoothstep(0.5 - 1.5 / h, 0.5 + 1.5 / h, s);
}
/* a hand from c at angle a, L long, a tail T back, w wide tapering to half */
float hand(vec2 p, vec2 c, float a, float L, float T, float w) {
    vec2 u = dirOf(a), n = vec2(-u.y, u.x);
    float along = dot(p - c, u), side = abs(dot(p - c, n));
    float ww = mix(w, w * 0.5, clamp((along + T) / (L + T), 0.0, 1.0)) * 0.5;
    return clamp(0.5 - (side - ww), 0.0, 1.0) * clamp(L - along + 0.5, 0.0, 1.0) * clamp(along + T + 0.5, 0.0, 1.0);
}
void main() {
    vec2 p = v_uv * u_size;
    float R = min(u_size.x, u_size.y) * 0.5, px = 1.0 / R;
    vec2 c = u_size * 0.5, d = p - c;
    float r = length(d) / R;
    vec4 acc = vec4(0.0);
    if (r > 1.0 + 1.5 / R) { gl_FragColor = acc; return; }
    acc = over(acc, mix(u_face0, u_face1, smoothstep(0.0, 0.95, r)), clamp((0.94 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_bezel, span(r / px, 0.94 / px, 1.0 / px));
    float a = atan(d.x, -d.y) / DEG;
    if (a < 0.0) a += 360.0;
    /* the hour marks (each 30 degrees; the quarters longer) and the minute dots */
    float kh = floor(a / 30.0 + 0.5), oh = abs(a - kh * 30.0) * DEG * r * R;
    bool quarter = abs(mod(kh, 3.0)) < 0.5;
    float mark = clamp(R * (quarter ? 0.035 : 0.025) - oh + 0.5, 0.0, 1.0) * span(r / px, (quarter ? 0.72 : 0.78) / px, 0.88 / px);
    float km = floor(a / 6.0 + 0.5), om = abs(a - km * 6.0) * DEG * r * R;
    float dot1 = clamp(R * 0.018 - length(vec2(om, (r - 0.85) * R)) + 0.5, 0.0, 1.0) * (abs(mod(km, 5.0)) < 0.5 ? 0.0 : 1.0);
    acc = over(acc, u_tick, mark);
    acc = over(acc, u_minor, dot1);
    /* 12, 3, 6, 9 */
    float h = 0.2 * R;
    acc = over(acc, u_num, numeral(p, c + dirOf(0.0) * R * 0.56, h, 12.0));
    acc = over(acc, u_num, numeral(p, c + dirOf(90.0) * R * 0.58, h, 3.0));
    acc = over(acc, u_num, numeral(p, c + dirOf(180.0) * R * 0.56, h, 6.0));
    acc = over(acc, u_num, numeral(p, c + dirOf(270.0) * R * 0.58, h, 9.0));
    /* the hands: the hour short and broad, the minute long; a soft glow round them */
    float hh = hand(p, c, u_hm.x * 30.0, R * 0.5, R * 0.1, R * 0.075);
    float mm = hand(p, c, u_hm.y * 6.0, R * 0.8, R * 0.12, R * 0.05);
    float halo = max(hand(p, c, u_hm.x * 30.0, R * 0.52, R * 0.1, R * 0.11), hand(p, c, u_hm.y * 6.0, R * 0.82, R * 0.12, R * 0.09));
    acc = over(acc, u_glow, clamp(halo - max(hh, mm), 0.0, 1.0) * 0.35);
    acc = over(acc, u_needle, max(hh, mm));
    acc = over(acc, u_hub, clamp((0.08 - r) / px + 0.5, 0.0, 1.0));
    acc = over(acc, u_needle * 0.6, span(r / px, 0.065 / px, 0.08 / px));
    gl_FragColor = acc;
}`;


/* One program per mode for the shaders that pick their part by u_mode (JDM_FS, MROUND_FS): u_mode a constant, so the
 * compiler drops every other mode's code. The whole JDM 2 in one program ran its largest program over 1.9 million
 * pixels a frame (the full-screen carbon background with it), more than the cluster's GPU keeps up with: the
 * cluster removed the scene (2026-11-16, a car's cluster-render log: "1 x scene removed"). (engine.js fsOf) */
const byMode = (fs, n) => Array.from({ length: n }, (_, m) => fs.replace('uniform float u_mode;', '#define u_mode ' + m + '.0'));
const JDM_FS_MODES = byMode(JDM_FS, 8);
const MROUND_FS_MODES = byMode(MROUND_FS, 3);

module.exports = { HIGHP, COMMON, GLYPH, FLAT_FS, PANEL_FS, DIAL_FS, BAND_FS, TEXT_FS, BG_FS, ICON_FS, SPARK_FS, CAR_FS, LEDS_FS, FLAG_FS, EAGLE_FS, FIREWORKS_FS, ROAD_FS, CHEVRON_FS, MDASH_FS, MTACH_FS, SDASH_FS, LICON_FS, E9X_FS, MBAR_FS, JDM_FS, MROUND_FS, ACLOCK_FS, RING_FS, RTACH_FS, RBOX_FS, RSEG_FS, CUP_FS, WAKABA_FS, JDM_FS_MODES, MROUND_FS_MODES };
