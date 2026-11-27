'use strict';
/**
 * test_fuel.js - the tank's fill in data.js: the engine unit's own % (OBD tank level, the one Live Data shows) and
 * nothing else, its last answer held; '--' till it first answers (Layouts 0.66.0: the car's litres over a tank size,
 * Settings > Fuel tank size and Fuel % from, gone - the size meant nothing to the owner).
 *   node tools/test_fuel.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fuel-'));
require('./scene');   // maps ./kit/ to the kit's runtime
const KIT = process.env.KIT_DIR || path.join(__dirname, '..', 'kit', 'runtime');

// a stubbed diagnostic link: the engine unit answers its tank level (91 %), nothing else
let tankPct = 91.4, asked = [];
const stub = (file, exp) => { const f = require.resolve(path.join(KIT, file)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('diag.js', { Diag: class { constructor() { this.available = true; } init() {} } });
stub('dids.js', { DidReader: class { constructor() { this.pick = {}; } async value(k) { asked.push(k); return k === 'tank' ? tankPct : null; } } });

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };

(async () => {
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
    await check('Layouts asks the engine unit for the tank level; no tank size or Fuel % from anywhere; Centre (no fuel %) doesn\'t ask', () => {
        const centre = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_centre', 'app.json'), 'utf8'));
        assert(!centre.config.dme.tank, 'Centre: no tank read');
        [spec, centre].forEach((j) => assert(!j.settings.some((x) => x.key === 'fuelFrom' || x.key === 'tankLitres'), j.id + ': no tank size, no Fuel % from'));
        ['akakingj_cluster_layouts'].forEach((a) => {
            const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', a, 'app.json'), 'utf8'));
            assert.deepStrictEqual(j.config.dme.tank.map((c) => c.did || 'OBD ' + c.obd), ['F42F', 'OBD 2F'], a);
            // a full tank (255) and an empty one (0) are inside the candidates' range, not thrown away
            ['tank', 'pedal', 'throttle'].forEach((k) => j.config.dme[k].filter((c) => c.obd || c.factor > 0.39).forEach((c) => [0, 255].forEach((raw) => { const v = raw * c.factor + (c.offset || 0); assert(v >= c.min && v <= c.max, a + ' ' + k + ' raw ' + raw + ' -> ' + v); })));
            j.config.dme.tank.forEach((c) => [0, 255].forEach((raw) => { const v = raw * c.factor + (c.offset || 0); assert(v >= c.min && v <= c.max, a + ' raw ' + raw + ' -> ' + v); }));
        });
    });

    const set = { demo: 'off' };   // (no car here: the demo would take over after a while)
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
        handlers.statusRangeTankStatus({ fluidLevelFuelTank: 51, fluidLevelFuelTankLeftHand: 25, fluidLevelFuelTankRightHand: 26, range: 610 });
        await check('the engine unit not asked yet: none (\'--\'), the car\'s litres not used', () => {
            assert.strictEqual(D.data().fuelPct, undefined);
        });
        await check('the engine unit answers (its slow round, 10 s): its own %', async () => {
            D.want(['fuel']);
            for (let i = 0; i < 40 && asked.indexOf('tank') < 0; i++) { D.want(['fuel']); await new Promise((r) => setTimeout(r, 250)); }
            assert(asked.indexOf('tank') >= 0, 'tank level asked');
            const d = D.data();
            assert.strictEqual(Math.round(d.fuelPct), 91);
        });
        await check('the engine unit silent: its last answer held', async () => {
            tankPct = null;
            asked = [];
            for (let i = 0; i < 60 && asked.indexOf('tank') < 0; i++) { D.want(['fuel']); await new Promise((r) => setTimeout(r, 250)); }
            assert(asked.indexOf('tank') >= 0, 'asked again');
            assert.strictEqual(Math.round(D.data().fuelPct), 91);
        });
        await check('a wild answer is held to 0..100', async () => {
            tankPct = 140;
            asked = [];
            for (let i = 0; i < 60 && asked.indexOf('tank') < 0; i++) { D.want(['fuel']); await new Promise((r) => setTimeout(r, 250)); }
            assert(D.data().fuelPct <= 100);
        });
    } finally { D.stop(); }
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
