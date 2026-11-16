'use strict';
/**
 * test_hvsoc.js - the battery's charge without eDrive Live (Layouts 0.39.1, Centre 0.11.1): while no app shares a
 * charge, data.js asks the battery unit (SME, 0x07) for it itself, every 15 s; as soon as eDrive Live shares one,
 * it takes that and leaves the battery unit alone (two apps asking it in turn left both without answers); on a
 * petrol or diesel car it never asks. (Nov 17 2026: an owner's hybrid battery showed nothing on the cluster.)
 *   node tools/test_hvsoc.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hvsoc-'));
process.env.CLUSTER_INFO_DIR = DIR;
require('./scene');   // maps ./kit/ to the kit's runtime
const KIT = process.env.KIT_DIR || path.join(__dirname, '..', 'kit', 'runtime');

// a stubbed diagnostic link: the battery unit answers its charge (64.3 %) on DDBC, nothing else answers
let asked = [];
const stub = (file, exp) => { const f = require.resolve(path.join(KIT, file)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('diag.js', { Diag: class { constructor() { this.available = true; } init() {} } });
stub('dids.js', { DidReader: class { constructor() { this.pick = {}; } async value(k, cands) { asked.push({ k, cands }); return k === 'hvSoc' ? 64.3 : null; } } });

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hvAsks = () => asked.filter((a) => a.k === 'hvSoc');
const HV_DIDS = ['DDBC', 'E5CE'];

(async () => {
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
    const set = { demo: 'off' };   // (the car's own data, not the demo's)
    const handlers = {};
    const ctx = {
        log: { info() {}, warn() {}, debug() {} }, spec,
        settings: { get: (k) => set[k] },
        signals: { watch: (i, n, h) => { Object.assign(handlers, h); return Promise.resolve({}); }, proxy: () => Promise.reject(new Error('no link (test)')) },
    };
    const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
    const D = startData(ctx, { shown: () => true });
    try {
        handlers.VehicleCondition({ statusConditionVehicle: 'FAHREN' });
        await check('no app sharing: nothing asked of the battery unit for the first 10 s', async () => {
            await wait(6000);
            assert.strictEqual(hvAsks().length, 0);
            assert.strictEqual(D.data().soc, undefined);
        });
        await check('then the battery unit (0x07) asked for its charge, DDBC first: on the cluster', async () => {
            for (let i = 0; i < 40 && !hvAsks().length; i++) await wait(250);
            const a = hvAsks()[0];
            assert(a, 'asked');
            assert.deepStrictEqual(a.cands.map((c) => c.ecu + ':' + c.did), HV_DIDS.map((d) => '7:' + d));
            assert.strictEqual(D.data().soc, 64.3);
        });
        await check('every 15 s, not more', async () => {
            const n = hvAsks().length;
            await wait(3000);
            assert.strictEqual(hvAsks().length, n);
        });
        await check('eDrive Live shares a charge: its own, and the battery unit left alone', async () => {
            const n = hvAsks().length;
            const put = () => fs.writeFileSync(path.join(DIR, 'edrive.json'), JSON.stringify({ v: 1, t: Date.now(), app: 'eDrive', values: { soc: { pct: 51.2 } } }));
            for (let i = 0; i < 70; i++) { put(); await wait(250); }    // 17.5 s: past a 15 s round
            assert.strictEqual(D.data().soc, 51.2);
            assert.strictEqual(hvAsks().length, n, 'no battery unit read while shared');
            fs.unlinkSync(path.join(DIR, 'edrive.json'));
        });
        await check('a petrol or diesel car (Settings > Vehicle): never asked', async () => {
            set.vehicle = 'petrol';
            const n = hvAsks().length;
            await wait(16000);
            assert.strictEqual(hvAsks().length, n);
            delete set.vehicle;
        });
    } finally { D.stop(); }

    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
