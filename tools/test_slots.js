'use strict';
/**
 * test_slots.js - the readouts set per layout (Cluster Layouts 0.29.0): layouts.js SLOTS names, for each layout, the
 * readout settings it draws (checked here against the layout itself: a setting is the layout's when changing it
 * changes what the layout draws, petrol and plug-in, with the layout's own strip and the cluster's), slotsFor picks
 * those that show now, slotValue a layout's own value over the Settings' one. And previews.wad has a picture of
 * each layout.
 *   node tools/test_slots.js
 */
const assert = require('assert');
// (the clock held still: a minute ticking over mid-run changed every layout's time and so seemed to change what each
// setting draws - CI failed so once, at 13:30:00)
const RealDate = Date, T0 = 1763200000000;
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
require('./scene');   // (./kit/ as kit/runtime, as on the car)
const APP = path.join(ROOT, 'apps', 'akakingj_cluster_layouts');
const L = require(path.join(APP, 'layouts.js'));
const SPEC = require(path.join(APP, 'app.json'));

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('ok   ' + name); };
const def = {};
SPEC.settings.forEach((s) => { def[s.key] = s.default; });
const D = { speed: 88, rpm: 3200, gear: 4, stage: 'D', oil: 96, coolant: 90, outside: 9, iat: 31, gearbox: 78, boostActual: 0.8, boostTarget: 0.9, torque: 300,
    timing: 14, hpfp: 200, lpfp: 5, pedal: 30, throttle: 28, engineOn: true, enginePower: 120, soc: 60, kw: -10, erange: 30, frange: 500, fuelPct: 55, battTemp: 25,
    driveMode: 'COMFORT', avgCons: 6.4, avgConsUnit: 'l100', tripKm: 123.4, tripMin: 75, odometer: 48215, demo: true };
const call = (f, ...a) => { try { return f(...a); } catch (e) { return 'E'; } };
/** What layout id draws with options o, as text (each piece's place, texts, values, uniforms, visibility). */
function drawn(id, o) {
    return JSON.stringify(L.byId(id).pieces(o).map((p) => [p.key, p.kind, p.x, p.y, p.w, p.h, typeof p.text === 'function' ? call(p.text, D, {}) : p.text,
        p.value ? call(p.value, D) : '', p.dyn ? JSON.stringify(call(p.dyn, D, {})) : '', p.visible ? call(p.visible, D) : '', JSON.stringify(p.params || {})]));
}
const base = Object.assign({}, def, { redline: 7000, rpmMax: 8000, centre: 'info', speedUnit: 'kmh', tempUnit: 'c' });
const KINDS = [['ice', 'stock'], ['phev', 'stock']];   // (the car's own strip: the only form since 0.34.0)

check('every layout has its readout places listed', () => L.LAYOUTS.forEach((l) => assert(l.id in L.SLOTS, l.id)));
L.LAYOUTS.forEach((l) => {
    check(l.id + ': the readouts it lists are those it draws, on each kind of car and strip', () => {
        KINDS.forEach(([vehicle, bottomStrip]) => {
            const o = Object.assign({}, base, { vehicle: vehicle, bottomStrip: bottomStrip });
            const before = drawn(l.id, o);
            const used = L.SLOT_KEYS.filter((k) => SPEC.settings.find((s) => s.key === k).options.some(([v]) => v !== o[k] && drawn(l.id, Object.assign({}, o, { [k]: v })) !== before));
            assert.deepStrictEqual(L.slotsFor(l.id, o), used, vehicle + ' / ' + bottomStrip + ': listed ' + L.slotsFor(l.id, o).join(',') + ', draws ' + used.join(','));
        });
    });
});
/* each layout's own places (0.35.0: every place can be set on the page): another reading there changes what the layout
 * draws (where it shows: with its condition met), as designed ('auto') draws as with nothing set; each has its
 * Korean, and its item lists its kind's values */
