'use strict';
/**
 * test_hvsoc_info.js - Cluster Info's battery charge without eDrive Live (1.8.1, apps/akakingj_cluster_info/hvsoc.js):
 * the battery unit (SME, 0x07) asked for the SOC slot, every 15 s, only after no app has shared a charge for 10 s,
 * only while the slot is shown; the same identifiers as Layouts' and Centre's (shared/data.js).
 *   node tools/test_hvsoc_info.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./scene');   // maps ./kit/ to the kit's runtime

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };
const HV_DIDS = (() => { const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'data.js'), 'utf8'); return (src.match(/const HV = \{[\s\S]*?\] \};/)[0].match(/did: '([0-9A-F]+)'/g) || []).map((m) => m.slice(6, -1)); })();

(async () => {
    const infoDir = path.join(__dirname, '..', 'apps', 'akakingj_cluster_info');
    const { startHvSoc, SOC } = require(path.join(infoDir, 'hvsoc'));
    let t = 0, want = true, shared = false;
    const reqs = [];
    const link = { ready: true, wake() {}, async physical(ecu, sid, data) { reqs.push({ ecu, did: (data[0] << 8) | data[1] }); return ecu === 7 && data[0] === 0xDD && data[1] === 0xBC ? [0x62, 0xDD, 0xBC, 0x02, 0x84] : null; } };
    const hv = startHvSoc(link, { info() {}, warn() {} }, { manual: true, now: () => t, want: () => want, shared: () => shared });
    await check('Info: the candidates as Layouts\' (DDBC, E5CE, 0x07)', () => {
        assert.deepStrictEqual(SOC.map((c) => c.did), HV_DIDS);
    });
    await check('Info: no app sharing for 10 s, the SOC slot shown: the battery unit asked, 64.4 %', async () => {
        t = 5000; await hv.poll(); assert.strictEqual(reqs.length, 0, 'not in the first 10 s');
        t = 10500; await hv.poll(); assert.strictEqual(reqs.length, 1); assert.strictEqual(reqs[0].ecu, 7);
        assert.strictEqual(hv.value(), 64.4);
        t = 20000; await hv.poll(); assert.strictEqual(reqs.length, 1, 'every 15 s');
        t = 26000; await hv.poll(); assert.strictEqual(reqs.length, 2);
    });
    await check('Info: an app shares it, or the slot not shown: not asked', async () => {
        shared = true; t = 60000; await hv.poll(); assert.strictEqual(reqs.length, 2);
        shared = false; t = 65000; await hv.poll(); assert.strictEqual(reqs.length, 2, '10 s alone first');
        want = false; t = 90000; await hv.poll(); assert.strictEqual(reqs.length, 2);
        t = 200000; assert.strictEqual(hv.value(), null, 'gone after a minute');
    });
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
