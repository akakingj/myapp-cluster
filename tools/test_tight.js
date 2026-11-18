'use strict';
/**
 * test_tight.js - each program as the engine sends it (engine.js tight: no comments, indentation or empty lines) is
 * the same program: the same words and signs in the same order, every preprocessor line whole on its own line, and a
 * third or so smaller.
 *   node tools/test_tight.js
 */
const assert = require('assert');
const path = require('path');
require('./scene');
const SH = require(path.join(__dirname, '..', 'shared', 'shaders.js'));
const { tight } = require(path.join(__dirname, '..', 'shared', 'engine.js'));
const tokens = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').match(/[A-Za-z_]\w*|\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|\S/g) || [];
const progs = [];
Object.keys(SH).forEach((k) => {
    const v = SH[k];
    if (typeof v === 'string' && /#version/.test(v)) progs.push([k, v]);
    else if (v && typeof v === 'object') Object.keys(v).forEach((m) => { if (typeof v[m] === 'string' && /#version/.test(v[m])) progs.push([k + '[' + m + ']', v[m]]); });
});
let before = 0, after = 0;
progs.forEach(([k, src]) => {
    const t = tight(src);
    assert.deepStrictEqual(tokens(t), tokens(src), k + ': the words and signs changed');
    assert(!/\/\*|\/\//.test(t), k + ': a comment left');
    const pre = src.split('\n').map((l) => l.trim()).filter((l) => l.charAt(0) === '#');
    const preT = t.split('\n').filter((l) => l.charAt(0) === '#');
    assert.deepStrictEqual(preT, pre.map((l) => l.replace(/\/\/.*$/, '').trim()), k + ': its preprocessor lines');
    assert(/^#version 100\n/.test(t), k + ': #version first');
    assert.strictEqual(tight(src), t, 'the same each time');
    before += src.length; after += t.length;
});
assert(progs.length > 30 && after < before * 0.8, progs.length + ' programs, ' + before + ' -> ' + after);
console.log('ok   ' + progs.length + ' programs the same when tight: ' + Math.round(before / 1024) + ' KB -> ' + Math.round(after / 1024) + ' KB');
