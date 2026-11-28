'use strict';
/**
 * test_cluster_info_survey.js - Cluster Info 1.11.0's signal survey (survey.js): started only with the car standing;
 * every declared service subscribed (fields and events, on the instance the install found); a sign candidate's every
 * change written with the time, the speed and the HUD data's own figures; the settings read once; the fast ones let go
 * after 5 values, how often they came measured; [Stop survey] and the 30 min both making the record - each member's
 * state, the catalog's lines - saved to exports/ and fitted into about 25 QR codes; never a method call or a write.
 *   node kit/tools/test_cluster_info_survey.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'akakingj_cluster_info');
const F = require(path.join(ROOT, 'kit', 'runtime', 'survey_fit'));
const INFO = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
// (survey.js finds the kit as ./kit, as in the built app)
const Module = require('module'), load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === './kit/survey_fit') return F;
    return load.call(this, req, parent, isMain);
};
const S = require(path.join(APP, 'survey.js'));
Module._load = load;
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('ok   ' + name); };
const settle = () => new Promise((r) => setTimeout(r, 5));

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-')), kit = path.join(dir, 'kit');
    fs.mkdirSync(kit);
    const g = (id) => ({ getter: { id } }), nt = (id) => ({ notifier: { id } });
    const catalog = { interfaces: {
        'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl': { fields: { displaySpeedLimitAndNoPassingRestriction: Object.assign(g(1), nt(32769)) } },
        'de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy': { events: { RecognitionTrafficSignCamera: { eventId: 32771 } } },
        'de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions': { fields: { settingSpeedLimitOffset: g(5) } },
        'de.bmw.dass.GapVehicleAhead': { fields: { GapVehicleDrivingAhead: nt(32780) } },
        'de.bmw.dass.TrafficSignRecognition': { events: { TrafficSignRecognition: { eventId: 32790 } } },
    }, instanceIDs: {
        'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl': { 1: 1 }, 'de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy': { Main_Instance: 1 },
        'de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions': { 1: 1 }, 'de.bmw.dass.GapVehicleAhead': { 1: 1 },
        'de.bmw.dass.TrafficSignRecognition': { 1: 1 },
    } };
    const cat = path.join(dir, 'cat.json');
    fs.writeFileSync(cat, JSON.stringify(catalog));
    // the install: the request fitted to this catalog (kit/survey-signals.json, kit/survey-request.json)
    const report = F.fit({ proxies: {} }, INFO.survey, catalog);
    fs.writeFileSync(path.join(kit, F.REPORT), JSON.stringify(report));
    fs.writeFileSync(path.join(kit, F.REQUEST), JSON.stringify(INFO.survey));

    // a stubbed car: watch() and on() record what is subscribed; the handlers fed by the test
    let t = 1000000, hudV = { speed: { kmH: 0 }, xSpeedLimitAssist: { vSLISpeedValue: 12, ldmAdditionalSign: 'TAKEOVER_SET' }, activeCruiseControl: { symbolACC: 'LDM_CAR_OFF' } };
    const h = {}, watched = [], events = [], calls = [], shut = [];
    const signals = {
        watch: async (iface, inst, handlers) => {
            watched.push(iface + '@' + inst);
            Object.keys(handlers).forEach((k) => { h[iface + '.' + k] = handlers[k]; });
            if (/TrafficSignRecognition$/.test(iface)) return { error: 'Error: no SOME/IP config for ' + iface };
            return { available: !/TrafficSignDisplayControl/.test(iface) || true, proxy: { iface }, shutdown: () => { shut.push(iface); return Promise.resolve(); } };
        },
        on: async (p, name, fn) => { events.push(p.iface + '.' + name); h[p.iface + '.' + name] = fn; },
        call: async () => { calls.push('call'); }, set: async () => { calls.push('set'); },
    };
    const sv = S.startSurvey({ dataDir: dir }, null, { signals, kitDir: kit, dir, now: () => t, hud: () => hudV, catalog: cat });

    await check('what the install declared: 5 here; what this car hasn\'t counted as left out', async () => {
        const inf = sv.info();
        assert.strictEqual(inf.declared, 5);
        assert(inf.missing > 0 && inf.catalog === true && inf.error === null);
        assert.strictEqual(sv.running(), false);
    });
    await check('started driving too (1.11.1); then every service subscribed on its instance, events too', async () => {
        assert.strictEqual(watched.length, 0, 'nothing asked of the car before the start');
        hudV.speed.kmH = 40;
        assert.strictEqual(sv.start(), null, 'at 40 km/h: started');
        hudV.speed.kmH = 0;
        for (let i = 0; i < 20; i++) await settle();
        assert.deepStrictEqual(watched.sort(), ['de.bmw.dass.GapVehicleAhead@1', 'de.bmw.dass.TrafficSignRecognition@1', 'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl@1',
            'de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions@1', 'de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy@Main_Instance']);
        assert.deepStrictEqual(events, ['de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy.RecognitionTrafficSignCamera']);
        assert.strictEqual(sv.start(), 'already running');
    });
    await check('a sign candidate\'s each change with the time, the speed and Speed Limit Assist\'s figures; the same again not', async () => {
        hudV = { speed: { kmH: 52 }, xSpeedLimitAssist: { vSLISpeedValue: 12, ldmAdditionalSign: 'NO_TAKEOVER_OFFER' }, activeCruiseControl: { symbolACC: 'LDM_CAR_OFF' } };
        const cam = h['de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy.RecognitionTrafficSignCamera'];
        cam({ signs: [{ type: 'SPEED_LIMIT', value: 50, other: 'x' }] }); t += 1000;
        cam({ signs: [{ type: 'SPEED_LIMIT', value: 50, other: 'x' }] }); t += 1000;
        hudV.speed.kmH = 61;
        cam({ signs: [{ type: 'SPEED_LIMIT', value: 60, other: 'x' }] });
        h['de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl.displaySpeedLimitAndNoPassingRestriction']({ speedLimit: 60, noPassing: 0 });
        const st = sv.status();
        assert.strictEqual(st.changes, 3);
        assert(/SignRecognitionFrontCameraLegacy\.RecognitionTrafficSignCamera/.test(st.recent[1].what) && st.recent[1].kmh === 61);
        assert(/^signs\[0\]\.type="SPEED_LIMIT" signs\[0\]\.value=60/.test(st.recent[1].value) || /signs.length=1 signs\[0\]\.type/.test(st.recent[1].value), st.recent[1].value);
    });
    await check('the settings read once and let go; the fast one let go after 5 values, its rate measured', async () => {
        h['de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions.settingSpeedLimitOffset']({ offset: 5 });
        const gap = h['de.bmw.dass.GapVehicleAhead.GapVehicleDrivingAhead'];
        for (let i = 0; i < 9; i++) { gap({ gap: i }); t += 100; }
        t += 1000;
        await new Promise((r) => setTimeout(r, 1100));      // (its 1 s tick)
        assert(shut.indexOf('de.bmw.dass.settingsdriverassistancefunctions.SettingsDriverAssistanceFunctions') >= 0, 'the settings let go');
        assert(shut.indexOf('de.bmw.dass.GapVehicleAhead') >= 0, 'the fast one let go');
        assert(shut.indexOf('de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy') < 0, 'the sign candidates kept');
    });
    await check('[Stop survey]: everything let go, each member\'s state, the record saved and kept', async () => {
        t += 4 * 60 * 1000;
        const rec = sv.end('button');
        await settle();
        assert(!sv.running());
        const by = (m) => rec.items.find((i) => i.member === m);
        assert.strictEqual(by('GapVehicleDrivingAhead').n, 5, 'the first 5 only');
        assert.strictEqual(by('GapVehicleDrivingAhead').hz, 10, '5 in 0.4 s');
        assert.strictEqual(by('RecognitionTrafficSignCamera').state, 'values came');
        assert(/^refused/.test(by('TrafficSignRecognition').state));
        assert(rec.settings.some((l) => /settingSpeedLimitOffset = offset=5/.test(l)), rec.settings.join('\n'));
        assert(shut.indexOf('de.bmw.environmentalmodel.SignRecognitionFrontCameraLegacy') >= 0);
        assert(rec.saved && fs.existsSync(rec.saved) && /exports[\\/]survey-.*\.txt$/.test(rec.saved));
        const txt = fs.readFileSync(rec.saved, 'utf8');
        ['--- survey summary ---', '--- sign changes ---', '--- settings read ---'].forEach((s) => assert(txt.indexOf(s) >= 0, s));
        assert(txt.indexOf('--- catalog (sign/assist) ---') < 0, 'the catalog\'s lines no more (1.14.5)');
        assert(/RecognitionTrafficSignCamera  values came  flags=e  n=3  hz=\S+  first=/.test(txt), txt.slice(0, 1200));
        assert(/\d\d:\d\d:\d\d 61 km\/h vSLI=12x5=60 takeover=NO_TAKEOVER_OFFER acc=LDM_CAR_OFF \| de\.bmw\.environmentalmodel\.SignRecognitionFrontCameraLegacy\.RecognitionTrafficSignCamera = /.test(txt));
        assert(/not in this car/.test(txt));
        assert(fs.existsSync(path.join(dir, 'survey-last.json')));
        assert.strictEqual(sv.status().last.changes, 3);
    });
    await check('30 min after the start it ends by itself, with its record', async () => {
        const sv2 = S.startSurvey({ dataDir: dir }, null, { signals, kitDir: kit, dir, now: () => t, hud: () => ({ speed: { kmH: 0 } }), catalog: cat });
        assert.strictEqual(sv2.start(), null);
        t += S.MAX_MS;
        await new Promise((r) => setTimeout(r, 1100));
        assert(!sv2.running());
        assert.strictEqual(sv2.last().why, '30 min');
    });
    await check('the record fitted into the QR codes: at most 30, cut shorter by level', async () => {
        // a long drive's worth: 150 changes of long values
        const rec = sv.last();
        for (let i = 0; i < 150; i++) rec.changes.push({ at: t + i * 1000, kmh: 50 + (i % 40), vsli: 10, takeover: 'TAKEOVER_SET', acc: 'LDM_CAR_OFF', what: 'de.bmw.x.Y.z' + (i % 7), value: 'v=' + Math.random().toString(36).repeat(12) });
        const other = [['settings', 'x'.repeat(500)]];
        const s = sv.fitted(other, 30, 380), all = other.concat(s).map(([a, b]) => '--- ' + a + ' ---\n' + b).join('\n');
        const codes = Math.ceil(zlib.deflateSync(Buffer.from(all)).toString('base64').length / 380);
        assert(codes <= 30, codes + ' codes');
        assert.strictEqual(s.length, 3);
    });
    await check('read only: no method call, no write, in survey.js or by it', async () => {
        assert.deepStrictEqual(calls, []);
        const src = fs.readFileSync(path.join(APP, 'survey.js'), 'utf8');
        assert(!/\.(call|set|callMethod|setValue)\(/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'no method call or write in survey.js');
    });
    await check('the page: [Test log] starts it, ends it and shows its codes; its Korean (1.13.0)', async () => {
        assert(!INFO.settings.find((x) => x.key === 'adasCheck'), 'no Driving assistant check setting any more');
        assert(INFO.screens[0].buttons.some((b) => b[0] === 'BTN_TEST' && b[1] === 'Test log'), 'its button, Test log');
        const ko = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'runtime', 'locales', 'ko.json'), 'utf8'));
        assert.deepStrictEqual([ko['Test log'], ko['Test log: end and show'], ko.Logs], ['테스트 로그', '테스트 끝내고 보기', '로그']);
        const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
        assert(/testOn\(\) \? 'Test log: end and show' : 'Test log'/.test(main), 'the label while it runs');
        assert(main.indexOf('survey.fitted(sections, 15, logs.codeCount)') > 0, 'the record fitted to 15 codes');
    });
    console.log(n + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
