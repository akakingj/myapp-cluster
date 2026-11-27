#!/usr/bin/env python3
"""decode_logs.py - puts the logs back together from photos of the QR codes Cluster Layouts shows under Logs.

    python3 tools/decode_logs.py photo1.jpg photo2.jpg ... [-o logs.txt]

Each code reads "CLG2 <bundle id> <n>/<count> <base45>." (alphanumeric mode; the last '.' not the data's) or, from
older apps, "CLG1 <bundle id> <n>/<count> <base64>"; the slices of the newest bundle are joined in order, decoded and
inflated (zlib). Needs OpenCV (cv2): its Aruco-based QR detector reads several codes in one photo.
"""
import base64, sys, zlib, argparse

B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

def b45decode(s):
    """base45 (RFC 9285) back to bytes: three characters for two bytes, two for a last odd one."""
    out = bytearray()
    for i in range(0, len(s), 3):
        c = [B45.index(ch) for ch in s[i:i + 3]]
        if len(c) == 3:
            n = c[0] + c[1] * 45 + c[2] * 2025
            out += bytes((n >> 8, n & 255))
        else: out.append(c[0] + c[1] * 45)
    return bytes(out)
import cv2, numpy as np

def views(gray):
    """The photo, then thirds of it across (one code each), each also scaled and sharpened: codes a whole
    photo misses (glare, angle) often read alone."""
    yield gray
    h, w = gray.shape[:2]
    for i in range(3):
        part = gray[:, max(0, int(w * (i / 3 - 0.05))):min(w, int(w * ((i + 1) / 3 + 0.05)))]
        for k in (1, 1.5, 2):
            im = cv2.resize(part, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC) if k != 1 else part
            yield im
            yield cv2.adaptiveThreshold(cv2.GaussianBlur(im, (5, 5), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 8)

def codes_in(img):
    found = []
    dets = []
    try: dets.append(cv2.QRCodeDetectorAruco())
    except Exception: pass
    dets.append(cv2.QRCodeDetector())
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    for d in dets:
        for im in [x for g in views(gray) for x in (g, cv2.GaussianBlur(g, (3, 3), 0))]:
            try:
                ok, texts, _, _ = d.detectAndDecodeMulti(im)
                if ok: found += [t for t in texts if t]
            except Exception: pass
            t = d.detectAndDecode(im)[0]
            if t: found.append(t)
    return found

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photos', nargs='+'); ap.add_argument('-o', '--out')
    a = ap.parse_args()
    parts = {}
    for p in a.photos:
        img = cv2.imread(p)
        if img is None: print('cannot read', p); continue
        for t in codes_in(img):
            f = t.split(' ', 3)
            if len(f) == 4 and f[0] in ('CLG1', 'CLG2'):
                n, count = map(int, f[2].split('/'))
                data = f[3][:-1] if f[0] == 'CLG2' and f[3].endswith('.') else f[3]
                parts.setdefault(f[1], {'count': count, 'kind': f[0], 'slices': {}})['slices'][n] = data
    if not parts: sys.exit('no codes found')
    bid = max(parts, key=lambda k: len(parts[k]['slices']))
    b = parts[bid]
    missing = [i for i in range(1, b['count'] + 1) if i not in b['slices']]
    if missing: sys.exit('bundle %s: missing codes %s of %d' % (bid, missing, b['count']))
    joined = ''.join(b['slices'][i] for i in range(1, b['count'] + 1))
    text = zlib.decompress(b45decode(joined) if b['kind'] == 'CLG2' else base64.b64decode(joined)).decode('utf8')
    if a.out: open(a.out, 'w').write(text); print('wrote', a.out, len(text), 'chars')
    else: print(text)

if __name__ == '__main__': main()
