'use strict';
/**
 * test_readouts.js - the readouts a petrol or diesel car picks for its displays (Settings > Readout 1, Readout 2,
 * Main readout) and the engine's power and pedal readings behind them.
 *   node tools/test_readouts.js
 */
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
require('./scene');   // (./kit/ as kit/runtime, as on the car)
const C = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layout_common.js'));
const R = require(path.join(ROOT, 'apps', 'akakingj_cluster_centre', 'readings.js'));
const SPEC = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'app.json'));

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('ok   ' + name); };
const o = (x) => Object.assign({ vehicle: 'ice', speedUnit: 'kmh', tempUnit: 'c', torqueUnit: 'kgm', pressUnit: 'psi', powerUnit: 'hp' }, x || {});
// 2.0 l petrol at 5000 rpm: 300 Nm is 157 kW, 211 hp
const d = { iat: 31, gearbox: 78, oil: 98, coolant: 90, boostActual: 1.0, torque: 300, rpm: 5000, enginePower: 300 * 5000 / 9549.3, pedal: 85.4, throttle: 72.6, timing: 6, engineOn: true };
const narrow = { w: 120, h: 30 }, wide = { w: 500, h: 34 };

check('readout 1 and 2: the defaults are intake air and gearbox oil, short where narrow', () => {
    assert.strictEqual(C.stripInfoA(o(), narrow)(d), 'IAT 31°');
    assert.strictEqual(C.stripInfoB(o(), narrow)(d), 'TRANS 78°');
});
check('readouts: long names and units where the box has room', () => {
    assert.strictEqual(C.stripInfoA(o(), wide)(d), 'INTAKE AIR 31°');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'boost' }), wide)(d), 'BOOST 14.5 psi');
});
check('readouts: every choice, short', () => {
    const t = (k) => C.stripInfoA(o({ infoA: k }), narrow)(d);
    assert.strictEqual(t('boost'), 'BST 14.5');
    assert.strictEqual(t('power'), 'HP 211');
    assert.strictEqual(t('torque'), 'TQ 30.6');
    assert.strictEqual(t('throttle'), 'THR 73%');
    assert.strictEqual(t('pedal'), 'PDL 85%');
    assert.strictEqual(t('oil'), 'OIL 98°');
    assert.strictEqual(t('coolant'), 'CLT 90°');
    assert.strictEqual(t('timing'), 'TIM 6.0°');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'off' }), narrow), '');
});
check('the gear as a readout: D / S / M and its number, P R N; Nothing under the speed', () => {
    const g = (x) => Object.assign({}, d, x);
    // (0.47.1: the gear without its name - D4, S3, M2, P say what they are)
    assert.strictEqual(C.stripInfoA(o({ infoA: 'gear' }), narrow)(g({ stage: 'D', mode: 'D', gear: 4 })), 'D4');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'gear' }), narrow)(g({ stage: 'D', mode: 'S', gear: 3 })), 'S3');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'gear' }), narrow)(g({ stage: 'D', mode: 'M', gear: 2 })), 'M2');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'gear' }), narrow)(g({ stage: 'P', gear: 0 })), 'P');
    assert.strictEqual(C.placeReadout(o({}), 'gear').short, '');
    assert.strictEqual(C.focus.power(o({ infoMain: 'gear' }))(g({ stage: 'D', mode: 'M', gear: 5 })), 'M5');
    assert.strictEqual(C.focus.powerLabel(o({ infoMain: 'gear' }), true), '', 'no GEAR under the big gear either');
    assert.strictEqual(C.focus.power(o({ infoMain: 'off' })), '');
    assert.strictEqual(C.focus.powerLabel(o({ infoMain: 'off' }), true), '');
    assert.strictEqual(C.focus.mainFrac(o({ infoMain: 'off' }))(d), 0);
    assert.strictEqual(C.readout(o(), 'off', { w: 300, h: 40 }, true), '');
});
check('power unit: hp, PS or kW', () => {
    assert.strictEqual(C.stripInfoA(o({ infoA: 'power', powerUnit: 'ps' }), narrow)(d), 'PS 214');
    assert.strictEqual(C.stripInfoA(o({ infoA: 'power', powerUnit: 'kw' }), narrow)(d), 'KW 157');
});
check('main readout: the engine torque by default, else the one picked, with its unit and label', () => {
    assert.strictEqual(C.focus.power(o())(d), '30.6 kgm');
    assert.strictEqual(C.focus.powerLabel(o(), true), 'ENGINE TORQUE');
    assert.strictEqual(C.focus.power(o({ infoMain: 'power' }))(d), '211 hp');
    assert.strictEqual(C.focus.powerLabel(o({ infoMain: 'power' }), true), 'ENGINE POWER');
    assert.strictEqual(C.focus.powerLabel(o({ infoMain: 'power' }), false), 'POWER');
    assert.strictEqual(C.focus.power(o({ infoMain: 'boost' }))(d), '14.5 psi');
    assert.strictEqual(C.focus.power(o({ infoMain: 'pedal' }))(d), '85%');
    assert.strictEqual(C.focus.power(o({ infoMain: 'throttle' }))(d), '73%');
    assert.strictEqual(C.focus.power(o({ infoMain: 'iat' }))(d), '31°');
    assert.strictEqual(C.focus.power(o({ infoMain: 'boost' }))(Object.assign({}, d, { engineOn: false })), 'OFF');
    assert.strictEqual(C.focus.power(o({ infoMain: 'power' }))({}), '--');
    assert(Math.abs(C.focus.mainFrac(o({ infoMain: 'pedal' }))(d) - 0.854) < 1e-9);
});
check('a plug-in hybrid: Auto keeps its battery readings; one set by hand shows (0.36.1)', () => {
    const p = C.resolveReadouts(o({ vehicle: 'phev', infoA: 'auto', infoMain: 'auto' }));
    assert.strictEqual(C.stripInfoA(p, narrow)({ battTemp: 27 }), 'BATT 27°');
    assert.strictEqual(C.focus.power(p)({ kw: 12.34 }), '+12 kW');
    const q = C.resolveReadouts(o({ vehicle: 'phev', infoA: 'soc', infoMain: 'battTemp' }));
    assert.strictEqual(C.stripInfoA(q, narrow)({ soc: 64 }), 'SOC 64%');
    assert.strictEqual(C.focus.power(q)({ battTemp: 27 }), '27°');
    const i = C.resolveReadouts(o({ vehicle: 'ice', infoA: 'auto', infoMain: 'auto' }));
    assert.strictEqual(i.infoA, 'iat'); assert.strictEqual(i.infoMain, 'torque');
});
check('the engine unit reads what the readouts show', () => {
    const w = C.focus.needs(o({ infoA: 'timing', infoB: 'boost', infoMain: 'iat' }));
    ['timing', 'boostActual', 'iat'].forEach((k) => assert(w.indexOf(k) >= 0, k));
    assert(C.focus.needs(o()).indexOf('gearbox') >= 0);
});
check('the settings offer every readout, and the defaults are this build\'s', () => {
    const s = (k) => SPEC.settings.find((x) => x.key === k);
    ['infoA', 'infoB', 'infoMain'].forEach((k) => Object.keys(C.READOUTS).forEach((r) => assert(s(k).options.some((x) => x[0] === r), k + ' ' + r)));
    const want = { vehicle: 'petrol', speedUnit: 'kmh', tempUnit: 'c', torqueUnit: 'kgm', pressUnit: 'psi', powerUnit: 'hp', infoA: 'auto', infoB: 'auto', infoMain: 'auto', redline: 6000, rpmMax: 7000 };
    Object.keys(want).forEach((k) => assert.strictEqual(s(k).default, want[k], k));
    // (a number setting is a drop-down on the car: its steps, the default among them)
    SPEC.settings.filter((x) => x.type === 'number').forEach((x) => assert(Array.isArray(x.steps) && x.steps.indexOf(x.default) >= 0, x.key));
});
check('Cluster Centre: engine power and the pedal as readings', () => {
    const u = { temp: 'c', press: 'psi', speed: 'kmh', torque: 'kgm', power: 'hp' };
    const v = R.view('enginePower', d, u);
    assert.strictEqual(v.text + ' ' + v.unit, '211 hp');
    assert.strictEqual(R.view('enginePower', d, Object.assign({}, u, { power: 'ps' })).unit, 'PS');
    const p = R.view('pedal', d, u);
    assert.strictEqual(p.text + p.unit, '85%');
});
check('small gauges: the layout\'s own by default; any reading on its own scale, red zone and figures', () => {
    assert.strictEqual(C.gaugeOf(o({ gaugeSpeed: 'auto' }), 'speed'), null);
    assert.strictEqual(C.gaugeOf(o(), 'rpm'), null);
    const b = C.gaugeOf(o({ gaugeRpm: 'boost' }), 'rpm');
    assert.strictEqual(b.label, 'BOOST');
    assert.strictEqual(b.txt(d), '14.5 psi');
    assert(Math.abs(b.frac(d) - 1 / 1.6) < 1e-9 && b.redFrac > 1);
    const i = C.gaugeOf(o({ gaugeSpeed: 'iat' }), 'speed');
    assert.strictEqual(i.txt(d), '31°');
    assert(Math.abs(i.redFrac - 0.75) < 1e-9 && !i.hot(d) && i.hot({ iat: 65 }));
    assert.strictEqual(C.gaugeOf(o({ gaugeSpeed: 'power' }), 'speed').txt(d), '211 hp');
    assert.strictEqual(C.gaugeOf(o({ gaugeSpeed: 'throttle' }), 'speed').frac({}), 0);
    assert(C.focus.needs(o({ gaugeSpeed: 'timing', gaugeRpm: 'boost' })).indexOf('timing') >= 0);
    const s = SPEC.settings.find((x) => x.key === 'gaugeRpm');
    Object.keys(C.GAUGES).forEach((k) => assert(s.options.some((x) => x[0] === k), k));
    assert.strictEqual(s.default, 'auto');
});
check('shift point and red zone as the Redline app: the red line less 300, lower while the oil is cold', () => {
    const r = (x, oil) => C.shiftPoint(o(Object.assign({ redline: 6500, rpmMax: 7000 }, x)), { oil });
    assert.deepStrictEqual(r({}, 90), { rpm: 6200, red: 6500, cold: false });
    assert.deepStrictEqual(r({}, 30), { rpm: 4500, red: 4800, cold: true });
    assert.deepStrictEqual(r({}, 55), { rpm: 5350, red: 5650, cold: true });
    assert.deepStrictEqual(r({ coldGuard: 'off' }, 30), { rpm: 6200, red: 6500, cold: false });
    assert.deepStrictEqual(r({ shiftBefore: 500, coldLimit: 4000, warmOil: 70 }, 50), { rpm: 5000, red: 5500, cold: true });
    assert.strictEqual(r({}, undefined).cold, false);
    const B = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'bimmer.js'));
    assert(B.shiftNow(o({ redline: 6500 }), { rpm: 6200, oil: 90 }) && !B.shiftNow(o({ redline: 6500 }), { rpm: 6100, oil: 90 }));
    assert(B.shiftNow(o({ redline: 6500 }), { rpm: 4600, oil: 30 }));
    assert(Math.abs(B.redMarks(o({ redline: 6500 }), 8000, { oil: 30 })[0] - 4800 / 8000) < 1e-9);
    assert(Math.abs(B.redMarks(o({ redline: 6000 }), 8000, { oil: 90 })[1] - 5300 / 8000) < 1e-9);
    assert(Math.abs(B.redMarks(o({ redline: 6000, yellowFrom: 4500 }), 8000, { oil: 90 })[1] - 4500 / 8000) < 1e-9);
    assert(Math.abs(B.redMarks(o({ redline: 6000 }), 8000, { oil: 90 })[1] - 5300 / 8000) < 1e-9);   // (Auto: 700 under the red)
    assert.strictEqual(B.redMarks(o({ redline: 6000, yellowFrom: 6000 }), 8000, { oil: 90 })[1], 2);   // (at the red: none)
});
check('the pedal from the engine unit (as Live Data: 5814 / 480B, OBD 49), asked for while a readout shows it', () => {
    const { DME_KEYS } = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'data.js'));
    assert(DME_KEYS.indexOf('pedal') >= 0);
    ['akakingj_cluster_layouts', 'akakingj_cluster_centre'].forEach((a) => {
        const c = require(path.join(ROOT, 'apps', a, 'app.json')).config.dme.pedal;
        assert.deepStrictEqual(c.map((x) => x.did || 'OBD ' + x.obd), ['5814', '480B', 'OBD 49'], a);
        // raw 0x2000 (8192) x 0.01220703 = 100 % (100 / 8192 a bit)
        assert(Math.abs(8192 * c[0].factor - 100) < 0.01);
    });
    assert(C.focus.needs(o({ infoMain: 'pedal' })).indexOf('pedal') >= 0);
    assert(C.focus.needs(o({ gaugeRpm: 'pedal' })).indexOf('pedal') >= 0);
    assert(C.focus.needs(o({ infoLow: 'throttle' })).indexOf('throttle') >= 0);
    assert(C.focus.needs(o({ infoA: 'throttle' })).indexOf('pedal') < 0);
    assert(C.focus.needs(o()).indexOf('pedal') < 0);
});
check('the layout for the drive mode: Sport / ECO PRO when set, else Layout; the gear selector\'s S doesn\'t switch', () => {
    const L = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layouts.js'));
    const S = { layout: 'analog_sport', layoutSport: 'm', layoutEco: 'same' }, get = (k) => S[k];
    assert.strictEqual(L.layoutFor(get, { driveMode: 'COMFORT' }), 'analog_sport');
    assert.strictEqual(L.layoutFor(get, { driveMode: 'SPORT INDIVIDUAL' }), 'm');
    assert.strictEqual(L.layoutFor(get, { driveMode: 'ECO PRO' }), 'analog_sport');
    assert.strictEqual(L.layoutFor(get, { driveMode: 'COMFORT', mode: 'S' }), 'analog_sport');
    assert.strictEqual(L.layoutFor(get, {}), 'analog_sport');
    assert.strictEqual(L.layoutFor((k) => (k === 'layoutSport' ? 'nope' : S[k]), { driveMode: 'SPORT' }), 'analog_sport');
});
check('temperatures in colour: blue while cold, red when hot, the piece\'s own colour between; off: as it was', () => {
    const base = () => ({ color: ['#ffffff', 1], glow: ['#ff7a1a', 0.6] });
    const c = C.toned(base, 'oil');
    assert.strictEqual(c({}, { oil: 40 }).color[0], '#4ab4ff');
    assert.strictEqual(c({}, { oil: 135 }).color[0], '#ff3b30');
    assert.strictEqual(c({}, { oil: 90 }).color[0], '#ffffff');
    assert.strictEqual(C.toned(base, 'iat')({}, { iat: 5 }).color[0], '#ffffff');
    // the oil amber while warming: from 60 °C up to Oil warm at (the cold-engine guard's range), as the Redline HUD
    const w = C.toned(base, 'oil', { warmOil: 80 });
    assert.strictEqual(w({}, { oil: 59 }).color[0], '#4ab4ff');
    assert.strictEqual(w({}, { oil: 70 }).color[0], '#ffc21a');
    assert.strictEqual(w({}, { oil: 80 }).color[0], '#ffffff');
    assert.strictEqual(C.toned(base, 'coolant', { warmOil: 80 })({}, { coolant: 70 }).color[0], '#ffffff', 'the oil only');
    const L = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layouts.js'));
    const ps = L.byId('analog_sport').pieces(o({ bottomStrip: 'stock', centre: 'info', infoA: 'oil', infoB: 'gearbox', gaugeRpm: 'gearbox', tempGauge: 'scale' }));
    const col = (k, d) => ps.find((p) => p.key === k).colors({ red: '#ff0000', text: '#ffb066', glow: '#ff7a1a', dim: '#999999' }, d).color[0];
    assert.strictEqual(col('clock', { oil: 30 }), '#4ab4ff');
    assert.strictEqual(col('clock', { oil: 70 }), '#ffc21a', 'Oil warm at 80 (the default) passed on by layouts.js');
    assert.strictEqual(col('outside', { gearbox: 120 }), '#ff3b30');
    assert.strictEqual(col('oilNum', { gearbox: 40 }), '#4ab4ff');
    const off = L.byId('analog_sport').pieces(o({ bottomStrip: 'stock', centre: 'info', infoA: 'oil', tempTone: 'off' }));
    assert.notStrictEqual(off.find((p) => p.key === 'clock').colors({ red: '#ff0000', text: '#ffb066', glow: '#ff7a1a' }, { oil: 30 }).color[0], '#4ab4ff');
});
check('shift warning (off by default): the digital speed red at the shift point, in the layouts without their own', () => {
    const L = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layouts.js'));
    const t = { red: '#ff0000', text: '#ffb066', glow: '#ff7a1a', dim: '#999999' };
    const sp = (x) => L.byId('analog_sport').pieces(o(Object.assign({ bottomStrip: 'stock', centre: 'info', redline: 6000, rpmMax: 7000 }, x))).find((p) => p.key === 'speedDigits');
    assert.strictEqual(sp({ shiftWarn: 'on' }).colors(t, { rpm: 5800, oil: 90 }).color[0], '#ff0000');
    assert.notStrictEqual(sp({ shiftWarn: 'on' }).colors(t, { rpm: 5000, oil: 90 }).color[0], '#ff0000');
    assert.strictEqual(sp({ shiftWarn: 'on' }).colors(t, { rpm: 4600, oil: 30 }).color[0], '#ff0000');
    assert.notStrictEqual(sp({}).colors(t, { rpm: 5800, oil: 90 }).color[0], '#ff0000');
});
check('temperature gauges as the car\'s (C-H, the default): the needle in the middle once warm, towards H above it', () => {
    assert.strictEqual(C.chFrac('coolant', 20), 0);
    assert(Math.abs(C.chFrac('coolant', 90) - 0.5) < 0.03);
    assert(Math.abs(C.chFrac('oil', 100) - 0.5) < 0.03);
    assert(C.chFrac('oil', 130) > C.CH_RED - 0.1 && C.chFrac('oil', 145) === 1);
    assert(C.chFrac('coolant', 60) < 0.45);
    assert.strictEqual(C.chOf(o(), 'oil'), 'oil');
    assert.strictEqual(C.chOf(o({ tempGauge: 'scale' }), 'oil'), null);
    assert.strictEqual(C.chOf(o(), 'boost'), null);
    const L = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layouts.js'));
    ['analog_sport', 'retro', 'classic'].forEach((id) => {
        const keys = L.byId(id).pieces(o({ bottomStrip: 'stock', centre: 'info', gaugeSpeed: 'coolant', gaugeRpm: 'oil' })).map((p) => p.key);
        assert(keys.some((k) => /ChH$|Sub2$/.test(k)), id + ': ' + keys.join(','));
    });
});
check('the throttle (the valve, as Live Data: 4600 / 5858, OBD 11) apart from the pedal; both read twice a round', () => {
    const { DME_KEYS, FAST_KEYS } = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'data.js'));
    assert(DME_KEYS.indexOf('throttle') >= 0 && FAST_KEYS.indexOf('pedal') >= 0 && FAST_KEYS.indexOf('throttle') >= 0);
    ['akakingj_cluster_layouts', 'akakingj_cluster_centre'].forEach((a) => {
        const c = require(path.join(ROOT, 'apps', a, 'app.json')).config.dme.throttle;
        assert.deepStrictEqual(c.map((x) => x.did || 'OBD ' + x.obd), ['4600', '5858', 'OBD 11'], a);
        assert(Math.abs(12800 * c[0].factor - 100) < 0.01);
    });
    const L = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layouts.js'));
    const low = (x) => L.byId('classic').pieces(o(Object.assign({ bottomStrip: 'stock', centre: 'info' }, x))).find((p) => p.key === 'socTxt');
    assert.strictEqual(low({}).text({ coolant: 90 }), 'COOLANT 90°');
    assert.strictEqual(low({ infoLow: 'throttle' }).text({ throttle: 40 }), 'THROTTLE 40%');
    assert.strictEqual(low({ infoLow: 'boost' }).text({ boostActual: 1, engineOn: true }), 'BOOST 14.5 psi');
});
check('settings in sections: the top lists Show, Start with the car, Layout, Colours and the sections; a section opens, Back returns', () => {
    const { listSheet } = require(path.join(ROOT, 'kit', 'runtime', 'sheet.js'));
    const vals = {}; SPEC.settings.forEach((x) => { vals[x.key] = x.default; });
    const st = { schema: SPEC.settings, get: (k) => vals[k], set: (k, v) => { vals[k] = v; }, display: (k) => String(vals[k]), cycle() {} };
    const sh = listSheet(st, null, {});
    const top = sh.entries().map((e) => e.key || '[' + e.section + ']');
    assert.deepStrictEqual(top, ['show', 'autoStart', 'layout', 'look', '[Display]', '[Readouts and gauges]', '[Red zone and shift]', '[Units and clock]', '[Car]']);
    sh.focus = 5; sh.choose();
    assert.strictEqual(sh.sec, 'Readouts and gauges');
    // (the readouts and the small gauges are set on the page alone: not in the section)
    const keys = sh.entries().map((e) => e.key);
    ['infoA', 'infoB', 'infoMain', 'infoLow', 'centreView', 'leftDial', 'gaugeSpeed', 'gaugeRpm'].forEach((k) => assert(keys.indexOf(k) < 0, k));
    assert.strictEqual(keys[0], 'stripBars');
    sh.focus = 0; sh.choose(); assert.strictEqual(sh.open.key, 'stripBars');
    sh.sub = sh.open.options.findIndex((x) => x[0] !== vals.stripBars); const want = sh.open.options[sh.sub][0]; sh.choose();
    assert.strictEqual(vals.stripBars, want); assert.strictEqual(sh.sec, 'Readouts and gauges');
    assert.strictEqual(sh.back(), null); assert.strictEqual(sh.sec, null); assert.strictEqual(sh.focus, 5);
    assert.strictEqual(sh.back(), 'close');
});
check('too hot: Settings > Too hot (the Car profile\'s) for the colours, the small gauges\' and the C-H gauges\' red', () => {
    assert.deepStrictEqual(['oil', 'coolant', 'gearbox'].map((k) => C.hotAt({}, k)), [130, 118, 115], 'the defaults');
    const o = { hotOil: 125, hotCoolant: 112, hotGearbox: 120 };
    assert.strictEqual(C.toneOf('coolant', { coolant: 113 }, {}), null);
    assert.strictEqual(C.toneOf('coolant', { coolant: 113 }, o), 'hot');
    assert.strictEqual(C.toneOf('gearbox', { gearbox: 118 }, o), null);
    assert.strictEqual(C.toneOf('oil', { oil: 125 }, Object.assign({ warmOil: 80 }, o)), 'hot');
    assert.strictEqual(C.toneOf('iat', { iat: 61 }, o), 'hot', 'the intake air its own 60');
    const g = C.gaugeOf(Object.assign({ gaugeSpeed: 'coolant' }, o), 'speed');
    assert.strictEqual(g.red, 112); assert(g.hot({ coolant: 112 }) && !g.hot({ coolant: 111 }));
    assert(Math.abs(C.chRed(o, 'coolant') - C.chFrac('coolant', 112)) < 1e-9 && C.chRed(o, 'coolant') < C.chRed({}, 'coolant'));
    assert.strictEqual(C.chRed(o, 'boost'), C.CH_RED);
    // the settings: each a Car profile name, its default the colours' own
    ['hotOil', 'hotCoolant', 'hotGearbox'].forEach((k, i) => {
        const s = SPEC.settings.find((x) => x.key === k);
        assert.strictEqual(s.profile, k); assert.strictEqual(s.default, [130, 118, 115][i]);
    });
});
check('the speed and rpm figures hold until the reading is past them, as the cluster holds its own', () => {
    const sp = (s, u) => C.speedText(o({ speedUnit: u || 'kmh' }), { speed: s });
    assert.deepStrictEqual([78.6, 79.4, 79.6, 79.9, 80.1, 79.3, 79.2, 120, 0.4].map((s) => sp(s)), ['79', '79', '79', '80', '80', '80', '79', '120', '0']);
    assert.strictEqual(sp(undefined), '--');
    assert.strictEqual(sp(100, 'mph'), '62');
    const rp = (r) => C.rpmShown({ rpm: r });
    assert.deepStrictEqual([702, 695, 712, 688, 716, 731, 744, 6118, 6106, 6131, 6136].map(rp), [700, 700, 700, 700, 720, 720, 740, 6120, 6120, 6120, 6140]);
    assert.strictEqual(rp(undefined), null);
});


