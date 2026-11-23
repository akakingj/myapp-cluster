'use strict';
/**
 * test_custom.js - Custom 1-3 (custom.js): a design drawn with the layouts' own pieces, whatever it holds. A design
 * with every kind of piece draws its readings; a broken one (wrong types, numbers out of range, too many pieces,
 * a colour that isn't one) still draws, inside the panel, under the service's limits; an empty slot draws its name;
 * the data folder's design comes first and is read again when it changes.
 *   node tools/test_custom.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeScene, APP } = require('./scene');
const custom = require(path.join(APP, 'custom'));
const { byId } = require(path.join(APP, 'layouts'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const drive = (s, seconds, fn) => { for (let i = 0; i < seconds * 25; i++) { s.setData(fn(i / 25)); s.engine._tick(); } };
const effects = (s) => Array.from(s.client.layers.values()).filter((l) => l.kind === 'effect');
const textsOf = (s) => s.engine._pieces().filter((p) => p.text !== null).map((p) => p.text);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-'));
const put = (designs) => { fs.writeFileSync(path.join(dir, 'custom_layouts.json'), JSON.stringify(designs)); const t = new Date(Date.now() + Math.random() * 1000); fs.utimesSync(path.join(dir, 'custom_layouts.json'), t, t); };
const inside = (s) => effects(s).every((l) => l.opts.x >= 0 && l.opts.y >= 0 && l.opts.x + l.opts.w <= 1920 && l.opts.y + l.opts.h <= 720);

const FULL = { v: 1, slot: 1, title: 'Test', font: 'light', colors: { bg: '#050505', accent: '#ff0000' }, looks: { sport: { accent: '#00ff00' } }, pieces: [
    { type: 'dial', src: 'speed', x: 80, y: 60, w: 460 }, { type: 'dial', src: 'rpm', x: 1380, y: 60, w: 460 }, { type: 'dial', src: 'oil', x: 820, y: 300, w: 160 },
    { type: 'readout', src: 'speed', x: 760, y: 150, w: 400, h: 120, unit: false }, { type: 'readout', src: 'gear', x: 900, y: 420, w: 120, h: 90 },
    { type: 'readout', src: 'rpm', x: 760, y: 280, w: 400, h: 60 }, { type: 'readout', src: 'boost', x: 600, y: 560, w: 300, h: 40, name: 'short' },
    { type: 'readout', src: 'oil', x: 1000, y: 560, w: 300, h: 40, name: 'long' }, { type: 'label', text: 'HELLO', x: 860, y: 520, w: 200, h: 30 },
    { type: 'bar', src: 'rpm', x: 560, y: 610, w: 800, h: 20, segments: 20 }, { type: 'box', x: 740, y: 140, w: 440, h: 400, radius: 20 },
    { type: 'line', x: 600, y: 600, w: 720, h: 2, color: '#334455' },
] };

custom.useDataDir(dir);
check('an empty slot: its name, the background, nothing else', () => {
    put([]); custom.reload();
    const s = makeScene({ layout: 'custom2', data: { speed: 0 } });
    assert(textsOf(s).indexOf('CUSTOM 2') >= 0, JSON.stringify(textsOf(s)));
    assert(inside(s));
    s.stop();
});
check('a design with every kind of piece: its readings reach the cluster, inside the panel', () => {
    put([FULL]); custom.reload();
    const s = makeScene({ layout: 'custom1', options: { speedUnit: 'kmh', tempUnit: 'c', pressUnit: 'psi' }, data: {} });
    drive(s, 2, () => ({ speed: 50, rpm: 2500, stage: 'D', gear: 3, oil: 100, coolant: 90, boostActual: 1 }));
    const t = textsOf(s);
    ['50', 'D3', '2,500 rpm', 'HELLO'].forEach((x) => assert(t.indexOf(x) >= 0, x + ' in ' + JSON.stringify(t)));
    assert(t.some((x) => /^BST 14\.5 psi$/.test(x)), JSON.stringify(t));
    assert(t.some((x) => /^ENGINE OIL 100°/.test(x)), JSON.stringify(t));
    assert(inside(s));
    assert(effects(s).length <= 60);
    assert.strictEqual(byId('custom1').title, 'Test');
    assert.strictEqual(byId('custom1').font, 'light');
    s.stop();
});
check('its colours: the design\'s, a drive mode\'s over them, every colour a piece uses a colour', () => {
    const L = byId('custom1');
    assert.strictEqual(L.palette('comfort').accent, '#ff0000');
    assert.strictEqual(L.palette('sport').accent, '#00ff00');
    ['comfort', 'sport', 'efficient'].forEach((look) => L.pieces({ speedUnit: 'kmh', tempUnit: 'c', centre: 'info', redline: 7000, rpmMax: 8000 }).forEach((p) => {
        if (!p.colors) return;
        const c = p.colors(L.palette(look), { stage: 'D', gear: 3, oil: 90, coolant: 90, rpm: 6900 });
        Object.keys(c).forEach((k) => { const v = Array.isArray(c[k]) ? c[k][0] : c[k]; assert(/^#[0-9a-f]{6}$/i.test(v), p.key + '.' + k + ' = ' + v); });
    }));
});
check('a broken design still draws: kept inside the panel, at most 60 layers, no error', () => {
    const junk = { v: 1, slot: 3, colors: { bg: 'red', text: 12 }, font: 'comic', pieces: [null, 7, 'x', { type: 'nope' }, { type: 'dial', src: 'zzz', x: -900, y: 5000, w: 99999 },
        { type: 'readout', src: 'nothing', x: 'a', y: NaN, w: -5, h: 1e9 }, { type: 'bar', src: {}, x: 1910, y: 715, w: 500, h: 50, segments: 'many' },
        { type: 'label', text: 'x'.repeat(500), color: 'nope' }, { type: 'box', radius: -4, border: 99 }].concat(Array.from({ length: 80 }, (x, i) => ({ type: 'line', x: i * 20, y: 10, w: 10, h: 10 }))) };
    put([FULL, junk]); custom.reload();
    const s = makeScene({ layout: 'custom3', data: {} });
    drive(s, 2, () => ({ speed: 80, rpm: 3000, stage: 'D', gear: 4 }));
    assert(inside(s), 'inside');
    assert(effects(s).length <= 60, effects(s).length + ' layers');
    assert.strictEqual(byId('custom3').font, 'bold');
    s.stop();
});
check('the data folder\'s design comes first and is read again when it changes', () => {
    put([Object.assign({}, FULL, { title: 'One' })]);
    assert.strictEqual(custom.reload(), true);
    assert.strictEqual(byId('custom1').title, 'One');
    assert.strictEqual(custom.reload(), false, 'unchanged: not read again');
    put([Object.assign({}, FULL, { title: 'Two' })]);
    assert.strictEqual(custom.reload(), true);
    assert.strictEqual(byId('custom1').title, 'Two');
    fs.writeFileSync(path.join(dir, 'custom_layouts.json'), '{ not json');
    custom.reload();
    assert.strictEqual(byId('custom1').title, 'Custom 1', 'a file that is not JSON: the shipped designs (none here)');
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(ok + ' passed');
