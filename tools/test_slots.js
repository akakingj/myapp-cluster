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
    driveMode: 'COMFORT', demo: true };
const call = (f, ...a) => { try { return f(...a); } catch (e) { return 'E'; } };
/** What layout id draws with options o, as text (each piece's place, texts, values, uniforms, visibility). */
function drawn(id, o) {
    return JSON.stringify(L.byId(id).pieces(o).map((p) => [p.key, p.kind, p.x, p.y, p.w, p.h, typeof p.text === 'function' ? call(p.text, D, {}) : p.text,
        p.value ? call(p.value, D) : '', p.dyn ? JSON.stringify(call(p.dyn, D, {})) : '', p.visible ? call(p.visible, D) : '', JSON.stringify(p.params || {})]));
}
const base = Object.assign({}, def, { redline: 7000, rpmMax: 8000, centre: 'info', cluster: 'standard', boxBezel: false, speedUnit: 'kmh', tempUnit: 'c' });
const KINDS = [['ice', 'layout'], ['phev', 'layout'], ['ice', 'stock'], ['phev', 'stock']];

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
check('all: whatever the car, every place the layout can have', () => {
    assert.deepStrictEqual(L.slotsFor('arc_tach', base, true), ['infoMain', 'infoA', 'infoB', 'gaugeSpeed', 'gaugeRpm']);
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

check('previews.wad: a 600 x 225 picture of every layout, with its own bottom strip and with the car\'s', () => {
    const b = fs.readFileSync(path.join(APP, 'previews.wad'));
    assert.strictEqual(b.slice(0, 4).toString(), 'LPV1');
    const hl = b.readUInt32LE(4), head = JSON.parse(b.slice(8, 8 + hl).toString()), data = 8 + hl;
    assert(head.w === 600 && head.h === 225);
    L.LAYOUTS.forEach((l) => [0, 1].forEach((strip) => {
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