/* Settings > Vehicle: Diesel (0.35.7): no ignition timing read or shown; the intake air in its place */
(() => {
    const assert = require('assert');
    const C2 = require('../apps/akakingj_cluster_layouts/layout_common');
    const base = { vehicle: 'ice', tempUnit: 'c', speedUnit: 'kmh' };
    const d = { iat: 31, timing: 12.5, boostActual: 0.8, engineOn: true };
    assert(C2.focus.needs(Object.assign({ fuel: 'diesel' }, base)).indexOf('timing') < 0, 'a diesel reads no timing');
    assert(C2.focus.needs(Object.assign({ fuel: 'petrol' }, base)).indexOf('timing') >= 0, 'a petrol car reads the timing');
    assert(C2.focus.chargeLabel(Object.assign({ fuel: 'diesel' }, base)) === 'INTAKE');
    assert(/31/.test(C2.focus.charge(Object.assign({ fuel: 'diesel' }, base))(d)));
    assert(C2.focus.chargeLabel(Object.assign({ fuel: 'petrol' }, base)) === 'TIMING');
    console.log('ok   diesel: the intake air in the timing\'s place, no timing read');
})();

// (the clock with AM / PM on a 12-hour clock; the average economy's 0.0 and its name; the fuel gauge's marks 0, 1/2, 1)
check('the clock: AM / PM on a 12-hour clock, none on a 24-hour one', () => {
    const clk = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'clock.js'));
    // (the car's own time: the cluster's display time, here 9 hours ahead of the unit's UTC; none until it says)
    const T0 = Date.UTC(2026, 10, 18, 0, 0);
    assert.strictEqual(clk.fromCar({ statusDisplayClockTimeDate: 15 }, T0), undefined, '15: not filled, nothing changes');
    assert.strictEqual(clk.fromCar({ statusDisplayClockTimeDate: 2, displayHour: 9, displayMinute: 0 }, T0), null, 'even: the car shows --:--');
    assert.strictEqual(clk.hm(T0, true), '--:--');
    clk.fromCar({ statusDisplayClockTimeDate: 1, displayHour: 9, displayMinute: 0, displaySecond: 0 }, T0);
    const at = (h, m) => Date.UTC(2026, 10, 18, (h - 9 + 24) % 24, m);
    assert.deepStrictEqual([[0, 5], [7, 37], [12, 0], [19, 37]].map(([h, m]) => clk.hm(at(h, m), true)), ['12:05 AM', '7:37 AM', '12:00 PM', '7:37 PM']);
    assert.strictEqual(clk.hm(at(19, 37)), '7:37', 'without ampm: as before (the Centre\'s AT 7:05)');
    clk.setTwelve(false);
    assert.strictEqual(clk.hm(at(19, 37), true), '19:37');
    clk.setTwelve(true);
    assert(/^\d{1,2}:\d\d [AP]M$/.test(C.READOUTS.clock.num({}, {})));
    // (no TIME before it: the time alone)
    assert(/^\d{1,2}:\d\d [AP]M$/.test(C.readout({ tempUnit: 'c' }, 'clock', { w: 400, h: 30 })({})), 'readout: ' + C.readout({ tempUnit: 'c' }, 'clock', { w: 400, h: 30 })({}));
    assert.strictEqual(C.READOUTS.clock.short, '');
});
check('the average economy: 0.0 when the trip is reset, its name AVG', () => {
    assert.strictEqual(C.READOUTS.avgFuel.num({}, { avgCons: 0, avgConsUnit: 'l100' }), '0.0 L/100km');
    assert.strictEqual(C.READOUTS.avgFuel.num({ econUnit: 'kml' }, { avgCons: 0, avgConsUnit: 'l100' }), '0.0 km/L');
    assert.strictEqual(C.READOUTS.avgFuel.num({}, { avgCons: 8.5, avgConsUnit: 'l100' }), '8.5 L/100km');
    assert.strictEqual(C.READOUTS.avgFuel.num({}, {}), '--');
    assert.strictEqual(C.READOUTS.avgFuel.long, 'AVG');
});
check('the fuel gauge: 0, 1/2, 1 as the car\'s own', () => {
    assert.deepStrictEqual(C.placeGauge({ tempUnit: 'c' }, 'fuel').marks, ['0', '1/2', '1']);
    assert.deepStrictEqual(C.placeGauge({ tempUnit: 'c' }, 'coolant').marks, ['40', '90', '140']);
});

