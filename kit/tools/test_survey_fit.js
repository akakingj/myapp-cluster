'use strict';
/*
 * test_survey_fit.js - a signal survey's declarations fitted to the car's own catalog (kit/runtime/survey_fit.js),
 * as Cluster Info 1.11.0 asks for them (app.json "survey"): only what the catalog has, with the accesses it has
 * (r: a getter, s: a notifier; the settings r alone), events with a valid eventId, on an instance the catalog names;
 * never a method or a setter; nothing the app declares itself touched; at most 60; the same when done twice; nothing
 * without a catalog. Built by kit/tools/build.py on the car (MGU_SOMEIP_CATALOG here): the manifest and
 * kit/survey-signals.json; Layouts and Centre, which have no survey, built the same with a catalog or without.
 *   node kit/tools/test_survey_fit.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const F = require(path.join(ROOT, 'kit', 'runtime', 'survey_fit'));
const INFO = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'app.json'), 'utf8'));
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok   ' + name); };

const g = (id) => ({ getter: { id } }), nt = (id) => ({ notifier: { id } });
/* a catalog with the names Cluster Info 1.10.25's log showed on the test car, and a few made up */
function catalog(extra) {
    const c = {
        interfaces: {
            'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl': { fields: {
                displaySpeedLimitAndNoPassingRestriction: Object.assign(g(1), nt(32769)), displayForesight: nt(32770),
                displayColorLabel: g(2), displayDriverAssistanceLongitudinal: {} }, methods: { setSomething: {} } },
            'de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy': { events: [{ name: 'RecognitionTrafficSignCamera', eventId: 32771 }, { name: 'recognitionTrafficSignCamera2', eventId: 5 }] },
            'de.bmw.environmentalmodel.SignRecognitionFrontCamera': { events: { TrafficSignRecognitionFrontCamera: { eventId: 32772 } } },
            'de.bmw.infotainment.fasus.FASuS': { fields: { statusNextSpeedLimitRecognition: Object.assign(g(3), nt(32773)), statusOther: g(4), statusSignAhead: nt(32774) } },
            'de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions': { fields: {
                settingSpeedLimitOffset: Object.assign(g(5), nt(32775), { setter: { id: 6 } }), displayStatusSpeedLimitAssistMode: nt(32776), settingOther: g(7) } },
            'de.bmw.foo.VzaInfo': { fields: { a: g(8), b: nt(32777) }, events: { c: { eventId: 32778 } } },
            'de.bmw.bar.Misc': { fields: { speedLimitWarning: g(9), unrelated: g(10) } },
            'de.bmw.infotainment.displaydataserver.DisplayDataServer': { fields: { functionalLibraryData: Object.assign(g(11), nt(32779)), xSpeedLimitAssistMirror: g(12) } },
            'de.bmw.dass.GapVehicleAhead': { fields: { GapVehicleDrivingAhead: nt(32780), DataFrontVehicle: nt(32781), DataFrontVehicleExtended: nt(32782), Other: nt(32783) } },
            'de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2': { events: { ObjectRecognition: { eventId: 32784 }, ObjectPosition: { eventId: 32785 }, Else: { eventId: 32786 } } },
            'de.bmw.environmentalmodel.LaneBoundariesFrontCamera': { events: { LaneBoundaries: { eventId: 32787 } } },
        },
        instanceIDs: {
            'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl': { 1: 1, 2: 2 },
            'de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy': { Main_Instance: 1 },
            'de.bmw.infotainment.fasus.FASuS': { Other: 3 },
            'de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions': { 1: 1 },
            'de.bmw.foo.VzaInfo': { 1: 1 }, 'de.bmw.bar.Misc': { 1: 1 }, 'de.bmw.infotainment.displaydataserver.DisplayDataServer': { 1: 1 },
            'de.bmw.dass.GapVehicleAhead': { 1: 1 }, 'de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2': { 1: 1 },
            'de.bmw.environmentalmodel.LaneBoundariesFrontCamera': { 1: 1 },
        },
    };
    if (extra) extra(c);
    return c;
}
/* the app's own, as build.py makes it: DisplayDataServer is Cluster Info's */
const manifest = () => ({ proxies: { 'de.bmw.infotainment.displaydataserver.DisplayDataServer': { instances: '1', attributes: { functionalLibraryData: 'rs' } },
    'de.bmw.infotainment.vehicle.CDS': { instances: '1', attributes: { statusEngineTemperature: 'rs' } } }, services: {} });

