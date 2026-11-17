'use strict';
/**
 * test_boost_psi.js - the sport display's boost in the car's pressure unit (Layouts 0.39.3, Centre 0.11.3, Info
 * 1.8.2): 0.01 bar (or 1 kPa) a step, 0.1 psi a step on a car set to psi (idrive7-apps issue #186: 20 psi, raw 200,
 * read as 2.0 bar, 29 psi). Kept in bar.
 *   node tools/test_boost_psi.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bpsi-'));
require('./scene');
const KIT = process.env.KIT_DIR || path.join(__dirname, '..', 'kit', 'runtime');
const stub = (file, exp) => { const f = require.resolve(path.join(KIT, file)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('diag.js', { hex: (n) => n.toString(16), NRC: {}, Diag: class { constructor() { this.available = false; } init() {} async physical() { return null; } } });

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
const handlers = {};
const ctx = {
    log: { info() {}, warn() {}, debug() {} }, spec,
    settings: { get: (k) => ({ demo: 'off' })[k] },
    signals: { watch: (i, n, h) => { Object.assign(handlers, h); return Promise.resolve({}); }, proxy: () => Promise.reject(new Error('no link (test)')) },
};
const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
for (const shown of [{ shown: () => true }, { shown: () => true, tyres: true }]) {
    const D = startData(ctx, shown);
    const boost = (raw) => { handlers.statusSwitchDriveDynamicSport2({ displayBoostPressure: raw }); return D.data().boostActual; };
    const app = shown.tyres ? 'Layouts' : 'Centre';
    check(app + ': the car\'s unit not known yet: hundredths of a bar (raw 120 = 1.20 bar)', () => assert.strictEqual(+boost(120).toFixed(3), 1.2));
    check(app + ': a car set to psi: tenths of a psi (raw 200 = 20.0 psi = 1.379 bar)', () => {
        assert(typeof handlers.statusNewCurrentUnitsStatusExt === 'function', 'the units watched without the tyres too');
        handlers.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: 3 });
        assert.strictEqual(+(boost(200) * 14.5038).toFixed(1), 20);
    });
    check(app + ': a car set to kPa or bar: hundredths of a bar again', () => {
        handlers.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: 'KPA' });
        assert.strictEqual(+boost(150).toFixed(3), 1.5);
        handlers.statusNewCurrentUnitsStatusExt({ unitOfMeasurementAirPressure: 1 });
        assert.strictEqual(+boost(90).toFixed(3), 0.9);
    });
    D.stop();
}
// Info: its own reading (main.js), the same rule
const src = fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_info', 'main.js'), 'utf8');
check('Info: the boost read in the car\'s unit, the unit watched', () => {
    assert(/carPress === 'PSI' \? b \* 0\.1 \/ 14\.5038 : b \/ 100/.test(src));
    assert(/statusNewCurrentUnitsStatusExt/.test(src));
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_info', 'app.json'), 'utf8'));
    assert(info.signals['de.bmw.infotainment.vehicle.Vehicle'].statusNewCurrentUnitsStatusExt);
    const centre = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_centre', 'app.json'), 'utf8'));
    assert(centre.signals['de.bmw.infotainment.vehicle.Vehicle'].statusNewCurrentUnitsStatusExt);
});
console.log(ok + ' passed');
process.exit(0);
