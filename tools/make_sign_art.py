#!/usr/bin/env python3
"""
make_sign_art.py - Cluster Info's road sign pictures for the HUD (apps/akakingj_cluster_info/sign_art.js).

The pictures are South Korea's road signs (도로교통법 시행규칙 별표 6; Government of the Republic of Korea, free to use
as public works under Article 24-2 of the Korean Copyright Act), as the owner downloaded them (Nov 27 2026; the same
designs as Wikipedia's "Road signs in South Korea"), kept here 240 px wide in tools/sign_art/<name>.png.

Each is cut out along the outside of its thick red edge (the thin outer line and the white rim dropped: on the HUD
white is light, the ground around a sign must be clear), shrunk to the HUD's size (overlay.js SIGNS: h high, as BMW's limit sign; at most wmax wide) and
written as raw RGBA, deflated and in base64, to sign_art.js. "danger" (140, "!") is made from another warning sign:
its picture painted out and a "!" drawn in.

    python3 tools/make_sign_art.py                 # from tools/sign_art/*.png
    python3 tools/make_sign_art.py --import DIR    # first: DIR/<name>.jpg (the downloads) -> tools/sign_art/<name>.png
"""
import base64
import json
import re
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'sign_art'
OUT = ROOT / 'apps' / 'akakingj_cluster_info' / 'sign_art.js'
OVERLAY = ROOT / 'apps' / 'akakingj_cluster_info' / 'overlay.js'
# AK Cluster Layouts' warning signs (KO 1, KO 2: layout_common.js WARN): one atlas, every sign WARN.h high
ATLAS = ROOT / 'apps' / 'akakingj_cluster_layouts' / 'sign_atlas.js'
COMMON = ROOT / 'apps' / 'akakingj_cluster_layouts' / 'layout_common.js'

# the signs used (the camera's types map to these in signs.js)
NAMES = ['slippery', 'traffic_jam', 'wild_animal', 'downhill', 'uphill', 'curve_right', 'curve_left',
         'double_bend_right', 'double_bend_left', 'road_works', 'crosswalk', 'children', 'bicycle', 'speed_hump',
         'bumpy_road', 'falling_rocks', 'crosswind', 'tunnel', 'bridge', 'railway', 'traffic_lights', 'roundabout',
         'merge_right', 'merge_left', 'riverside', 'give_way', 'stop', 'no_entry',
         # the regulatory and instruction signs (the camera's names for them not known yet: kept till the car's own
         # list of types says which it has - signs.js logs it)
         'slow', 'no_u_turn', 'no_left_turn', 'no_right_turn', 'no_straight', 'no_cars', 'no_parking', 'no_stopping',
         'keep_distance_50m', 'one_way', 'unprotected_left',
         # no passing: the car's head-up display shows it itself, but on the cluster AK Cluster Layouts covers BMW's own
         # signs - so Layouts' atlas has it (the owner, 2026-11-28)
         'no_passing']


def box_from_overlay():
    """overlay.js SIGNS: h (every sign this high, as BMW's own limit sign) and wmax (the widest, a triangle)."""
    t = OVERLAY.read_text(encoding='utf-8')
    m = re.search(r'const SIGNS = \{([^}]*)\}', t)
    if not m:
        raise SystemExit('overlay.js: no SIGNS')
    v = dict(re.findall(r'(\w+):\s*(\d+)', m.group(1)))
    return int(v['h']), int(v['wmax'])


# not in Layouts' atlas: the cluster shows the warning signs only (the yellow triangles)
REGULATORY = {'give_way', 'stop', 'no_entry', 'slow', 'no_u_turn', 'no_left_turn', 'no_right_turn', 'no_straight', 'no_cars',
              'no_parking', 'no_stopping', 'keep_distance_50m', 'one_way', 'unprotected_left'}


def warn_h():
    m = re.search(r'const WARN = \{[^}]*h:\s*(\d+)', COMMON.read_text(encoding='utf-8'))
    if not m:
        raise SystemExit('layout_common.js: no WARN h')
    return int(m.group(1))


def atlas(cuts, h):
    """Every sign h high (at most 1.2 h wide), packed in rows of an atlas at most 1024 wide, 2 px apart."""
    ims = {n: shrink(im, h, round(h * 1.2)) for n, im in cuts.items() if n not in REGULATORY}
    W, x, y, cells = 1024, 0, 0, {}
    for n in sorted(ims):
        im = ims[n]
        if x + im.width > W:
            x, y = 0, y + h + 2
        cells[n] = [x, y, im.width, im.height]
        x += im.width + 2
    H = y + h
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for n, (cx, cy, cw, ch) in cells.items():
        sheet.paste(ims[n], (cx, cy))
    return sheet, cells


def import_dir(d):
    SRC.mkdir(parents=True, exist_ok=True)
    for n in NAMES:
        f = Path(d) / (n + '.jpg')
        if not f.exists():
            print('missing ' + f.name)
            continue
        im = Image.open(f).convert('RGB')
        im = im.resize((240, round(im.height * 240 / im.width)), Image.LANCZOS)
        im.save(SRC / (n + '.png'), optimize=True)
        print('imported ' + n)