ok('fields as the catalog has them: getter r, notifier s, both rs, neither left out; on instance 1', () => {
    const m = manifest(), r = F.fit(m, INFO.survey, catalog());
    assert.deepStrictEqual(m.proxies['de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl'],
        { instances: '1', attributes: { displayColorLabel: 'r', displayForesight: 's', displaySpeedLimitAndNoPassingRestriction: 'rs' } });
    assert(r.dropped.some((d) => d.member === 'displayDriverAssistanceLongitudinal' && d.why === 'no getter or notifier'));
    assert.strictEqual(r.catalog, true);
});
ok('events only with a valid eventId; the instance Main_Instance where there is no 1, else the first; none: left out', () => {
    const m = manifest(), r = F.fit(m, INFO.survey, catalog());
    assert.deepStrictEqual(m.proxies['de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy'], { instances: 'Main_Instance', broadcasts: ['RecognitionTrafficSignCamera'] });
    assert(r.dropped.some((d) => d.member === 'recognitionTrafficSignCamera2' && d.why === 'no valid eventId'));
    assert(!m.proxies['de.bmw.environmentalmodel.SignRecognitionFrontCamera'], 'no instance: not declared');
    assert(r.dropped.some((d) => d.iface === 'de.bmw.environmentalmodel.SignRecognitionFrontCamera' && d.why === 'no instance in the catalog'));
    assert(r.dropped.some((d) => d.iface === 'de.bmw.dass.TrafficSignRecognition' && d.why === 'not in this car\'s catalog'));
    assert.deepStrictEqual(m.proxies['de.bmw.infotainment.fasus.FASuS'], { instances: 'Other', attributes: { statusNextSpeedLimitRecognition: 'rs', statusSignAhead: 's' } });
});
ok('the settings read only: r alone, a setter never, one with no getter left out; never a method', () => {
    const m = manifest(), r = F.fit(m, INFO.survey, catalog());
    assert.deepStrictEqual(m.proxies['de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions'], { instances: '1', attributes: { settingSpeedLimitOffset: 'r' } });
    assert(r.dropped.some((d) => d.member === 'displayStatusSpeedLimitAssistMode' && d.why === 'no getter'));
    r.added.forEach((i) => { assert(!m.proxies[i].methods, i + ': no method'); Object.values(m.proxies[i].attributes || {}).forEach((f) => assert(!/w/.test(f), i + ': no setter')); });
});
ok('found by name over the whole catalog: a service named so whole, another service\'s member named so; the app\'s own untouched', () => {
    const m = manifest(), before = JSON.stringify(manifest().proxies['de.bmw.infotainment.displaydataserver.DisplayDataServer']);
    const r = F.fit(m, INFO.survey, catalog());
    assert.deepStrictEqual(m.proxies['de.bmw.foo.VzaInfo'], { instances: '1', attributes: { a: 'r', b: 's' }, broadcasts: ['c'] });
    assert.deepStrictEqual(m.proxies['de.bmw.bar.Misc'], { instances: '1', attributes: { speedLimitWarning: 'r' } });
    assert.strictEqual(JSON.stringify(m.proxies['de.bmw.infotainment.displaydataserver.DisplayDataServer']), before, 'the app\'s own declaration as it was');
    assert.deepStrictEqual(m.proxies['de.bmw.infotainment.vehicle.CDS'], manifest().proxies['de.bmw.infotainment.vehicle.CDS']);
    assert(r.added.indexOf('de.bmw.infotainment.displaydataserver.DisplayDataServer') < 0);
    // the fast ones: the car ahead, the camera's objects (only the two asked), the lanes
    assert.deepStrictEqual(m.proxies['de.bmw.dass.GapVehicleAhead'].attributes, { DataFrontVehicle: 's', DataFrontVehicleExtended: 's', GapVehicleDrivingAhead: 's' });
    assert.deepStrictEqual(m.proxies['de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2'].broadcasts, ['ObjectPosition', 'ObjectRecognition']);
    assert.deepStrictEqual(m.proxies['de.bmw.environmentalmodel.LaneBoundariesFrontCamera'].broadcasts, ['LaneBoundaries']);
    const it = r.declared.find((d) => d.member === 'GapVehicleDrivingAhead');
    assert(it.fast && !it.sign && r.declared.find((d) => d.member === 'RecognitionTrafficSignCamera').sign);
});
ok('at most 60, the groups\' order deciding: the last (the fast ones) go first', () => {
    const many = (c) => { const f = {}; for (let i = 0; i < 80; i++) f['speedLimitX' + i] = g(100 + i); c.interfaces['de.bmw.x.Many'] = { fields: f }; c.instanceIDs['de.bmw.x.Many'] = { 1: 1 }; };
    const m = manifest(), r = F.fit(m, INFO.survey, catalog(many));
    assert.strictEqual(r.declared.length, 60);
    assert(r.dropped.filter((d) => d.why === 'over the 60 limit').length > 0);
    assert(!m.proxies['de.bmw.dass.GapVehicleAhead'], 'the fast ones over the limit');
    assert(m.proxies['de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl'], 'the first groups kept');
    assert(F.plan(INFO.survey, catalog(many), {}).items.every((x, i, a) => !i || a[i - 1].group !== 'lanes' || x.group === 'lanes' || x.group === 'trafficLight'));
});
ok('the camera\'s traffic lights (1.14.2, group trafficLight): declared where the catalog has the service, left out where not', () => {
    const TL = 'de.bmw.environmentalmodel.TrafficLightRecognitionFrontCameraLegacy';
    const withTl = (c) => { c.interfaces[TL] = { events: { RecognitionTrafficLightCamera: { eventId: 32769 } } }; c.instanceIDs[TL] = { 1: 1 }; };
    const m = manifest(), r = F.fit(m, INFO.survey, catalog(withTl));
    const it = r.declared.find((d) => d.iface === TL);
    assert(it && it.member === 'RecognitionTrafficLightCamera' && it.kind === 'event' && it.group === 'trafficLight', JSON.stringify(it));
    assert(m.proxies[TL]);
    const m2 = manifest(), r2 = F.fit(m2, INFO.survey, catalog());
    assert(!r2.declared.some((d) => d.iface === TL) && !m2.proxies[TL]);
    assert.strictEqual(INFO.survey.groups[INFO.survey.groups.findIndex((x) => x.id === 'lanes') + 1].id, 'trafficLight');
});
ok('done twice (the installer\'s check, then the install): the same; no catalog: nothing added, the last ones taken out', () => {
    const m = manifest(), r1 = F.fit(m, INFO.survey, catalog()), once = JSON.stringify(m);
    const r2 = F.fit(m, INFO.survey, catalog(), r1);
    assert.strictEqual(JSON.stringify(m), once);
    assert.deepStrictEqual(r2.declared, r1.declared);
    const r3 = F.fit(m, INFO.survey, null, r2);
    assert.deepStrictEqual(m.proxies, manifest().proxies, 'only the app\'s own left');
    assert.strictEqual(r3.catalog, false);
    assert.deepStrictEqual(r3.declared, []);
});
ok('the catalog\'s lines: one a service the groups touch, its instances, fields (g / n), events, method count', () => {
    const lines = F.catalogLines(catalog(), INFO.survey);
    assert(lines.indexOf('de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl|i:1,2|f:displayColorLabel:g,displayDriverAssistanceLongitudinal:,displayForesight:n,displaySpeedLimitAndNoPassingRestriction:gn|e:|m:1') >= 0, lines.join('\n'));
    assert(lines.some((l) => /^de\.bmw\.environmentalmodel\.SignRecognitionFrontCamera\|i:-\|f:\|e:TrafficSignRecognitionFrontCamera\|m:0$/.test(l)), 'with no instance too');
    assert(lines.some((l) => /^de\.bmw\.infotainment\.displaydataserver\.DisplayDataServer\|.*xSpeedLimitAssistMirror/.test(l)), 'the app\'s own services listed (not declared)');
});

