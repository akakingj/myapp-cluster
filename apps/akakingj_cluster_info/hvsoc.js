'use strict';
/**
 * hvsoc.js - (Info 1.8.1) the high-voltage battery's charge from the battery unit (SME, 0x07) itself, as eDrive Live
 * reads it, for the SOC slot when no app shares one (eDrive Live not running): plug-in hybrids 22 DDBC (0.1 %; fully
 * electric cars answer it with no data bytes, so min 0.5), fully electric cars 22 E5CE (0.01 %). Read only.
 *
 * Asked only while wanted (the SOC slot on the panel, the panel on, the car on), every EVERY_MS, and only after no app
 * has shared a charge for ALONE_MS: two apps asking the battery unit in turn left both without answers. Five misses
 * in a row (no battery unit: a petrol or diesel car): every 5 minutes. Through the app's one diagnostic link (shared
 * with the blind spot reads: one request at a time).
 *
 *   const hv = startHvSoc(link, log, { want: () => bool, shared: () => bool });
 *   hv.value()   -> the charge (%) read in the last minute, or null
 *   hv.status()  -> a line for the app's page
 */
const { DidReader } = require('./kit/dids');

const ECU = 0x07;
const SOC = [
    { did: 'DDBC', bytes: 2, at: 0, factor: 0.1, offset: 0, min: 0.5, max: 100, timeoutMs: 1500 },
    { did: 'E5CE', bytes: 2, at: 0, factor: 0.01, offset: 0, min: 0, max: 100, timeoutMs: 1500 }];
const EVERY_MS = 15000, ALONE_MS = 10000, RESTING_MS = 300000, KEEP_MS = 60000;

function startHvSoc(link, log, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const rd = new DidReader(link, { ecu: ECU });
    let at = -Infinity, miss = 0, sharedAt = now(), last = null, busy = false, said = '';
    async function poll() {
        const t = now();
        if (opts.shared && opts.shared()) { sharedAt = t; return; }
        if (busy || !(opts.want ? opts.want() : true) || !link.ready) return;
        if (t - sharedAt < ALONE_MS || t - at < (miss >= 5 ? RESTING_MS : EVERY_MS)) return;
        busy = true;
        at = t;
        try {
            link.wake(ECU);      // (the link skips a unit after misses in a row: this one is asked seldom)
            const v = await rd.value('soc', SOC);
            if (v !== null) { miss = 0; last = { pct: v, t: now() }; } else miss++;
            const line = v !== null ? 'answers (' + SOC[rd.pick.soc || 0].did + ')' : miss >= 5 ? 'no answer 5 times: every 5 minutes' : '';
            if (line && line !== said) { said = line; log.info('battery unit charge: ' + line); }
        } catch (e) { miss++; } finally { busy = false; }
    }
    const timer = opts.manual ? null : setInterval(() => { poll().catch(() => {}); }, 1000);
    if (timer && timer.unref) timer.unref();
    return {
        poll,
        value: () => (last && now() - last.t < KEEP_MS ? last.pct : null),
        status: () => (last ? 'read ' + Math.round((now() - last.t) / 1000) + ' s ago' : miss ? 'no answer (' + miss + ')' : 'not asked (an app shares it, or not wanted)'),
        stop: () => { if (timer) clearInterval(timer); },
    };
}

module.exports = { startHvSoc, SOC, ECU, EVERY_MS, ALONE_MS };
