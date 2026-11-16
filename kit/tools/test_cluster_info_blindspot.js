'use strict';
/**
 * test_cluster_info_blindspot.js - Cluster Info's lane change warning (blindspot.js, 1.6.25): the door mirror lamps
 * read from the BDC (0x40) as 22 D3 47 and nothing else - never a write (2E D3 47 switches the lamps themselves) -
 * decoded (1 lit, 2..4 flashing, the rest off), shown steady either way (a car there), gone 3 s
 * after the last good reply, not read while not wanted, a refusal logged once; and the HUD signs it drives.
 *   node kit/tools/test_cluster_info_blindspot.js
 */
const assert = require('assert');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..', '..');
const KIT = path.join(ROOT, 'kit', 'runtime');
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req.indexOf('./kit/') === 0) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.call(this, req, parent, isMain);
};
const BS = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'blindspot.js'));
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('ok   ' + name); };

/* a stand-in for the head unit's diagnostic service: every request kept; the BDC answers with `answer` */
function fakeSignals(answer) {
    const sent = [];
    let onResp = null;
    const signals = {
        proxy: async () => ({}),
        on: async (p, name, fn) => { onResp = fn; },
        onAvailable: async (p, fn) => fn(true),
        call: async (p, method, req) => {
            sent.push({ method, target: req.targetAddress, sid: req.serviceID, data: Array.from(req.udsData) });
            const uds = answer(req);
            if (uds) setImmediate(() => onResp({ udsResponse: Buffer.from([0, 0, 0, 0, 0, 0, req.targetAddress, 0, 0].concat(uds)), errorCode: 'NO_ERROR' }));
            return 'NO_ERROR';
        },
    };
    return { signals, sent };
}
const quiet = { info() {}, warn() {}, error() {} };

(async () => {
    let lamps = [0, 0], t = 1000000, wanted = true;
    const fake = fakeSignals(() => [0x62, 0xD3, 0x47].concat(lamps));
    const warns = [];
    const bs = BS.startBlindSpot({ signals: fake.signals }, { info() {}, warn: (m) => warns.push(m), error() {} }, { now: () => t, want: () => wanted, manual: true });
    await new Promise((r) => setTimeout(r, 20));

    await check('only 22 D3 47 to the BDC (0x40): read only, never 2E', async () => {
        for (let i = 0; i < 5; i++) await bs.poll();
        assert(fake.sent.length >= 5);
        fake.sent.forEach((r) => assert.deepStrictEqual([r.method, r.target, r.sid, r.data], ['sendTasuRequest', 0x40, 0x22, [0xD3, 0x47]]));
        assert(!fake.sent.some((r) => r.sid === 0x2E));
    });
    await check('the bytes: 1 lit, 2..4 flashing, 0 / 0x0D / 0xFF nothing', async () => {
        assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 0x0D, 0xFF].map(BS.decode), [0, 1, 2, 2, 2, 0, 0, 0]);
        lamps = [1, 0]; await bs.poll();
        assert.deepStrictEqual(bs.state(t), { left: 1, right: 0 });
        lamps = [0, 0x0D]; await bs.poll();
        assert.deepStrictEqual(bs.state(t), { left: 0, right: 0 });
    });
    await check('a car there, the turn signal or not: lit, steady (the lamp flashing too); none: off', async () => {
        lamps = [0, 3]; await bs.poll();
        [0, 199, 200, 400, 1000].forEach((dt) => assert.deepStrictEqual(bs.state(t + dt), { left: 0, right: 1 }, String(dt)));
        lamps = [2, 1]; await bs.poll();
        assert.deepStrictEqual(bs.state(t), { left: 1, right: 1 });
        lamps = [0, 0]; await bs.poll();
        assert.deepStrictEqual(bs.state(t), { left: 0, right: 0 });
    });
    await check('stale: nothing 3 s after the last good reply', async () => {
        lamps = [1, 1]; await bs.poll();
        assert.deepStrictEqual(bs.state(t + 2999), { left: 1, right: 1 });
        assert.deepStrictEqual(bs.state(t + 3000), { left: 0, right: 0 });
    });
    await check('not wanted (panel off, parked, the setting off): no request, nothing shown', async () => {
        wanted = false;
        const before = fake.sent.length;
        await bs.poll(); await bs.poll();
        assert.strictEqual(fake.sent.length, before);
        assert.deepStrictEqual(bs.state(t), { left: 0, right: 0 });
        wanted = true;
    });
    await check('a BDC without D347 (7F 22 31): logged once, nothing shown', async () => {
        const f2 = fakeSignals(() => [0x7F, 0x22, 0x31]);
        const w2 = [];
        const b2 = BS.startBlindSpot({ signals: f2.signals }, { info() {}, warn: (m) => w2.push(m), error() {} }, { now: () => t, manual: true });
        await new Promise((r) => setTimeout(r, 20));
        await b2.poll(); await b2.poll(); await b2.poll();
        assert.strictEqual(w2.filter((m) => /refused 22 D347/.test(m)).length, 1);
        assert.deepStrictEqual(b2.state(t), { left: 0, right: 0 });
        assert(b2.status().refused);
    });
    await check('the read-only link turns a write away before it leaves', async () => {
        const { ReadOnlyDiag } = require(path.join(KIT, 'readonly-diag.js'));
        const f3 = fakeSignals(() => null);
        const l = new ReadOnlyDiag(f3.signals, quiet); await l.init();
        let refused = null;
        try { await l.physical(0x40, 0x2E, [0xD3, 0x47, 1, 1]); } catch (e) { refused = e; }
        assert(refused && /read-only/.test(refused.message), String(refused));
        assert.strictEqual(f3.sent.length, 0);
    });
    console.log(n + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
