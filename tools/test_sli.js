'use strict';
// Settings > Speed limit sign (Layouts 0.62.0): off by default and then nowhere; on, every layout, with every centre,
// car and bottom strip, gets one sign in room it leaves (clear of its pieces, the KOMBI's lights, the map's window, the
// glass's corners and the car's strip), at most 60 pieces in all, drawn over everything; '--' until the car's value.
//   node tools/test_sli.js
const assert = require('assert');
const path = require('path');
require('./scene');     // (the kit's runtime for the layouts' ./kit/ requires)
const APP = path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts');
const { LAYOUTS, signOn } = require(path.join(APP, 'layouts'));
const C = require(path.join(APP, 'layout_common'));
const spec = require(path.join(APP, 'app.json'));

let n = 0;
const item = spec.settings.find((s) => s.key === 'sliSign');
assert(item && item.default === 'off' && item.section === 'Display', 'the setting, off by default, under Display');
assert.strictEqual(signOn({}), false);

LAYOUTS.forEach((L) => ['info', 'map', 'stock'].forEach((centre) => ['ice', 'phev'].forEach((vehicle) => ['on', 'off'].forEach((bottomExtra) => {
    const o = { centre, vehicle, bottomExtra, speedUnit: 'kmh', tempUnit: 'c', redline: 7000, rpmMax: 8000 };
    const what = L.id + ' ' + centre + ' ' + vehicle + ' ' + bottomExtra;
    assert(!L.pieces(o).some((p) => /^sli/.test(p.key)), what + ': off, no sign');
    const ps = L.pieces(Object.assign({ sliSign: 'on' }, o));
    const disc = ps.filter((p) => p.key === 'sliDisc'), num = ps.filter((p) => p.key === 'sliNum');
    assert(disc.length === 1 && num.length === 1, what + ': one sign (' + disc.length + ')');
    assert(ps.length <= 60, what + ': ' + ps.length + ' pieces');
    const d = disc[0], r = d.w / 2, x = d.x + r, y = d.y + r;
    assert(C.SLI_R.indexOf(r) >= 0 && d.w === d.h, what + ': its size');
    assert(d.y >= 8 && y + r <= C.STRIP_Y - 6 && d.x >= 8 && d.x + d.w <= 1912, what + ': on the glass, above the car\'s strip');
    assert(!C.inCorner(x, y - r), what + ': clear of the slanted corners');
    // (and of the driver camera's cowl over the top middle, NOTCH, where the glass shows nothing: AK Cluster ID8 0.22.0
    // put its M styles' signs there)
    const N = C.NOTCH;
    assert(x + r <= N.x || x - r >= N.x + N.w || y - r >= N.y + N.h, what + ': clear of the camera\'s cowl');
    // clear of every other piece (its backgrounds aside), the lights, the map's window
    const mapForm = centre === 'map' || centre === 'stock';
    const others = ps.filter((p) => !/^sli/.test(p.key));
    const obs = C.sliObstacles(others, mapForm ? (L.mapWindow || C.MAP_VIEW) : null, L.sliSkip);
    assert(C.sliFree(x, y, r, obs), what + ': clear of the layout at ' + x + ',' + y);
    assert(d.z > 20 && num[0].z > d.z, what + ': over everything');
    n++;
}))));
const s = C.sliPieces({ x: 500, y: 500, r: 46 });
assert.strictEqual(C.sliText({}), '--', 'no value yet');
assert.strictEqual(C.sliText({ speedLimit: 80 }), '80');
assert.strictEqual(C.sliText({ speedLimit: 0 }), '--');
assert.strictEqual(s[1].text, C.sliText);
console.log('test_sli: ' + n + ' cases ok');
