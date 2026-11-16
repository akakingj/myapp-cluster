'use strict';
/**
 * blindspot.js - the lane change warning (a car in the blind spot) as the car's own door mirror lamps show it: read
 * from the body domain controller, BDC (0x40), identifier D347 (AUSSENSPIEGEL_HC2), the left and the right mirror's
 * lamp, every 300 ms while it is wanted.
 *
 * The driving assistant's lane change service never reaches the head unit's apps (a G20 and a G21: "not available",
 * Cluster Info 1.6.12-1.6.23); the mirror lamps' state is read over the head unit's diagnostic link instead, as
 * mlurker's HUD signals (mlurker/bmw-idrive7-apps tools/mlurker-hud-signals 0.5.0, src/blindspot.cpp, GPL-3.0-or-later)
 * found on a G05. Written anew here on the kit's read-only link; the same reading and timing.
 *
 *   reply  62 D3 47 <left> <right>     0 off, 1 lit (a car in the blind spot), 2..4 flashing (warning steps 1-3: the
 *                                      turn signal on towards it), 0x0D a display fault, 0xFF invalid: off
 *   refusal 7F 22 <NRC>                (7F 22 31: this BDC has no D347) logged once
 *
 * READ ONLY. The same identifier written (2E D3 47 ..) switches the mirror lamps themselves: the requests go through
 * kit/readonly-diag.js, which lets nothing but 22 (and OBD 01 / 09) leave the head unit, and the only request made
 * here is 22 D3 47 (tests: kit/tools/test_cluster_info_blindspot.js).
 *
 *   const bs = startBlindSpot(ctx, log, { want: () => shown });
 *   bs.state(now)   -> { left, right }: 0 nothing, 1 lit (steady), 2 flashing and lit now, 3 flashing and dark now
 *   bs.status()     -> for the app's page
 */
const { ReadOnlyDiag } = require('./kit/readonly-diag');

const BDC = 0x40;
const DID = 0xD347;
const POLL_MS = 300;        // (mlurker kPollMs)
const STALE_MS = 3000;      // no good reply this long: nothing shown (kStaleMs)
const FLASH_MS = 200;       // flashing: 200 ms lit, 200 ms dark, from the moment it began (kFlashMs)
const WAKE_MS = 10000;      // the link skips a unit after 5 misses in a row: asked again this often

/** A lamp's byte: 0 off, 1 steady, 2 flashing. */
const decode = (v) => (v === 1 ? 1 : v >= 2 && v <= 4 ? 2 : 0);
const NAMES = ['off', 'steady', 'flashing'];

function startBlindSpot(ctx, log, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const want = opts.want || (() => true);
    const link = opts.link || new ReadOnlyDiag(ctx.signals, log, { silentAfter: 5 });
    const lamps = { left: { s: 0, since: 0 }, right: { s: 0, since: 0 }, last: 0 };
    const st = { reads: 0, good: 0, refused: null, lastRaw: '', since: 0, busy: false, error: null };
    let woke = 0, said = '';
    if (!opts.link) link.init().catch((e) => { st.error = String(e); });

    async function poll() {
        if (st.busy || !want()) return;
        if (!link.ready) return;
        const t = now();
        if (t - woke > WAKE_MS) { woke = t; link.wake(BDC); }
        st.busy = true;
        try {
            const u = await link.read(BDC, DID, 1000);
            st.reads++;
            if (!u) return;                                         // no answer: goes stale after STALE_MS
            st.lastRaw = u.map((b) => b.toString(16).padStart(2, '0')).join(' ');
            if (u[0] === 0x7F) {
                if (!st.refused) { st.refused = st.lastRaw; log.warn('blind spot: the BDC refused 22 D347: ' + st.lastRaw); }
                return;
            }
            if (u[0] !== 0x62 || u[1] !== 0xD3 || u[2] !== 0x47 || u.length < 5) return;
            const tm = now();
            [['left', u[3]], ['right', u[4]]].forEach(([side, v]) => {
                const s = decode(v);
                if (s !== lamps[side].s) lamps[side].since = tm;
                lamps[side].s = s;
            });
            lamps.last = tm;
            st.good++;
            const line = 'left ' + NAMES[lamps.left.s] + ', right ' + NAMES[lamps.right.s];
            if (line !== said) { said = line; log.info('mirror lamps: ' + line); }   // (only when it changes)
        } catch (e) {
            st.error = String(e && e.message || e);
        } finally { st.busy = false; }
    }
    const timer = opts.manual ? null : setInterval(() => { poll().catch(() => {}); }, POLL_MS);
    if (timer && timer.unref) timer.unref();

    /** Each side now: 0 nothing, 1 lit, 2 flashing and lit, 3 flashing and dark. */
    function state(tm0) {
        const tm = tm0 === undefined ? now() : tm0;
        const one = (side) => {
            if (!want() || !lamps.last || tm - lamps.last >= STALE_MS) return 0;
            const l = lamps[side];
            if (l.s === 1) return 1;
            if (l.s !== 2) return 0;
            return Math.floor((tm - l.since) / FLASH_MS) % 2 === 0 ? 2 : 3;
        };
        return { left: one('left'), right: one('right') };
    }

    return {
        state,
        poll,
        stop() { if (timer) clearInterval(timer); },
        status: () => {
            const tm = now(), fresh = lamps.last && tm - lamps.last < STALE_MS;
            return {
                link: link.ready ? (link.available ? 'ready' : 'not available') : st.error || 'connecting',
                reading: !!want(), reads: st.reads, good: st.good, refused: st.refused,
                left: fresh ? NAMES[lamps.left.s] : null, right: fresh ? NAMES[lamps.right.s] : null,
                lastRaw: st.lastRaw, age: lamps.last ? tm - lamps.last : null,
            };
        },
    };
}

module.exports = { startBlindSpot, decode, BDC, DID, POLL_MS, STALE_MS, FLASH_MS };
