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

check('on when read, 10 s, a new one read in its place (one event\'s several together, at most 4) (2026-11-28)', () => {
    const tr = S.makeTracker();
    tr.add(['SPEED_LIMIT', 'GIVE_WAY'], 0);
    assert.deepStrictEqual(tr.current(0), ['GIVE_WAY']);
    tr.add(['SPEED_LIMIT'], 1000);                  // none of its own: nothing changes
    assert.deepStrictEqual(tr.current(2000), ['GIVE_WAY']);
    tr.add(['DS_TRAFFIC_JAM'], 3000);               // a new one: in its place
    assert.deepStrictEqual(tr.current(5000), ['DS_TRAFFIC_JAM']);
    tr.add(['DS_TRAFFIC_JAM'], 12000);              // read again: 10 s from then
    assert.deepStrictEqual(tr.current(21000), ['DS_TRAFFIC_JAM']);
    assert.deepStrictEqual(tr.current(22000), []);
    tr.add(['DS_A', 'DS_B', 'DS_C', 'DS_D', 'DS_E', 'DS_A'], 30000);
    assert.deepStrictEqual(tr.current(31000), ['DS_A', 'DS_B', 'DS_C', 'DS_D']);
});

check('no passing on the cluster: from its sign till its end sign, or 3 km driven since the sign (2026-11-28)', () => {
    const RS = require('../../shared/road_signs.js');
    ['NO_PASSING_SIGN', 'NO_OVERTAKING'].forEach((t) => assert(RS.npStart(t) && !RS.npEnd(t), t));
    ['NO_PASSING_END', 'END_OF_NO_PASSING', 'END_NO_PASSING_SIGN', 'END_OF_ALL_RESTRICTIONS', 'NO_OVERTAKING_CANCEL'].forEach((t) => assert(RS.npEnd(t) && !RS.npStart(t), t));
    ['SPEED_LIMIT', 'DS_TRAFFIC_JAM', 'GIVE_WAY'].forEach((t) => assert(!RS.npEnd(t) && !RS.npStart(t), t));
    const z = RS.makeZone(3);
    z.step(0, 60); assert(!z.on());
    z.add(['NO_PASSING_SIGN']); assert(z.on());
    for (let t = 1000; t <= 170000; t += 1000) z.step(t, 60);           // 170 s at 60 km/h: 2.83 km
    assert(z.on(), z.km());
    z.add(['NO_PASSING_SIGN']); assert(z.on() && z.km() === 0, 'read again: from there');
    for (let t = 171000; t <= 400000; t += 1000) z.step(t, 60);
    assert(!z.on(), '3 km on: gone');
    z.add(['NO_PASSING_SIGN']); z.step(500000, 0); z.step(900000, 0); assert(z.on(), 'standing: still on');
    z.step(1000000, 120); z.step(1010000, 120); assert(z.on() && Math.abs(z.km() - 2 * 120 * 2 / 3600) < 1e-9, 'a gap counts as 2 s');
    z.add(['DS_TRAFFIC_JAM']); assert(z.on());
    z.add(['END_OF_NO_PASSING']); assert(!z.on(), 'its end sign');
});

