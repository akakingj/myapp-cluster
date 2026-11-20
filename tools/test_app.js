'use strict';
/**
 * test_app.js - the whole app (apps/akakingj_cluster_layouts/main.js) on the kit with stubbed car signals and a
 * recording stand-in for the cluster render client: off by default, on with the page's button, the car's
 * readings reach the cluster as needle values and glyph codes, and the page draws. No SDK or car needed:
 *   node tools/test_app.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { FakeClient, APP, KIT } = require('./scene');

let app = null, client = null;
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === './kit/mgu') return { run(a) { app = a; } };
    if (req === './cluster_render_client') return { ClusterRender: function () { client = new FakeClient(); return client; } };
    return load.call(this, req, parent, isMain);
};
process.env.SOMEIP_CATALOG = '/nonexistent/someip-interfaces.json';
process.env.CLUSTER_INFO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-'));
process.env.CLUSTER_SETTLE_MS = '0';
    process.env.CLUSTER_PRESENCE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
const SPEC = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
const themes = require(path.join(KIT, 'themes'));
const { Recorder: Canvas } = require(path.join(KIT, 'record'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

(async () => {
    const S = {}, changes = [];
    SPEC.settings.forEach((s) => { S[s.key] = s.default; });
    // (the personal build's defaults are Korean and petrol; these checks are written for the original's)
    Object.assign(S, { vehicle: 'auto', tankLitres: 69, speedUnit: 'mph', tempUnit: 'f', torqueUnit: 'nm', pressUnit: 'auto', timeZone: 'eastern', redline: 7000, rpmMax: 8000 });
    const handlers = {}, clicks = {}, warns = [];
    let pages = 0, lastPage = null, sheets = null;
    const ctx = {
        app: {}, ui: { onClick(n, fn) { clicks[n] = fn; }, text() {}, image: async (n, cv) => { pages++; lastPage = cv; }, sheet: (sh) => { if (!sheets) return false; sheets.push(sh); return true; } },
        settings: { get: (k) => S[k], set: (k, v) => { S[k] = v; changes.forEach((f) => f(k, v)); }, onChange(f) { changes.push(f); }, display: (k) => String(S[k]) },
        log: { info() {}, warn: (m) => warns.push(m), error: (m, e) => warns.push(m + ' ' + e) },
        spec: SPEC, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')),
        signals: { watch: (iface, inst, h) => { Object.assign(handlers, h); return Promise.resolve({ available: true }); },
            proxy: () => Promise.reject(new Error('no TASU here')), on: () => Promise.resolve(), onAvailable: () => Promise.resolve() },
        loop() {}, theme: () => themes.theme('m_tricolour'), canvas: (w, h) => new Canvas(w, h),
    };
    require(path.join(APP, 'main.js'));
    await app.start(ctx);
    await sleep(300);
    const effects = () => Array.from(client.layers.values()).filter((l) => l.kind === 'effect');
    check('every signal the app reads is declared in app.json', () => {
        const declared = [].concat(...Object.keys(SPEC.signals).map((i) => Object.keys(SPEC.signals[i])));
        Object.keys(handlers).forEach((h) => assert(declared.indexOf(h) >= 0, h));
    });
    const eng = () => require(path.join(APP, 'engine')).startCluster.last;
    check('off by default: no layers at all (the stock cluster shows)', () => {
        assert(effects().length === 0, 'no layers while off: hidden ones count against the renderer\'s limits');
    });
    await clicks.BTN_SHOW();
    await sleep(120);
    check('shown after the button', () => assert(effects().every((l) => l.opts.visible === true)));
    /* the page (0.29.0): each layout's picture on a card; a tap shows it on the cluster at once; its readouts set for it alone */
    const rec = require(path.join(KIT, 'record'));
    const tgt = (key) => { const x = lastPage.targets.find((q) => q.key === key); assert(x, 'no ' + key + ' on the page: ' + lastPage.targets.map((q) => q.key).join(',')); return x; };
    check('the page: the chosen layout\'s picture and a row of cards, each a picture from previews.wad', () => {
        const ids = Array.from(lastPage.images);
        // (the row the Stock card is on, it being chosen while off: the twelve layouts before KO 1 and KO 2 filling the two
        // rows before; the pictures with the car's own bottom strip, the only form; the Stock card its own picture,
        // the car's cluster drawn, 0.39.6: IMG_CARD + 0x3f)
        // (0.44.0: KO 1 and KO 2 before it on that row; 0.49.0: Simple after Pulse, GT3 moved onto that row)
        assert(ids.indexOf(0x434c0100) >= 0 && ids.filter((i) => i >= 0x434c0200 && i < 0x434c0300).sort().join() === [0x434c0200 + 0x3f, 0x434c0200 + 0x40 + 12, 0x434c0200 + 0x40 + 13, 0x434c0200 + 0x40 + 14].join(), ids.map((i) => i.toString(16)).join(','));
        assert(rec.imageById.get(0x434c0200 + 0x3f).w === 216 && rec.imageById.get(0x434c0200 + 0x3f).data.length === 216 * 81 * 4);
        assert(rec.imageById.get(0x434c0100).w === 600 && rec.imageById.get(0x434c0100).data.length === 600 * 225 * 4);
    });
    await tgt('cards_prev').run();
    check('the row before: six layouts\' pictures, with the car\'s strip', () => {
        const ids = Array.from(lastPage.images).filter((i) => i >= 0x434c0200 && i < 0x434c0300);
        assert(ids.length === 6 && ids.indexOf(0x434c0200 + 0x40 + 6) >= 0 && ids.every((i) => i >= 0x434c0200 + 0x40), ids.map((i) => i.toString(16)).join(','));
    });
    // (a petrol car: Arc tach's main readout shows)
    S.vehicle = 'ice'; changes.forEach((f) => f('vehicle', 'ice'));
    await tgt('card_arc_tach').run();
    await sleep(150);
    check('a card tapped: that layout on the cluster at once', () => assert.strictEqual(S.layout, 'arc_tach'));
    check('its readouts on the page, each following the Settings\' value', () => ['slot_infoMain', 'slot_gaugeSpeed', 'slot_gaugeRpm'].forEach(tgt));
    // (no sheet: a tap goes to the next value)
    await tgt('slot_infoMain').run();
    check('a readout tapped (no sheet here): the next value, for this layout only', () => assert.deepStrictEqual(S.slotsBy, { arc_tach: { infoMain: 'auto' } }));
    sheets = [];
    await tgt('slot_infoMain').run();
    check('with sheets: the values listed, the one set marked', () => assert(sheets.length === 1 && sheets[0].focus === 1, 'focus ' + (sheets[0] && sheets[0].focus)));
    sheets[0].focus = 7; sheets[0].press();     // (Boost: 'Same as in Settings' first, then the setting's own: Auto, Nothing, ...)
    await sleep(150);
    check('picked: this layout\'s, the cluster rebuilt with it', () => {
        assert.deepStrictEqual(S.slotsBy, { arc_tach: { infoMain: 'boost' } });
        assert(eng() && JSON.stringify(require(path.join(APP, 'layouts')).slotValue((k) => S[k], (k) => SPEC.settings.find((x) => x.key === k), 'arc_tach', 'infoMain')) === '"boost"');
    });
    sheets.length = 0;
    await tgt('slot_infoMain').run();
    sheets[0].focus = 0; sheets[0].press();
    check('"Same as in Settings": the Settings\' value again (nothing kept for the layout)', () => assert.deepStrictEqual(S.slotsBy, {}));
    sheets = null;
    // (0.43.0) JDM 1's page: its cup of water large on the page (cup_view.js), Back to the layouts
    await tgt('cup_open').run();
    check('JDM 1: the water cup view on the page, drawn with the kit\'s shapes, Back to leave it', () => {
        tgt('cup_back');
        assert(!lastPage.targets.some((q) => /^card_/.test(q.key)), 'the cards are not on the cup view');
        const u = lastPage.words(); let tris = false;
        for (let i = 0; i < u.length; i++) if (u[i] === rec.OP.TRIS) { tris = true; break; }
        assert(tris, 'the water a filled shape');
    });
    await tgt('cup_back').run();
    check('Back: the layouts again', () => { tgt('card_arc_tach'); tgt('cup_open'); });
    await tgt('cup_open').run();
    await clicks.BTN_SIGNALS();
    check('Signals: the cup view left for the next page', () => assert(!lastPage.targets.some((q) => q.key === 'cup_back')));
    // (round the pages to the layouts again: 4 with no signal catalog here)
    for (let i = 0; i < 3; i++) await clicks.BTN_SIGNALS();
    check('round to the layouts: the cup view stays shut', () => tgt('cup_open'));
    await tgt('cards_next').run();
    await tgt('card_stock').run();
    check('Stock: the layout off, the stock cluster back', () => assert.strictEqual(S.show, 'off'));
    await clicks.BTN_SHOW();
    await sleep(120);
    S.layout = 'analog_sport'; changes.forEach((f) => f('layout', 'analog_sport'));
    S.vehicle = 'auto'; changes.forEach((f) => f('vehicle', 'auto'));
    await sleep(120);
    // the car: 50 mph, 2500 rpm, D3, oil 100 C
    handlers.statusCarSpeed2({ speedVehicleCentreOfGravity: Math.round(50 * 1.609344 / 0.015625) });
    handlers.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 2500 / 0.25 });
    handlers.statusGearboxDrive({ statusActualGearDrive: 'G3', statusActualStageDrive: 'D' });
    handlers.statusEngineTemperature({ temperatureEngineDrive: 90 + 48, temperatureEngineOilDrive: 100 + 48 });
    handlers.ExteriorTemperature({ temperatureExterior: (9 + 40) * 2 });
    await sleep(1500);
    check('the readings reach the cluster: needles and texts', () => {
        const dial = (max) => eng()._pieces().find((p) => p.kind === 'dial' && p.params.u_scale[0] === max);
        assert(Math.abs(dial(160).value - 50) < 0.5, 'speed ' + dial(160).value);
        assert(Math.abs(dial(8).value - 2.5) < 0.02, 'rpm ' + dial(8).value);
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        // (the gear: the car's own strip shows it, so the layout over it has none)
        ['50'].forEach((t) => assert(texts.indexOf(t) >= 0, t + ' in ' + JSON.stringify(texts)));
        assert(texts.indexOf('D3') < 0, 'no second gear over the strip');
    });
    // (0.45.0) the car's trip computer (KombiIF): KO 1's display shows its distance, driving time and average economy,
    // in the car's unit (l/100 km here) or Settings > Fuel economy unit's
    S.layout = 'ko1'; changes.forEach((f) => f('layout', 'ko1'));
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 85, speedAverage1BC1: 463, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM' });
    handlers.statusBordcomputerTravelData({ rideDurationHours: 2, rideDurationMinutes: 30, wayPassed: 126 });
    await sleep(700);
    check('the trip computer: KO 1 shows the distance, the driving time and the average economy', () => {
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        ['78 mi', '2:30', '8.5 L/100km'].forEach((t) => assert(texts.indexOf(t) >= 0, t + ' in ' + JSON.stringify(texts)));
    });
    // (0.48.4) "since delivery" chosen on the head unit: no distance comes (too long for its field), so the odometer
    handlers.statusRangeTankStatus({ fluidLevelFuelTank: 34, range: 416, mileageKilometre: 236345 });
    handlers.statusBordcomputerTravelData({ rideDurationHours: 65535, rideDurationMinutes: 255, wayPassed: 65535 });
    await sleep(40);
    check('the trip since delivery: the odometer, no driving time', () => {
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        assert(texts.indexOf('146858 mi') >= 0 && texts.indexOf('2:30') < 0, JSON.stringify(texts));
    });
    // (0.48.8) a long trip's distance past 65,535 km: the setting's wraps added (the plug-in hybrid's own reset: 119,110 km
    // on the car, 53,575 sent), never past the odometer; a short trip as sent
    const tripTexts = () => eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
    const mi = (km) => Math.round(km / 1.609344) + ' mi';
    ctx.settings.set('tripWraps', 1);
    handlers.statusBordcomputerTravelData({ rideDurationHours: 677, rideDurationMinutes: 5, wayPassed: 53575 });
    await sleep(40);
    check('a long trip past 65,535 km: one wrap from Settings added (53,575 sent, 119,111 km)', () => assert(tripTexts().indexOf(mi(119111)) >= 0, JSON.stringify(tripTexts())));
    ctx.settings.set('tripWraps', 3);
    handlers.statusBordcomputerTravelData({ rideDurationHours: 677, rideDurationMinutes: 6, wayPassed: 53575 });
    await sleep(40);
    check('never past the odometer: 3 wraps would be 250,183 km, so 2 (184,647 km)', () => assert(tripTexts().indexOf(mi(184647)) >= 0, JSON.stringify(tripTexts())));
    ctx.settings.set('tripWraps', 0);
    handlers.statusBordcomputerTravelData({ rideDurationHours: 677, rideDurationMinutes: 7, wayPassed: 65530 });
    handlers.statusBordcomputerTravelData({ rideDurationHours: 677, rideDurationMinutes: 8, wayPassed: 4 });
    await sleep(40);
    check('a wrap seen while the long trip counts (65,530 -> 4): the setting one up, the distance 65,540 km', () => {
        assert.strictEqual(S.tripWraps, 1);
        assert(tripTexts().indexOf(mi(65540)) >= 0, JSON.stringify(tripTexts()));
    });
    handlers.statusBordcomputerTravelData({ rideDurationHours: 0, rideDurationMinutes: 40, wayPassed: 48 });
    await sleep(40);
    check('a short trip (since the start) as sent, the setting left alone', () => assert(tripTexts().indexOf(mi(48)) >= 0 && S.tripWraps === 1, JSON.stringify(tripTexts())));
    ctx.settings.set('tripWraps', 0);
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 85, speedAverage1BC1: 463, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM' });
    handlers.statusBordcomputerTravelData({ rideDurationHours: 2, rideDurationMinutes: 30, wayPassed: 126 });
    ctx.settings.set('econUnit', 'kml');
    await sleep(180);
    check('Fuel economy unit km/L: 100 / 8.5', () => assert(eng()._pieces().some((p) => p.text === '11.8 km/L')));
    ctx.settings.set('econUnit', 'auto');
    // (a trip just reset: 0.0, as the car shows it, not the last trip's figure; the car's unit changed on the MGU with
    // no figure yet: the old figure gone, the new unit's when it comes)
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 0, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM' });
    await sleep(40);
    check('the average economy 0: 0.0 shown, not the last figure', () => {
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        assert(texts.indexOf('0.0 L/100km') >= 0 && texts.indexOf('8.5 L/100km') < 0, JSON.stringify(texts));
    });
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 85, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM' });
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 65535, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_KM_S_L' });
    await sleep(40);
    check('the car\'s economy unit changed with no figure: the old figure dropped', () => {
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        assert(texts.indexOf('8.5 L/100km') < 0 && texts.indexOf('11.8 km/L') < 0, JSON.stringify(texts));
    });
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 118, statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_KM_S_L' });
    await sleep(40);
    check('then the new unit\'s figure', () => assert(eng()._pieces().some((p) => p.text === '11.8 km/L')));
    handlers.statusBordcomputerAverage({ consumptionAverage1BC1: 65535 });
    S.layout = 'analog_sport'; changes.forEach((f) => f('layout', 'analog_sport'));
    await sleep(300);
    check('a colour change sends uniforms only', () => {
        client.reset();
        ctx.settings.set('look', 'sport');
        assert(client.log.length > 0 && client.log.every((m) => m.op === 'uniform'));
    });
    check('km/h: the layout is made again with the km/h scale', () => {
        ctx.settings.set('speedUnit', 'kmh');
        const dial = eng()._pieces().find((p) => p.kind === 'dial');
        assert.strictEqual(dial.params.u_scale[0], 260);
    });
    await sleep(200);
    ctx.settings.set('centre', 'map');
    await sleep(700);
    const mw = path.join(process.env.CLUSTER_INFO_DIR, 'map_window.txt');
    check('Waze centre: the map window for Waze on cluster, the map area on the panel', () => assert.strictEqual(fs.readFileSync(mw, 'utf8'), 'panel 416 120 1088 480\n'));
    ctx.settings.set('centre', 'info');
    await sleep(700);
    check('the readings centre: no map window', () => assert(!fs.existsSync(mw)));
    check('the page draws', () => assert(pages > 0));
    check('warnings only for what this machine lacks (no catalog, no diagnostic link)', () => assert(warns.some((w) => /catalog not readable/.test(w)) && warns.every((w) => /catalog not readable|TASU/.test(w)), JSON.stringify(warns)));
    // (a sample again: the checks above take longer than the readings' staleness, 3 s, with the trip data's added)
    handlers.statusCarSpeed2({ speedVehicleCentreOfGravity: Math.round(52 * 1.609344 / 0.015625) });
    await sleep(300);
    check('the stock strip\'s time and outside temperature left to the car: its slots show the battery and the gearbox oil', () => {
        const texts = eng()._pieces().filter((p) => p.text !== null).map((p) => p.text);
        assert(texts.some((x) => /^BATT /.test(x)) && texts.some((x) => /^GEARBOX /.test(x)) && !texts.some((x) => /^48°/.test(x)), JSON.stringify(texts));
    });
    // the samples stop with the engine running (the services still there): the last speed must not stay up
    await sleep(3000 + 1500 + 300);
    check('readings stopped while driving: the layout hides, the stock cluster back', () => assert.strictEqual(effects().length, 0, effects().length + ' layers'));
    handlers.statusCarSpeed2({ speedVehicleCentreOfGravity: Math.round(52 * 1.609344 / 0.015625) });
    await sleep(300);
    check('the readings come again: the layout back', () => assert(effects().length > 0 && effects().every((l) => l.opts.visible === true)));
    // the car locked and left: the layout comes off (nobody sees it, the cluster can sleep); someone back in: on again
    // (switched off first: the engine and the car stopped, then locked; the car counts as running 30 s after it last ran)
    handlers.statusEngineSpeed2({ actualValueRPMEngineCrankshaft: 0 });
    handlers.statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
    handlers.VehicleCondition({ statusConditionVehicle: 'PARKEN_BN_IO' });
    await sleep(31500);
    check('the car locked and left: the layout off', () => assert.strictEqual(effects().length, 0, effects().length + ' layers'));
    handlers.VehicleCondition({ statusConditionVehicle: 'WOHNEN' });
    handlers.statusCarSpeed2({ speedVehicleCentreOfGravity: 0 });
    await sleep(300);
    check('someone in the car again: the layout back', () => assert(effects().length > 0));
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
