'use strict';
/**
 * test_oilpress.js - the oil pressure and the 12 V battery's voltage from the engine unit (Layouts 0.57.0): the oil's
 * absolute pressure less the engine unit's ambient pressure, in bar; the voltage as read. A diesel's engine unit is
 * asked only the standard forms: no oil pressure, the voltage from F442.
 *   node tools/test_oilpress.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oilp-'));
require('./scene');   // maps ./kit/ to the kit's runtime
const KIT = process.env.KIT_DIR || path.join(__dirname, '..', 'kit', 'runtime');

// the engine unit (0x12): oil 4500 hPa absolute (4436), ambient 1000 hPa (4201: x 0.0390625), 14.2 V (5853), 13.9 V (F442)
let reqs = [];
const REC = { 0x4436: [0x11, 0x94], 0x4201: [0x64, 0x00], 0x5853: [0x37, 0x78], 0xF442: [0x36, 0x4C] };
stub('diag.js', { hex: (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0'), NRC: {}, Diag: class {
    constructor() { this.available = true; }
    init() {}
    async physical(target, sid, data) {
        const did = (data[0] << 8) | data[1];
        reqs.push(did);
        if (target !== 0x12 || sid !== 0x22 || data.length !== 2) return null;
        return REC[did] ? [0x62, data[0], data[1], ...REC[did]] : [0x7F, 0x22, 0x31];
    }
} });
function stub(file, exp) { const f = require.resolve(path.join(KIT, file)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; }

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(vehicle, body) {
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
    const handlers = {};
    const ctx = {
        log: { info() {}, warn() {}, debug() {} }, spec,
        settings: { get: (k) => ({ demo: 'off', vehicle })[k] },
        signals: { watch: (i, n, h) => { Object.assign(handlers, h); return Promise.resolve({}); }, proxy: () => Promise.reject(new Error('no link (test)')) },
    };
    delete require.cache[require.resolve(path.join(__dirname, '..', 'shared', 'data'))];
    const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
    reqs = [];
    const D = startData(ctx, { shown: () => true });
    handlers.VehicleCondition({ statusConditionVehicle: 'FAHREN' });
    const want = setInterval(() => D.want(['oilPress', 'volts']), 500);
    D.want(['oilPress', 'volts']);
    try { await body(D); } finally { clearInterval(want); D.stop(); }
}

(async () => {
    await run('petrol', async (D) => {
        await check('a petrol car: the oil pressure over the ambient (3.5 bar) and the voltage (14.2 V) within 4 s', async () => {
            for (let i = 0; i < 40 && !(D.data().oilPress && D.data().volts); i++) await wait(100);
            assert.strictEqual(Math.round(D.data().oilPress * 100) / 100, 3.5);
            assert.strictEqual(Math.round(D.data().volts * 10) / 10, 14.2);
            assert.strictEqual(D.status().dme.oilPress, '4436');
            assert.strictEqual(D.status().dme.volts, '5853');
        });
    });
    await run('diesel', async (D) => {
        await check('a diesel: no oil pressure asked (BMW\'s own identifiers), the voltage from F442 (13.9 V)', async () => {
            for (let i = 0; i < 40 && !D.data().volts; i++) await wait(100);
            await wait(500);
            assert.strictEqual(Math.round(D.data().volts * 10) / 10, 13.9);
            assert.strictEqual(D.data().oilPress, undefined);
            [0x4436, 0x586F, 0x4201, 0x5853].forEach((d) => assert(reqs.indexOf(d) < 0, d.toString(16) + ' asked'));
        });
    });
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