check('JDM 2\'s G trail: a place every 200 ms, 16 kept, packed one number each; it flows (the phase) and stops while parked', () => {
    const J = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layout_jdm2.js')).trailParts;
    const unpack = (v) => { const xi = Math.floor(v / 256 + 0.001); return [(xi - 128) / 100, (v - xi * 256 - 128) / 100]; };
    [[0, 0], [1.12, -1.12], [-0.37, 0.5], [0.01, -0.01]].forEach((q) => assert.deepStrictEqual(unpack(J.packOf(q)), q, String(q)));
    const tr = J.trailOf();
    let t = 1000, u = tr([0.1, 0.2], t);
    assert.deepStrictEqual(u.u_trail_np.slice(0, 2), [1, 0]);
    u = tr([0.2, 0.2], t + J.TRAIL_MS / 2);
    assert.deepStrictEqual(u.u_trail_np.slice(0, 2), [1, 0.5], 'between places: the phase on, no new place');
    // (the bounding circle holds the places and the dot)
    const mid = unpack(u.u_trail_np[2]);
    [[0.1, 0.2], [0.2, 0.2]].forEach((q) => assert(Math.hypot(q[0] - mid[0], q[1] - mid[1]) <= u.u_trail_np[3] + 1e-9, 'in the circle: ' + q));
    for (let i = 1; i <= 40; i++) u = tr([0.1 * (i % 5), -0.05 * (i % 3)], t + i * J.TRAIL_MS);
    assert.strictEqual(u.u_trail.length, 16); assert.strictEqual(u.u_trail_np[0], 16);
    assert.deepStrictEqual(unpack(u.u_trail[15]), [0, -0.05], 'the newest last');
    // a parked car: once every place is on the dot, the same uniforms every frame (nothing sent)
    let last = '';
    for (let i = 0; i < 40; i++) u = tr([0, 0], t + 6000 + i * J.TRAIL_MS);
    for (let i = 0; i < 10; i++) { const s = JSON.stringify(tr([0, 0], t + 11000 + i * 37)); assert(!last || s === last, 'still: ' + s); last = s; }
    assert.strictEqual(JSON.parse(last).u_trail_np[1], 0);
});
check('every readout and gauge value of the page has its reading (READOUTS, GAUGES with its kind and icon)', () => {
    const opts = (k) => SPEC.settings.find((x) => x.key === k).options.map((x) => x[0]).filter((v) => v !== 'auto' && v !== 'off');
    ['infoA', 'infoB', 'infoMain', 'infoLow'].forEach((k) => assert.deepStrictEqual(opts(k).filter((v) => !C.READOUTS[v]), [], k));
    ['gaugeSpeed', 'gaugeRpm'].forEach((k) => opts(k).forEach((v) => { const g = C.placeGauge(o(), v); assert(g && g.key === v, k + ' ' + v); }));
    assert.deepStrictEqual(opts('infoA').sort(), Object.keys(C.READOUTS).sort(), 'every readout offered');
    assert.deepStrictEqual(opts('gaugeSpeed').sort(), Object.keys(C.GAUGES).sort(), 'every gauge offered');
});
check('the new readings: rpm, the other unit\'s speed, oil pressure, voltage, the fuel pressures, the boost target', () => {
    const ro = (k, x, oo) => C.readout(oo || o(), k, { w: 700, h: 34 })(x);
    assert.strictEqual(ro('rpm', { rpm: 3204 }), 'ENGINE SPEED 3200 rpm');
    assert.strictEqual(ro('speed2', { speed: 100 }), 'MPH 62');
    assert.strictEqual(ro('speed2', { speed: 100 }, o({ speedUnit: 'mph' })), 'KM/H 100');
    assert.strictEqual(ro('oilPress', { oilPress: 3.5 }), 'OIL PRESSURE 50.8 psi');
    assert.strictEqual(ro('volts', { volts: 14.18 }), 'BATTERY VOLTS 14.2 V');
    assert.strictEqual(ro('hpfp', { hpfp: 200 }, o({ pressUnit: 'bar' })), 'HIGH FUEL PRESS 200 bar');
    assert.strictEqual(ro('lpfp', { lpfp: 5.2 }, o({ pressUnit: 'bar' })), 'LOW FUEL PRESS 5.20 bar');
    assert.strictEqual(ro('boostTarget', { boostTarget: 1, engineOn: true }), 'BOOST TARGET 14.5 psi');
    assert.strictEqual(C.placeGauge(o({ pressUnit: 'bar' }), 'oilPress').num({ oilPress: 3.5 }), '3.50');
    assert.strictEqual(C.placeGauge(o(), 'volts').unit, 'V');
});
check('this drive\'s figures (driveSample): the peaks, the 0-100 time and its best, the last upshift', () => {
    const real = Date.now;
    let t = 1e6;
    Date.now = () => t;
    try {
        const at = (x, ms) => { t += ms || 20; return C.driveSample(Object.assign({ engineOn: true }, x), 'kmh'); };
        at({ speed: 0, gear: 1, rpm: 900 });
        at({ speed: 5, gear: 1, rpm: 3000, boostActual: 0.6, enginePower: 80 }, 100);
        at({ speed: 40, gear: 1, rpm: 6400, boostActual: 1.3, enginePower: 210 }, 1500);
        let d = at({ speed: 45, gear: 2, rpm: 4600, boostActual: 1.1, enginePower: 190 }, 200);
        assert.deepStrictEqual([d.lastShift.from, d.lastShift.to, d.lastShift.rpm], [1, 2, 6400]);
        assert(d.zero100Live && Math.abs(d.zero100 - 1.7) < 0.01, String(d.zero100));
        d = at({ speed: 101, gear: 3, rpm: 3000, boostActual: 0.9 }, 3000);
        assert(!d.zero100Live && Math.abs(d.zero100 - 4.7) < 0.01, String(d.zero100));
        assert.strictEqual(d.zero100Best, d.zero100);
        assert.strictEqual(d.boostPeak, 1.3); assert.strictEqual(d.powerPeak, 210);
        assert.strictEqual(d.lastShift.to, 3, 'one up again: 2-3');
        assert.strictEqual(C.readout(o(), 'lastShift', wide)(d), 'LAST SHIFT ' + d.lastShift.rpm + ' rpm');
        assert.strictEqual(C.readout(o(), 'zero100', narrow)(d), '0-100 4.7');
        // (a gear down, or the same gear: no upshift)
        const before = d.lastShift;
        at({ speed: 60, gear: 2, rpm: 5000 }, 400);
        assert.strictEqual(at({ speed: 60, gear: 2, rpm: 5000 }).lastShift, before);
    } finally { Date.now = real; }
});
check('GT3 grades the last upshift from the data (no state of its own)', () => {
    const G = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'layout_gt3.js'));
    const v = (rpm, oil) => G._shift.verdictOf(o({ redline: 7000 }), { from: 2, to: 3, rpm, oil });
    assert.strictEqual(v(6700, 95), 'SPOT ON');
    assert.strictEqual(v(5000, 95), 'EARLY');
    assert.strictEqual(G._shift.verdictOf(o(), undefined), '');
});
check('the speedometers\' and boost gauges\' ends: Settings > Speedometer up to and Boost gauge up to (the Car profile\'s)', () => {
    const item = (k) => SPEC.settings.find((x) => x.key === k);
    assert.strictEqual(item('speedMax').profile, 'speedMax');
    assert.strictEqual(item('boostMax').profile, 'boostMax');
    assert.deepStrictEqual(C.speedScale(o()), { max: 260, major: 20, minor: 10 });
    assert.deepStrictEqual(C.speedScale(o({ speedMax: '330' })), { max: 330, major: 30, minor: 10 });
    assert.deepStrictEqual(C.speedScale(o({ speedMax: '330', speedUnit: 'mph' })), { max: 200, major: 20, minor: 5 });
    assert.deepStrictEqual(C.speedScale(o({ speedUnit: 'mph' })), { max: 160, major: 20, minor: 5 });
    // the bars: boost 1.0 bar on the layouts' own 1.6, then on the gauge set; the speed in the other unit to 260 or 330 km/h
    C.setScales(o());
    assert.ok(Math.abs(C.READOUTS.boost.frac(d) - 1 / 1.6) < 1e-9);
    assert.ok(Math.abs(C.READOUTS.speed2.frac({ speed: 130 }) - 0.5) < 1e-9);
    C.setScales(o({ boostMax: 45, speedMax: '330', pressUnit: 'bar' }));
    assert.ok(Math.abs(C.READOUTS.boost.frac(d) - 1 / 3) < 1e-9, '45 psi: a 3.0 bar gauge');
    assert.ok(Math.abs(C.READOUTS.boostTarget.frac({ boostTarget: 1.5 }) - 0.5) < 1e-9);
    assert.ok(Math.abs(C.READOUTS.speed2.frac({ speed: 165 }) - 0.5) < 1e-9);
    C.setScales(o({ boostMax: 15, pressUnit: 'kpa' }));
    assert.ok(Math.abs(C.READOUTS.boost.frac(d) - 1 / 2) < 1e-9, '15 psi: in bar and kPa a 2.0 bar gauge');
    // in psi its own end
    C.setScales(o({ boostMax: 30, pressUnit: 'psi' }));
    assert.ok(Math.abs(C.READOUTS.boost.frac(d) - 14.5038 / 30) < 1e-9);
    assert.deepStrictEqual(C.BOOST_GAUGES, { 15: { psi: 15, bar: 2 }, 20: { psi: 20, bar: 2 }, 30: { psi: 30, bar: 2 }, 45: { psi: 45, bar: 3 } });
    // the numbers as the car's own gauges
    const ticks = (e, u) => C.boostTicks(e, u).map((t) => t[1]).join(' ');
    assert.deepStrictEqual([15, 20, 30, 45].map((e) => ticks(e, 'psi')), ['0 5 10 15', '0 10 20', '0 10 20 30', '0 15 30 45']);
    assert.deepStrictEqual([2, 3].map((e) => ticks(e, 'bar')), ['0.0 1.0 2.0', '0.0 1.0 2.0 3.0']);
    assert.deepStrictEqual([200, 300].map((e) => ticks(e, 'kpa')), ['0 100 200', '0 100 200 300']);
    assert.deepStrictEqual(C.boostTicks(45, 'psi').map((t) => +t[0].toFixed(3)), [0, 0.333, 0.667, 1], 'evenly apart');
    const bm = SPEC.settings.find((x) => x.key === 'boostMax');
    assert.deepStrictEqual(bm.steps, [0, 15, 20, 30, 45]);
    // From the car's Sport Display (0): its gauge's end as the least at or over it, within 5 %; set in the Car profile alone
    assert.deepStrictEqual([bm.default, bm.hidden, bm.labels['0']], [0, true, 'From the car\'s Sport Display']);
    assert.deepStrictEqual([1.16, 2.5, 3.9, undefined].map(C.snapBoost), [20, 45, 45, 0]);
    // a car's own gauge ends in its unit: 200 kPa, 2.0 / 3.0 bar; 15 / 20 / 30 / 45 psi
    assert.deepStrictEqual([2, 3, ...[15, 20, 30, 45].map((p) => p / 14.5038)].map(C.snapBoost), [30, 45, 15, 20, 30, 45]);
    assert.strictEqual(R.snapBoost(2), 30);
    C.setScales(o());
    // Centre: boost on its 2 bar, or Boost gauge up to
    assert.ok(Math.abs(R.view('boostActual', { boostActual: 1 }, { press: 'bar' }).frac - 0.5) < 1e-9);
    assert.ok(Math.abs(R.view('boostActual', { boostActual: 1 }, { press: 'bar', boostMax: 45 }).frac - 1 / 3) < 1e-6);
    assert.ok(Math.abs(R.view('boostActual', { boostActual: 1 }, { press: 'kpa', boostMax: 20 }).frac - 0.5) < 1e-6);
    assert.ok(Math.abs(R.view('boostActual', { boostActual: 1 }, { press: 'psi', boostMax: 20 }).frac - 14.5038 / 20) < 1e-3);
});
check('the electric range: full at Settings > Electric range when full; an estimate with ~ (Layouts and Centre alike)', () => {
    const est = { erange: 20, erangeFull: 40, erangeEst: true }, own = { erange: 20, erangeFull: 40 };
    assert.strictEqual(C.READOUTS.erange.frac(est), 0.5);
    assert.strictEqual(C.READOUTS.erange.frac({ erange: 80, erangeFull: 40 }), 1);
    assert.strictEqual(C.erangeText(o(), est).slice(0, 3), '~20');
    assert.strictEqual(C.erangeText(o(), own).slice(0, 2), '20');
    assert.strictEqual(R.view('erange', est, { speed: 'kmh' }).frac, 0.5);
    assert.strictEqual(R.view('erange', est, { speed: 'kmh' }).text, '~20');
    assert.strictEqual(R.view('erange', own, { speed: 'kmh' }).text, '20');
    assert.ok(Math.abs(R.view('erange', est, { speed: 'mph' }).frac - 0.5) < 1e-9, 'in miles the same share');
});
console.log(n + ' passed');