def cut(im):
    """The sign along the outside of its thick red edge: RGBA, cropped to it."""
    a = np.asarray(im.convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 150) & (g < 100) & (b < 100)
    blue = (b > 110) & (r < 60) & (g < 110)
    if red.sum() < blue.sum() * 0.5:                  # a blue sign (one way, unprotected left turn): its blue edge
        red = blue
    k = max(2, round(im.width / 110))                     # the thin outer line (~1 % of the width) goes, the edge stays
    yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
    disk = (xx * xx + yy * yy) <= k * k
    edge = ndimage.binary_opening(red, structure=disk)
    lab, n = ndimage.label(edge)
    if not n:
        raise ValueError('no red edge')
    edge = lab == (1 + int(np.argmax(ndimage.sum(edge, lab, range(1, n + 1)))))
    shape = ndimage.binary_fill_holes(edge)
    ys, xs = np.nonzero(shape)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([a, (shape * 255)]).astype(np.uint8)[y0:y1, x0:x1]
    return Image.fromarray(rgba, 'RGBA')


def danger(base):
    """140 (위험): a warning sign's picture painted out, a "!" in its place."""
    a = np.asarray(base).copy()
    rgb = a[..., :3].astype(int)
    yellow = (rgb[..., 0] > 200) & (rgb[..., 1] > 140) & (rgb[..., 1] < 220) & (rgb[..., 2] < 90)
    col = np.median(rgb[yellow], axis=0).astype(np.uint8)
    ys, xs = np.nonzero(yellow)
    inside = np.zeros(yellow.shape, bool)
    inside[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
    dark = (rgb.sum(axis=2) < 300) & inside & (a[..., 3] > 0)
    dark = ndimage.binary_dilation(dark, iterations=2) & inside & ~((rgb[..., 0] > 150) & (rgb[..., 1] < 100))
    a[dark, :3] = col
    im = Image.fromarray(a, 'RGBA')
    d = ImageDraw.Draw(im)
    w, h = im.size
    cx, top, bot = w / 2, ys.min() + (ys.max() - ys.min()) * 0.30, ys.min() + (ys.max() - ys.min()) * 0.72
    bw, ink = w * 0.075, (35, 28, 26, 255)
    d.polygon([(cx - bw / 2, top), (cx + bw / 2, top), (cx + bw * 0.32, bot), (cx - bw * 0.32, bot)], fill=ink)
    r = bw * 0.52
    cy = ys.min() + (ys.max() - ys.min()) * 0.86
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ink)
    return im


def shrink(im, h, wmax):
    """h high (as BMW's limit sign: a round sign h across, a triangle h tall), or narrower if wider than wmax."""
    k = min(h / im.height, wmax / im.width)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)   # (premultiplied: no fringe)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--import':
        import_dir(sys.argv[2])
    h, wmax = box_from_overlay()
    art = {}
    cuts = {}
    for n in NAMES:
        f = SRC / (n + '.png')
        if not f.exists():
            raise SystemExit('missing ' + str(f))
        cuts[n] = cut(Image.open(f))
    cuts['danger'] = danger(cuts['speed_hump'])
    for n, im in cuts.items():
        s = shrink(im, h, wmax)
        raw = s.tobytes()
        art[n] = {'w': s.width, 'h': s.height, 'z': base64.b64encode(zlib.compress(raw, 9)).decode()}
    body = ',\n'.join('    %s: %s' % (json.dumps(n), json.dumps(v, separators=(',', ':'))) for n, v in sorted(art.items()))
    OUT.write_text("""'use strict';
/**
 * sign_art.js - made by tools/make_sign_art.py; don't edit. South Korea's road signs (Government of the Republic of
 * Korea, 도로교통법 시行규칙 별표 6; free to use as public works, Article 24-2 of the Korean Copyright Act), cut out
 * along their red edge, %d px high (a triangle at most %d wide): raw RGBA, deflated, base64.
 */
module.exports = {
    h: %d,
    wmax: %d,
    art: {
%s,
    },
};
""".replace('시行', '시행') % (h, wmax, h, wmax, body), encoding='utf-8')
    print('%s: %d signs, %d px high, %d bytes' % (OUT.relative_to(ROOT), len(art), h, OUT.stat().st_size))
    # Layouts' atlas
    ah = warn_h()
    sheet, cells = atlas(cuts, ah)
    ATLAS.write_text("""'use strict';
/**
 * sign_atlas.js - made by tools/make_sign_art.py; don't edit. South Korea's road signs (Government of the Republic of
 * Korea, 도로교통법 시행규칙 별표 6; free to use as public works, Article 24-2 of the Korean Copyright Act), cut out
 * along their red or blue edge, %d px high, in one atlas (%dx%d; raw RGBA, deflated, base64) for AK Cluster Layouts'
 * warning signs (layout_common.warnPieces; the warning signs only): cells { name: [x, y, w, h] }.
 */
module.exports = {
    h: %d,
    w: %d,
    ah: %d,
    cells: %s,
    z: %s,
};
""" % (ah, sheet.width, sheet.height, ah, sheet.width, sheet.height, json.dumps(cells, separators=(',', ':')),
           json.dumps(base64.b64encode(zlib.compress(sheet.tobytes(), 9)).decode())), encoding='utf-8')
    sheet.save('/tmp/sign_atlas.png')
    print('%s: %d signs, %d px high, atlas %dx%d, %d bytes' % (ATLAS.relative_to(ROOT), len(cells), ah, sheet.width, sheet.height, ATLAS.stat().st_size))
    # a contact sheet to look at
    sheet = Image.new('RGBA', (len(cuts) * (wmax + 6), h + 6), (40, 44, 50, 255))
    for i, n in enumerate(sorted(art)):
        im = Image.frombytes('RGBA', (art[n]['w'], art[n]['h']), zlib.decompress(base64.b64decode(art[n]['z'])))
        sheet.alpha_composite(im, (i * (wmax + 6) + 3, 3))
    sheet.save('/tmp/sign_art_sheet.png')


if __name__ == '__main__':
    main()
