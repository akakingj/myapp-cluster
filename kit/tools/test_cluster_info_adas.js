'use strict';
/**
 * test_cluster_info_adas.js - Cluster Info's driving assistant check (adas_probe.js, 1.10.5): nothing subscribed
 * while it is off; then each source told apart (not in the catalog, nobody provides it, values coming), the
 * values counted and logged (the first three and one a minute), the HUD data's driving assistant members picked
 * out, the catalog's matching services listed with their fields and broadcasts; never a method call or a write.
 *   node kit/tools/test_cluster_info_adas.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const P = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'adas_probe.js'));
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('ok   ' + name); };
const tick = () => new Promise((r) => setTimeout(r, 10));

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adas-'));
    const cat = path.join(dir, 'someip-interfaces.json');
    fs.writeFileSync(cat, JSON.stringify({ interfaces: {
        'de.bmw.dass.pad.communication.ObjectListSuAAR': { serviceId: 1, broadcasts: { suAARObjectList: { id: 2 } }, fields: {} },
        'de.bmw.infotainment.displaydataserver.DisplayDataServer': { fields: { functionalLibraryData: { getter: { id: 1 }, notifier: { id: 2 } } } },
        'de.bmw.infotainment.vehicle.CDS': { fields: { statusEngineSpeed2: {}, statusHandBrake: {}, statusAutoHold: {} } },
    } }));
    const handlers = {}, watched = [], calls = [];
    let on = false, t = 1000000;
    const ctx = { dataDir: dir, signals: {
        watch: async (iface, inst, h) => {
            watched.push(iface);
            Object.keys(h).forEach((k) => { handlers[iface + '.' + k] = h[k]; });
            if (/ObjectList/.test(iface)) return { available: false };
            if (/LateralCollision/.test(iface)) return { error: 'Error: no SOME/IP config for ' + iface + ' (add it to app.json "signals")' };
            return { available: true };
        },
        call: async () => { calls.push('call'); }, set: async () => { calls.push('set'); },
    } };
    const pr = P.startAdasProbe(ctx, null, { want: () => on, now: () => t, catalog: cat, manual: true });

    await check('off: nothing subscribed, nothing written', async () => {
        await tick();
        assert.strictEqual(watched.length, 0);
        assert.strictEqual(pr.status().started, false);
        assert(!fs.existsSync(pr.file));
    });
    await check('on: the four assisted driving view services and the HUD data subscribed, read only', async () => {
        on = true; pr.start(); await tick();
        assert.deepStrictEqual(watched.sort(), P.SOURCES.map((s) => s.iface).concat([P.HUD.iface]).sort());
        assert.deepStrictEqual(calls, []);
    });
    await check('each source told apart: not in the catalog / nothing provides it / provided, no value yet / values coming', async () => {
        handlers['de.bmw.dass.AssistedDrivingViewFunctionInput.assistedDrivingViewFunctionInputIbVip']({ assistedDrivingViewStateXcc: 3 });
        const s = pr.status().sources, by = (re) => s.find((x) => re.test(x.iface));
        assert.strictEqual(by(/LateralCollision/).what, 'not in this car\'s catalog');
        assert.strictEqual(by(/ObjectList/).what, 'in the catalog, nothing provides it');
        assert.strictEqual(by(/LateralFunctionInput/).what, 'provided, no value yet');
        const a = by(/AssistedDrivingViewFunctionInput$/);
        assert.strictEqual(a.what, 'values coming');
        assert.strictEqual(a.count, 1);
        assert(/assistedDrivingViewStateXcc/.test(a.sample));
    });
    await check('values logged: the first three, then one a minute', async () => {
        const h = handlers['de.bmw.dass.AssistedDrivingViewFunctionInput.assistedDrivingViewFunctionInputIbVip'];
        for (let i = 0; i < 5; i++) h({ i });
        const count = () => fs.readFileSync(pr.file, 'utf8').split('\n').filter((l) => /cruise control \(IbVip\) value/.test(l)).length;
        assert.strictEqual(count(), 3);
        t += 61000; h({ i: 9 });
        assert.strictEqual(count(), 4);
    });
    await check('the HUD data: its driving assistant members picked out', async () => {
        handlers['de.bmw.infotainment.displaydataserver.DisplayDataServer.functionalLibraryData']({ cruiseCtrlSpeedHUD: 80, laneDepartureWarning: 0, gear: 4, nested: { accDistance: 2 } });
        const m = pr.status().hud;
        assert.deepStrictEqual(m.sort(), ['cruiseCtrlSpeedHUD=80', 'laneDepartureWarning=0', 'nested.accDistance=2']);
    });
    await check('the speed limit in the HUD data: each change logged at once, with the car\'s speed; none while the same', async () => {
        const h = handlers['de.bmw.infotainment.displaydataserver.DisplayDataServer.functionalLibraryData'];
        /* as a G20's HUD data came (a plug-in hybrid, 2026-11-18), as JSON text and as an object */
        const sample = (v, sym) => ({ speed: { kmH: 64, mlsH: 40 }, cruiseCtrlSpeedHUD: 82, statusLimiter: 'STATUS_ACTIVE', pia: { piaSliNpi: 8, piaHUDSliNpi: 0 },
            xSpeedLimitAssist: { vSLISymbol: sym, statusVZA: 'STATUS_INACTIVE', ldmAdditionalSign: 'TAKEOVER_SET', vSLISpeedValue: v } });
        const lines = () => fs.readFileSync(pr.file, 'utf8').split('\n').filter((l) => / speed limit: .*vSLI/.test(l));
        h(JSON.stringify(sample(16, 'LDM_VZA_VSLI_NO_SYMBOL')));
        h(sample(16, 'LDM_VZA_VSLI_NO_SYMBOL'));
        assert.strictEqual(lines().length, 1, 'the same twice: once');
        assert(/at 64 km\/h {2}xSpeedLimitAssist\.vSLISpeedValue=16 {2}pia\.piaSliNpi=8 {2}pia\.piaHUDSliNpi=0 {2}xSpeedLimitAssist\.vSLISymbol="LDM_VZA_VSLI_NO_SYMBOL"/.test(lines()[0]), lines()[0]);
        assert(!/cruiseCtrlSpeedHUD|statusLimiter/.test(lines()[0]), 'the speed limit members alone (not the limiter)');
        t += 1000; h(sample(12, 'LDM_VZA_VSLI_NO_SYMBOL'));
        assert.strictEqual(lines().length, 2);
        const st = pr.status().sli;
        assert(st.now.indexOf('xSpeedLimitAssist.vSLISpeedValue=12') >= 0, st.now.join(' '));
        assert.strictEqual(st.changes.length, 3, 'none in the HUD data before (logged too), then two');
        assert(/vSLISpeedValue=12/.test(st.changes[0].line) && st.changes[0].at === t);
        assert.deepStrictEqual(P.sliOf('not json'), []);
    });
    await check('the catalog: the matching services with their fields and broadcasts, the rest left out', async () => {
        const c = pr.status().catalog;
        assert.strictEqual(c.error, null);
        assert.strictEqual(c.total, 3);
        assert.deepStrictEqual(c.list.map((e) => e.iface), ['de.bmw.dass.pad.communication.ObjectListSuAAR', 'de.bmw.infotainment.displaydataserver.DisplayDataServer']);
        assert(/broadcasts suAARObjectList/.test(P.catalogLine(c.list[0])));
        const log = fs.readFileSync(pr.file, 'utf8');
        assert(/2 of 3 services/.test(log) && /ObjectListSuAAR {2}broadcasts suAARObjectList/.test(log));
        assert(P.scanCatalog(cat + '.none').error);
    });
    await check('the catalog: every service\'s members that look like the brakes\' or Auto Hold\'s, listed and logged', async () => {
        const c = pr.status().catalog;
        assert.deepStrictEqual(c.brakes.map(P.brakeLine), ['de.bmw.infotainment.vehicle.CDS  fields statusAutoHold',
            'de.bmw.infotainment.vehicle.CDS  fields statusHandBrake']);
        const log = fs.readFileSync(pr.file, 'utf8');
        assert(/2 members look like the brakes/.test(log) && /CDS {2}fields statusHandBrake/.test(log), log);
        assert(!/statusEngineSpeed2/.test(c.brakes.map(P.brakeLine).join()));
        assert.deepStrictEqual(P.scanCatalog(cat + '.none').brakes, []);
    });
    await check('app.json: the services optional (the app installs without them), the check off by default', async () => {
        const spec = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'app.json'));
        P.SOURCES.forEach((s) => {
            assert(spec.signals[s.iface] && spec.signals[s.iface]._optional, s.iface);
            assert.deepStrictEqual(spec.signals[s.iface]._broadcasts, [s.name]);
        });
        assert(spec.signals[P.HUD.iface]._optional);
        assert.strictEqual(spec.settings.find((x) => x.key === 'adasCheck').default, 'off');
    });
    console.log(n + ' passed');
})().catch((e) => { console.error(e); process.exit(1); });
