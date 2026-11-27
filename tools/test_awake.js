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
            // the speed limit sign as the car's own cluster: the last limit recognised, kept till another, cruise control
            // or not - AK Cluster Info's log of Nov 27 2026 (cruise control off): an 80 announced from 600 m, counted
            // once reached; then a 100 from 1.3 km
            const row = (value, symbol, dist, takeover) => ({ xSpeedLimitAssist: { vSLISymbol: symbol, vSLIDistance: dist, ldmAdditionalSign: takeover || 'NO_TAKEOVER_OFFER',
                vSLISpeedValue: value, statusVZA: 'STATUS_INACTIVE' }, activeCruiseControl: { symbolACC: 'LDM_CAR_OFF' }, statusLimiter: 'STATUS_INACTIVE', cruiseCtrlSpeedHUD: 65535 });
            const SL = 'LDM_VZA_VSLI_SPEED_LIMIT', NO = 'LDM_VZA_VSLI_NO_SYMBOL';
            assert.strictEqual(D.data().speedLimit, undefined, 'no limit read yet');
            handlers.functionalLibraryData(row(16, SL, 'LDM_VSLI_DIST_600_M'));
            assert.strictEqual(D.data().speedLimit, undefined, '01:22: an 80 announced 600 m ahead: not yet (none before it: --)');
            assert.deepStrictEqual([D.data().sliRaw, D.data().sliSymbol, D.data().sliDist], [16, SL, 'LDM_VSLI_DIST_600_M']);
            handlers.functionalLibraryData(row(16, SL, 'LDM_VSLI_DIST_250_M'));
            assert.strictEqual(D.data().speedLimit, undefined, '250 m: still ahead');
            handlers.functionalLibraryData(row(16, SL, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 80, '01:33: reached: 80');
            handlers.functionalLibraryData(row(16, NO, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 80, 'the symbol gone: 80 kept');
            handlers.functionalLibraryData(row(20, SL, 'LDM_VSLI_DIST_1_P_3_KM'));
            assert.strictEqual(D.data().speedLimit, 80, '03:55: a 100 announced 1.3 km ahead: 80 still');
            handlers.functionalLibraryData(row(20, NO, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 100, '04:26: reached: 100');
            handlers.functionalLibraryData(row(20, NO, 'LDM_VSLI_DIST_OFF', 'TAKEOVER_SET'));
            assert.strictEqual(D.data().speedLimit, 100, 'the takeover offered or not: the same');
            handlers.functionalLibraryData(row(0, NO, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 100, '0: the one shown kept');
            handlers.functionalLibraryData(row(30, NO, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 100, '30 (150, Nov 24): no road\'s, kept 100');
            handlers.functionalLibraryData(row(12, NO, 'LDM_VSLI_DIST_OFF'));
            assert.strictEqual(D.data().speedLimit, 60, 'a new one with no announcement (the camera\'s): 60');
            const was = Date.now, later = Date.now() + 10001;
            Date.now = () => later;
            try { assert.strictEqual(D.data().speedLimit, undefined, 'no head-up display data for 10 s: --'); } finally { Date.now = was; }
            const lines = D.sliLog(20).split('\n');
            assert.ok(/^head-up display data: \d+ in the last 60 s, the last [\d.]+ s ago; shown: 60$/.test(lines[0]), lines[0]);
            assert.ok(lines.length >= 6 && / shown 60  \{"value":12/.test(lines[lines.length - 1]), lines[lines.length - 1]);
        } finally { D.stop(); }
    });

    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