ok('the files (build.py, gen.js): survey-request.json in, the manifest and survey-signals.json out; unreadable catalog: nothing', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-')), kit = path.join(d, 'javascript', 'kit');
    fs.mkdirSync(kit, { recursive: true });
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(manifest()));
    fs.writeFileSync(path.join(kit, F.REQUEST), JSON.stringify(INFO.survey));
    fs.writeFileSync(path.join(d, 'cat.json'), JSON.stringify(catalog()));
    execFileSync('node', [path.join(ROOT, 'kit', 'runtime', 'survey_fit.js'), path.join(d, 'cat.json'), path.join(d, 'manifest.json'), kit]);
    const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')), rep = JSON.parse(fs.readFileSync(path.join(kit, F.REPORT), 'utf8'));
    assert(m.proxies['de.bmw.foo.VzaInfo'] && rep.declared.length > 10 && rep.added.length);
    execFileSync('node', [path.join(ROOT, 'kit', 'runtime', 'survey_fit.js'), path.join(d, 'none.json'), path.join(d, 'manifest.json'), kit]);
    const m2 = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')), rep2 = JSON.parse(fs.readFileSync(path.join(kit, F.REPORT), 'utf8'));
    assert.deepStrictEqual(m2.proxies, manifest().proxies);
    assert(/catalog not readable/.test(rep2.error));
    assert(/survey_fit\.js'\)\)\.fitFiles\(dbPath, manifestPath, kitDir/.test(fs.readFileSync(path.join(ROOT, 'kit', 'tools', 'oapgen', 'gen.js'), 'utf8')), 'gen.js fits it before generating');
});

