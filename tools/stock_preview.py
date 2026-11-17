"""stock_preview.py - a plain drawing of the car's own ID7 cluster (its sport look: the two framed scales, the map
between them, the speed and the gear, the bottom row), 1920 x 720: the picture of Cluster Layouts' Stock card
(make_previews.py packs it with the layouts' as 'stock'). Drawn here line by line, not a photo: no BMW picture in
the repository.

    python3 tools/stock_preview.py out.png
"""
import math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
S = 2                                    # drawn at 2x, then halved (smooth edges)
W, H = 1920 * S, 720 * S
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
FR = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf'
def P(pts, mirror=False): return [((1920 - x) * S if mirror else x * S, y * S) for x, y in pts]
def font(sz, bold=True): return ImageFont.truetype(FB if bold else FR, int(sz * S))

def lerp_path(pts, t):
    """the point a share t along the polyline pts"""
    seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    d = t * sum(seg)
    for i, L in enumerate(seg):
        if d <= L or i == len(seg) - 1:
            u = d / L if L else 0
            return (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u)
        d -= L

def main(out):
    im = Image.new('RGB', (W, H), (0, 0, 0))
    # the map in the middle: dark, a few streets, the route and the car's arrow
    mp = Image.new('RGB', (W, H), (0, 0, 0)); md = ImageDraw.Draw(mp)
    md.rectangle([0, 0, W, H], fill=(16, 19, 26))
    import random
    random.seed(7)
    for x in range(380, 1560, 74): md.line([((x + random.randint(-20, 20)) * S, 0), ((x + random.randint(-30, 30)) * S, H)], fill=(58, 68, 88), width=3 * S)
    for y in range(60, 720, 66): md.line([(0, (y + random.randint(-10, 10)) * S), (W, (y + random.randint(-14, 14)) * S)], fill=(58, 68, 88), width=3 * S)
    md.line([(952 * S, 0), (958 * S, H)], fill=(86, 118, 170), width=14 * S)
    mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon(P([(600, 150), (1320, 150), (1250, 590), (670, 590)]), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(60 * S))
    im = Image.composite(mp, im, mask)
    d = ImageDraw.Draw(im)
    d.polygon(P([(960, 470), (940, 515), (960, 505), (980, 515)]), fill=(255, 120, 40))
    # each frame: its outer line (white), a red band inside it, the scale's numerals along it
    outer = [(697, 30), (295, 88), (112, 248), (90, 356), (200, 596), (510, 630), (760, 646)]
    for mirror in (False, True):
        band = Image.new('RGBA', (W, H), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
        inner = [(x + dx, y + dy) for (x, y), (dx, dy) in zip(outer, [(0, 20), (14, 17), (19, 9), (20, 0), (15, -14), (0, -18), (0, -18)])]
        glass = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(glass).polygon(P(outer[:6] + [(640, 360)], mirror), fill=(40, 44, 52, 150))
        glass = glass.filter(ImageFilter.GaussianBlur(30 * S))
        im.paste(glass, (0, 0), glass)
        poly = P(outer[:6], mirror) + list(reversed(P(inner[:6], mirror)))
        bd.polygon(poly, fill=(190, 20, 24, 255))
        band = band.filter(ImageFilter.GaussianBlur(3 * S))
        glow = band.filter(ImageFilter.GaussianBlur(22 * S))
        im.paste(glow, (0, 0), glow); im.paste(band, (0, 0), band)
        d = ImageDraw.Draw(im)
        d.line(P(outer, mirror), fill=(232, 236, 242), width=5 * S, joint='curve')
        d.line(P([(x + 4, y + 4) for x, y in inner[:6]], mirror), fill=(120, 20, 24), width=2 * S, joint='curve')
        nums = ['0', '20', '40', '60', '100', '140', '200', '260'] if not mirror else ['0', '1', '2', '3', '4', '5', '6', '7']
        ts = [0.84, 0.74, 0.62, 0.5, 0.36, 0.23, 0.12, 0.02] if not mirror else [0.84, 0.74, 0.62, 0.5, 0.38, 0.26, 0.14, 0.03]
        path = [(x + dx, y + dy) for (x, y), (dx, dy) in zip(outer, [(0, 62), (40, 54), (60, 34), (66, 0), (52, -42), (0, -52), (0, -52)])]
        for n, t in zip(nums, ts):
            x, y = lerp_path(path, t)
            if mirror: x = 1920 - x
            d.text((x * S, y * S), n, font=font(34), fill=(240, 242, 246), anchor='mm')
    # the readings: speed left, the drive mode and gear right, each over a line
    d.text((430 * S, 360 * S), '90', font=font(84), fill=(255, 255, 255), anchor='rs')
    d.text((442 * S, 360 * S), 'km/h', font=font(28, False), fill=(200, 204, 210), anchor='ls')
    d.line([(250 * S, 380 * S), (560 * S, 380 * S)], fill=(210, 214, 220), width=3 * S)
    d.text((1490 * S, 360 * S), 'D', font=font(84), fill=(255, 255, 255), anchor='ls')
    d.text((1360 * S, 360 * S), 'SPORT', font=font(28), fill=(220, 224, 230), anchor='ls')
    d.line([(1360 * S, 380 * S), (1670 * S, 380 * S)], fill=(210, 214, 220), width=3 * S)
    # the speed limit sign at the speedometer's foot
    d.ellipse([(640 - 34) * S, (590 - 34) * S, (640 + 34) * S, (590 + 34) * S], fill=(255, 255, 255), outline=(220, 30, 30), width=8 * S)
    d.text((640 * S, 590 * S), '120', font=font(26), fill=(20, 20, 20), anchor='mm')
    # the bottom row: range, time, street, outside temperature
    for txt, x, a in (('328 km', 180, 'ls'), ('13:45', 360, 'ls'), ('Street', 960, 'ms'), ('+10.0 °C', 1740, 'rs')):
        d.text((x * S, 700 * S), txt, font=font(32, False), fill=(225, 228, 234), anchor=a)
    im = im.resize((1920, 720), Image.LANCZOS)
    im.save(out)

if __name__ == '__main__':
    main(sys.argv[1])
