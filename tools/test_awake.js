'use strict';
/**
 * test_awake.js - kit/awake.js (the car switched on, or parked) and data.js under it: nothing asked of eDrive Live
 * while the car is off, however long the layout is set to show (Nov 10 2026: a locked car kept from sleeping).
 *   node tools/test_awake.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'awake-'));
process.env.CLUSTER_INFO_DIR = DIR;
require('./scene');   // maps ./kit/ to the kit's runtime
const { createAwake, conditionOf } = require(path.join(__dirname, '..', 'kit', 'runtime', 'awake'));

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };

(async () => {
    await check('states: names, numbers, in a struct; invalid ones ignored', () => {
        assert.strictEqual(conditionOf({ statusConditionVehicle: 'FAHREN' }), 10);
        assert.strictEqual(conditionOf({ statusConditionVehicle: 2 }), 2);
        assert.strictEqual(conditionOf({ crc: 3, vehicleCondition: 'WOHNEN' }), 5);
        assert.strictEqual(conditionOf({ statusConditionVehicle: 15 }), undefined);
        assert.strictEqual(conditionOf('NONSENSE'), undefined);
    });

    await check('told: on with the ignition, ready or driving; parked and standby: parked; someone in, ignition off: off', () => {
        let t = 1e6;
        const a = createAwake({ now: () => t });
        assert.strictEqual(a.on(), false); assert.strictEqual(a.parked(), false); assert.strictEqual(a.off(), false);
        [7, 8, 10, 12].forEach((c) => { a.note({ statusConditionVehicle: c }); assert.strictEqual(a.on(), true, 'on ' + c); });
        a.note({ statusConditionVehicle: 'WOHNEN' });
        assert.deepStrictEqual([a.on(), a.parked(), a.off()], [false, false, true]);
        [1, 2, 3].forEach((c) => { a.note({ statusConditionVehicle: c }); assert.deepStrictEqual([a.on(), a.parked(), a.off()], [false, true, true], 'parked ' + c); });
    });

    await check('moving or running overrides a state that says off (a missed change); 30 s later the state counts again', () => {
        let t = 1e6;
        const a = createAwake({ now: () => t });
        a.note({ statusConditionVehicle: 2 });
        a.active(40, 0);
        assert.deepStrictEqual([a.on(), a.parked()], [true, false]);
        t += 31000;
        assert.deepStrictEqual([a.on(), a.parked()], [false, true]);
    });

    await check('not told: on for 3 min after moving or the engine running, then off', () => {
        let t = 1e6;
        const a = createAwake({ now: () => t });
        a.active(0, 0);
        assert.strictEqual(a.on(), false);
        a.active(0, 800);
        t += 170000; assert.strictEqual(a.on(), true);
        t += 20000; assert.strictEqual(a.on(), false);
        assert.strictEqual(a.parked(), false);
    });

    await check('data.js: shown, the car parked: eDrive Live not asked; switched on: asked; the car\'s power meter and cruise speed taken', async () => {
        const handlers = {};
        const log = { info() {}, warn() {}, debug() {} };
        const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
        const ctx = {
            log, spec,
            settings: { get: () => undefined },
            signals: {
                watch: (iface, inst, h) => { Object.assign(handlers, h); return Promise.resolve({}); },
                proxy: () => Promise.reject(new Error('no link (test)')),
            },
        };
        const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
        const own = () => fs.readdirSync(DIR).filter((n) => /^wanted/.test(n));
        const D = startData(ctx, { shown: () => true });
        try {
            assert(handlers.VehicleCondition, 'subscribed to the car state');
            handlers.VehicleCondition({ statusConditionVehicle: 'PARKEN_BN_IO' });
            await new Promise((r) => setTimeout(r, 1300));
            assert.deepStrictEqual(own(), [], 'parked: nothing asked');
            assert.strictEqual(D.awake().parked, true);
            handlers.VehicleCondition({ statusConditionVehicle: 'FAHREN' });
            await new Promise((r) => setTimeout(r, 1300));
            assert(own().length > 0, 'on: eDrive Live asked');
            handlers.VehicleCondition({ statusConditionVehicle: 'PARKEN_BN_IO' });
            await new Promise((r) => setTimeout(r, 1300));
            assert.deepStrictEqual(own(), [], 'parked again: let go');
            // the car's own power meter and the head-up display's cruise speed reach the kW fusion and the data
            handlers.statusPowerRelativHybrid({ displayActualValuePowerRelativeDrivingElectric: 20, displayActualValuePowerRelativeRecuperation: 0 });
            handlers.displaySportPowertrain({ displaySportPowerPowertrain: 31 });
            handlers.functionalLibraryData({ cruiseCtrlSpeedHUD: 70 });
            const m = D.status().kwFit.models;
            assert.deepStrictEqual([m.rel.last, m.sport.last], [{ drive: 20, recup: 0 }, 31]);
            assert.deepStrictEqual(D.data().cruise, { on: true, set: 70 });
            handlers.functionalLibraryData({ cruiseCtrlSpeedHUD: 0 });
            assert.deepStrictEqual(D.data().cruise, { on: false, set: undefined });
            // the speed limit sign: the limit Speed Limit Assist has taken (the limiter or the cruise control on and
            // TAKEOVER_SET), else none - AK Cluster Info's log of Nov 24 2026
            const row = (value, takeover, limiter, extra) => Object.assign({ xSpeedLimitAssist: { vSLISymbol: 'LDM_VZA_VSLI_NO_SYMBOL', ldmAdditionalSign: takeover, vSLISpeedValue: value },
                activeCruiseControl: { symbolACC: 'LDM_CAR_OFF' }, statusLimiter: limiter, cruiseCtrlSpeedHUD: 65535 }, extra || {});
            assert.strictEqual(D.data().speedLimit, undefined, 'no limit read yet');
            handlers.functionalLibraryData(row(10, 'TAKEOVER_SET', 'STATUS_ACTIVE'));
            assert.strictEqual(D.data().speedLimit, 50, '00:43: the limiter on, 10 taken: 50');
            assert.deepStrictEqual([D.data().sliRaw, D.data().sliTakeover, D.data().sliLimiter], [10, 'TAKEOVER_SET', 'STATUS_ACTIVE']);
            handlers.functionalLibraryData(row(12, 'NO_TAKEOVER_OFFER', 'STATUS_ACTIVE'));
            assert.strictEqual(D.data().speedLimit, undefined, '00:56: no takeover: --');
            handlers.functionalLibraryData(row(0, 'NO_TAKEOVER_OFFER', 'STATUS_ACTIVE', { cruiseCtrlSpeedHUD: 60 }));
            assert.strictEqual(D.data().speedLimit, undefined, '05:00: 0: --');
            handlers.functionalLibraryData(row(6, 'TAKEOVER_SET', 'STATUS_INACTIVE'));
            assert.strictEqual(D.data().speedLimit, undefined, 'the limiter off, a value left: -- (not 30 on a motorway)');
            handlers.functionalLibraryData(row(14, 'TAKEOVER_SET', 'STATUS_INACTIVE', { activeCruiseControl: { symbolACC: 'LDM_CAR_NORMAL' } }));
            assert.strictEqual(D.data().speedLimit, 70, 'the cruise control on: its limit');
            handlers.functionalLibraryData(row(16, 'TAKEOVER_OCCURED', 'STATUS_ACTIVE'));
            assert.strictEqual(D.data().speedLimit, 80, 'TAKEOVER_OCCURED (the moment taken, Info\'s log of Nov 27 04:16:44): no -- blink');
            handlers.functionalLibraryData(row(14, 'TAKEOVER_SET', 'STATUS_INACTIVE', { activeCruiseControl: { symbolACC: 'LDM_CAR_NORMAL' } }));
            const was = Date.now, later = Date.now() + 10001;
            Date.now = () => later;
            try { assert.strictEqual(D.data().speedLimit, undefined, 'no head-up display data for 10 s: --'); } finally { Date.now = was; }
            const lines = D.sliLog(20).split('\n');
            assert.ok(/^head-up display data: \d+ in the last 60 s, the last [\d.]+ s ago; shown: 70$/.test(lines[0]), lines[0]);
            assert.ok(lines.length >= 6 && / shown 70  \{"value":14/.test(lines[lines.length - 1]), lines[lines.length - 1]);
        } finally { D.stop(); }
    });

    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