const KO = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit', 'runtime', 'locales', 'ko.json'), 'utf8'));
L.LAYOUTS.forEach((l) => (l.places || []).forEach((p) => check(l.id + ': its place ' + p.key + ' (' + p.kind + ') changes what it draws', () => {
    ['ice', 'phev'].forEach((vehicle) => {
        // (the trip computer's lines show with Settings > Centre display: Trip computer, 0.46.0)
        const o = Object.assign({}, base, { vehicle, bottomStrip: 'stock', leftDial: 'temps', centreView: 'trip' });
        assert(!p.when || p.when(o), 'shows with the readings in the centre');
        const own = drawn(l.id, o);
        assert.strictEqual(drawn(l.id, Object.assign({}, o, { places: { [p.key]: 'auto' } })), own, 'auto: as designed');
        const it = L.placeItem(l.id, p.key, SPEC);
        assert(it && it.options[0][0] === 'auto' && it.options.length > 8, 'its values');
        const changed = it.options.slice(1).filter(([v]) => drawn(l.id, Object.assign({}, o, { places: { [p.key]: v } })) !== own).map(([v]) => v);
        assert(changed.length >= it.options.length - 2, vehicle + ': only ' + changed.join(',') + ' change it');
    });
    assert(Object.prototype.hasOwnProperty.call(KO, p.label), 'no Korean for ' + p.label);
})));
check('all: whatever the car, every place the layout can have', () => {
    assert.deepStrictEqual(L.slotsFor('arc_tach', base, true), ['infoMain', 'infoA', 'infoB', 'gaugeSpeed', 'gaugeRpm']);
    assert.deepStrictEqual(L.slotsFor('id6m', base, true), ['infoMain', 'infoA', 'infoB', 'gaugeSpeed', 'gaugeRpm', 'centreView']);
    assert.deepStrictEqual(L.slotsFor('m', base, true), []);
});

const item = (k) => SPEC.settings.find((s) => s.key === k);
check('a layout\'s own value over the Settings\' one; another layout keeps the Settings\'', () => {
    const v = { infoMain: 'torque', slotsBy: { arc_tach: { infoMain: 'boost' } } }, get = (k) => v[k];
    assert.strictEqual(L.slotValue(get, item, 'arc_tach', 'infoMain'), 'boost');
    assert.strictEqual(L.slotValue(get, item, 'classic', 'infoMain'), 'torque');
});
check('a value the setting doesn\'t have (an old save), or no slotsBy: the Settings\' one', () => {
    assert.strictEqual(L.slotValue((k) => ({ infoMain: 'torque', slotsBy: { arc_tach: { infoMain: 'warp' } } })[k], item, 'arc_tach', 'infoMain'), 'torque');
    assert.strictEqual(L.slotValue((k) => ({ infoMain: 'torque' })[k], item, 'arc_tach', 'infoMain'), 'torque');
    assert.strictEqual(L.slotValue((k) => ({ infoMain: 'torque', slotsBy: 'x' })[k], item, 'arc_tach', 'infoMain'), 'torque');
});
check('slotsBy: a hidden object setting, empty by default', () => {
    const s = item('slotsBy');
    assert(s && s.type === 'object' && s.hidden === true && JSON.stringify(s.default) === '{}');
});

check('previews.wad: a 600 x 225 picture of every layout, with the car\'s strip, and of the stock cluster', () => {
    const b = fs.readFileSync(path.join(APP, 'previews.wad'));
    assert.strictEqual(b.slice(0, 4).toString(), 'LPV1');
    const hl = b.readUInt32LE(4), head = JSON.parse(b.slice(8, 8 + hl).toString()), data = 8 + hl;
    assert(head.w === 600 && head.h === 225);
    // (and the Stock card's, the car's own cluster drawn: tools/stock_preview.py, 0.39.6)
    L.LAYOUTS.concat([{ id: 'stock' }]).forEach((l) => [1].forEach((strip) => {
        const e = head.list.find((x) => x.id === l.id && x.strip === strip);
        assert(e, 'no picture of ' + l.id + (strip ? ' with the car\'s strip' : ''));
        const px = zlib.inflateSync(b.slice(data + e.off, data + e.off + e.len));
        assert.strictEqual(px.length, 600 * 225 * 3, l.id);
        let lit = 0;
        for (let i = 0; i < px.length; i += 3) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
        assert(lit > 1500, l.id + ': nearly black (' + lit + ')');
    }));
});

console.log(n + ' passed');
