'use strict';
/**
 * test_pedal.js - the pedal and the throttle from the engine unit (Layouts 0.39.1, Centre 0.11.1): read every other
 * turn while shown, both in one request (22 <pedal> <throttle>) once each has answered alone; an engine unit that
 * refuses that: each alone again. (Nov 17 2026: slow next to the revs and the boost, or no value at all.)
 *   node tools/test_pedal.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pedal-'));
require('./scene');   // maps ./kit/ to the kit's runtime
const KIT = process.env.KIT_DIR || path.join(__dirname, '..', 'kit', 'runtime');

// a stubbed diagnostic link at the request level: the engine unit (0x12) answers the pedal (5814, 40 %) and the
// throttle (4600, 20 %), alone or together (unless told to refuse two at once); nothing else answers
let refusePair = false, reqs = [];
const REC = { 0x5814: [0x0C, 0xCD], 0x4600: [0x0A, 0x00] };
stub('diag.js', { hex: (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0'), NRC: {}, Diag: class {
    constructor() { this.available = true; }
    init() {}
    async physical(target, sid, data) {
        reqs.push({ t: Date.now(), target, sid, data: data.slice() });
        if (target !== 0x12 || sid !== 0x22) return null;
        const dids = [];
        for (let i = 0; i + 1 < data.length; i += 2) dids.push((data[i] << 8) | data[i + 1]);
        if (dids.length > 1 && refusePair) return [0x7F, 0x22, 0x13];
        if (!dids.every((d) => REC[d])) return dids.length === 1 ? [0x7F, 0x22, 0x31] : null;
        const out = [0x62];
        dids.forEach((d) => out.push(d >> 8, d & 0xFF, ...REC[d]));
        return out;
    }
} });
function stub(file, exp) { const f = require.resolve(path.join(KIT, file)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; }

let ok = 0;
const check = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pairs = () => reqs.filter((r) => r.target === 0x12 && r.data.length === 4);
const singles = (did) => reqs.filter((r) => r.target === 0x12 && r.data.length === 2 && ((r.data[0] << 8) | r.data[1]) === did);

async function run(name, before) {
    const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'), 'utf8'));
    const handlers = {};
    const ctx = {
        log: { info() {}, warn() {}, debug() {} }, spec,
        settings: { get: (k) => ({ demo: 'off', vehicle: 'petrol' })[k] },
        signals: { watch: (i, n, h) => { Object.assign(handlers, h); return Promise.resolve({}); }, proxy: () => Promise.reject(new Error('no link (test)')) },
    };
    delete require.cache[require.resolve(path.join(__dirname, '..', 'shared', 'data'))];
    const { startData } = require(path.join(__dirname, '..', 'shared', 'data'));
    reqs = [];
    const D = startData(ctx, { shown: () => true });
    handlers.VehicleCondition({ statusConditionVehicle: 'FAHREN' });
    const want = setInterval(() => D.want(['pedal', 'throttle']), 500);
    D.want(['pedal', 'throttle']);
    try { await before(D); } finally { clearInterval(want); D.stop(); }
}

(async () => {
    await run('together', async (D) => {
        await check('the pedal and the throttle on the cluster within 3 s', async () => {
            for (let i = 0; i < 30 && !(D.data().pedal && D.data().throttle); i++) await wait(100);
            assert.strictEqual(Math.round(D.data().pedal), 40);
            assert.strictEqual(Math.round(D.data().throttle), 20);
        });
        await check('then both in one request, 2 to 4 a second (2 while the 10 s round of the rest runs between them)', async () => {
            // (over 6 s: a pair every 0.5 s counts 11 or 12 there by where the window falls; over 4 s 7 or 8 - 1.75 a second -
            // with the engine unit's other readings, Nov 25 2026)
            const n = pairs().length, t0 = Date.now();
            await wait(6000);
            const per = (pairs().length - n) / ((Date.now() - t0) / 1000);
            assert(per >= 1.8 && per <= 4.5, per.toFixed(1) + ' a second');
            assert.strictEqual(Math.round(D.data().pedal), 40);
            assert.strictEqual(Math.round(D.data().throttle), 20);
        });
        await check('the rest of the engine unit\'s readings (every 10 s) between them, the pedal still every other turn', async () => {
            const iat = reqs.filter((r) => r.target === 0x12 && r.data.length === 2 && r.data[0] === 0xF4 && r.data[1] === 0x0F);
            assert(iat.length >= 1, 'the 10 s round asked the intake air');
            // the pedal never more than a turn away: no gap between two pedal reads over 0.7 s (two turns of 0.25 s,
            // and room for a busy test machine: GitHub's runner once took 656 ms, Nov 19 2026)
            const ts = pairs().map((r) => r.t), gaps = ts.slice(1).map((t, i) => t - ts[i]);
            assert(Math.max.apply(null, gaps) < 700, 'longest gap ' + Math.max.apply(null, gaps) + ' ms');
        });
    });
    await run('refused', async (D) => {
        refusePair = true;
        await check('an engine unit that refuses two at once: twice, then each alone', async () => {
            await wait(6000);
            assert.strictEqual(pairs().length, 2);
            const p = singles(0x5814).length, t = singles(0x4600).length;
            await wait(2000);
            assert(singles(0x5814).length > p && singles(0x4600).length > t);
            assert.strictEqual(pairs().length, 2);
            assert.strictEqual(Math.round(D.data().pedal), 40);
        });
    });
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
