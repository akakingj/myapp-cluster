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
console.log('test_gauge_tops: ok');