check('pictures: South Korea\'s own signs - the types the camera read get theirs; another warning 위험 ("!")', () => {
    assert.strictEqual(S.artOf('DS_SPLIPPERY_ROAD'), 'slippery');
    assert.strictEqual(S.artOf('DS_TRAFFIC_JAM'), 'traffic_jam');
    assert.strictEqual(S.artOf('DS_ANIMAL_CROSSING'), 'wild_animal');
    assert.strictEqual(S.artOf('DS_RIGHT_DOWNWARDS'), 'downhill');
    assert.strictEqual(S.artOf('GIVE_WAY'), 'give_way');
    assert.strictEqual(S.artOf('DS_LEFT_CURVE'), 'curve_left');
    assert.strictEqual(S.artOf('DS_CURVE_RIGHT'), 'curve_right');
    assert.strictEqual(S.artOf('DS_SPEED_BUMP'), 'speed_hump');
    assert.strictEqual(S.artOf('DS_UNEVEN_ROAD'), 'bumpy_road');
    assert.strictEqual(S.artOf('DS_TRAFFIC_LIGHTS'), 'traffic_lights');
    assert.strictEqual(S.artOf('DS_SOMETHING_NEW'), 'danger');
    // the regulatory ones before the warnings: no left turn is no bend
    assert.strictEqual(S.artOf('NO_LEFT_TURN'), 'no_left_turn');
    assert.strictEqual(S.artOf('NO_U_TURN'), 'no_u_turn');
    assert.strictEqual(S.artOf('NO_PARKING'), 'no_parking');
    assert.strictEqual(S.artOf('NO_STOPPING'), 'no_stopping');
    assert.strictEqual(S.artOf('ONE_WAY_STREET'), 'one_way');
    assert(S.wanted('NO_LEFT_TURN') && S.wanted('STOP') && !S.wanted('END_OF_NO_PASSING') && !S.wanted('SPEED_LIMIT_END') && !S.wanted('NONE'));
    // every name it can give has a picture, as high as BMW's limit sign (made for overlay.js SIGNS: h, wmax)
    const art = require(path.join(APP, 'sign_art.js'));
    assert.strictEqual(art.h, SIGNS.h, 'sign_art.js made for this size: tools/make_sign_art.py');
    assert.strictEqual(art.wmax, SIGNS.wmax);
    assert.strictEqual(art.art.slippery.h, SIGNS.h, 'a triangle as tall as the limit sign');
    assert(art.art.slippery.w >= 66 && art.art.slippery.w <= SIGNS.wmax, 'and wider: ' + art.art.slippery.w);
    assert(Math.abs(art.art.no_entry.w - SIGNS.h) <= 1 && art.art.no_entry.h === SIGNS.h, 'a round sign as big as the limit sign');
    const src = fs.readFileSync(path.join(APP, 'road_signs.js'), 'utf8');
    const block = src.slice(src.indexOf('const ART_OF'), src.indexOf('function artOf'));
    const names = new Set((block.match(/'([a-z_]+)'/g) || []).map((q) => q.slice(1, -1)));
    names.add('danger');
    assert(names.size > 20);
    names.forEach((n) => { const a = art.art[n]; assert(a, 'no picture ' + n); assert(a.h <= SIGNS.h && a.w <= SIGNS.wmax, n); });
});

