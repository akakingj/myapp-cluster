'use strict';
/**
 * test_map_test.js - AK Map Test (apps/akakingj_map_test): its one layout, KO 1 Map, the map under the layout whatever
 * the centre: its window "under" (main.js, map_window.js), a black base in the ambient class (below Waze on cluster's
 * map there, so the stock cluster never shows through), and over the map only the veil, the readouts' plates and
 * figures, and the dials (each on its black disc). Then every layout check of tools/test_engine.js, clearance.js and
 * check_fit.js on the app (LAYOUTS_APP).
 *   node tools/test_map_test.js
 */
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
process.env.LAYOUTS_APP = path.join(__dirname, '..', 'apps', 'akakingj_map_test');
const { makeScene, APP } = require('./scene');
let failed = 0, passed = 0;
const check = (name, fn) => { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } };

check('ko1map: the map window under the layout, whatever the centre', () => {
    const L = require(path.join(APP, 'layouts')).byId('ko1map');
    assert(L.mapAlways && L.mapWindow.under === true);
    const W = L.mapWindow;
    assert.strictEqual(W.w % 4, 0);
    assert(W.y + W.h <= 646, 'above the car\'s strip');
    assert(Math.abs(W.w / W.h - 1088 / 480) < 0.01, 'the phone\'s proportions');
    ['info', 'map', 'stock'].forEach((centre) => {
        const s = makeScene({ layout: 'ko1map', options: { centre }, data: { speed: 0 } });
        s.engine._tick();
        const layers = [...s.client.layers.values()];
        const ambient = layers.filter((l) => l.opts.klass === 'ambient').map((l) => l.opts);
        assert.strictEqual(ambient.length, 1, centre + ': one layer in the ambient class (the base)');
        assert(ambient[0].x === 0 && ambient[0].y === 0 && ambient[0].w === 1920 && ambient[0].h >= W.y + W.h, centre + ': the base under the whole map');
        const over = s.engine._pieces().filter((l) => l.x < W.x + W.w && l.x + l.w > W.x && l.y < W.y + W.h && l.y + l.h > W.y);
        // (the dials' own pieces: within a dial's black disc's square, its arc's glow and its foot's figures a little round it)
        const dials = s.engine._pieces().filter((l) => /Disc$/.test(l.key));
        const inDial = (l) => dials.some((d) => l.x >= d.x - 40 && l.x + l.w <= d.x + d.w + 40 && l.y >= d.y - 40 && l.y + l.h <= d.y + d.h + 60);
        const allowed = (l) => /^(bgMap|clock|outside)/.test(l.key) || inDial(l);
        assert(over.every(allowed), centre + ': over the map: ' + over.filter((l) => !allowed(l)).map((l) => l.key).join(' '));
        s.stop();
    });
});
check('map_window.js: "under" at the line\'s end', () => {
    const fs = require('fs'), os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-'));
    const log = { info() {}, warn() {} };
    const mw = require(path.join(APP, 'map_window')).startMapWindow(log, { dir });
    mw.set({ x: 280, y: 46, w: 1360, h: 600, under: true });
    assert.strictEqual(fs.readFileSync(path.join(dir, 'map_window.txt'), 'utf8'), 'panel 280 46 1360 600 under\n');
    mw.set({ x: 416, y: 120, w: 1088, h: 480 });
    assert.strictEqual(fs.readFileSync(path.join(dir, 'map_window.txt'), 'utf8'), 'panel 416 120 1088 480\n');
    mw.release();
    assert(!fs.existsSync(path.join(dir, 'map_window.txt')));
    fs.rmdirSync(dir);
});
check('the app: one layout, its own id, its own engine (a piece\'s klass), the other shared files as Cluster Layouts\'', () => {
    const fs = require('fs');
    const spec = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
    assert.strictEqual(spec.id, 'akakingj_map_test');
    assert.deepStrictEqual(require(path.join(APP, 'layouts')).LAYOUTS.map((l) => l.id), ['ko1map']);
    assert(Array.isArray(spec.shared) && spec.shared.indexOf('engine.js') < 0);
    assert(/klass: s\.klass \|\| 'content'/.test(fs.readFileSync(path.join(APP, 'engine.js'), 'utf8')));
    const show = spec.settings.find((x) => x.key === 'show');
    assert.strictEqual(show.default, 'off', 'nothing on the cluster until it is turned on');
});
['test_engine.js', 'clearance.js', 'check_fit.js'].forEach((t) => check('on the app: ' + t, () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, t)], { env: process.env, encoding: 'utf8', timeout: 600000 });
    assert.strictEqual(r.status, 0, (r.stdout + r.stderr).split('\n').filter((l) => /FAIL|Error|clash/.test(l)).slice(0, 5).join(' | '));
}));
console.log(passed + ' passed' + (failed ? ', ' + failed + ' failed' : ''));
process.exit(failed ? 1 : 0);
