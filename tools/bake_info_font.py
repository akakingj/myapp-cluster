#!/usr/bin/env python3
"""
bake_info_font.py - Cluster Info's own IBM Plex Sans Condensed SemiBold (SIL OFL 1.1, shared/NOTICE), for the text of
the panel it draws for the cluster and the HUD (overlay.js), as the cluster's other apps' glyphs (tools/bake_font.py:
the personal build's face since Nov 2026). The kit's atlas JSON (kit/runtime/fonts/*.json: sizes of a shelf-packed
alpha atlas, each glyph [x, y, w, h, left, top from the baseline, advance]), as one module the build ships:
apps/akakingj_cluster_info/plex_font.js, registered as family 'plex' (kit fonts.register). Its iDrive pages keep the
kit's own faces.
    python3 tools/bake_info_font.py <folder with IBMPlexSansCondensed-SemiBold.ttf>
"""
import base64
import json
import os
import sys
import zlib

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'apps', 'akakingj_cluster_info', 'plex_font.js')
TTF = 'IBMPlexSansCondensed-SemiBold.ttf'
TEXT = ''.join(chr(c) for c in range(32, 127)) + '°·–—…×±'
SIZES = (24, 36, 54, 80)


def bake(path, size):
    font = ImageFont.truetype(path, size)
    ascent, descent = font.getmetrics()
    imgs = []
    for ch in dict.fromkeys(TEXT):
        bbox = font.getbbox(ch, anchor='ls')
        adv = font.getlength(ch)
        w, h = max(0, bbox[2] - bbox[0]), max(0, bbox[3] - bbox[1])
        im = None
        if w and h:
            im = Image.new('L', (w, h), 0)
            ImageDraw.Draw(im).text((-bbox[0], -bbox[1]), ch, font=font, fill=255, anchor='ls')
        imgs.append((ch, im, bbox, adv))
    W, x, y, rowh, place = 1024, 0, 0, 0, {}
    for ch, im, bbox, adv in imgs:
        if im is None:
            place[ch] = (0, 0, 0, 0)
            continue
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 1, 0
        place[ch] = (x, y, im.width, im.height)
        x += im.width + 1
        rowh = max(rowh, im.height)
    H = y + rowh + 1
    atlas = Image.new('L', (W, H), 0)
    glyphs = {}
    for ch, im, bbox, adv in imgs:
        px, py, pw, ph = place[ch]
        if im is not None:
            atlas.paste(im, (px, py))
        glyphs[ord(ch)] = [px, py, pw, ph, bbox[0], bbox[1], round(adv, 2)]
    return {'size': size, 'ascent': ascent, 'descent': descent, 'atlasW': W, 'atlasH': H,
            'alpha': base64.b64encode(zlib.compress(atlas.tobytes(), 9)).decode(), 'glyphs': glyphs}


if __name__ == '__main__':
    path = os.path.join(sys.argv[1], TTF)
    data = {'family': 'plex', 'source': 'IBM Plex Sans Condensed SemiBold (OFL-1.1)', 'cacheKey': 'plex-info-1', 'sizes': [bake(path, s) for s in SIZES]}
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write("'use strict';\n// plex_font.js - made by tools/bake_info_font.py (don't edit): Cluster Info's panel text, IBM Plex Sans Condensed\n"
                "// SemiBold, Copyright 2017 IBM Corp., SIL OFL 1.1 (shared/NOTICE; converted glyphs, not offered as a font named Plex)\n"
                'module.exports = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('plex', SIZES, os.path.getsize(OUT), 'bytes')
