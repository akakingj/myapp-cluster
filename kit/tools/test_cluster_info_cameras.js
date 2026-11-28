'use strict';
/**
 * test_cluster_info_cameras.js - speed cameras (Info 1.14.0, Layouts 0.70.0): BMW's route events decoded (nav.js
 * decodeCamera, decodeEvents, Tracker.camera), fixed / mobile / section (road_signs.js), their pictures (sign_art.js,
 * sign_atlas.js), the query asking for them (navlog.js) and the file the cluster's apps read (providers.js camera).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..'), KIT = path.join(ROOT, 'kit', 'runtime'), APP = path.join(ROOT, 'apps', 'akakingj_cluster_info');
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req.startsWith('./kit/')) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.apply(this, arguments);
};
const Nav = require(path.join(APP, 'nav.js'));
const RS = require(path.join(ROOT, 'shared', 'road_signs.js'));
const ART = require(path.join(APP, 'sign_art.js'));
const ATLAS = require(path.join(ROOT, 'apps', 'akakingj_cluster_layouts', 'sign_atlas.js'));
const { startProviders } = require(path.join(ROOT, 'shared', 'providers.js'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

const fd = (d, u) => ({ distance: d, unit: u || 'METER', rawDistance: 0 });
const cam = (dist, id, more) => ({ speedCamera: Object.assign({ uid: 9, distanceToDestination: 5000, formattedDistance: dist === null ? fd('', 'NONE') : fd(dist),
    speedCameraInfo: { cameraIcon: { valid: true, id: id, url: '', cache: false }, endCameraIcon: { valid: false, id: '', url: '' } } }, more || {}) });
const section = (dist, inside) => ({ speedSectionCamera: { uid: 10, distanceToDestination: 4000, formattedDistance: fd(dist), isInsideEvent: !!inside, averageSpeed: 80, speedUnit: 'KM_P_H',
    speedCameraInfo: { cameraIcon: { id: 'section_cam' }, endCameraIcon: { id: 'section_cam_end' } } } });
const turn = (dist, dtd) => ({ intersection: { uid: 1, direction: 'LEFT', distanceToDestination: dtd, formattedDistance: fd(dist), description: { elements: [] } } });
const reply = (...evs) => ({ GuidanceEventListError: 'NO_ERROR', viewContent: [{ eventsInView: evs }] });

check('a speed camera event: fixed, mobile (its icon says so), section; its distance, the icons kept for the log', () => {
    const f = Nav.decodeCamera(cam('450', 'ic_speedcam_fixed'));
    assert.strictEqual(f.cam, 'fixed'); assert.strictEqual(f.m, 450); assert.deepStrictEqual(f.icons, ['ic_speedcam_fixed']);
    assert.strictEqual(Nav.decodeCamera(cam('300', 'ic_speedcam_mobile')).cam, 'mobile');
    assert.strictEqual(Nav.decodeCamera(cam('300', 'MobileSpeedCamera')).cam, 'mobile');
    assert.strictEqual(Nav.decodeCamera(cam('300', '')).cam, 'fixed');
    const s = Nav.decodeCamera(section('1,2', true));
    assert.strictEqual(s.cam, 'section'); assert.strictEqual(s.inside, true); assert.strictEqual(s.avg, 80);
    assert.strictEqual(Nav.decodeCamera(turn('200', 100)), null);
    assert.strictEqual(Nav.decodeCamera(null), null);
});

check('the event list: cameras apart, never the next turn; one with no distance gets it from the distances to the destination', () => {
    const r = Nav.decodeEvents(reply(cam('120', 'x'), turn('300', 4700), cam(null, 'y', { distanceToDestination: 4400 })));
    assert.strictEqual(r.events.length, 1); assert.strictEqual(r.events[0].kind, 'turn');
    assert.strictEqual(r.cameras.length, 2);
    assert.strictEqual(r.cameras[0].m, 120); assert.strictEqual(r.cameras[0].first, true);
    // the car: the first camera 120 m ahead at 5000 m to go -> 5120; the second 4400 -> 720 m
    assert.strictEqual(r.cameras[1].m, 720);
});

check('Tracker.camera: the nearest within CAM_M while a route runs, a section the car is in, gone when stale or passed', () => {
    const T = Nav.Tracker();
    T.field('guidance', 'guidanceState', 'ACTIVE', 0);
    T.events(reply(turn('300', 4700), cam('1,5', 'a', { formattedDistance: fd('1,5', 'KM') })), 0, 0);
    assert.strictEqual(T.camera(10), null, '1.5 km: not yet');
    T.events(reply(cam('800', 'ic_mobile'), cam('400', 'ic_fixed')), 100, 100);
    assert.strictEqual(T.camera(110).cam, 'fixed');
    assert.strictEqual(T.camera(110).m, 400);
    assert.strictEqual(T.camera(100 + Nav.STALE_MS + 1), null, 'stale');
    T.events(reply(section('2', true)), 5000, 5000);
    assert.strictEqual(T.camera(5010).cam, 'section', 'inside a section, however far its end');
    T.events(reply(turn('100', 4000)), 6000, 6000);
    assert.strictEqual(T.camera(6010), null, 'passed');
    // BMW's own next one (conclusiveDart) while its guidance is active
    T.field('guidance', 'conclusiveDart', { maneuver: cam('250', 'ic_mobile') }, 7000);
    assert.strictEqual(T.camera(20000).cam, 'mobile');
    T.field('guidance', 'guidanceState', 'INACTIVE', 20001);
    assert.strictEqual(T.camera(20002), null, 'no route');
});

check('road_signs: the camera types always shown, each with its own picture; not taken for the front camera\'s', () => {
    Object.keys(RS.CAMERAS).forEach((t) => { assert.strictEqual(RS.wanted(t), true); assert.strictEqual(RS.artOf(t), RS.CAMERAS[t]); });
    assert.strictEqual(RS.CAM_TYPE.mobile, 'SPEED_CAMERA_MOBILE');
    assert.strictEqual(RS.cameraKind('speedCamera', ['x', 'ic_mobile_cam']), 'mobile');
    assert.strictEqual(RS.cameraKind('speedSectionCamera', ['ic_mobile_cam']), 'section');
    assert.strictEqual(RS.cameraType({ camera: { type: 'SPEED_CAMERA_FIXED' } }), 'SPEED_CAMERA_FIXED');
    assert.strictEqual(RS.cameraType({ camera: { type: 'NOPE' } }), null);
    ['camera_fixed', 'camera_mobile', 'camera_section'].forEach((n) => {
        assert.ok(ART.art[n], 'HUD ' + n); assert.strictEqual(ART.art[n].h, ART.h);
        assert.ok(ART.art[n].w < ART.h, n + ' upright');
        assert.ok(ATLAS.cells[n], 'Layouts ' + n);
    });
    assert.ok(fs.existsSync(path.join(ROOT, 'tools', 'sign_art', 'camera_mobile.png')));
});

check('the query asks for speed cameras, eight events', () => {
    const t = fs.readFileSync(path.join(APP, 'navlog.js'), 'utf8');
    assert.ok(/'INCLUDE_SPEED_CAMERA'/.test(t)); assert.ok(/maxElementCount: 8/.test(t));
});

check('camera.json: the cluster\'s apps read its type while fresh; Cluster Info doesn\'t list it as a provider', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cam-'));
    const log = { info() {}, warn() {} };
    fs.writeFileSync(path.join(dir, 'camera.json'), JSON.stringify({ v: 1, t: Date.now(), app: 'Cluster Info', camera: { type: 'SPEED_CAMERA_MOBILE', m: 300 } }));
    const p = startProviders(log, { dir, watch: false, scanMs: 100000 });
    assert.strictEqual(p.readings().camera, 'SPEED_CAMERA_MOBILE');
    p.stop();
    fs.writeFileSync(path.join(dir, 'camera.json'), JSON.stringify({ v: 1, t: Date.now() - 10000, camera: { type: 'SPEED_CAMERA_MOBILE' } }));
    const q = startProviders(log, { dir, watch: false, scanMs: 100000 });
    assert.strictEqual(q.readings().camera, undefined, 'stale');
    q.stop();
    const Info = require(path.join(APP, 'providers.js'));
    fs.writeFileSync(path.join(dir, 'camera.json'), JSON.stringify({ v: 1, t: Date.now(), app: 'Cluster Info', camera: { type: 'SPEED_CAMERA_FIXED' } }));
    const ip = Info.startProviders(log, { dir });
    ip.scan();
    assert.deepStrictEqual(ip.list(), {});
    if (ip.stop) ip.stop();
    // Layouts' and Info's copies are the shared one
    ['akakingj_cluster_layouts', 'akakingj_cluster_info', 'akakingj_cluster_centre'].forEach((a) => {
        const f = path.join(ROOT, 'apps', a, 'road_signs.js');
        assert.strictEqual(fs.readFileSync(f, 'utf8'), fs.readFileSync(path.join(ROOT, 'shared', 'road_signs.js'), 'utf8'), a);
    });
});

console.log(ok + ' checks passed');
