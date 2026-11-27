'use strict';
/**
 * test_cluster_info_signs.js - Cluster Info's road signs on the HUD (signs.js, overlay.js, 1.12.0): the camera's sign
 * event read, which signs are drawn and how long, their pictures, one subscription shared with the survey, and the
 * row on the HUD right of BMW's speed.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');
const Module = require('module');

const ROOT = path.join(__dirname, '..', '..'), KIT = path.join(ROOT, 'kit', 'runtime'), APP = path.join(ROOT, 'apps', 'akakingj_cluster_info');
const load = Module._load;
Module._load = function (req, parent, isMain) {
    if (req.startsWith('./kit/')) return load.call(this, path.join(KIT, req.slice(6)), parent, isMain);
    return load.apply(this, arguments);
};
const S = require(path.join(APP, 'signs.js'));
const { startOverlay, SIGNS, HUD_SEEN } = require(path.join(APP, 'overlay.js'));
const { Canvas } = require(path.join(KIT, 'canvas'));
const themes = require(path.join(KIT, 'themes'));
const fit = require(path.join(KIT, 'survey_fit'));
const theme = themes.theme('m_tricolour');

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const acheck = async (name, fn) => { await fn(); ok++; console.log('ok   ' + name); };

// the camera's value as the survey wrote it (2026-11-26)
const value = (...types) => ({ trafficSignRecognition: { numberSigns: types.length, speedLimitUnit: 'KM_H' },
    trafficSign: types.map((t) => ({ value: t === 'SPEED_LIMIT' ? 90 : 0, type: t })).concat([{ value: 0, type: 'GIVE_WAY' }]) });

check('the camera\'s value: its sign types, as many as numberSigns says', () => {
    assert.deepStrictEqual(S.parseSigns(value('DS_ANIMAL_CROSSING')), ['DS_ANIMAL_CROSSING']);
    assert.deepStrictEqual(S.parseSigns(value('GIVE_WAY', 'SPEED_LIMIT')), ['GIVE_WAY', 'SPEED_LIMIT']);
    assert.deepStrictEqual(S.parseSigns(JSON.stringify(value('DS_TRAFFIC_JAM'))), ['DS_TRAFFIC_JAM']);
    assert.deepStrictEqual(S.parseSigns({ x: { trafficSign: [{ type: 'ds_splippery_road' }] } }), ['DS_SPLIPPERY_ROAD']);
    [null, undefined, 3, 'nope', {}, { trafficSign: 5 }, { trafficSign: [{ type: 7 }] }].forEach((v) => assert.deepStrictEqual(S.parseSigns(v), []));
});

check('drawn: the danger signs and give way; not the speed limit or no passing (the HUD shows those itself)', () => {
    ['DS_TRAFFIC_JAM', 'DS_SPLIPPERY_ROAD', 'DS_RIGHT_DOWNWARDS', 'DS_ANIMAL_CROSSING', 'DS_ANYTHING', 'GIVE_WAY'].forEach((t) => assert(S.wanted(t), t));
    ['SPEED_LIMIT', 'NO_PASSING_SIGN', 'END_OF_NO_PASSING', 'UNKNOWN'].forEach((t) => assert(!S.wanted(t), t));
});

check('each shows 10 s after it was last seen, oldest first, at most 4', () => {
    const tr = S.makeTracker();
    tr.add(['SPEED_LIMIT', 'GIVE_WAY'], 0);
    assert.deepStrictEqual(tr.current(0), ['GIVE_WAY']);
    tr.add(['DS_TRAFFIC_JAM'], 3000);
    assert.deepStrictEqual(tr.current(5000), ['GIVE_WAY', 'DS_TRAFFIC_JAM']);
    assert.deepStrictEqual(tr.current(10000), ['DS_TRAFFIC_JAM']);
    tr.add(['DS_TRAFFIC_JAM'], 12000);              // seen again: longer, still in its place
    assert.deepStrictEqual(tr.current(21000), ['DS_TRAFFIC_JAM']);
    assert.deepStrictEqual(tr.current(22000), []);
    tr.add(['DS_A', 'DS_B', 'DS_C'], 30000); tr.add(['DS_D', 'DS_E'], 31000);
    assert.deepStrictEqual(tr.current(31000), ['DS_B', 'DS_C', 'DS_D', 'DS_E']);
});

check('pictures: the types the camera read get their own; another danger sign the "!"', () => {
    assert.deepStrictEqual(S.pictureOf('DS_SPLIPPERY_ROAD'), ['slippery']);
    assert.deepStrictEqual(S.pictureOf('DS_TRAFFIC_JAM'), ['jam']);
    assert.deepStrictEqual(S.pictureOf('DS_ANIMAL_CROSSING'), ['animal']);
    assert.deepStrictEqual(S.pictureOf('DS_RIGHT_DOWNWARDS'), ['down', true]);
    assert.deepStrictEqual(S.pictureOf('DS_LEFT_DOWNWARDS'), ['down', false]);
    assert.deepStrictEqual(S.pictureOf('DS_ROAD_WORKS'), ['general']);
});

const px = (cv, x, y) => { const i = (Math.round(y) * cv.w + Math.round(x)) * 4; return [cv.d[i], cv.d[i + 1], cv.d[i + 2], cv.d[i + 3]]; };
check('drawn as Korean signs: a yellow triangle with a red edge, give way white and point down; a picture in each', () => {
    const size = 56, box = S.signBox(size), cv = new Canvas(2 * size + 8, box.h + 2);
    S.drawSigns(cv, ['DS_ANIMAL_CROSSING', 'GIVE_WAY'], size, 8);
    const y0 = Math.floor((cv.h - box.h) / 2);
    // the first: red at its foot's middle edge, yellow inside, clear in its top corners
    const red = px(cv, size / 2, y0 + box.h - 2), yel = px(cv, size * 0.5, y0 + box.h * 0.80), corner = px(cv, 2, y0 + 2);
    assert(red[0] > 200 && red[1] < 80 && red[3] > 200, 'red edge ' + red);
    assert(yel[0] > 200 && yel[1] > 170 && yel[2] < 80, 'yellow ' + yel);
    assert.strictEqual(corner[3], 0, 'clear outside');
    // the second: point down - its top edge red, white inside, clear at its foot's corners
    const x2 = size + 8;
    const top = px(cv, x2 + size / 2, y0 + 1), white = px(cv, x2 + size / 2, y0 + box.h * 0.35), foot = px(cv, x2 + 2, y0 + box.h - 2);
    assert(top[0] > 200 && top[1] < 80, 'red top ' + top);
    assert(white[0] > 220 && white[1] > 220 && white[2] > 220, 'white ' + white);
    assert.strictEqual(foot[3], 0);
    // each type its own picture: the rows differ
    const pic = (t) => { const c = new Canvas(size, box.h + 2); S.drawSigns(c, [t], size, 0); return Buffer.from(c.d).toString('base64'); };
    const all = ['DS_SPLIPPERY_ROAD', 'DS_TRAFFIC_JAM', 'DS_ANIMAL_CROSSING', 'DS_RIGHT_DOWNWARDS', 'DS_ROAD_WORKS'].map(pic);
    assert.strictEqual(new Set(all).size, all.length);
});

/* ---------- the camera, and the survey through the same subscription ---------- */
function kitWith(declared) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signs-'));
    if (declared) fs.writeFileSync(path.join(dir, fit.REPORT), JSON.stringify({ declared, dropped: [] }));
    return dir;
}
const CAM = { iface: S.CAM_IFACE, instance: '1', member: S.CAM_EVENT, kind: 'event', flags: 'e', group: 'camera', sign: true };
function fakeSignals() {
    const f = { watches: [], ons: [], proxies: 0 };
    f.watch = (iface, inst, handlers, log, o) => { f.watches.push([iface, inst, Object.keys(handlers || {})]); const proxy = { n: ++f.proxies, iface, subs: {} };
        return Promise.resolve({ iface, available: true, proxy, error: null, shutdown: () => { proxy.down = true; return Promise.resolve(); } }); };
    f.on = (p, name, fn) => { f.ons.push([p.iface, name]); p.subs[name] = fn; return Promise.resolve(); };
    f.fire = (name, v) => f.ons.length && f.watches.length && Object.values(f.last().subs).length && f.last().subs[name] && f.last().subs[name](v);
    return f;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 20));
