'use strict';
/**
 * Cluster Info - a small panel of live values over the Waze map in the instrument cluster or on the HUD
 * (Waze on cluster), plus turn signal arrows on the HUD. For any car:
 *
 *   - its own values from the car: engine oil and coolant temperature (CDS statusEngineTemperature), the turn
 *     signals (body Light), day / night (to dim the HUD extras), the driver profile (each driver keeps their
 *     own settings);
 *   - values other apps provide through /dev/shm/cluster-info (providers.js): eDrive Live gives the battery's
 *     power (the kW meter and its bar) and the battery temperature; any app can add its own the same way.
 *
 * The panel itself is overlay.js; this page shows what it shows now, larger, and whether each source works.
 */
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const Car = require('./kit/car');
const { startOverlay, drawBadge, badgeRect, mapRect } = require('./overlay');
const { startProviders, DIR } = require('./providers');
const RSG = require('./road_signs');
const IND = require('./indicators');
const { startBlindSpot } = require('./blindspot');
const { startHvSoc } = require('./hvsoc');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { startAdasProbe } = require('./adas_probe');
const { startSurvey, hudNow } = require('./survey');
const { startResearch } = require('./research');
const { startSigns, SAMPLE: SIGN_SAMPLE } = require('./signs');
const logs = require('./logs');

