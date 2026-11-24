'use strict';
/**
 * test_daynight.js - day and night from the car's light sensor (data.js: Vehicle.statusDayNightChangeOver, by name or
 * number; "unchanged" and "invalid" keep what was) and 90's, lit by them (layout_retro.js dayNight: day its white
 * look, every word in it white; night its orange one).
 *   node tools/test_daynight.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'daynight-'));
require('./scene');   // maps ./kit/ to the kit's runtime

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
const handlers = {};
const ctx = {
    log: { info() {}, warn() {}, debug() {} }, spec,
    settings: { get: () => undefined },
    signals: { watch: (i, n, h) => { Object.assign(handlers, h); return Promise.resolve({}); }, proxy: () => Promise.reject(new Error('no link (test)')) },
};
const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
const D = startData(ctx, { shown: () => true, dayNight: true });
try {
    check('no word from the light sensor yet: neither', () => assert.strictEqual(D.data().night, undefined));
    check('NACHT: night; TAG: day', () => {
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 'NACHT' });
        assert.strictEqual(D.data().night, true);
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 'TAG' });
        assert.strictEqual(D.data().night, false);
    });
    check('as numbers too (2 night, 1 day); unchanged (0) and invalid (3) keep what was', () => {
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 2 });
        assert.strictEqual(D.data().night, true);
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 0 });
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 3 });
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 'KEINE_AENDERUNG' });
        assert.strictEqual(D.data().night, true);
        handlers.statusDayNightChangeOver({ dayNightChangeOver: 1 });
        assert.strictEqual(D.data().night, false);
    });
} finally { if (D.stop) D.stop(); }

check("90's is lit by day and night: day white, its words too; night orange", () => {
    const R = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layout_retro'));
    assert.strictEqual(R.dayNight, true);
    const day = R.palette('efficient'), night = R.palette('comfort');
    ['tick', 'num', 'text'].forEach((k) => assert.strictEqual(day[k], '#f4f4f0', 'day ' + k));
    assert.strictEqual(night.text, '#ff9a3c');
});
check("20's and ID6 M in Efficient: the needles in its blue", () => {
    const A = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layout_analog_sport'));
    const I = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layout_id6m'));
    assert.strictEqual(A.palette('efficient').needle, A.palette('efficient').accent);
    assert.strictEqual(I.palette('efficient').needle, I.palette('efficient').accent);
});
console.log(ok + ' passed');
process.exit(0);
