#!/usr/bin/env python3
"""make_previews.py - the layout pictures Cluster Layouts shows on its page (main.js, menu.js): each layout drawn as
the cluster would (tools/preview.js, WebGL in headless Chromium) with demo readings for a petrol car, made smaller to
PW x PH and packed, each deflated RGB, into apps/akakingj_cluster_layouts/previews.wad (.wad: the build ships it
as it is, as the fonts; kit/tools/build.py):

    'LPV1', u32 header length, header JSON { w, h, list: [{ id, strip, off, len }] }, the data (off from the data's start)

Each layout with the car's own bottom strip (strip 1: the only form since 0.34.0, the full-screen one gone), the car's
strip drawn in as a stand-in (the KOMBI draws the real one: gear, drive mode, ranges, time,
outside temperature) so the picture reads as on the car.

And the Stock card's picture, the car's own cluster drawn (tools/stock_preview.py), as 'stock'.

Run again after a layout's look changes:  python3 tools/make_previews.py
"""
import json, os, struct, subprocess, sys, tempfile, zlib
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'apps', 'akakingj_cluster_layouts')
PW, PH = 600, 225          # the page's large picture (8:3, the cluster's 1920 x 720); the cards are made from it

def layout_ids():
    js = "require('./tools/scene');console.log(JSON.stringify(require('./apps/akakingj_cluster_layouts/layouts').LAYOUTS.map(l=>l.id)))"
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        raise SystemExit('layout list: ' + out.stderr)
    return json.loads(out.stdout)

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'

def stock_strip(im):
    """The car's own strip under y 660 (1920 x 720): a stand-in, grey, its usual contents."""
    d = ImageDraw.Draw(im)
    d.rectangle([0, 664, 1919, 719], fill=(10, 11, 13))
    d.line([360, 664, 1560, 664], fill=(48, 52, 58), width=2)
    f, big = ImageFont.truetype(FONT, 30), ImageFont.truetype(FONT, 40)
    grey, light = (120, 126, 134), (190, 195, 202)
    d.text((420, 676), '520 km', font=f, fill=grey)
    d.text((960, 668), 'D4', font=big, fill=light, anchor='ma')
    d.text((800, 676), 'COMFORT', font=f, fill=grey, anchor='ma')
    d.text((1500, 676), '4:13   9\u00b0C', font=f, fill=grey, anchor='ra')
    return im

def main():
    ids = layout_ids()
    tmp = tempfile.mkdtemp(prefix='lpv-')
    blobs, head = [], {'w': PW, 'h': PH, 'list': []}
    off = 0
    for strip in (1,):
        for lid in ids:
            png = os.path.join(tmp, '%s_%d.png' % (lid, strip))
            r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'preview.js'), '--layout', lid, '--engine', '--kmh', '--celsius', '--speed', '88',
                                '--rpm', '4200', '--gear', '4', '--stage', 'D', '--oil', '96', '--coolant', '90', '--out', png] + (['--strip'] if strip else []),
                               capture_output=True, text=True, cwd=ROOT)
            if r.returncode != 0:
                raise SystemExit(lid + ': ' + r.stderr[-800:])
            im = Image.open(png).convert('RGB')
            if strip:
                im = stock_strip(im)
            im = im.resize((PW, PH), Image.LANCZOS)
            data = zlib.compress(im.tobytes(), 9)
            head['list'].append({'id': lid, 'strip': strip, 'off': off, 'len': len(data)})
            blobs.append(data)
            off += len(data)
            im.save(os.path.join(tmp, '%s_%d_small.png' % (lid, strip)))
            print('%-14s strip %d %6d bytes' % (lid, strip, len(data)))
    # the Stock card's: the car's own cluster, drawn (stock_preview.py)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import stock_preview
    png = os.path.join(tmp, 'stock_1.png')
    stock_preview.main(png)
    data = zlib.compress(Image.open(png).convert('RGB').resize((PW, PH), Image.LANCZOS).tobytes(), 9)
    head['list'].append({'id': 'stock', 'strip': 1, 'off': off, 'len': len(data)})
    blobs.append(data)
    off += len(data)
    print('%-14s strip 1 %6d bytes' % ('stock', len(data)))
    hj = json.dumps(head, separators=(',', ':')).encode()
    with open(os.path.join(APP, 'previews.wad'), 'wb') as f:
        f.write(b'LPV1' + struct.pack('<I', len(hj)) + hj + b''.join(blobs))
    print('previews.wad: %d pictures, %d bytes (pictures in %s)' % (len(head['list']), 8 + len(hj) + off, tmp))

if __name__ == '__main__':
    main()
