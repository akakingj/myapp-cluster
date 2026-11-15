#!/usr/bin/env python3
"""make_previews.py - the layout pictures Cluster Layouts shows on its page (main.js, menu.js): each layout drawn as
the cluster would (tools/preview.js, WebGL in headless Chromium) with demo readings for a petrol car, made smaller to
PW x PH and packed, each deflated RGB, into apps/akakingj_cluster_layouts/previews.wad (.wad: the build ships it
as it is, as the fonts; kit/tools/build.py):

    'LPV1', u32 header length, header JSON { w, h, list: [{ id, off, len }] }, the data (off from the data's start)

Run again after a layout's look changes:  python3 tools/make_previews.py
"""
import json, os, struct, subprocess, sys, tempfile, zlib
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'apps', 'akakingj_cluster_layouts')
PW, PH = 600, 225          # the page's large picture (8:3, the cluster's 1920 x 720); the cards are made from it

def layout_ids():
    js = "require('./tools/scene');console.log(JSON.stringify(require('./apps/akakingj_cluster_layouts/layouts').LAYOUTS.map(l=>l.id)))"
    out = subprocess.run(['node', '-e', js], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        raise SystemExit('layout list: ' + out.stderr)
    return json.loads(out.stdout)

def main():
    only = sys.argv[1:]
    ids = layout_ids()
    tmp = tempfile.mkdtemp(prefix='lpv-')
    blobs, head = [], {'w': PW, 'h': PH, 'list': []}
    off = 0
    for lid in ids:
        png = os.path.join(tmp, lid + '.png')
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'preview.js'), '--layout', lid, '--engine', '--kmh', '--celsius', '--speed', '88',
                            '--rpm', '4200', '--gear', '4', '--stage', 'D', '--oil', '96', '--coolant', '90', '--out', png],
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode != 0:
            raise SystemExit(lid + ': ' + r.stderr[-800:])
        im = Image.open(png).convert('RGB').resize((PW, PH), Image.LANCZOS)
        data = zlib.compress(im.tobytes(), 9)
        head['list'].append({'id': lid, 'off': off, 'len': len(data)})
        blobs.append(data)
        off += len(data)
        im.save(os.path.join(tmp, lid + '_small.png'))
        print('%-14s %6d bytes' % (lid, len(data)))
    hj = json.dumps(head, separators=(',', ':')).encode()
    with open(os.path.join(APP, 'previews.wad'), 'wb') as f:
        f.write(b'LPV1' + struct.pack('<I', len(hj)) + hj + b''.join(blobs))
    print('previews.wad: %d layouts, %d bytes (pictures in %s)' % (len(ids), 8 + len(hj) + off, tmp))

if __name__ == '__main__':
    main()