// build.py, as the Store runs it on the car (the catalog beside it); needs the SDK (never in the repository)
if (fs.existsSync(path.join(ROOT, 'oap-sdk', 'index.js'))) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'svb-')), cat = path.join(d, 'cat.json');
    fs.writeFileSync(cat, JSON.stringify(catalog()));
    const build = (id, env) => {
        execFileSync('python3', [path.join(ROOT, 'kit', 'tools', 'build.py'), '--language', 'ko', id], { cwd: ROOT, stdio: 'pipe', env: Object.assign({}, process.env, env) });
        const src = path.join(ROOT, 'dist', id, 'source');
        const rep = path.join(src, 'javascript', 'kit', F.REPORT);
        return { manifest: fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'), report: fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, 'utf8')) : null };
    };
    ok('build.py on the car: Cluster Info\'s manifest with what the catalog has; Layouts the sign event where it has it; Centre as without a catalog', () => {
        const none = path.join(d, 'none.json');
        const info = build('akakingj_cluster_info', { MGU_SOMEIP_CATALOG: cat }), bare = build('akakingj_cluster_info', { MGU_SOMEIP_CATALOG: none });
        assert(JSON.parse(info.manifest).proxies['de.bmw.foo.VzaInfo'] && info.report.declared.length > 10);
        assert(!JSON.parse(bare.manifest).proxies['de.bmw.foo.VzaInfo'] && bare.report.catalog === false);
        ['akakingj_cluster_centre'].forEach((id) => {
            const a = build(id, { MGU_SOMEIP_CATALOG: cat }), b = build(id, { MGU_SOMEIP_CATALOG: none });
            assert.strictEqual(a.manifest, b.manifest, id);
            assert(a.report === null && b.report === null, id + ': no survey');
        });
        /* Layouts (0.68.0): the speed limit sign's one event, only where the catalog has it */
        const la = build('akakingj_cluster_layouts', { MGU_SOMEIP_CATALOG: cat }), lb = build('akakingj_cluster_layouts', { MGU_SOMEIP_CATALOG: none });
        const has = !!(catalog().interfaces || {})['de.bmw.dass.TrafficSignRecognition'];
        assert.strictEqual(!!JSON.parse(la.manifest).proxies['de.bmw.dass.TrafficSignRecognition'], has, 'Layouts: the sign where the catalog has it');
        assert(!JSON.parse(lb.manifest).proxies['de.bmw.dass.TrafficSignRecognition'] && lb.report.catalog === false, 'Layouts: without a catalog, nothing');
        assert(la.report.declared.length <= 1);
        const c2 = catalog(), cat2 = path.join(d, 'cat2.json');
        c2.interfaces['de.bmw.dass.TrafficSignRecognition'] = { fields: {}, events: { TrafficSignRecognition: { eventId: 32769 } } };
        (c2.instanceIDs = c2.instanceIDs || {})['de.bmw.dass.TrafficSignRecognition'] = { 1: 1 };
        fs.writeFileSync(cat2, JSON.stringify(c2));
        const lc = JSON.parse(build('akakingj_cluster_layouts', { MGU_SOMEIP_CATALOG: cat2 }).manifest).proxies['de.bmw.dass.TrafficSignRecognition'];
        assert.deepStrictEqual(lc, { instances: '1', broadcasts: ['TrafficSignRecognition'] }, JSON.stringify(lc));
    });
} else console.log('--   build.py not run (no oap-sdk/ here)');

console.log(n + ' passed');