const W = 1600, H = 520;
const GO = '#2fd27a';
const IDLE_KW = 0.3;
const VALUES = {
    battery: { label: 'BATT', what: 'battery temperature' },
    oil: { label: 'OIL', what: 'engine oil temperature' },
    coolant: { label: 'COOL', what: 'coolant temperature' },
    soc: { label: 'SOC', what: 'battery charge (%)' },
    // the engine, from the car's own signals (no diagnostics): boost (the sport display's), speed, torque
    boost: { label: 'BOOST', what: 'boost pressure', engine: true },
    rpm: { label: 'RPM', what: 'engine speed', engine: true },
    torque: { label: 'NM', what: 'engine torque', engine: true },
};

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const car = new Car(ctx, ['temps', 'rpm', 'torque']);
        const providers = startProviders(log);
        let hv = null;      // (below: the battery unit's charge)
        /* The car's state (kit/awake.js): told it is switched off, the panel asks no app for anything - their reads go
         * through the car's gateway and kept a locked car from sleeping (Nov 10 2026). */
        const awake = require('./kit/awake').watch(ctx, log);
        const live = { indicator: 'off', night: null, profile: null, raw: {} };
        const sigStatus = {};
        const one = (v, key) => {
            if (!v || typeof v !== 'object') return undefined;
            if (key in v) return v[key];
            for (const k of Object.keys(v)) { const r = one(v[k], key); if (r !== undefined) return r; }
            return undefined;
        };
        const watch = (iface, handlers, what, opts, instance) => ctx.signals.watch(iface, instance || '1', handlers, log, opts)
            .then((s) => { sigStatus[what] = s.error ? 'error: ' + s.error : 'subscribed'; log.info(what + ' ' + sigStatus[what]); return s; });

        /* ---------- units ---------- */
        const F = () => settings.get('tempUnit') === 'f';
        const temp = (c) => (G.isNum(c) ? G.fmt(F() ? c * 9 / 5 + 32 : c, 0) + '°' : '--');

        /* ---------- turn signals: either field may be the one the car fills, so both are watched ----------
         * controlIndicateDirection: 1 / 3 tap / steady left, 2 / 4 right, 8 both (hazards), 0 off; else
         * activeFunctionIndicateDirection, the function blinking: 7 / 9 / 18 / 20 / 22 left, 8 / 10 / 19 / 21 / 23
         * right, hazards and alarms both, 0 off. The raw values show on this app's page. */
        const onIndicators = (what) => (v) => {
            live.raw[what] = JSON.stringify(v);
            const c = one(v, 'controlIndicateDirection'), a = one(v, 'activeFunctionIndicateDirection');
            const dir = IND.direction(c, a);
            if (dir) { if (dir !== live.indicator) log.info('turn signals: ' + dir + ' (' + what + ' ' + c + ' / ' + a + ')'); live.indicator = dir; }
        };
        watch('de.bmw.body.Light', {
            StatusFunctionsIndicators: onIndicators('indicators'),
            StatusFunctionsIndicators2: onIndicators('indicators 2'),
        }, 'turn signals');
        // day or night (the car's light sensor): 1 day, 2 night, 0 unchanged
        watch('de.bmw.infotainment.vehicle.Vehicle', {
            statusDayNightChangeOver: (v) => {
                live.raw['day / night'] = JSON.stringify(v);
                const n = IND.night(one(v, 'dayNightChangeOver'));
                if (n !== null) live.night = n;
            },
        }, 'day / night');

        /* ---------- settings per driver profile ----------
         * The head unit's current user account (SessionManager.currentUserAccountReference: a getter only, read
         * every 5 s). Each driver keeps their own PROFILE_KEYS in profiles.json: a change is kept for the driver at
         * the time, and a driver seen again gets theirs back; one seen for the first time keeps what is set. */
        const PROFILE_KEYS = ['show', 'place', 'slot1', 'slot2', 'slot3', 'bar', 'turnSignals', 'hudBrightness', 'nightDim'];
        const PROFILE_FILE = path.join(ctx.dataDir, 'profiles.json');
        // (1.14.3) the panel "Where the Waze map is" is no more: one saved so is on the HUD
        if (settings.get('show') === 'map') settings.set('show', 'hud');
        let profiles = {}, applying = false;
        try { profiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')) || {}; } catch (e) { /* none yet */ }
        const saveProfiles = () => { try { fs.writeFileSync(PROFILE_FILE, JSON.stringify(profiles)); } catch (e) { log.warn('profiles: ' + e); } };
        const snapshot = () => { const o = {}; PROFILE_KEYS.forEach((k) => { o[k] = settings.get(k); }); return o; };
        function onProfile(id) {
            if (!id || id === live.profile) return;
            live.profile = id;
            const saved = profiles[id];
            if (saved) {
                applying = true;
                if (saved.show === 'map') saved.show = 'hud';      // (1.14.3: no Waze map place any more)
                PROFILE_KEYS.forEach((k) => { if (saved[k] !== undefined && saved[k] !== settings.get(k)) settings.set(k, saved[k]); });
                applying = false;
                log.info('driver profile ' + id + ': their settings');
            } else {
                profiles[id] = snapshot();
                saveProfiles();
                log.info('driver profile ' + id + ': first seen, the current settings kept for them');
            }
        }
        settings.onChange((k, v) => {
            if (applying || !live.profile || PROFILE_KEYS.indexOf(k) < 0) return;
            profiles[live.profile] = Object.assign(profiles[live.profile] || snapshot(), { [k]: v });
            saveProfiles();
        });
        watch('de.bmw.infotainment.personalization.SessionManager', {
            currentUserAccountReference: (v) => {
                const id = typeof v === 'string' ? v : v && (v.value || v.currentUserAccountReference);
                if (id) onProfile(String(id));
            },
        }, 'driver profile', { pollMs: 5000 }, 'de.bmw.infotainment.personalization.SessionManager');

        /* ---------- boost, from the car's sport display signal ----------
         * FES statusSwitchDriveDynamicSport2: displayBoostPressure over atmosphere in the car's pressure unit, as
         * BMW's sport display shows it: hundredths of a bar (or 1 kPa) a step (tenths read ten times too high against
         * the engine unit and M Vitals, issue #7), but 0.1 psi a step on a car set to psi (1.8.2; idrive7-apps issue
         * #186: 20 psi, raw 200, read as 2.0 bar, 29 psi); 254 and up: none. Kept in bar. */
        let carPress = null;
        watch('de.bmw.infotainment.vehicle.Vehicle', {
            statusNewCurrentUnitsStatusExt: (v) => {
                const u = one(v, 'unitOfMeasurementAirPressure'), n = u && typeof u === 'object' ? (u.name || u.value) : u;
                const p = ({ 1: 'BAR', 2: 'KPA', 3: 'PSI' })[n] || (/BAR|KPA|PSI/.test(String(n)) ? String(n).match(/BAR|KPA|PSI/)[0] : null);
                if (p && p !== carPress) { carPress = p; log.info('car pressure unit: ' + p); }
            },
        }, 'units', { pollMs: 60000 });
        watch('de.bmw.infotainment.drivingexcitement.FES', {
            statusSwitchDriveDynamicSport2: (v) => {
                live.raw.sport = JSON.stringify(v);
                const b = one(v, 'displayBoostPressure');
                if (typeof b === 'number' && b >= 0 && b < 254) { live.boost = carPress === 'PSI' ? b * 0.1 / 14.5038 : b / 100; live.boostT = Date.now(); }
            },
        }, 'boost', { pollMs: 1000 });

        /* ---------- what the panel shows ---------- */
        /** The three slots in order: 'power' (the kW meter) or a value's name; none and repeats left out. */
        const slots = () => [settings.get('slot1'), settings.get('slot2'), settings.get('slot3')]
            .filter((k, i, a) => (k === 'power' || VALUES[k]) && a.indexOf(k) === i);
        const chosen = () => slots().filter((k) => k !== 'power');
        /** A value now, in deg C: the car's own (oil, coolant) first, else a provider's; { c, src } or null. */
        function valueNow(name) {
            const d = car.data();
            // the engine's (car signals): text in the panel's units. Pressure: Settings > Pressure unit, or with
            // the temperature unit (psi with °F, bar with °C)
            if (VALUES[name] && VALUES[name].engine) {
                if (name === 'boost') {
                    if (!G.isNum(live.boost) || Date.now() - (live.boostT || 0) > 5000) return null;
                    const pu = ['psi', 'bar', 'kpa'].indexOf(settings.get('pressUnit')) >= 0 ? settings.get('pressUnit')
                        : settings.get('tempUnit') === 'c' ? 'bar' : 'psi';
                    const text = pu === 'bar' ? live.boost.toFixed(2) : pu === 'kpa' ? String(Math.round(live.boost * 100)) : (live.boost * 14.5038).toFixed(1);
                    return { text, label: 'BOOST ' + (pu === 'kpa' ? 'kPa' : pu), src: 'car signal (sport display)' };
                }
                if (name === 'rpm') return G.isNum(d.rpm) && !d.demo ? { text: String(Math.round(d.rpm / 50) * 50), src: 'car signal' } : null;
                if (name === 'torque') {
                    if (!G.isNum(d.torque) || d.demo) return null;
                    // Settings > Torque unit: Nm, kgm (to a tenth) or lb-ft
                    const tu = settings.get('torqueUnit');
                    if (tu === 'kgm') return { text: (d.torque / 9.80665).toFixed(1), label: 'KGM', src: 'car signal' };
                    if (tu === 'lbft') return { text: String(Math.round(d.torque * 0.737562)), label: 'LB-FT', src: 'car signal' };
                    return { text: String(Math.round(d.torque)), src: 'car signal' };
                }
            }
            if ((name === 'oil' || name === 'coolant') && !d.demo && G.isNum(d[name])) return { c: d[name], src: 'car signal' };
            const p = providers.value(name);
            if (p) return { c: p.c, text: typeof p.pct === 'number' ? Math.round(p.pct) + '%' : p.text, label: p.label, src: p.app };
            // (1.8.1) no app shares the charge: the battery unit's own (hvsoc.js)
            if (name === 'soc' && hv && G.isNum(hv.value()) && !d.demo) return { text: Math.round(hv.value()) + '%', src: 'battery unit' };
            return null;
        }
        const tempCol = (t, name, c) => {
            if (!G.isNum(c)) return t.dim;
            if (name === 'battery') return c < 5 ? t.cold : c > 45 ? t.crit : c > 38 ? t.warn : t.text;
            if (name === 'soc') return t.text;
            // (as Cluster Layouts' and Centre's: cold under 60 °C (the gearbox oil 50), the oil amber up to Oil warm at,
            // too hot from Settings: Oil / Coolant / Gearbox is too hot at (130 / 118 / 115, the Car profile's when it
            // sets them); anything else as before)
            const hot = (k, d) => { const v = Number(settings.get(k)); return isFinite(v) && v > 0 ? v : d; };
            const T = { oil: [60, hot('hotOil', 130)], coolant: [60, hot('hotCoolant', 118)], gearbox: [50, hot('hotGearbox', 115)] }[name];
            if (!T) return c >= 125 ? t.warn : c < 60 ? (t.cold || t.text) : t.text;
            if (c >= T[1]) return t.crit || t.warn;
            if (c < T[0]) return t.cold || t.text;
            const warm = Number(settings.get('warmOil'));
            return name === 'oil' && isFinite(warm) && c < warm ? t.warn : t.text;
        };
        const src = {
            power(t) {
                if (slots().indexOf('power') < 0) return null;
                const p = providers.power();
                if (!p) return null;
                const v = p.kw, a = Math.abs(v);
                return { kw: v, text: (v < -IDLE_KW ? '-' : '') + G.fmt(a, a < 10 ? 1 : 0), col: p.old ? t.dim : v < -IDLE_KW ? GO : a >= 60 ? t.warn : t.text };
            },
            /** The thin kW bar along the bottom (setting underline: 'cluster' on the cluster only, 'on' also on the
             *  HUD): { kw } whenever an app provides the power, below all three slots, even with no kW meter among them. */
            under(target) {
                if (!this.underOn(target)) return null;
                const p = providers.power();
                return { kw: p && G.isNum(p.kw) ? p.kw : null };
            },
            /** Whether the thin kW bar shows on this target (its strip under the panel is kept while it does). */
            underOn(target) {
                const us = settings.get('underline');
                return us === 'on' || (us === 'cluster' && target !== 'hud');
            },
            limits() { const p = providers.power(); return p ? { outMax: p.outMax, inMax: p.inMax } : null; },
            extras(t) {
                return chosen().map((k) => {
                    const v = valueNow(k);
                    // (the engine's values - boost, rpm, torque - have no temperature: plain text while they come, as bright
                    // as the oil's; through tempCol they were dim grey beside a white oil, 2026-11-15)
                    const col = k === 'soc' || VALUES[k].engine ? (v ? t.text : t.dim) : tempCol(t, k, v && v.c);
                    return { slot: slots().indexOf(k), label: (v && v.label) || VALUES[k].label, text: v ? (G.isNum(v.c) ? temp(v.c) : v.text || '--') : '--', col: col };
                });
            },
            /** The kW meter's slot (0-2 among the slots in use; values with a lower slot go before it). */
            powerAt() { return Math.max(0, slots().indexOf('power')); },
            /** The car locked and left: the panel comes off (nobody sees it, and the cluster can sleep). */
            parked: () => awake.parked(),
            keepFast() { if (!awake.off()) providers.want({ power: slots().indexOf('power') >= 0 || (settings.get('underline') || 'off') !== 'off', values: chosen() }); },
            indicator: () => live.indicator,
            night: () => live.night === true,
        };
        // the lane change warning: the door mirror lamps, read from the BDC (blindspot.js, read only: 22 D3 47) while
        // it can show: the setting on, the panel not off, the car not locked and left (1.6.25)
        // (read only while the sign can show: not while another app holds the HUD, so Redline and this never both poll the BDC)
        let overlay = null, overlayError = null;
        // (1.8.1) one read-only diagnostic link for the blind spot and the battery's charge: one request at a time
        const link = new ReadOnlyDiag(ctx.signals, log, { silentAfter: 5 });
        let linkError = null;
        link.init().catch((e) => { linkError = String(e); log.warn('diagnostic link: ' + e); });
        // the battery's charge from the battery unit itself, for the SOC slot while no app shares one (hvsoc.js)
        hv = startHvSoc(link, log, { want: () => chosen().indexOf('soc') >= 0 && settings.get('show') !== 'off' && awake.on(),
            shared: () => !!providers.value('soc') || !!providers.power() });
        const bs = startBlindSpot(ctx, log, { link, want: () => settings.get('blindSpot') !== 'off' && settings.get('show') !== 'off' && !awake.parked()
            && !(overlay && overlay.lcwWanted && !overlay.lcwWanted()) });
        src.blindSpot = () => bs.state();
        /* ---------- the Test log (1.13.0, the owner's: two logs - Logs for how the app works, Test log for development and
         * checks): [Test log] starts the checks (read only) - the driving assistant check (adas_probe.js: the assisted
         * driving view's sources, the HUD's data, the catalog), the signal survey (survey.js: what the car's catalog had of
         * the sign services when the app was installed, to 30 min) and the recorder of the sign services' every field
         * (research.js); pressed again, they end and its codes show. The sign services' definitions are read once at the
         * start (signs.js). Till 1.12.x: Settings > Driving assistant check (Signals, Catalog, Signal survey) and
         * [Start survey]. */
        let survey = null, testNote = '', testShown = 0;
        const testOn = () => !!(survey && survey.running());
        const research = startResearch({ kmh: () => (adas ? hudNow(adas.hudValue()).kmh : null) });
        let adas = null;
        try { adas = startAdasProbe(ctx, log, { want: () => testOn(), onHud: (v, t) => { if (testOn()) research.onHud(v, t); } }); } catch (e) { log.warn('driving assistant check: ' + e); }
        /* ---------- the road signs the camera reads, on the HUD (signs.js, 1.12.0) ----------
         * the camera's sign event, declared as the survey's (only where the car's catalog has it), subscribed from the
         * start: it comes once a sign, not at a rate. Settings > HUD > Road signs: on, sample (three signs, to see the
         * place), off. The survey reads the same event through this subscription. */
        let signs = null;
        try { signs = startSigns(ctx, log); } catch (e) { log.warn('road signs: ' + e); }
        /* a speed camera ahead first (camNow, from the route's events below: nav.js camera()) */
        let camNow = null;
        src.roadSigns = () => (settings.get('roadSigns') === 'sample' ? SIGN_SAMPLE.slice()
            : (camNow ? [RSG.CAM_TYPE[camNow.cam]] : []).concat(signs ? signs.current() : []));
        try {
            survey = startSurvey(ctx, log, { hud: () => (adas ? adas.hudValue() : null), dir: ctx.dataDir || '.', signals: signs ? signs.signalsFor(ctx.signals) : undefined,
                onValue: (iface, member, v, t) => research.onValue(iface, member, v, t) });
        } catch (e) { log.warn('signal survey: ' + e); }
        const KO = /^ko/.test((() => { try { return require('./kit/i18n').getLanguage(); } catch (e) { return 'en'; } })());
        /* [Show on the HUD] (1.14.3, the owner's: the panel on the HUD or off from the page's left column; "Where the Waze
           map is" gone from Settings > Show the panel - not used: a setting or a driver's saved one of it is the HUD) */
        let hudShown = null;
        const hudLabel = () => {
            const lab = settings.get('show') === 'off' ? 'Show on the HUD: off' : 'Show on the HUD: on';
            if (lab === hudShown) return Promise.resolve();
            hudShown = lab;
            return ui.text('BTN_HUD', lab);
        };
        ui.onClick('BTN_HUD', () => { settings.set('show', settings.get('show') === 'off' ? 'hud' : 'off'); hudLabel(); return render(); });
        settings.onChange((k) => { if (k === 'show') hudLabel(); });
        hudLabel();
        let shownLabel = null;
        const testLabel = () => {
            const lab = testOn() ? 'Test log: end and show' : 'Test log';
            if (lab === shownLabel) return Promise.resolve();
            shownLabel = lab;
            return ui.text('BTN_TEST', lab);
        };
        testLabel();
        /* ---------- directions on the HUD (Settings > Directions on the HUD), as Redline's (nav.js, navlog.js) ----------
         * BMW's guidance service, read only: the next turn, its distance, the street and the lanes, the same way for
         * CarPlay, Android Auto and BMW's navigation (only apps that hand the car their turns: Waze over CarPlay doesn't).
         * The event list is asked only while they can show (the panel on the HUD: overlay.js); never stops the app. */
        let tracker = null, navError = null;
        const navMode = () => (settings.get('hudNav') === 'near' ? 'near' : settings.get('hudNav') === 'off' ? 'off' : 'route');
        const navWanted = () => navMode() !== 'off' && !!(overlay && overlay.navCan());
        // speed cameras (1.14.0): the route's events asked for them too, while the HUD's signs are on (the cluster's
        // apps read them from here: camera.json)
        const camWanted = () => settings.get('roadSigns') !== 'off';
        try {
            const Nav = require('./nav');
            const probe = require('./navlog').start(ctx, log, (s, f, v, at) => {
                if (tracker) tracker.tap(s, f, v, at);
                // (1.14.10) the route's events to the Test log while it runs: whether a phone's route (CarPlay) brings speed cameras
                if (testOn()) { try { research.onRoute(s, f, v); } catch (e) { /* the log's own */ } }
            },
                { wanted: () => navWanted() || camWanted(), routing: () => !!tracker && tracker.routing(), onGlass: () => !!(overlay && overlay.nav().shown) });
            tracker = Nav.start(ctx, log, probe);
        } catch (e) { navError = String(e); log.warn('directions not started: ' + e); }
        src.nav = () => (tracker && navMode() !== 'off' ? tracker.view(navMode()).show : null);
        /* the speed camera to show, twice a second; shared with AK Cluster Layouts and AK Cluster ID8 in the providers'
           folder (camera.json, road_signs.js; removed when there's none, so it never outlives the camera) */
        const CAM_FILE = path.join(DIR, 'camera.json');
        let camShared = false;
        const camTimer = setInterval(() => {
            try {
                camNow = tracker && camWanted() ? tracker.camera() : null;
                if (camNow) {
                    const tmp = CAM_FILE + '.' + process.pid + '.tmp';
                    fs.writeFileSync(tmp, JSON.stringify({ v: 1, t: Date.now(), app: 'Cluster Info', camera: { type: RSG.CAM_TYPE[camNow.cam], m: camNow.m, inside: camNow.inside } }), { mode: 0o644 });
                    fs.renameSync(tmp, CAM_FILE);
                    camShared = true;
                } else if (camShared) { camShared = false; fs.unlinkSync(CAM_FILE); }
            } catch (e) { camShared = false; }
        }, 500);
        if (camTimer.unref) camTimer.unref();
        try { overlay = startOverlay(ctx, src); } catch (e) { overlayError = String(e); log.warn('overlay: ' + e); }

        /** The page's rows, [name, text]: what each source does now (on the page and in the logs). */
        function statusLines() {
            const ov = overlay && overlay.status ? overlay.status() : null, pw = src.power(ctx.theme());
            const st = (k) => sigStatus[k] || 'waiting';
            const provs = providers.list(), pnames = Object.keys(provs).map((k) => provs[k]);
            return [
                ['Shown', settings.display('show')
                    + '   ·   Waze map: ' + (ov ? ov.map : '--') + '   ·   Cluster renderer: ' + (overlayError ? 'error: ' + overlayError : ov ? ov.renderer : 'not started')
                    + '   ·   Directions: ' + (navError ? 'error: ' + navError : navMode() === 'off' ? 'off' : !tracker || !tracker.routing() ? 'no route' : overlay && overlay.nav().shown ? 'on the HUD' : 'route, not shown (panel not on the HUD)')],
                ['Apps providing', (pnames.length ? pnames.join(', ') : 'none') + (pw ? '   ·   power ' + pw.text + ' kW' : '') + '   (folder ' + DIR + ')'],
                ['Values', (chosen().map((k) => { const v = valueNow(k); return VALUES[k].label + ' ' + (v ? (G.isNum(v.c) ? temp(v.c) : v.text) + ' from ' + v.src : 'no reading'); }).join('   ·   ') || 'none chosen')
                    + (chosen().indexOf('soc') >= 0 && hv ? '   ·   battery unit: ' + hv.status() : '') + (linkError ? '   ·   diagnostic link: ' + linkError : '')],
                ['Lane change warning', settings.get('blindSpot') === 'off' ? 'off (settings)' : (() => { const b = bs.status();
                    return (b.refused ? 'the BDC has no D347 (' + b.refused + ')' : b.left !== null ? 'mirror lamps: left ' + b.left + ', right ' + b.right : b.reading ? 'no answer yet' : 'not read now (panel off or parked)')
                        + '   ·   BDC 22 D347: ' + b.good + ' of ' + b.reads + ' answered   ·   link ' + b.link; })()],
                ['Road signs', settings.get('roadSigns') === 'off' ? 'off (settings)' : (() => { const g = signs ? signs.status() : null, o = overlay && overlay.roadSigns ? overlay.roadSigns() : null;
                    return (g ? 'camera: ' + g.state + (g.carTypes ? '   ·   this car\'s camera knows ' + g.carTypes.length + ' types, ' + g.drawn + ' drawn' + (g.asDanger ? ' (' + g.asDanger + ' as "!")' : '') : '') + '   ·   ' + g.seen + ' read' + (Object.keys(g.types).length ? ' (' + Object.keys(g.types).map((k) => k + ' ' + g.types[k]).join(', ') + ')' : '') : 'not started')
                        + (settings.get('roadSigns') === 'sample' ? '   ·   showing the sample' : '') + (o && o.shown ? '   ·   on the HUD: ' + o.types.join(', ') : '')
                        + '   ·   speed camera: ' + (camNow ? camNow.cam + (camNow.m !== null ? ' ' + camNow.m + ' m' : '') + (camNow.inside ? ', inside' : '') : 'none (from BMW\'s route)'); })()],
                ['Turn signals', st('turn signals') + (live.indicator !== 'off' ? ' (now ' + live.indicator + ')' : '')
                    + '   ·   Day / night: ' + (live.night === null ? st('day / night') + ', none received' : live.night ? 'night' : 'day')
                    + '   ·   Driver profile: ' + (live.profile || (st('driver profile') === 'subscribed' ? 'none read yet' : st('driver profile')))],
            ];
        }

        /* ---------- Logs: this app's own, as QR codes to photograph and a file on a USB stick (logs.js) ---------- */
        const dataDir = ctx.dataDir || '.';
        /* [Logs]: how this app works - its settings, its page, the panel's state, the turn signals' raw values, the
           directions' log and its own log (1.13.0: the checks' records are the Test log's) */
        function logBundle(full) {
            const n = (short, long) => (full ? long : short), ov = overlay && overlay.status ? overlay.status() : null;
            const sets = {};
            (settings.schema || []).forEach((x) => { sets[x.key] = settings.get(x.key); });
            const sections = [
                ['settings', JSON.stringify(sets)],
                ['page', statusLines().map(([k, v]) => k + ': ' + v).join('\n')],
                ['overlay', JSON.stringify(ov)],
                ['turn signals and day / night (raw)', JSON.stringify(live.raw)],
                ['directions log', logs.tail(path.join(dataDir, 'cluster-info-nav.log'), n(15, 1500))],
                ['this app\'s log', logs.tail(path.join(dataDir, 'akakingj_cluster_info.log'), n(40, 600))],
            ];
            if (full) sections.push(['cluster-render log', logs.tail(logs.RENDER_LOG, 1500)]);
            return logs.bundle(((ctx.spec && ctx.spec.title) || 'Cluster Info') + ' ' + ((ctx.spec && ctx.spec.version) || ''), sections);
        }
        /* [Test log]: the checks - the sign services' definitions, types and the catalog's no passing services (read at
           the start), the sign services' every field and the HUD data's no passing fields as they changed, the signal
           survey's record (as much as fits in 15 codes, the rest in the file), the driving assistant check */
        function testBundle(full) {
            const n = (short, long) => (full ? long : short), st = adas ? adas.status() : null, rec = survey && survey.last();
            const sections = [
                ['page', statusLines().map(([k, v]) => k + ': ' + v).join('\n')],
            ].concat(research.sections(), [
                ['speed limit (HUD data), last changes', st ? st.sli.changes.map((c) => new Date(c.at).toISOString().slice(11, 19) + ' ' + c.line).join('\n') : ''],
                // (1.14.5: the catalog's lists left out - the owner's car's catalog is known whole now; in the file as before)
                ['driving assistant check', st ? JSON.stringify(full ? st : { sources: st.sources, hud: st.hud }) : 'not started'],
                ['driving assistant log', logs.tail(path.join(dataDir, 'cluster-info-adas.log'), n(20, 3000))],
            ]);
            if (rec) sections.splice(2, 0, ...(full ? survey.sections(0) : survey.fitted(sections, 15, logs.codeCount)));
            return logs.bundle(((ctx.spec && ctx.spec.title) || 'Cluster Info') + ' ' + ((ctx.spec && ctx.spec.version) || '') + ' test', sections);
        }
        const logPages = logs.pager(logBundle, dataDir, log, 'info');
        const testPages = logs.pager(testBundle, dataDir, log, 'info-test', { en: 'Test log', ko: '테스트 로그' });
        /* [Mark] (1.14.8, the owner's: to line a moment of the drive up with the log - BMW's map opened, the driving
           assistant on or off): a numbered line in the Test log's sections while its checks run; else nothing */
        let markedAt = 0;
        ui.onClick('BTN_MARK', () => {
            if (!testOn() || testPages.active() || logPages.active()) return render();
            research.mark(Date.now()); markedAt = Date.now();
            return render();
        });
        ui.onClick('BTN_LOGS', () => { testPages.close(); logPages.press(); return render(); });
        /* [Test log]: start the checks; pressed while they run (or after they ended by themselves, 30 min): they end and
           the codes show, a page a press */
        ui.onClick('BTN_TEST', () => {
            logPages.close();
            testNote = '';
            const last = survey && survey.last();
            if (testPages.active()) testPages.press();
            else if (testOn()) { survey.end('button'); testShown = (survey.last() || {}).endedAt || 1; testPages.press(); }
            else if (last && last.endedAt && last.endedAt !== testShown) { testShown = last.endedAt; testPages.press(); }
            else {
                const why = survey ? survey.start() : (KO ? '신호 조사를 시작할 수 없습니다' : 'the signal survey could not start');
                if (why) { testNote = (KO ? '조사를 시작하지 못해 지금까지의 기록만 보여줍니다: ' : 'The checks did not start, so this is what there is: ') + why; testPages.press(); }
                else research.reset();
            }
            testLabel();
            return render();
        });

        /* ---------- this app's page: the panel as it is now, larger, and every source's state ---------- */
        function render() {
            const t = ctx.theme();
            const cv = ctx.canvas(W, H).clear(t.bg);
            testLabel();
            if (logPages.active()) { logPages.draw(cv, t); return ui.image('MAIN_GFX', cv); }
            if (testPages.active()) { testPages.draw(cv, t, testNote); return ui.image('MAIN_GFX', cv); }
            G.panel(cv, t, 24, 44, 1552, 468, ((ctx.spec && ctx.spec.title) || 'Cluster Info'));
            const pw = src.power(t), ex = src.extras(t).filter((e) => e.text !== '--');
            if (pw || ex.length) {
                const b = badgeRect(mapRect('map', 0), 'bottom', 'map', ex.length, !!pw, src.underOn('map'));
                const lim = src.limits() || {};
                // the panel drawn into this page, 1.5 times its cluster size, centred
                const k = 1.5, ox = Math.round(800 - b.w * k / 2), oy = 92;
                const view = {
                    w: b.w, h: b.h, clear() { return view; },
                    roundRect: (x, y, w, h, r, c) => cv.roundRect(ox + x * k, oy + y * k, w * k, h * k, r * k, c),
                    rampRect: (x, y, w, h, r, stops, sx, sw) => cv.rampRect(ox + x * k, oy + y * k, w * k, h * k, r * k, stops, ox + sx * k, sw * k),
                    fillRect: (x, y, w, h, c) => cv.fillRect(ox + x * k, oy + y * k, w * k, h * k, c),
                    text: (str, x, y, size, c, o) => cv.text(str, ox + x * k, oy + y * k, size * k, c, o),
                    textWidth: (str, size, o) => cv.textWidth(str, size * k, o) / k,
                };
                if (pw) pw.bar = settings.get('bar') !== 'off';            // (as on the cluster)
                drawBadge(view, t, pw, lim.outMax || 100, lim.inMax || 50, ex, ex.filter((e) => e.slot < src.powerAt()).length, src.under('map'), b.ph);
            } else {
                cv.text('Nothing to show now: no power from an app, and no value chosen has a reading', 800, 150, 24, t.dim, { align: 'center' });
            }
            if (testOn()) { drawTest(cv, t); G.frame(cv, t, [((ctx.spec && ctx.spec.title) || 'Cluster Info')], 0, []); return ui.image('MAIN_GFX', cv); }
            const lines = statusLines(), step = lines.length > 5 ? 31 : 36;
            lines.forEach(([k, v], i) => {
                cv.text(k, 48, 296 + i * step, 20, t.dim, { font: 'bold' });
                cv.text(v, 260, 296 + i * step, 20, t.text, { font: 'label', literal: true });
            });
            const raws = Object.keys(live.raw).map((k) => k + ': ' + live.raw[k]).join('   ').slice(0, 190);
            cv.text(raws || 'No raw turn signal or day / night value received yet.', 48, 494, 16, t.dim, { font: 'label', literal: true });
            G.frame(cv, t, [((ctx.spec && ctx.spec.title) || 'Cluster Info')], 0, []);
            return ui.image('MAIN_GFX', cv);
        }
        /** The Test log's checks under way, on the page (from y 280): the survey's time and what came, the speed limit in
         *  the HUD's data, and the button's next step. */
        function drawTest(cv, t) {
            const L = (str, y, size, col, bold, x) => cv.text(String(str), x || 48, y, size, col, { font: bold ? 'bold' : 'label', literal: true });
            const inf = survey.info(), st = survey.status(), m = Math.floor(st.elapsedS / 60);
            L(KO ? '테스트 로그: 차 신호 조사 중 (읽기만)' : 'Test log: checking the car\'s signals (read only)', 280, 18, t.dim, true);
            L((KO ? '설치 때 선언됨 ' + inf.declared + '개 / 이 차에 없어 빠짐 ' + inf.missing + '개' : 'Declared at install ' + inf.declared + ' / not in this car, left out ' + inf.missing)
                + (inf.over ? (KO ? ' / 60개 넘어 빠짐 ' : ' / over the 60 limit ') + inf.over : '') + (inf.error ? '   ·   ' + inf.error : ''), 310, 18, inf.declared ? t.text : t.warn, true);
            L(KO ? m + '분째 · 값 온 항목 ' + st.valued + '개 · 표지판 변화 ' + st.changes + '번   (30분이면 저절로 끝남, 앱을 닫아도 계속)'
                : m + ' min · members with values ' + st.valued + ' · sign changes ' + st.changes + '   (ends by itself at 30 min; goes on with the app closed)', 340, 18, GO, true);
            L((KO ? '값 온 것: ' : 'With values: ') + (st.withValues.length ? st.withValues.join('  ·  ') : (KO ? '아직 없음' : 'none yet')).slice(0, 170), 368, 15, st.withValues.length ? t.text : t.dim);
            st.recent.forEach((c, i) => L(new Date(c.at).toTimeString().slice(0, 8) + '  ' + (typeof c.kmh === 'number' ? c.kmh + ' km/h  ' : '') + c.what.split('.').slice(-2).join('.') + ' = ' + String(c.value).slice(0, 120), 390 + i * 19, 14, t.text));
            const sli = adas ? adas.status().sli : null;
            if (sli) L((KO ? 'HUD 데이터의 제한속도: ' : 'Speed limit (HUD data): ') + (sli.now.length ? sli.now.join('  ').replace(/xSpeedLimitAssist\.|pia\./g, '').slice(0, 150) : (KO ? '아직 없음' : 'none yet')), 456, 15, sli.now.length ? GO : t.dim);
            L(KO ? '끝내고 QR로 보려면 [테스트 끝내고 보기]   ·   [구간 표시] ' + research.marks() + '번' + (Date.now() - markedAt < 3000 ? ' (방금 표시함)' : '')
                : 'To end and see its codes: [Test log: end and show]   ·   [Mark] ' + research.marks() + (Date.now() - markedAt < 3000 ? ' (just marked)' : ''), 488, 16, Date.now() - markedAt < 3000 ? GO : t.dim);
        }
        ctx.loop('MAIN', 2, render);
        Promise.resolve().then(render).then(() => log.info('first frame done')).catch((e) => log.warn('first render: ' + e));
    },
});
