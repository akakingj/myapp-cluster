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
    assert(!L.pieces(o).some((p) => /^(sli|warn\d)/.test(p.key)), what + ': off, no sign');
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
    const others = ps.filter((p) => !/^(sli|warn\d)/.test(p.key));
    const obs = C.sliObstacles(others, mapForm ? (L.mapWindow || C.MAP_VIEW) : null, L.sliSkip);
    const own = L.sliAt ? L.sliAt(others, o) : null;
    if (L.sliAt && centre === 'info') assert(own, what + ': in the speedometer (the full-size dials)');
    if (!own) assert(C.sliFree(x, y, r, obs), what + ': clear of the layout at ' + x + ',' + y);
    else {
        // (a layout's own place, KO 1's and KO 2's in the speedometer's open foot: clear of every text and the foot's
        // arc and icon, 4 px round its box)
        assert.deepStrictEqual([x, y, r], [own.x, own.y, own.r], what + ': at its own place');
        others.filter((p) => p.kind === 'text' || p.kind === 'icon' || /Foot/.test(p.key)).forEach((p) => {
            if (p.kind === 'band') { const g = p.params.u_geo; assert(Math.hypot(x - (p.x + g[0]), y - (p.y + g[1])) + r + 4 <= g[2] - g[3] / 2 || y + r + 4 <= p.y, what + ': clear of ' + p.key); return; }
            assert(x + r + 4 <= p.x || x - r - 4 >= p.x + p.w || y + r + 4 <= p.y || y - r - 4 >= p.y + p.h, what + ': clear of ' + p.key + ' ' + [p.x, p.y, p.w, p.h]);
        });
    }
    assert(d.z > 20 && num[0].z > d.z, what + ': over everything');
    // the warning signs the camera reads (0.69.0): KO 1's and KO 2's alone, two beside the sign, each clear of the
    // layout, the sign, the lights and the camera's cowl (along its triangle), the two apart
    const warn = ps.filter((p) => /^warn\d$/.test(p.key));
    if (!L.warnSigns) assert.strictEqual(warn.length, 0, what + ': no warning signs');
    else {
        assert.strictEqual(warn.length, 2, what + ': two warning signs');
        const wobs = C.sliObstacles(ps.filter((p) => !/^warn\d$/.test(p.key)), mapForm ? (L.mapWindow || C.MAP_VIEW) : null, L.sliSkip);
        warn.forEach((w, i) => {
            assert(w.kind === 'sign' && w.h === C.WARN.h && w.w === C.WARN_W && w.z >= 30, what + ': warn' + i + ' its kind and size');
            assert(C.warnFree(w.x + w.w / 2, w.y + w.h / 2, wobs.concat(i ? [{ r: [warn[0].x, warn[0].y, warn[0].w, warn[0].h] }] : [])), what + ': warn' + i + ' clear at ' + w.x + ',' + w.y);
            assert(w.x + w.w <= N.x || w.x >= N.x + N.w || w.y >= N.y + N.h, what + ': warn' + i + ' clear of the camera\'s cowl');
        });
        const home = L.warnHome || { x, y };
        const near = Math.hypot(warn[0].x + warn[0].w / 2 - home.x, warn[0].y + warn[0].h / 2 - home.y);
        // (beside the map's window the nearest free place, wherever it is)
        if (!mapForm) assert(near < 160, what + ': the first beside ' + (L.warnHome ? 'its place' : 'the speed limit sign') + ' (' + Math.round(near) + ' px)');
        // shown only while the camera has one: the i-th the i-th sign's picture, else hidden
        assert.strictEqual(warn[1].visible({ roadSigns: ['wild_animal'] }), false);
        assert.strictEqual(warn[0].visible({ roadSigns: ['wild_animal'] }), true);
        const A = require('../apps/akakingj_cluster_layouts/sign_atlas');
        assert.deepStrictEqual(warn[0].dyn({ roadSigns: ['wild_animal'] }).u_cell, A.cells.wild_animal);
        assert.deepStrictEqual(warn[0].dyn({ roadSigns: ['unknown_name'] }).u_cell, A.cells.danger);
        assert.deepStrictEqual(warn[0].dyn({}).u_cell, [0, 0, 0, 0]);
    }
    n++;
}))));
const s = C.sliPieces({ x: 500, y: 500, r: 46 });
assert.strictEqual(C.sliText({}), '--', 'no value yet');
assert.strictEqual(C.sliText({ speedLimit: 80 }), '80');
assert.strictEqual(C.sliText({ speedLimit: 0 }), '--');
assert.strictEqual(s[1].text, C.sliText);
// the atlas: every warning sign the camera's types can give (road_signs.artOf of a DS_ type), WARN.h high
{
    const A = require('../apps/akakingj_cluster_layouts/sign_atlas'), RS = require('../shared/road_signs');
    assert.strictEqual(A.h, C.WARN.h, 'sign_atlas.js made for WARN.h: tools/make_sign_art.py');
    ['DS_SPLIPPERY_ROAD', 'DS_TRAFFIC_JAM', 'DS_ANIMAL_CROSSING', 'DS_RIGHT_DOWNWARDS', 'DS_ROAD_WORKS', 'DS_SPEED_BUMP', 'DS_CURVE_LEFT', 'DS_NEW_ONE']
        .forEach((t) => { const c = A.cells[RS.artOf(t)]; assert(c && c[3] === C.WARN.h && c[2] <= C.WARN_W && c[0] + c[2] <= A.w && c[1] + c[3] <= A.ah, t); });
    assert(!A.cells.give_way && !A.cells.no_entry, 'the warning signs only');
    const tex = C.signAtlas();
    assert.strictEqual(tex.px.length, tex.w * tex.h * 4);
}
console.log('test_sli: ' + n + ' cases ok');