const log = { lines: [], info(m) { this.lines.push(m); }, warn(m) { this.lines.push('WARN ' + m); } };

(async () => {
    await acheck('declared (the car\'s catalog has it): subscribed once at the start; a sign comes, is shown 10 s, and logged once a type', async () => {
        const sig = fakeSignals(); let t = 1000, proxy = null;
        const w = sig.watch; sig.watch = (...a) => w(...a).then((s) => { proxy = s.proxy; return s; });
        const sg = S.startSigns({ signals: sig }, log, { kitDir: kitWith([CAM]), now: () => t });
        await wait();
        assert.deepStrictEqual(sig.watches, [[S.CAM_IFACE, '1', []]]);
        assert.deepStrictEqual(sig.ons, [[S.CAM_IFACE, S.CAM_EVENT]]);
        assert.strictEqual(sg.status().state, 'subscribed');
        proxy.subs[S.CAM_EVENT](value('DS_ANIMAL_CROSSING', 'SPEED_LIMIT'));
        proxy.subs[S.CAM_EVENT](value('DS_ANIMAL_CROSSING'));
        assert.deepStrictEqual(sg.current(), ['DS_ANIMAL_CROSSING']);
        t += 9999; assert.deepStrictEqual(sg.current(), ['DS_ANIMAL_CROSSING']);
        t += 1; assert.deepStrictEqual(sg.current(), []);
        assert.strictEqual(log.lines.filter((l) => /read DS_ANIMAL_CROSSING/.test(l)).length, 1);
        assert(log.lines.some((l) => /read SPEED_LIMIT \(not drawn/.test(l)));
        assert.deepStrictEqual(sg.status().types, { DS_ANIMAL_CROSSING: 2, SPEED_LIMIT: 1 });
    });

    await acheck('not in the catalog, or no survey list: nothing asked of the car', async () => {
        const sig = fakeSignals();
        const a = S.startSigns({ signals: sig }, log, { kitDir: kitWith([Object.assign({}, CAM, { member: 'Other' })]) });
        const b = S.startSigns({ signals: sig }, log, { kitDir: kitWith(null) });
        await wait();
        assert.strictEqual(sig.watches.length, 0);
        assert.strictEqual(a.status().state, 'not in this car\'s catalog');
        assert(/no survey list/.test(b.status().state));
        assert.deepStrictEqual(a.current(), []);
    });

    await acheck('the survey reads the camera through the same proxy (no second one), and lets go of only its own', async () => {
        const sig = fakeSignals(); let proxy = null;
        const w = sig.watch; sig.watch = (...a) => w(...a).then((s) => { proxy = proxy || s.proxy; return s; });
        const sg = S.startSigns({ signals: sig }, log, { kitDir: kitWith([CAM]), now: () => 5000 });
        await wait();
        const sv = sg.signalsFor(sig), got = [], other = [];
        const sub = await sv.watch(S.CAM_IFACE, '1', {}, log);
        assert.strictEqual(sig.watches.length, 1, 'no second watch of the camera');
        assert.strictEqual(sub.available, true);
        await sv.on(sub.proxy, S.CAM_EVENT, (v) => got.push(v));
        await sv.on(sub.proxy, 'TrafficSignRecognitionFrontCamera2', (v) => other.push(v));
        assert.deepStrictEqual(sig.ons.map((o) => o[1]), [S.CAM_EVENT, 'TrafficSignRecognitionFrontCamera2'], 'a member not yet on the proxy is subscribed on it, once');
        proxy.subs[S.CAM_EVENT](value('GIVE_WAY'));
        proxy.subs.TrafficSignRecognitionFrontCamera2({ a: 1 });
        assert.strictEqual(got.length, 1); assert.strictEqual(other.length, 1);
        assert.deepStrictEqual(sg.current(), ['GIVE_WAY']);
        await sub.shutdown();
        assert(!proxy.down, 'the shared proxy stays');
        proxy.subs[S.CAM_EVENT](value('DS_TRAFFIC_JAM'));
        assert.strictEqual(got.length, 1, 'the survey hears no more');
        assert.deepStrictEqual(sg.current(), ['GIVE_WAY', 'DS_TRAFFIC_JAM'], 'the signs still do');
        // any other service: as it was
        await sv.watch('de.bmw.dass.TrafficSignRecognition', '1', {}, log);
        assert.strictEqual(sig.watches.length, 2);
    });

    check('read only: signs.js calls no method and writes nothing', () => {
        const src = fs.readFileSync(path.join(APP, 'signs.js'), 'utf8');
        assert(!/signals\.(call|set|proxy)\(|callMethod|setValue|writeFileSync/.test(src));
    });

    /* ---------- on the HUD ---------- */
    class FakeCR extends EventEmitter {
        constructor() { super(); this.layers = new Map(); this.next = 1; FakeCR.last = this; }
        connect() { setImmediate(() => this.emit('ready')); }
        close() {}
        image(o) { const r = this.next++; this.layers.set(r, Object.assign({}, o)); return r; }
        set(r, o) { Object.assign(this.layers.get(r), o); }
        drop(r) { this.layers.delete(r); }
        pixels(r, rects, p) { const l = this.layers.get(r); assert.strictEqual(p.length, l.iw * l.ih * 4); l.px = (l.px || 0) + 1; }
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signs-hud-'));
    const claims = path.join(dir, 'mgu-hud'); fs.mkdirSync(claims);
    const settings = { v: { show: 'off', roadSigns: 'on' }, get(k) { return this.v[k]; } };
    let list = [], t = Date.now();
    const lv = { power: () => null, limits: () => ({ outMax: 100, inMax: 60 }), keepFast: () => {}, indicator: () => 'off', night: () => false, extras: () => [], roadSigns: () => list };
    const ov = startOverlay({ settings, log, theme: () => theme }, lv, { statusPath: path.join(dir, 'status.json'), ClusterRender: FakeCR, now: () => t, setInterval: () => 0, clearInterval: () => {}, hudClaims: claims });
    const layer = () => FakeCR.last && [...FakeCR.last.layers.values()].find((l) => l.x === SIGNS.x && l.target === 'hud');

    check('no signs: no renderer asked for', () => { ov._signsTick(); assert(!FakeCR.last); });
    check('a sign: one HUD layer right of BMW\'s speed, in its row, shown; the same signs not sent again', () => {
        list = ['DS_ANIMAL_CROSSING']; ov._signsTick();
        const l = layer();
        assert(l && l.visible && l.opacity > 0, JSON.stringify(l));
        assert(l.x >= 373 + 6, 'clear of "km/h" (x ~373)');
        assert(l.y < 388 && l.y + l.h > 388, 'in the speed\'s row (middle y ~388)');
        assert(l.x + l.w <= HUD_SEEN.x + HUD_SEEN.w, 'four fit on the glass');
        assert.strictEqual(l.px, 1);
        ov._signsTick(); assert.strictEqual(l.px, 1);
        list = ['DS_ANIMAL_CROSSING', 'GIVE_WAY']; ov._signsTick(); assert.strictEqual(l.px, 2);
        assert.deepStrictEqual(ov.roadSigns(), { shown: true, types: ['DS_ANIMAL_CROSSING', 'GIVE_WAY'] });
    });
    check('gone, off in the settings, or the HUD another app\'s: hidden', () => {
        list = []; ov._signsTick(); assert.strictEqual(layer().visible, false);
        list = ['GIVE_WAY']; ov._signsTick(); assert.strictEqual(layer().visible, true);
        settings.v.roadSigns = 'off'; ov._signsTick(); assert.strictEqual(layer().visible, false);
        settings.v.roadSigns = 'on'; ov._signsTick(); assert.strictEqual(layer().visible, true);
        fs.writeFileSync(path.join(claims, 'redline'), JSON.stringify({ held: true })); t += 2000; ov._signsTick();
        assert.strictEqual(layer().visible, false);
        fs.unlinkSync(path.join(claims, 'redline')); t += 2000; ov._signsTick();
        assert.strictEqual(layer().visible, true);
    });

    await acheck('a wide Waze map on the HUD puts the panel low: the signs that would reach it are left off the row\'s end', async () => {
        const st = path.join(dir, 'status.json');
        fs.writeFileSync(st, JSON.stringify({ state: 'showing', target: 'hud', hud_width_pct: 85 }));
        lv.power = () => ({ kw: 12, text: '12', col: theme.text });
        settings.v.show = 'map'; ov._read(); await wait(50); ov._tick && ov._tick(); await wait(30);
        assert(ov.shown(), 'the panel is up');
        list = ['DS_A', 'DS_B', 'DS_C', 'DS_D']; t += 10; ov._signsTick();
        const o = ov.roadSigns();
        assert(o.types.length < 4, JSON.stringify(o));
        settings.v.show = 'off'; fs.writeFileSync(st, JSON.stringify({ state: 'waiting', target: 'hud' })); ov._read(); await wait(50); ov._tick && ov._tick();
        t += 10; ov._signsTick();
        assert.strictEqual(ov.roadSigns().types.length, 4, 'all four with the panel gone');
    });

    ov.stop();
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
