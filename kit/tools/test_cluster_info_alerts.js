'use strict';
// Cluster Info's speed camera / bump test (apps/akakingj_cluster_info/alerts.js) against a fake navigation: the
// replies decoded (cameras, section cameras, school zones, keywords in a manoeuvre's text, coordinates and street
// names kept out of the log), the type names asked one at a time and then together, nothing asked without a route.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const A = require(path.join(ROOT, 'apps', 'akakingj_cluster_info', 'alerts.js'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };

const dist = (d, u) => ({ distance: d, unit: u || 'METER', rawDistance: Number(d) });
const reply = (events) => ({ GuidanceEventListError: 'NO_ERROR', viewContent: [{ eventsInView: events }] });
const cam = { speedCamera: { formattedDistance: dist('450'), speedLimitAssistInfo: { value: { reason: { speedLimitInfo: { speedLimit: 60, speedUnit: 'KM_P_H', speedingInfo: 'SPEED_OKAY' } } } }, position: { latitude: 37.1, longitude: 126.9 } } };
const section = { speedSectionCamera: { formattedDistance: dist('0'), isInsideEvent: true, averageSpeed: 80, length: 2000 } };
const turnBump = { intersection: { direction: 'RIGHT', formattedDistance: dist('120'), description: { elements: [{ text: '과속방지턱' }] } } };
const turnStreet = { intersection: { direction: 'LEFT', formattedDistance: dist('300'), description: { elements: [{ text: '시흥대로' }] } } };

check('a camera, a section camera inside, a bump in a turn\'s text, a plain street', () => {
    const r = A.decode(reply([cam, section, turnBump, turnStreet]));
    assert(r.ok);
    assert.deepStrictEqual(r.kinds, { speedCamera: 1, speedSectionCamera: 1, intersection: 2 });
    assert.strictEqual(r.alerts.length, 2, 'the turns are not alerts');
    assert.strictEqual(r.alerts[0].dist, '450 m'); assert.strictEqual(r.alerts[0].limit, 60);
    assert.strictEqual(r.alerts[1].inside, true); assert.strictEqual(r.alerts[1].avg, 80);
    assert.deepStrictEqual(r.words, [{ kind: 'intersection', text: '과속방지턱', dist: '120 m' }]);
});
check('an error reply or a reply without a view: not ok, said why', () => {
    assert.strictEqual(A.decode({ GuidanceEventListError: 3 }).error, 'rejected: 3');
    assert.strictEqual(A.decode({ GuidanceEventListError: 0 }).error, 'no view');
    assert.strictEqual(A.decode(null).error, 'no reply');
});

(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-'));
    const asked = [];
    let routing = false, events = [cam, turnStreet, turnBump];
    const signals = {
        proxy: () => Promise.resolve({}),
        call: (p, method, params) => {
            const types = params.viewConfigs[0].viewport.includedTypes;
            asked.push(types.slice());
            // the car takes two of the names, and the empty list
            if (types.length === 1 && !/SPEED_CAMERAS$|SCHOOL_ZONES$/.test(types[0])) return Promise.resolve({ GuidanceEventListError: 'INVALID_PARAMETER' });
            return Promise.resolve(reply(events));
        },
    };
    let tick = null;
    const realSI = global.setInterval;
    global.setInterval = (fn) => { tick = fn; return { unref() {} }; };
    const t = A.start({ dataDir: dir, signals }, null, { wanted: () => true, routing: () => routing });
    global.setInterval = realSI;
    const step = async (n) => { for (let i = 0; i < (n || 1); i++) { tick(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); } };

    await step(3);
    check('no route: nothing asked', () => { assert.strictEqual(asked.length, 0); assert.strictEqual(t.status().state, 'waiting for a route'); });
    routing = true;
    await step(A.TYPES.length);
    check('a route: each type name asked alone once', () => {
        assert.strictEqual(asked.length, A.TYPES.length);
        assert(asked.every((x) => x.length === 1));
        const st = t.status().types;
        assert.strictEqual(st.INCLUDE_SPEED_CAMERAS, 'accepted'); assert.strictEqual(st.INCLUDE_SCHOOL_ZONES, 'accepted');
        assert.strictEqual(st.INCLUDE_SPEED_CAMERA, 'rejected');
    });
    await step(3);
    check('then the accepted ones together, and the empty list in turn', () => {
        const rest = asked.slice(A.TYPES.length);
        assert(rest.some((x) => x.join() === 'INCLUDE_SPEED_CAMERAS,INCLUDE_SCHOOL_ZONES'), JSON.stringify(rest));
        assert(rest.some((x) => x.length === 0), JSON.stringify(rest));
    });
    const logTxt = fs.readFileSync(path.join(dir, 'cluster-info-alerts.log'), 'utf8');
    check('the log: the types, the camera (no coordinates), the bump text in full, the street as its length', () => {
        assert(/types INCLUDE_SPEED_CAMERAS accepted/.test(logTxt) && /types INCLUDE_SPEED_CAMERA rejected/.test(logTxt));
        assert(/alerts: speedCamera 450 m /.test(logTxt), logTxt);
        assert(!/latitude|longitude|37\.1|126\.9/.test(logTxt), 'no coordinates');
        assert(/text intersection "과속방지턱" 120 m/.test(logTxt));
        assert(!/시흥대로/.test(logTxt), 'a plain street name is not written');
    });
    check('the page: what came, the latest new ones', () => {
        const st = t.status();
        assert(st.replies > 0 && st.kinds.speedCamera > 0);
        assert(st.last.some((l) => /speedCamera 450 m 60/.test(l)) && st.last.some((l) => /과속방지턱/.test(l)), JSON.stringify(st.last));
    });
    const n = asked.length;
    routing = false;
    await step(2);
    check('the route over: no more asking, said in the log', () => {
        assert.strictEqual(asked.length, n);
        assert(/route over/.test(fs.readFileSync(path.join(dir, 'cluster-info-alerts.log'), 'utf8')));
    });
    console.log(ok + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
