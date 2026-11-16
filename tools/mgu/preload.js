'use strict';
/*
 * preload.js - loaded first in the app's process the MGU screen runs (node -r, tools/mgu/emu.js): the cluster
 * renderer's client is a stand-in that only records (tools/scene.js FakeClient), so the app runs as with the
 * renderer there, while the demo draws the cluster itself from its own copy of the engine. Nothing else changes.
 */
const path = require('path');
const Module = require('module');
const { FakeClient } = require(path.join(__dirname, '..', 'scene'));

class DemoClient extends FakeClient {
    constructor() { super(); this.ready = true; this.connected = true; this.targets = new Map(); }
    status() { return null; }
}
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === './cluster_render_client' || /[\\/]cluster_render_client(\.js)?$/.test(req)) {
        return { ClusterRender: function () { const c = new DemoClient(); setImmediate(() => c.emit('ready')); return c; } };
    }
    return load.call(this, req, parent, isMain);
};
