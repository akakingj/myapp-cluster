'use strict';
// The car's own strip's fuel bar: left out where the layout shows the fuel itself (JDM 1's left box, Twin
// cowl's right gauge), back when Small gauge in the tach / speedometer puts another reading there.
//   node tools/test_strip_fuel.js
const assert = require('assert');
const path = require('path');
const { makeScene } = require('./scene');
const SPEC = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'));
const defaults = {};
SPEC.settings.forEach((s) => { defaults[s.key] = s.default; });
const keys = (layout, set) => {
    const s = Object.assign({}, defaults, set);
    const o = Object.assign({}, s, { redline: Number(s.redline), rpmMax: Number(s.rpmMax), cluster: 'standard', bottomStrip: 'stock' });
    const sc = makeScene({ layout, options: o, data: {}, log: { info() {}, warn() {}, error() {} } });
    const k = sc.engine._pieces().map((p) => p.key);
    try { sc.engine.stop(); } catch (e) { /* gone */ }
    return k;
};
let n = 0;
// (JDM 1 since 0.40.0: its fuel bar in the left box whatever the gauges show; the strip's bar only with the map)
assert(keys('arc_tach', {}).indexOf('stripFuel') < 0 && keys('arc_tach', { gaugeRpm: 'boost', gaugeSpeed: 'boost' }).indexOf('stripFuel') < 0, 'arc_tach: its own fuel bar, no strip bar'); n++;
[['twin_cowl', 'gaugeSpeed'], ['analog_sport', 'gaugeSpeed']].forEach(([id, setting]) => {
    assert(keys(id, {}).indexOf('stripFuel') < 0, id + ': its own fuel gauge, no strip bar'); n++;
    assert(keys(id, { [setting]: 'fuel' }).indexOf('stripFuel') < 0, id + ': the fuel picked there, no strip bar'); n++;
    assert(keys(id, { [setting]: 'boost' }).indexOf('stripFuel') >= 0, id + ': another reading there, the strip bar back'); n++;
});
assert(keys('track', {}).indexOf('stripFuel') >= 0, 'a layout without its own: the strip bar'); n++;
console.log(n + ' passed');
