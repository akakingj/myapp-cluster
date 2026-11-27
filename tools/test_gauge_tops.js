'use strict';
/*
 * The power and torque gauges' ends (Layouts 0.64.0): the engine's most from the Car profile (Power / Torque gauge up to,
 * on Auto the car's Sport Display's: kW, Nm), else the layouts' own 200 kW and 450 Nm.
 */
const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'layout_common'));

C.setScales({});
assert.deepStrictEqual([C.GAUGES.power.max, C.GAUGES.torque.max], [200, 450], 'the layouts\' own');
assert.strictEqual(C.READOUTS.torque.frac({ torque: 225 }), 0.5);
C.setScales({ powerMax: 215, torqueMax: 420 });
assert.deepStrictEqual([C.GAUGES.power.max, C.GAUGES.torque.max], [215, 420], 'a 330e\'s Sport Display');
const g = C.gaugeOf({ gaugeSpeed: 'torque', torqueUnit: 'nm' }, 'speed');
assert.strictEqual(g.frac({ torque: 420 }), 1, 'the most torque: the gauge\'s end');
assert.strictEqual(C.READOUTS.power.frac({ enginePower: 107.5 }), 0.5);
assert.strictEqual(C.READOUTS.torque.frac({ torque: 210 }), 0.5);
C.setScales({ powerMax: 0, torqueMax: 5000 });
assert.deepStrictEqual([C.GAUGES.power.max, C.GAUGES.torque.max], [200, 450], 'none, or not a car\'s: the layouts\' own');
C.setScales({});

// Yellow light at (Layouts 0.65.0): a figure, Auto (700 under the red) or Off (the Car profile's 'off': no yellow,
// green then red); the shift now warning past the red (a G20 320i: red 6000, solid from 6500)
const o = { redline: 6000, rpmMax: 7000, coldGuard: 'off' };
assert.strictEqual(C.yellowAt(o, {}), 5300, 'Auto');
assert.strictEqual(C.yellowAt(Object.assign({}, o, { yellowFrom: 4500 }), {}), 4500);
const off = Object.assign({}, o, { yellowOff: true });
assert.strictEqual(C.yellowAt(off, {}), 6000, 'Off: at the red, none');
assert.ok(C.yellowSet(off) && !C.yellowSet(o));
const t = { green: 'g', yellow: 'y' };
assert.deepStrictEqual([C.lightsYellow(o, t), C.lightsYellow(off, t)], ['y', 'g'], 'the shift lights\' yellow: green with Off');
assert.strictEqual(C.shiftPoint(Object.assign({}, o, { shiftBefore: 6000 - 6500 }), {}).rpm, 6500, 'the warning past the red');
const app = require(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'app.json'));
const yl = app.settings.filter((x) => x.key === 'yellowLight')[0];
assert.strictEqual(yl.profileMap.off, 99999);
assert.ok(yl.steps.indexOf(99999) >= 0 && /Off/.test(yl.labels['99999']), 'Off can be chosen here too');
assert.ok(/const YELLOW_OFF = 99999;/.test(require('fs').readFileSync(path.join(__dirname, '..', 'apps', 'akakingj_cluster_layouts', 'main.js'), 'utf8')));
console.log('test_gauge_tops: ok');
