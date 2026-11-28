'use strict';

// Cluster Info (apps/akakingj_cluster_info) on the kit with stubbed car signals, and a provider (as eDrive Live is on the
// car) next to it in a temporary folder: the panel's values come through the folder, the provider writes only
// while Cluster Info's panel wants them, and the page draws. No SDK or car needed:
//   node kit/tools/test_cluster_info.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..'), KIT = path.join(ROOT, 'kit', 'runtime');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-'));
process.env.CLUSTER_INFO_DIR = path.join(tmp, 'cluster-info');
process.env.WOC_STATUS = path.join(tmp, 'woc', 'status.json');
fs.mkdirSync(path.dirname(process.env.WOC_STATUS));
fs.writeFileSync(process.env.WOC_STATUS, JSON.stringify({ state: 'showing', target: 'map', hud_width_pct: 0 }));

let app = null, panelSrc = null;
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === './kit/mgu') return { run(a) { app = a; } };
    if (req === './overlay') {
        const real = load.call(this, path.join(ROOT, 'apps', 'akakingj_cluster_info', 'overlay.js'), parent, isMain);
        return Object.assign({}, real, { startOverlay: (c, src) => { panelSrc = src; return real.startOverlay(c, src); } });
    }
    if (req.startsWith('./kit/')) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.call(this, req, parent, isMain);
};
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'app.json'), 'utf8'));
const themes = require(path.join(KIT, 'themes'));
const { Recorder: Canvas } = require(path.join(KIT, 'record'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

(async () => {
    const S = {};
    SPEC.settings.forEach((s) => { S[s.key] = s.default; });
    // (the personal build's defaults are Korean and petrol; these checks are written for the original's)
    Object.assign(S, { tempUnit: 'f', torqueUnit: 'nm', pressUnit: 'auto', slot1: 'power', slot2: 'battery', slot3: 'oil' });
    const handlers = {}, warns = [], loops = {}, drawn = [], clicks = {}, placed = [];
    let lastCanvas = null;
    process.env.SOMEIP_CATALOG = path.join(tmp, 'no-catalog.json');
    const ctx = {
        app: {}, ui: { onClick: (k, fn) => { clicks[k] = fn; }, text() {}, image: async () => {} },
        settings: { get: (k) => S[k], set: (k, v) => { S[k] = v; }, onChange() {}, display: (k) => String(S[k]) },
        log: { info() {}, warn: (m) => warns.push(m), error: (m, e) => warns.push(m + ' ' + e) },
        spec: SPEC, dataDir: tmp,
        signals: { watch: (iface, inst, h) => { Object.assign(handlers, h); return Promise.resolve({ available: true }); },
            // (the diagnostic link for the lane change warning: none here)
            proxy: () => Promise.reject(new Error('no TASU here')), on: () => Promise.resolve(), onAvailable: () => Promise.resolve() },
        onTab() {}, hideButton() {}, onScroll() {},
        loop: (name, fps, fn) => { loops[name] = fn; },
        theme: () => themes.theme('m_tricolour'), canvas: (w, h) => { const c = new Canvas(w, h), tx = c.text.bind(c); c.text = (str, x, y, size, ...a) => { drawn.push(String(str)); placed.push({ str: String(str), y, size, h }); return tx(str, x, y, size, ...a); }; lastCanvas = c; return c; },
    };
    require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'main.js'));
    await app.start(ctx);
    await sleep(1300);
    const dir = process.env.CLUSTER_INFO_DIR;
    check('the shared folder is made, open to every app (sticky)', () => assert((fs.statSync(dir).mode & 0o1777) === 0o1777));
    check('the panel is up over the map: wanted.json says what it shows', () => {
        const w = JSON.parse(fs.readFileSync(path.join(dir, 'wanted.json'), 'utf8'));
        assert(w.power === true && w.values.indexOf('battery') >= 0 && w.values.indexOf('oil') >= 0, JSON.stringify(w));
    });

    // a provider beside it, as eDrive Live is on the car: it writes its file in the documented format
    // (providers.js) while wanted.json is fresh, replacing it whole, and removes it when the panel goes
    const prov = { file: path.join(dir, 'test_provider.json'), timer: null };
    const wanted = () => {
        try { return Date.now() - JSON.parse(fs.readFileSync(path.join(dir, 'wanted.json'), 'utf8')).t < 3000; } catch (e) { return false; }
    };
    prov.timer = setInterval(() => {
        if (wanted()) {
            fs.writeFileSync(prov.file + '.tmp', JSON.stringify({ v: 1, t: Date.now(), app: 'Test provider',
                power: { kw: -1.6, outMax: 120, inMax: 60, old: false },
                values: { battery: { c: 28.3 }, oil: { c: 81 }, soc: { pct: 64.4 } } }));
            fs.renameSync(prov.file + '.tmp', prov.file);
        } else {
            try { fs.unlinkSync(prov.file); } catch (e) { /* gone already */ }
        }
    }, 200);
    await sleep(700);
    check('Cluster Info reads a provider\'s power, temperature and battery charge', () => {
        const { startProviders } = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'providers.js'));
        const r = startProviders({ info() {}, warn() {} }, { dir, setInterval: () => 0 });
        const p = r.power(), b = r.value('battery'), soc = r.value('soc');
        assert(p && p.kw === -1.6 && p.app === 'Test provider' && b && b.c === 28.3 && soc && soc.pct === 64.4,
            JSON.stringify({ p, b, soc }));
        assert.deepStrictEqual(r.list(), { test_provider: 'Test provider' });
    });
    // the car's own oil temperature wins over a provider's
    handlers.statusEngineTemperature && handlers.statusEngineTemperature({ temperatureEngineDrive: 48 + 90, temperatureEngineOilDrive: 48 + 95 });
    await sleep(400);
    await loops.MAIN();
    check('the page draws without errors', () => assert(!warns.some((w) => /TypeError|ReferenceError|is not a function/.test(w)), warns.join(' | ')));
    // (1.13.0) two logs: Logs (how the app works) and Test log (the checks: started by its button, its codes when pressed again)
    check('no checks running by default: the page as before', () => assert(!drawn.some((d) => /^Test log: checking/.test(d))));
    if (handlers.functionalLibraryData) handlers.functionalLibraryData({ speed: { kmH: 64 }, pia: { piaSliNpi: 8, piaHUDSliNpi: 0 },
        xSpeedLimitAssist: { vSLISymbol: 'LDM_VZA_VSLI_NO_SYMBOL', statusVZA: 'STATUS_INACTIVE', ldmAdditionalSign: 'TAKEOVER_SET', vSLISpeedValue: 16 } });
    drawn.length = 0; await clicks.BTN_TEST();
    check('Test log: the checks start, or (none declared here) its codes at once with why', () => {
        const running = drawn.some((d) => /^Test log: checking the car's signals/.test(d)), codes = drawn.some((d) => /^Test log: photograph each code \(page 1 of/.test(d));
        assert(running || codes, drawn.join(' | '));
        if (codes) {
            const f = fs.readdirSync(path.join(tmp, 'exports')).filter((x) => /^cluster-logs-info-test-/.test(x));
            assert.strictEqual(f.length, 1);
            const txt = fs.readFileSync(path.join(tmp, 'exports', f[0]), 'utf8');
            assert(/--- sign definitions ---/.test(txt) && /--- driving assistant check ---/.test(txt) && /--- head-up display data, its fields ---/.test(txt), txt.slice(0, 400));
        }
        placed.forEach((p) => assert(p.y + p.size <= p.h, p.str.slice(0, 40) + ' at ' + p.y + ' + ' + p.size + ' of ' + p.h));
    });
    // (1.10.6) Logs: this app's own logs as codes on its page and a file in its data folder (not in Cluster Layouts')
    drawn.length = 0; await clicks.BTN_LOGS();
    check('Logs: the codes on the page, the full logs in a file - how the app works; the checks are the Test log\'s (1.13.0)', () => {
        assert(drawn.some((d) => /^Logs: photograph each code \(page 1 of/.test(d)), drawn.join(' | '));
        const f = fs.readdirSync(path.join(tmp, 'exports')).filter((x) => /^cluster-logs-info-\d/.test(x));
        assert.strictEqual(f.length, 1);
        const txt = fs.readFileSync(path.join(tmp, 'exports', f[0]), 'utf8');
        ['--- page ---', '--- directions log ---', '--- this app\'s log ---'].forEach((h) => assert(txt.indexOf(h) >= 0, h));
        ['--- driving assistant check ---', '--- sign definitions ---'].forEach((h) => assert(txt.indexOf(h) < 0, h));
    });
    for (let i = 0; i < 20 && drawn.some((d) => /^Logs: photograph/.test(d)); i++) { drawn.length = 0; await clicks.BTN_LOGS(); }
    check('Logs pressed past the last page: the page as before', () => assert(!drawn.some((d) => /^Logs: photograph/.test(d)) && drawn.length > 0));
    // (2026-11-15) the engine's values (here rpm) as bright as the oil's: they went through the temperatures' colours
    // and came out dim grey beside a white oil
    handlers.statusEngineSpeed2 && handlers.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2500 * 4 });
    S.slot1 = 'rpm'; S.slot3 = 'oil';
    check('the engine\'s values as bright as the oil\'s', () => {
        const t = themes.theme('m_tricolour'), ex = panelSrc.extras(t), rpm = ex.find((e) => e.label === 'RPM'), oil = ex.find((e) => e.label === 'OIL');
        assert(rpm && oil && rpm.text === '2500' && rpm.col === t.text && oil.col === t.text, JSON.stringify(ex));
    });
    S.slot1 = 'power';

    // the panel goes: the provider stops and removes its file
    fs.writeFileSync(process.env.WOC_STATUS, JSON.stringify({ state: 'idle', target: 'map', hud_width_pct: 0 }));
    await sleep(4500);
    check('panel down: wanted.json goes stale, so the provider stops and removes its file', () => assert(!wanted() && !fs.existsSync(prov.file)));
    clearInterval(prov.timer);
    // the turn signals and day / night as the car sends them (names, from photos of this app's page on a G05)
    const IND = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'indicators.js'));
    check('turn signals by name: right, left, hazards, off; day / night by name', () => {
        assert.strictEqual(IND.direction('DAUER_BLINKEN_RECHTS_EIN', 'DAUERBLINKEN_RECHTS'), 'right');
        assert.strictEqual(IND.direction('DAUER_BLINKEN_LINKS_EIN', 'DAUERBLINKEN_LINKS'), 'left');
        assert.strictEqual(IND.direction('BEIDSEITIGES_BLINKEN_EIN', 'WARNBLINKEN_MANUELL'), 'both');
        assert.strictEqual(IND.direction('TIPP_BLINKEN_LINKS_EIN', 'TIPPBLINKEN_LINKS'), 'left');
        assert.strictEqual(IND.direction('BLINKEN_AUS', 'BLINKEN_AUS'), 'off');
        assert.strictEqual(IND.direction(4, 8), 'right');
        assert.strictEqual(IND.night('TAG'), false); assert.strictEqual(IND.night('NACHT'), true); assert.strictEqual(IND.night('KEINE_AENDERUNG'), null);
    });
    console.log(ok + ' checks passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