const px = (cv, x, y) => { const i = (Math.round(y) * cv.w + Math.round(x)) * 4; return [cv.d[i], cv.d[i + 1], cv.d[i + 2], cv.d[i + 3]]; };
check('drawn: the sign\'s own colours, the ground around it clear (light on the HUD), each in its place in the row', () => {
    const size = S.signWidth('DS_ANIMAL_CROSSING'), gap = 8, box = { h: SIGNS.h }, cv = new Canvas(size + gap + S.signWidth('GIVE_WAY'), SIGNS.h + 2);
    S.drawSigns(cv, ['DS_ANIMAL_CROSSING', 'GIVE_WAY'], gap);
    const cnt = (x0, x1, f) => { let n = 0; for (let y = 0; y < cv.h; y++) for (let x = x0; x < x1; x++) if (f(px(cv, x, y))) n++; return n; };
    const red = (p) => p[3] > 200 && p[0] > 170 && p[1] < 70 && p[2] < 70, yellow = (p) => p[3] > 200 && p[0] > 200 && p[1] > 140 && p[2] < 80;
    const white = (p) => p[3] > 200 && p[0] > 220 && p[1] > 220 && p[2] > 220;
    assert(cnt(0, size, red) > 300 && cnt(0, size, yellow) > 300, 'warning sign');
    assert(cnt(size + gap, cv.w, red) > 300 && cnt(size + gap, cv.w, white) > 150 && cnt(size + gap, cv.w, yellow) < 20, 'give way');
    assert.strictEqual(px(cv, 1, 1)[3], 0); assert.strictEqual(px(cv, size - 2, 1)[3], 0);
    for (let y = 0; y < cv.h; y++) for (let x = size + 1; x < size + gap - 1; x++) assert.strictEqual(px(cv, x, y)[3], 0, 'gap');
    assert.strictEqual(cnt(0, size, white), 0, 'no white rim on the warning sign (a light outline on the HUD)');
    const one = (t) => { const c = new Canvas(SIGNS.wmax, box.h + 2); S.drawSigns(c, [t], 0); return Buffer.from(c.d).toString('base64'); };
    const all = ['DS_SPLIPPERY_ROAD', 'DS_TRAFFIC_JAM', 'DS_ANIMAL_CROSSING', 'DS_RIGHT_DOWNWARDS', 'DS_ROAD_WORKS', 'DS_NEW'].map(one);
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
        assert.deepStrictEqual(sg.current(), ['DS_TRAFFIC_JAM'], 'the signs still do (the new one in its place)');
        // any other service: as it was
        await sv.watch('de.bmw.dass.TrafficSignRecognition', '1', {}, log);
        assert.strictEqual(sig.watches.length, 2);
    });

    await acheck('the car\'s own list of sign types (its interface config): logged whole in lines the Logs keep, and on the page', async () => {
        // an interface config with the type's enumeration somewhere inside (its shape is the head unit's)
        const many = []; for (let i = 0; i < 40; i++) many.push('DS_SIGN_NUMBER_' + i);
        const cfg = { events: { TrafficSignRecognitionFrontCamera: { type: 'struct' } }, types: { E_TrafficSignType: { kind: 'enum',
            values: [{ name: 'SPEED_LIMIT', value: 0 }, { name: 'GIVE_WAY', value: 1 }, { name: 'NO_PASSING_SIGN', value: 2 }, { name: 'STOP', value: 3 },
                { name: 'DS_TRAFFIC_JAM', value: 4 }, { name: 'END_OF_NO_PASSING', value: 5 }].concat(many.map((n, i) => ({ name: n, value: 6 + i }))) },
            E_Unit: { kind: 'enum', values: [{ name: 'KM_H', value: 0 }, { name: 'MPH', value: 1 }] } } };
        assert.strictEqual(S.typeNames(cfg).length, 46);
        assert.deepStrictEqual(S.typeNames({ a: ['GIVE_WAY', 'DS_X'] }), ['GIVE_WAY', 'DS_X']);
        assert.deepStrictEqual(S.typeNames({ a: { GIVE_WAY: 1, DS_Y: 2 } }), ['GIVE_WAY', 'DS_Y']);
        assert.deepStrictEqual(S.typeNames({ units: ['KM_H', 'MPH'] }), []);
        const sig = fakeSignals(), lg = { lines: [], info(m) { this.lines.push(m); }, warn(m) { this.lines.push('WARN ' + m); } };
        // (and the sign services' definitions, once: the camera's and TrafficSignRecognition's; TrafficSignDisplayControl
        // not in this install)
        const tsrCfg = { events: { TrafficSignRecognition: { type: 'struct', members: ['presentClassLimitSpeed', 'presentNoPassing'] } },
            types: { E_NoPassing: { kind: 'enum', values: [{ name: 'NO_PASSING_INACTIVE' }, { name: 'NO_PASSING_ACTIVE' }] } } };
        const asked = [];
        const catFile = path.join(require('os').tmpdir(), 'np-catalog-' + process.pid + '.json');
        fs.writeFileSync(catFile, JSON.stringify({ interfaces: { 'de.bmw.navigation.ADAS': { fields: { speedLimitProfileNavGraph2: {}, noPassingProfile: {} } },
            'de.bmw.navigation.EHorizon': { events: { horizonUpdate: {} } }, 'de.bmw.infotainment.vehicle.CDS': { fields: { statusHandBrake: {} } } } }));
        const sg = S.startSigns({ signals: sig }, lg, { kitDir: kitWith([CAM]), catalog: catFile, loadConfig: (i) => {
            asked.push(i);
            if (i === S.CAM_IFACE) return cfg;
            if (i === 'de.bmw.dass.TrafficSignRecognition') return tsrCfg;
            throw new Error('not declared');
        } });
        await wait();
        const st = sg.status();
        assert.strictEqual(st.carTypes.length, 46);
        assert.strictEqual(st.drawn, 43, 'all but the limit, no passing and its end');
        assert.strictEqual(st.asDanger, 40, 'the 40 unknown DS_ ones (jam, stop, give way have their own)');
        const typeLines = lg.lines.filter((l) => /^road signs: types \d+: /.test(l));
        assert(typeLines.length > 1 && typeLines.every((l) => l.length <= 200), 'chunked: ' + typeLines.map((l) => l.length));
        const back = typeLines.map((l) => l.replace(/^road signs: types \d+: /, '')).join(', ').split(', ');
        assert.deepStrictEqual(back, st.carTypes, 'the whole list, in order');
        assert.deepStrictEqual(asked, [S.CAM_IFACE, 'de.bmw.dass.TrafficSignRecognition', S.CAM_IFACE, 'de.bmw.dass.driverassistanceapplications.TrafficSignDisplayControl', 'de.bmw.infotainment.displaydataserver.DisplayDataServer']);
        assert(lg.lines.indexOf('sign definitions: TrafficSignRecognition, 15 names') >= 0, lg.lines.filter((l) => /definitions/.test(l)).join(' | '));
        assert(/presentNoPassing.*NO_PASSING_ACTIVE/.test(lg.lines.filter((l) => /^sign definitions: TrafficSignRecognition \d+: /.test(l)).join(' ')), 'its fields and their values');
        assert(lg.lines.some((l) => /^sign definitions: TrafficSignDisplayControl not in this install \(not declared\)$/.test(l)));
        assert(lg.lines.filter((l) => /^sign definitions: /.test(l)).every((l) => l.length <= 200));
        // the catalog's services and members named for no passing or the map's look ahead (here: none readable)
        assert(lg.lines.indexOf('catalog no passing: 2 services') >= 0, lg.lines.filter((l) => /catalog/.test(l)).join(' | '));
        assert(lg.lines.indexOf('catalog no passing 1: de.bmw.navigation.ADAS: noPassingProfile') >= 0);
        assert(lg.lines.indexOf('catalog no passing 2: de.bmw.navigation.EHorizon: horizonUpdate') >= 0);
        fs.unlinkSync(catFile);
        // no config: said once, nothing else
        const sg2 = S.startSigns({ signals: fakeSignals() }, lg, { kitDir: kitWith([CAM]), loadConfig: () => { throw new Error('no SOME/IP config'); } });
        await wait();
        assert.deepStrictEqual(sg2.status().carTypes, []);
    });

    check('read only: signs.js and road_signs.js call no method and write nothing', () => {
        const src = fs.readFileSync(path.join(APP, 'signs.js'), 'utf8') + fs.readFileSync(path.join(APP, 'road_signs.js'), 'utf8');
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
        assert(l.x + l.w <= HUD_SEEN.x + HUD_SEEN.w, 'the row ends on the glass');
        assert.strictEqual(l.px, 1);
        ov._signsTick(); assert.strictEqual(l.px, 1);
        list = ['DS_ANIMAL_CROSSING', 'GIVE_WAY']; ov._signsTick(); assert.strictEqual(l.px, 2);
        assert.deepStrictEqual(ov.roadSigns(), { shown: true, types: ['DS_ANIMAL_CROSSING', 'GIVE_WAY'] });
        // as many as fit on the glass: four triangles at the limit sign's size, not five
        list = ['DS_A', 'DS_B', 'DS_C', 'DS_D', 'DS_E']; ov._signsTick();
        assert.deepStrictEqual(ov.roadSigns().types, ['DS_A', 'DS_B', 'DS_C', 'DS_D']);
        assert(SIGNS.x + 4 * S.signWidth('DS_A') + 3 * SIGNS.gap <= HUD_SEEN.x + HUD_SEEN.w);
        list = ['DS_ANIMAL_CROSSING', 'GIVE_WAY']; ov._signsTick();
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
        list = ['DS_A', 'DS_B', 'DS_C', 'DS_D', 'DS_E']; t += 10; ov._signsTick();
        const o = ov.roadSigns();
        assert(o.types.length < 4, JSON.stringify(o));
        settings.v.show = 'off'; fs.writeFileSync(st, JSON.stringify({ state: 'waiting', target: 'hud' })); ov._read(); await wait(50); ov._tick && ov._tick();
        t += 10; ov._signsTick();
        assert.strictEqual(ov.roadSigns().types.length, 4, 'all that fit on the glass with the panel gone');
    });

    ov.stop();
    console.log(ok + ' passed');
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
