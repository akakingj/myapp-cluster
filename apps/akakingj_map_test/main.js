'use strict';
/**
 * AK Map Test (a trial copy of Cluster Layouts with one layout, KO 1 Map: KO 1's dials over the CarPlay map laid under them).
 *
 * The layout (layout_*.js) is a set of shader layers on the cluster render service's `panel` target; the
 * KOMBI's GPU draws them (engine.js, shaders.js). While driving, the head unit sends only needle and band
 * values, a text's glyph codes when it changes and colours when they change. The stock warning lights stay
 * on top.
 *
 * Readings (data.js, shared with Cluster Centre): speed, engine speed, gear, oil and coolant, torque and g
 * from the car (kit/car.js); the selector's S / M programme, outside, gearbox oil, the
 * battery's temperature and the power distribution from the car's services; intake air, boost and fuel
 * pressures from the engine unit over UDS (only while a layout that shows them is up); the battery's charge
 * and power from eDrive Live; ranges from any app that shares them, until the car's own range signals are
 * added (the page lists the ones this car has: signal_finder.js).
 *
 * Safe by default: off until "Show on the cluster" is turned on; hidden (the stock cluster back) whenever the
 * car's data is not live, and whenever this app or the render service stops.
 */
const clock = require('./clock');
const mgu = require('./kit/mgu');
const { ClusterRender } = require('./cluster_render_client');
const { startCluster, STALE_MS, frozen } = require('./engine');
const { LAYOUTS, byId, layoutFor, slotValue, slotsFor, slotLabel: layoutSlotLabel, placesFor, placeItem } = require('./layouts');

/** The shift point as layout_common takes it - so many rpm under the red zone - from Settings > Shift point (0.42.0,
 * the Car profile's: an rpm; 0 Auto, the red zone less 300). */
function beforeOf(settings) {
    const at = Number(settings.get('shiftAt')), red = Number(settings.get('redline'));
    return at > 0 && red > 0 ? Math.max(100, red - at) : 300;
}
const menu = require('./menu');
const CupView = require('./cup_view');
const { withAlpha } = require('./kit/canvas');
const { t: tr } = require('./kit/i18n');
let record = null, Sheet = null;
try { record = require('./kit/record'); } catch (e) { /* an older kit: no pixel images */ }
try { Sheet = require('./kit/sheet'); } catch (e) { /* no sheets: a readout's value goes round on a tap */ }
const { lookNow } = require('./themes');
const { startData } = require('./data');
const presence = require('./presence');
const { DEMO: DAP_DEMO } = require('./dap');
const { startMapWindow } = require('./map_window');
const { findSignals } = require('./signal_finder');
const logs = require('./logs');
const attribution = require('./attribution');
const path = require('path');

const W = 1600, H = 520;
/* the page's pictures (record.js setImage): the large one, and each layout's card (+ its index; + 0x40 with the car's
 * own bottom strip) */
const IMG_BIG = 0x434c0100, IMG_CARD = 0x434c0200, IMG_STRIP = 0x40, IMG_STOCK = 0x3f;   // (the Stock card: under the layouts' with the strip)
const CARDS = 6;   // cards a row
const isNum = (v) => typeof v === 'number' && isFinite(v);
const SIGNALS_PER_PAGE = 7;

/* The free / open-source notice on the app's own screen (attribution.js): the repo and the refund line, dim when
 * the build is the author's, a warning in red when it was altered. Drawn on every app that carries the cluster
 * mark, so the notice is visible in the menu as well as on the glass. */
function creditFooter(cv, t) {
    const v = attribution.verify();
    const red = '#ff5a5a';
    const head = v.ok ? attribution.INFO.notice : 'MODIFIED BUILD (' + v.reason + ') - this is free: ' + attribution.INFO.notice;
    cv.text(head, 48, 486, 17, v.ok ? t.dim : red, { font: 'bold', literal: true });
    cv.text(attribution.INFO.url + (v.ok ? '   ·   official build, key ' + (v.fingerprint || '?') : ''), 48, 506, 15, v.ok ? t.dim : red, { font: 'label', literal: true });
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        // the clock's zone and format (clock.js: the unit runs its apps on UTC)
        const clockNow = () => { clock.setZone(settings.get('timeZone')); clock.setTwelve(settings.get('clock') !== '24'); };
        clockNow();
        settings.onChange((k) => { if (k === 'timeZone' || k === 'clock') clockNow(); });
        // Three pods and Freedom are gone (akakingj's build): a layout saved as either is Arc tach now
        // layouts taken out: a saved one moves to the nearest kept (0.30.0: Digital round, Modern wide and Digital dash)
        // (Settings > Vehicle: 'ice', petrol or diesel, became Petrol and Diesel apart in 0.35.7)
        if (settings.get('vehicle') === 'ice') settings.set('vehicle', 'petrol');
        const GONE = { three_pods: 'arc_tach', freedom: 'arc_tach', digital_round: 'analog_sport', modern_wide: 'pulse', digital_dash: 'track' };
        ['layout', 'layoutSport', 'layoutEco'].forEach((k) => { if (GONE[settings.get(k)]) settings.set(k, GONE[settings.get(k)]); });
        const showing = () => settings.get('show') === 'on';
        // every reading (data.js, shared with Cluster Centre): the car's signals, the engine unit over UDS for
        // what a layout needs (layout.needs), eDrive Live's charge and power while shown
        const D = startData(ctx, { shown: showing, tyres: true });
        const car = D.car;
        // the driving assistant (dap.js): none of its services is subscribed (0.36.7). ID8 M's cruise control reads the
        // head-up display's set speed (data.js cruise); dap.js stays for the previews' sample (DAP_DEMO) and later use
        const data = () => {
            const d = D.data();
            d.dap = d.demo ? DAP_DEMO : null;
            return d;
        };
        // the readouts (Settings' infoA ... gaugeRpm): the layout's own where it has one set (slotsBy, the page), else
        // the Settings' value, every layout's default
        const itemOf = (k) => (typeof settings.item === 'function' ? settings.item(k) : ((ctx.spec && ctx.spec.settings) || []).find((x) => x.key === k));
        const slot = (k, id) => slotValue((x) => settings.get(x), itemOf, id || layout.id, k);
        /** a layout's own places (layouts.js placesFor: set on the page, for it alone; unset: as designed) */
        const placesOf = (id) => {
            const by = settings.get('slotsBy'), own = (by && typeof by === 'object' && by[id]) || {}, out = {};
            placesFor(id).forEach((p) => { if (typeof own[p.key] === 'string') out[p.key] = own[p.key]; });
            return out;
        };
        const options = () => ({
            speedUnit: settings.get('speedUnit'), tempUnit: settings.get('tempUnit'), torqueUnit: settings.get('torqueUnit'), pressUnit: settings.get('pressUnit'),
            powerUnit: settings.get('powerUnit'), econUnit: settings.get('econUnit'), infoA: slot('infoA'), infoB: slot('infoB'), infoMain: slot('infoMain'), infoLow: slot('infoLow'), gScale: settings.get('gScale'), jdmCup: slot('jdmCup'), centreView: slot('centreView'), stripBars: settings.get('stripBars'), tempGauge: settings.get('tempGauge'), tempTone: settings.get('tempTone'), shiftWarn: settings.get('shiftWarn'), gaugeSpeed: slot('gaugeSpeed'), gaugeRpm: slot('gaugeRpm'), leftDial: slot('leftDial'), places: placesOf(layout.id),
            amberRpm: settings.get('amberRpm'), shiftBefore: beforeOf(settings), coldGuard: settings.get('coldGuard'), coldLimit: settings.get('coldLimit'), warmOil: settings.get('warmOil'),
            hotOil: settings.get('hotOil'), hotCoolant: settings.get('hotCoolant'), hotGearbox: settings.get('hotGearbox'),
            centre: settings.get('centre') === 'pages' ? 'map' : settings.get('centre'),   // (a saved 'pages', retired: Waze)
            redline: Number(settings.get('redline')) || 7000, rpmMax: Number(settings.get('rpmMax')) || 8000,
            // (always the car's own bottom strip since 0.34.0: Bottom strip, Cluster: M car and Frame behind the gear box
            // are gone with the full-screen form; layouts.js holds them so)
            cluster: 'standard', bottomStrip: 'stock', boxBezel: false,
            vehicle: D.vehicle().vehicle,      // set, or found from the car (Auto)
            fuel: D.vehicle().fuel,            // (Settings > Vehicle: Diesel, else petrol: no ignition timing on a diesel)
        });
        /** Live: demo data on, or the car's signals answer (a parked car sends nothing new for minutes, so a
         * provider that is there counts), or a value came in the last STALE_MS. */
        // (and not while the samples stopped with the car running: engine.js frozen() - the last speed would stay up)
        let lastSample = 0;
        car.onSample(() => { lastSample = Date.now(); });
        const live = () => {
            const cd = car.data();
            if (cd.demo) return true;
            if (frozen(cd, lastSample, Date.now())) return false;
            return car.subs.some((s) => s.available) || (car.lastCar > 0 && Date.now() - car.lastCar < STALE_MS);
        };
        // (Settings > Layout, or the one set for the drive mode now: Layout in Sport / in ECO PRO, layouts.layoutFor)
        const layoutNow = () => byId(layoutFor((k) => settings.get(k), data()));
        let layout = byId(settings.get('layout'));
        /* the colours now: the layout's palette for the look, as designed (Settings > Background: Pure black, which hid
         * the KOMBI's dark box in the full-screen form, went with it in 0.34.0: over the car's strip there is no box) */
        const themeNow = () => layout.palette(look());
        const look = () => lookNow(settings.get('look'), data());
        /* the renderer target: the panel (slot 0x203), where the HMI's own cluster screen goes down and the
         * KOMBI shows its fallback gear box */
        const start = () => startCluster({
            client: new ClusterRender('akakingj_map_test'),
            layout: () => layout,
            // (the glyphs: the layout's own family, M and Sport's wide one, else the bold)
            font: () => layout.font || 'bold',
            options, log, live, data,
            theme: () => themeNow(),
            // (not while the car is locked and left: nobody sees it, and the cluster can sleep)
            enabled: () => showing() && !D.awake().parked,
            sweep: () => settings.get('sweep') !== 'off',
            target: 'panel',
            onFresh: D.onFresh,
        });
        let cluster = start();
        const mapWindow = startMapWindow(log);
        let lastVehicle = null, lastModeGear = null, modeWant = null, modeAt = 0;
        // the engine-unit readings the layout shows, read fast while it shows
        setInterval(() => {
            if (showing()) D.want((typeof layout.needs === 'function' ? layout.needs(options()) : layout.needs || []).concat(require('./layout_common').focus.needs(options())));
            // Cluster Centre steps aside while a layout shows
            if (cluster.status().shown) presence.mark('layouts', { centre: options().centre });
            // the Waze centre: Waze on cluster draws its map over the layout, filling the window (map_window.js): the
            // layout's own (M's and Sport's: where bimmer-lab's put it), else the native map area; KO 1 Map (mapAlways)
            // whatever the centre, its map under the layout ("under", akakingj/idrive-apps extend-map)
            mapWindow.set(cluster.status().shown && (options().centre === 'map' || layout.mapAlways) ? (layout.mapWindow || require('./layout_common').MAP) : null);
            // the vehicle found (Settings > Vehicle: Auto): the layout redrawn for it once known
            const v = D.vehicle().vehicle;
            if (v !== lastVehicle) { if (lastVehicle) cluster.rebuild(); lastVehicle = v; }
            // drive mode and gear changes in the log (timestamped), beside the cluster's target changes: what the
            // KOMBI does to the layout on a mode change (the stock cluster back for a few seconds) shows in one log
            const dn = data(), mg = (dn.driveMode || '-') + ' / ' + (dn.gear == null ? '-' : dn.gear);
            // the layout for the drive mode: switched once the new mode has held 1.5 s (a mode passed through on the
            // way to another doesn't switch; the KOMBI shows its own cluster for a moment on a mode change anyway)
            const wantId = layoutNow().id;
            if (wantId === layout.id) modeWant = null;
            else if (modeWant !== wantId) { modeWant = wantId; modeAt = Date.now(); }
            else if (Date.now() - modeAt >= 1500) { log.info('drive mode ' + (dn.driveMode || '-') + ': layout ' + wantId); layout = byId(wantId); modeWant = null; cluster.rebuild(); }
            if (mg !== lastModeGear) {
                if (lastModeGear !== null && !dn.demo) log.info('drive mode / gear: ' + lastModeGear + ' -> ' + mg + '   (cluster: ' + JSON.stringify(cluster.status()) + ')');
                lastModeGear = mg;
            }
        }, 500);
        settings.onChange((k) => {
            if (k === 'look') return cluster.recolour();
            if (k === 'layout' || k === 'layoutSport' || k === 'layoutEco') { layout = layoutNow(); modeWant = null; }
            if (['layout', 'layoutSport', 'layoutEco', 'tempGauge', 'tempTone', 'shiftWarn', 'centre', 'speedUnit', 'tempUnit', 'torqueUnit', 'pressUnit', 'redline', 'rpmMax', 'vehicle', 'tankLitres', 'powerUnit', 'econUnit', 'infoA', 'infoB', 'infoMain', 'infoLow', 'gScale', 'jdmCup', 'centreView', 'stripBars', 'leftDial', 'gaugeSpeed', 'gaugeRpm', 'amberRpm', 'shiftAt', 'coldGuard', 'coldLimit', 'warmOil', 'hotOil', 'hotCoolant', 'hotGearbox', 'slotsBy'].indexOf(k) >= 0) cluster.rebuild();
        });

        /* ---------- the car's range and charge signals, from its own catalog ---------- */
        const found = findSignals();
        if (found.error) log.warn('signals: ' + found.error);
        else {
            log.info('signals for ranges, fuel and charge: ' + found.list.length);
            found.list.slice(0, 60).forEach((s) => log.info('  ' + s.iface + ' ' + s.field + (s.get ? ' get' : '') + (s.notify ? ' notify' : '') + ' {' + s.members.slice(0, 12).join(', ') + '}'));
        }
        // 0: the layouts (pictures to tap, the chosen one's readouts); 1: status; 2: the raw drive-mode and range values;
        // 3: what the cluster has up; 4...: the signal list, SIGNALS_PER_PAGE a page
        let page = 0;
        const pages = () => 4 + Math.ceil(found.list.length / SIGNALS_PER_PAGE);

        ui.onClick('BTN_SHOW', () => { settings.set('show', showing() ? 'off' : 'on'); return render(); });
        ui.onClick('BTN_SIGNALS', () => { logView = null; cupOpen = false; page = (page + 1) % Math.max(1, pages()); return render(); });

        /* ---------- Logs: what's needed to find a problem, as QR codes to photograph and as a file on a USB stick ---------- */
        let logView = null;   // { codes, page, saved, bytes }
        const PER_PAGE = 3;
        /** A finder result as lines: 'Iface.field [get notify] { members }'. */
        const sigList = (f, max) => (f.error ? f.error : f.list.slice(0, max).map((x) => x.iface.replace(/^de\.bmw\./, '') + '.' + x.field + (x.get ? ' get' : '') + (x.notify ? ' notify' : '') + ' {' + x.members.slice(0, 10).join(', ') + '}').join('\n') + (f.list.length > max ? '\n(' + (f.list.length - max) + ' more)' : ''));
        /** The renderer's status with this app's own effect layers (one line each, ~60) counted, for the codes. */
        const squeeze = (txt, full) => {
            if (full) return txt;
            let ours = 0;
            const kept = String(txt).split('\n').filter((l) => (/^layer \d+ effect of akakingj_map_test on panel/.test(l) ? (ours++, false) : true));
            return kept.join('\n') + (ours ? '\n(' + ours + ' effect layers of akakingj_map_test, one line each in the full logs)' : '');
        };
        function logBundle(full) {
            const n = (short, long) => (full ? long : short);
            const d = data(), o = options(), snap = {};
            Object.keys(d).forEach((k) => { const v = d[k]; if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') snap[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v; });
            return logs.bundle(((ctx.spec && ctx.spec.title) || 'AK Map Test') + ' ' + ((ctx.spec && ctx.spec.version) || ''), [
                ['settings', JSON.stringify({ layout: settings.get('layout'), centre: o.centre, look: settings.get('look'), show: settings.get('show') })],
                ['engine', JSON.stringify(cluster.status())],
                ['cluster renderer status', squeeze(cluster.rendererStatus() || '(no answer yet)', full)],
                ['data now', JSON.stringify(snap)],
                ['raw signals', JSON.stringify(D.status().raw || {})],
                ['driving assistant (ID8 M)', 'not subscribed (0.36.7): the cruise control from the head-up display\'s set speed'],
                ['vehicle', (() => { const v = D.vehicle(); return v.vehicle + ' (' + v.how + ': ' + v.why + ')'; })()],
                ['data status', JSON.stringify(Object.assign({}, D.status(), { raw: undefined }))],
                // the kW gauges' sources: each of the car's power signals (how often it came, its last value), its fit to
                // eDrive Live's readings (theta: kW = theta . features; err: the average miss, kW) and the one shown
                ['fast power (the kW gauges)', (() => {
                    const f = D.status().kwFit || {}, ms = f.models || {};
                    return ['shown now: ' + (d.kwModel || (isNum(d.kwRead) ? 'eDrive Live\'s reading as it is' : 'nothing')) + '   eDrive Live ' + (isNum(d.kwRead) ? d.kwRead.toFixed(1) + ' kW' : '--') + '   gauges ' + (isNum(d.kw) ? d.kw.toFixed(1) + ' kW' : '--')]
                        .concat(Object.keys(ms).map((k) => k + ': ' + (ms[k].rate === null ? 'every car sample' : ms[k].rate + '/s') + ', fits ' + ms[k].fits + ', error ' + (ms[k].err === null ? '--' : ms[k].err + ' kW') + ', theta ' + JSON.stringify(ms[k].theta) + (ms[k].last !== null ? ', last ' + JSON.stringify(ms[k].last) : '')))
                        .concat(['cruise (head-up display): ' + (d.cruise ? JSON.stringify(d.cruise) : 'nothing yet')]).join('\n');
                })()],
                // the car's own names for these (its service catalog): what to declare for the electric range
                // and the local time
                ['range and charge signals', sigList(found, n(40, 400))],
                // the battery's power as the car itself sends it (the head unit's live consumption and energy flow
                // come from somewhere): every power, current, consumption and energy-flow field the catalog has, to pick
                // one that updates without being asked (eDrive Live's diagnostic reads are a few a second)
                ['power and consumption signals', sigList(findSignals({ match: /power|leistung|current|strom|ampere|voltage|spannung|consum|verbrauch|efficien|energ|flow|momentan|instant|eboost|traction|antrieb|hvs|highvoltage|electricmachine|emachine/i }), n(150, 1500))],
                // the cruise control's: the driving assistant's view services send nothing on this car (Nov 9 2026,
                // "seen" empty), so the catalog's other candidates, to pick from
                ['cruise control signals', sigList(findSignals({ match: /cruise|tempomat|geschwindigkeitsregel|wunschgeschw|speed.?limit|limiter|set.?speed|target.?speed|abstand|distance.?control|longitudinal.?(control|guid|function|assist)|\bacc\b|acc[A-Z_]|ACC|DCC|FGR/ }), n(30, 300))],
                ['time and date signals', sigList(findSignals({ match: /time|date|uhrzeit|datum|zone|clock/i }), n(10, 300))],
                ['cluster-render log', logs.tail(logs.RENDER_LOG, n(50, 1500))],
                ['this app\'s log', logs.tail(path.join(ctx.dataDir || '.', 'akakingj_map_test.log'), n(30, 400))],
                ['Cluster Centre log', logs.siblingLog(ctx.dataDir || '.', 'akakingj_cluster_centre', n(20, 300))],
            ]);
        }
        ui.onClick('BTN_LOGS', () => {
            page = 0; cupOpen = false;
            if (!logView) {
                const saved = logs.save(logBundle(true), ctx.dataDir);
                saved.forEach((r) => log.info('logs: ' + (r.file ? 'saved ' + r.file : r.dir + ': ' + r.error)));
                const c = logs.codes(logBundle(false));
                logView = { codes: c.codes, page: 0, saved, bytes: c.bytes };
            } else {
                logView.page++;
                if (logView.page * PER_PAGE >= logView.codes.length) logView = null;
            }
            return render();
        });

        /* ---------- the layouts: the chosen one large, a row of cards to tap (it shows on the cluster at once), and
         * its readouts, each set for it alone (slotsBy) or following the Settings' value ---------- */
        const previews = menu.loadPreviews(__dirname, log);
        const ITEMS = LAYOUTS.map((l) => l.id).concat(['stock']);
        let cardPage = -1, bigShown = '';
        const cardsUp = {};
        /** The layout setting the drive mode now uses (a Sport / ECO PRO one only where set): what a tap changes. */
        const modeKey = () => {
            const m = data().driveMode || '';
            if (/SPORT|XTRABOOST/.test(m) && settings.get('layoutSport') !== 'same') return 'layoutSport';
            if (/ECO|ELECTRIC/.test(m) && !/HYBRID|BATTERY/.test(m) && settings.get('layoutEco') !== 'same') return 'layoutEco';
            return 'layout';
        };
        const choose = (id) => {
            if (id === 'stock') settings.set('show', 'off');
            else { if (settings.get(modeKey()) !== id) settings.set(modeKey(), id); if (!showing()) settings.set('show', 'on'); }
            return render();
        };
        /** A readout of layout id set to v ('' : the Settings' value again). */
        const setSlot = (id, k, v) => {
            const by = Object.assign({}, settings.get('slotsBy') || {}), own = Object.assign({}, by[id] || {});
            if (v === '') delete own[k]; else own[k] = v;
            if (Object.keys(own).length) by[id] = own; else delete by[id];
            settings.set('slotsBy', by);
            return render();
        };
        const ownSlot = (id, k) => { const by = settings.get('slotsBy'); return by && by[id] && by[id][k] !== undefined ? by[id][k] : undefined; };
        /** a readout setting's item, or a layout's own place's (its kind's values, 'auto': as designed) */
        const itemFor = (id, k) => placeItem(id, k, ctx.spec) || itemOf(k);
        /** a readout's name on the page: where that layout puts it (layouts.js slotLabel, 0.37.3 / 0.37.4: Old M's main
         *  readout is above the speed, JDM 1's readouts 1 and 2 under its side gauges ...), else the setting's */
        const slotLabel = (id, k) => layoutSlotLabel(id, k, Object.assign({}, options(), { places: placesOf(id) })) || ((itemFor(id, k) || {}).label || k);
        const optLabel = (k, v, id) => { const it = itemFor(id, k), o = it && (it.options || []).find((x) => x[0] === v); return o ? o[1] : String(v); };
        const openSlot = (id, k) => {
            const it = itemFor(id, k), cur = ownSlot(id, k), place = !!placeItem(id, k, ctx.spec);
            // (a place: its own values, the first back to as designed; a readout: the Settings' value first)
            const opts = place ? it.options.map((x) => (x[0] === 'auto' ? ['', x[1]] : x)) : [['', 'Same as in Settings']].concat(it.options);
            const sheet = Sheet && menu.pickSheet(Sheet, byId(id).title, slotLabel(id, k), opts, cur === undefined ? '' : cur, (v) => setSlot(id, k, v));
            // (the kit's sheet is ctx.sheet - mgu.js; 0.29.0-0.37.0 asked ui.sheet, which the kit has not, so on the car a
            // tap only stepped to the next value: 0.37.1 opens the list. ui.sheet stays for the tests' stand-in)
            const showSheet = typeof ctx.sheet === 'function' ? ctx.sheet : ui.sheet;
            if (sheet && showSheet && showSheet(sheet) !== false) return null;
            // (no sheet here: the next value, then back to the Settings')
            const vals = it.options.map((x) => x[0]).filter((v) => !place || v !== 'auto'), i = cur === undefined ? -1 : vals.indexOf(cur);
            return setSlot(id, k, i + 1 < vals.length ? vals[i + 1] : '');
        };
        /** A picture at x, y (w x h): a pixel image on the car's renderer, drawn in place on a plain canvas (the tests). */
        const picture = (cv, id, px, w, h, x, y, upload) => {
            if (!px) return false;
            if (typeof cv.image === 'function' && record) { if (upload) record.setImage(id, w, h, px); cv.image(id, x, y, w, h); return true; }
            if (typeof cv.drawImage === 'function') { cv.drawImage(px, w, h, x, y, w, h); return true; }
            return false;
        };
        /** s cut to maxW px at size in font, ending in "…" (as drawn: cv.textWidth; a plain canvas without it: as it is) */
        const fitText = (cv, s, size, font, maxW) => {
            if (typeof cv.textWidth !== 'function' || cv.textWidth(s, size, { font, literal: true }) <= maxW) return s;
            let n = s.length;
            while (n > 1 && cv.textWidth(s.slice(0, n) + '…', size, { font, literal: true }) > maxW) n--;
            return s.slice(0, n).replace(/[\s(·,:]+$/, '') + '…';
        };
        const tap = (cv, x, y, w, h, run, key) => { if (typeof cv.target === 'function') cv.target(x, y, w, h, run, key); };
        function drawLayouts(cv, t) {
            const st = cluster.status(), d = data(), o = options(), now = layoutNow(), on = showing();
            const sel = on ? now.id : 'stock', shownId = on ? now.id : settings.get(modeKey());
            // (the pictures as the layouts look with the bottom strip set: the car's own, or the layout's full screen)
            const strip = true, bigKey = shownId + ':strip';   // (the pictures with the car's own strip: the only form since 0.34.0)
            const acc = t.sel || t.accent || '#3d8bff';
            // the large picture: the layout the drive mode uses now (on or not)
            const BX = 24, BY = 14;
            cv.roundRect(BX - 4, BY - 4, menu.PW + 8, menu.PH + 8, 10, on ? acc : '#2a2f38');
            if (!picture(cv, IMG_BIG, previews.big(shownId, strip), menu.PW, menu.PH, BX, BY, bigShown !== bigKey)) cv.fillRect(BX, BY, menu.PW, menu.PH, '#000000');
            bigShown = bigKey;
            if (!on) { cv.fillRect(BX, BY, menu.PW, menu.PH, withAlpha('#000000', 0.55)); cv.text('The stock cluster shows', BX + menu.PW / 2, BY + menu.PH / 2 + 10, 28, t.text, { align: 'center', font: 'bold' }); }
            // the right: the layout, its state, its readouts
            const RX = 652, RW = W - 24 - RX;
            cv.text(byId(shownId).title, RX, 50, 34, t.text, { font: 'bold' });
            const state = !on ? 'Off - the stock cluster shows' : st.shown ? 'Showing on the cluster' : 'Waiting for live car data';
            cv.text(state, RX + RW, 50, 20, !on ? t.dim : st.shown ? '#3ccf6e' : '#f0a63c', { align: 'right', font: 'bold' });
            const modeName = modeKey() === 'layoutSport' ? 'Layout in Sport' : modeKey() === 'layoutEco' ? 'Layout in ECO PRO' : 'Layout';
            cv.text(modeName, RX, 80, 17, t.dim, { font: 'bold' });
            cv.text((d.demo ? 'demo' : live() ? 'live' : 'not live') + '  ·  ' + (isNum(d.speed) ? Math.round(o.speedUnit === 'kmh' ? d.speed : d.speed / 1.609344) : '--') + ' ' + (o.speedUnit === 'kmh' ? 'km/h' : 'mph')
                + '  ·  ' + (isNum(d.rpm) ? Math.round(d.rpm) : '--') + ' rpm  ·  ' + st.renderer + ', ' + st.layers + ' layers', RX + RW, 80, 16, t.dim, { align: 'right', font: 'label', literal: true });
            // its readouts (those showing on this car with these settings), then its own places (those showing now)
            const so = Object.assign({}, o, { leftDial: slot('leftDial', shownId), centreView: slot('centreView', shownId), places: placesOf(shownId) });
            const keys = slotsFor(shownId, so).concat(placesFor(shownId).filter((p) => !p.when || p.when(so)).map((p) => p.key));
            if (!keys.length) cv.text('This layout has no readouts to choose', RX, 130, 20, t.dim);
            // (two a row; three or four where it has more, three rows)
            const COLS = keys.length <= 6 ? 2 : keys.length <= 9 ? 3 : 4, CW = (RW - 12 * (COLS - 1)) / COLS, CH = 48;
            keys.forEach((k, i) => {
                const x = RX + (i % COLS) * (CW + 12), y = 96 + Math.floor(i / COLS) * (CH + 8), place = !!placeItem(shownId, k, ctx.spec);
                const own = ownSlot(shownId, k), v = place ? (own === undefined ? 'auto' : own) : slot(k, shownId), lbl = String(tr(slotLabel(shownId, k))).replace(/\s*\((petrol, diesel|가솔린, 디젤|Classic M|Old M|ID6 M)\)$/, '');
                cv.roundRect(x, y, CW, CH, 10, withAlpha('#ffffff', 0.07));
                if (own !== undefined) cv.roundRect(x, y, 5, CH, 2, acc);
                const common = own === undefined && !place && COLS === 2, vs = COLS > 2 ? 16 : 18;
                // (0.36.9: each text cut to its cell with "…": the Korean "auto" labels ran into the next cell)
                cv.text(fitText(cv, lbl, 14, 'bold', CW - 28), x + 16, y + 19, 14, t.dim, { font: 'bold', literal: true });
                cv.text(fitText(cv, String(tr(optLabel(k, v, shownId))), vs, 'bold', CW - 30 - (common ? 64 : 0)), x + 16, y + 40, vs, t.text, { font: 'bold', literal: true });
                if (common) cv.text('Common', x + CW - 14, y + 40, 14, t.dim, { align: 'right' });
                tap(cv, x, y, CW, CH, () => openSlot(shownId, k), 'slot_' + k);
            });
            // the cards: CARDS a row, the arrows for more; the one showing framed
            const pages = Math.ceil(ITEMS.length / CARDS);
            if (cardPage < 0) cardPage = Math.max(0, Math.floor(ITEMS.indexOf(sel) / CARDS));
            cardPage = Math.min(cardPage, pages - 1);
            const CY = 262, CX0 = 72, CGAP = 12, CWD = Math.floor((W - 2 * CX0 - (CARDS - 1) * CGAP) / CARDS), CHT = menu.TH + 44;
            ITEMS.slice(cardPage * CARDS, cardPage * CARDS + CARDS).forEach((id, i) => {
                const x = CX0 + i * (CWD + CGAP), y = CY, mine = id === sel;
                cv.roundRect(x, y, CWD, CHT, 10, mine ? acc : withAlpha('#ffffff', 0.08));
                cv.roundRect(x + 3, y + 3, CWD - 6, CHT - 6, 8, '#0b0d11');
                const ix = x + Math.round((CWD - menu.TW) / 2), iy = y + 8;
                // (0.39.6) the Stock card: the car's own cluster, drawn (tools/stock_preview.py), or its name without the picture
                const stockPx = id === 'stock' ? previews.thumb('stock', strip) : null;
                if (id === 'stock' && !stockPx) { cv.roundRect(ix, iy, menu.TW, menu.TH, 6, '#16191f'); cv.text('Stock', ix + menu.TW / 2, iy + menu.TH / 2 + 8, 24, t.dim, { align: 'center', font: 'bold' }); }
                else if (id === 'stock') { if (!picture(cv, IMG_CARD + IMG_STOCK, stockPx, menu.TW, menu.TH, ix, iy, !cardsUp.stock)) cv.fillRect(ix, iy, menu.TW, menu.TH, '#000000'); cardsUp.stock = true; }
                else {
                    const n = ITEMS.indexOf(id) + (strip ? IMG_STRIP : 0), ck = id + (strip ? ':strip' : '');
                    if (!picture(cv, IMG_CARD + n, previews.thumb(id, strip), menu.TW, menu.TH, ix, iy, !cardsUp[ck])) cv.fillRect(ix, iy, menu.TW, menu.TH, '#000000');
                    cardsUp[ck] = true;
                }
                cv.text(id === 'stock' ? 'Stock cluster' : byId(id).title, x + CWD / 2, y + CHT - 12, 18, mine ? '#ffffff' : t.text, { align: 'center', font: 'bold' });
                tap(cv, x, y, CWD, CHT, () => choose(id), 'card_' + id);
            });
            // the arrows and where the row is
            const arrow = (x, dir) => {
                const cy = CY + CHT / 2, can = dir < 0 ? cardPage > 0 : cardPage < pages - 1, c = can ? t.text : '#3a3f48';
                cv.line(x + 22 - dir * 8, cy - 16, x + 22 + dir * 8, cy, 4, c);
                cv.line(x + 22 + dir * 8, cy, x + 22 - dir * 8, cy + 16, 4, c);
                if (can) tap(cv, x, CY, 44, CHT, () => { cardPage += dir; return render(); }, dir < 0 ? 'cards_prev' : 'cards_next');
            };
            arrow(20, -1); arrow(W - 64, 1);
            for (let i = 0; i < pages; i++) cv.circle(W / 2 - (pages - 1) * 10 + i * 20, CY + CHT + 16, 4, i === cardPage ? t.text : '#3a3f48');
            cv.text('Tap a layout: it shows on the cluster at once. Tap a readout to choose it for this layout.', 48, 444, 17, t.dim);
            // JDM 1: its cup of water on this page, large (cup_view.js; 0.43.0)
            if (shownId === 'arc_tach') {
                const PX = W - 24 - 300, PY = 418, PW = 300, PH = 44;
                cv.roundRect(PX, PY, PW, PH, PH / 2, acc);
                cv.text('Water cup view', PX + PW / 2, PY + 29, 20, '#ffffff', { align: 'center', font: 'bold' });
                tap(cv, PX, PY, PW, PH, () => openCup(true), 'cup_open');
            }
            creditFooter(cv, t);
            return ui.image('MAIN_GFX', cv);
        }

        /* ---------- JDM 1's cup of water, large on this page (cup_view.js): Back, Signals or Logs leave it ---------- */
        let cupOpen = false;
        const cupV = CupView.view();
        const openCup = (on) => { cupOpen = on; cupV.reset(); return render(); };
        function drawCup() {
            const key = cupV.step(data(), options(), Date.now());
            if (key === null) return null;                     // (the water still, or under 30 ms since the last: no frame)
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg), acc = t.sel || t.accent || '#3d8bff';
            cv.text('JDM 1', 48, 52, 30, t.text, { font: 'bold', literal: true });
            cv.text('Water cup', 48, 82, 18, t.dim, { font: 'bold' });
            cv.text('Sloshes with the car\'s G, as the cup on the cluster', 48, 108, 15, t.dim);
            const BX = W - 24 - 220, BY = 24, BW = 220, BH = 44;
            cv.roundRect(BX, BY, BW, BH, BH / 2, withAlpha('#ffffff', 0.1));
            cv.text('Back', BX + BW / 2, BY + 29, 20, t.text, { align: 'center', font: 'bold' });
            tap(cv, BX, BY, BW, BH, () => openCup(false), 'cup_back');
            cupV.draw(cv, t);
            return ui.image('MAIN_GFX', cv);
        }

        const rawOf = (name) => { const r = D.status().raw || {}; return r[name] ? r[name].slice(0, 70) : 'nothing yet'; };
        function render() {
            if (cupOpen && !logView) return drawCup();
            const t = ctx.theme();
            const cv = ctx.canvas(W, H).clear(t.bg);
            if (logView) {
                const n = logView.codes.length, pages = Math.ceil(n / PER_PAGE), first = logView.page * PER_PAGE;
                const usb = logView.saved.filter((r) => r.file && !/exports/.test(r.file));
                cv.text('Logs: photograph each code (page ' + (logView.page + 1) + ' of ' + pages + ', codes ' + (first + 1) + '-' + Math.min(n, first + PER_PAGE) + ' of ' + n + '), then press Logs for the next', 40, 34, 20, t.text, { font: 'bold', literal: true });
                cv.text(usb.length ? 'The full logs are also on the USB stick: ' + usb[0].file : 'Plug in a USB stick and press Logs again from the start for the full logs as a file', 40, 62, 16, t.dim, { font: 'label', literal: true });
                logView.codes.slice(first, first + PER_PAGE).forEach((q, i) => {
                    const px = Math.max(3, Math.floor(420 / (q.size + 8)));
                    logs.draw(cv, q, 40 + i * 520, 84, px);
                    cv.text(String(first + i + 1) + ' / ' + n, 40 + i * 520 + 180, 84 + (q.size + 8) * px + 22, 18, t.text, { font: 'bold', literal: true });
                });
                return ui.image('MAIN_GFX', cv);
            }
            if (page === 2) {
                cv.text('What the car sends for the drive mode and the ranges (photograph this in each mode)', 48, 70, 24, t.text, { font: 'bold', literal: true });
                const raw = D.status().raw || {}, d = data();
                let y = 120;
                ['statusFESVehicleDynamicSwitchHMI', 'statusSwitchDriveDynamicSport2', 'statusRangeTankStatus', 'Range', 'statusEngineStatus', 'ActualSteeringAngleDriver', 'statusYawVelocityVehicle'].forEach((n) => {
                    const txt = raw[n] || 'nothing yet';
                    cv.text(n + ':  ' + txt.slice(0, 120), 48, y, 15, t.text, { font: 'label', literal: true }); y += 21;
                    for (let i = 120; i < txt.length && i < 2 * 120; i += 120) { cv.text(txt.slice(i, i + 120), 72, y, 15, t.dim, { font: 'label', literal: true }); y += 21; }
                    y += 6;
                });
                const vh = D.vehicle();
                cv.text('Vehicle: ' + (vh.vehicle === 'ice' ? (vh.fuel === 'diesel' ? 'diesel' : 'petrol') : 'plug-in hybrid') + ' (' + vh.how + (vh.how === 'set' ? '' : ': ' + vh.why) + ')', 48, y + 34, 18, t.text, { font: 'bold', literal: true });
                cv.text('Read as: ' + (d.driveMode || '-') + ', steering ' + (isNum(d.steer) ? Math.round(d.steer) + '°' : '--') + ', yaw ' + (isNum(d.yaw) ? d.yaw.toFixed(1) : '--') + ', fuel ' + (isNum(d.frange) ? Math.round(d.frange) : '--') + ', electric ' + (isNum(d.erange) ? Math.round(d.erange) : '--'), 48, y + 6, 18, t.text, { font: 'bold', literal: true });
                return ui.image('MAIN_GFX', cv);
            }
            if (page === 3) {
                cv.text('What the cluster shows besides this app (the renderer\'s report; photograph it with a layout up)', 48, 70, 24, t.text, { font: 'bold', literal: true });
                const txt = cluster.rendererStatus();
                const lines = txt ? txt.split('\n').filter((l) => /^slot 0x|^target (panel|map|hud)|^dcsm/.test(l)) : ['nothing yet'];
                lines.slice(0, 15).forEach((l, i) => cv.text(l.slice(0, 140), 48, 116 + i * 26, 16, t.text, { font: 'label', literal: true }));
                return ui.image('MAIN_GFX', cv);
            }
            if (page > 3) {
                cv.text('Signals on this car for ranges, fuel and charge (' + found.list.length + ')   ·   page ' + (page - 3) + ' of ' + (pages() - 4), 48, 70, 26, t.text, { font: 'bold', literal: true });
                found.list.slice((page - 4) * SIGNALS_PER_PAGE, (page - 3) * SIGNALS_PER_PAGE).forEach((s, i) => {
                    const y = 130 + i * 54;
                    cv.text(s.iface.replace(/^de\.bmw\./, '') + '  ·  ' + s.field + (s.get ? '  get' : '') + (s.notify ? '  notify' : ''), 48, y, 20, t.text, { font: 'label', literal: true });
                    cv.text(s.members.slice(0, 10).join(', ').slice(0, 150), 72, y + 24, 16, t.dim, { font: 'label', literal: true });
                });
                return ui.image('MAIN_GFX', cv);
            }
            if (page === 0) return drawLayouts(cv, t);
            const st = cluster.status(), d = data(), o = options();
            const LC = require('./layout_common');
            const spd = isNum(d.speed) ? Math.round(o.speedUnit === 'kmh' ? d.speed : d.speed / 1.609344) + ' ' + (o.speedUnit === 'kmh' ? 'km/h' : 'mph') : '--';
            const tmp = (c) => (isNum(c) ? Math.round(o.tempUnit === 'c' ? c : c * 9 / 5 + 32) + '°' : '--');
            const lines = [
                ['On the cluster', !showing() ? 'Off - the stock cluster shows (press Show on the cluster)'
                    : st.shown ? 'Showing: ' + layout.title + ', ' + look() + ' colours' : 'Waiting for live car data'],
                ['Cluster renderer', st.renderer + '   ·   panel: ' + st.target + '   ·   ' + st.layers + ' layers' + (st.refused ? '   ·   refused: ' + st.refused : '')],
                ['Car data', (d.demo ? 'demo   ·   ' : live() ? 'live   ·   ' : 'not live   ·   ') + spd + '   ·   ' + (isNum(d.rpm) ? Math.round(d.rpm) + ' rpm' : '-- rpm')
                    + '   ·   gear ' + layout.gearText(d) + '   ·   oil ' + tmp(d.oil) + '   ·   coolant ' + tmp(d.coolant) + '   ·   outside ' + tmp(d.outside)],
                // a petrol or diesel car: what the engine unit answers (and from which identifier), to check against Live Data
                o.vehicle === 'ice' ? ['Engine unit', 'link ' + D.status().diag + '   ·   pedal ' + (isNum(d.pedal) ? Math.round(d.pedal) + '%' : '--') + (D.status().dme.pedal ? ' (' + D.status().dme.pedal + ')' : '')
                    + '   ·   throttle ' + (isNum(d.throttle) ? Math.round(d.throttle) + '%' : '--') + (D.status().dme.throttle ? ' (' + D.status().dme.throttle + ')' : '')
                    + '   ·   boost ' + LC.pressNum(o, d.boostActual) + ' ' + LC.pressLabel(o) + '   ·   intake ' + tmp(d.iat) + '   ·   gearbox ' + tmp(d.gearbox) + '   ·   power ' + LC.powerNum(o, d.enginePower) + ' ' + LC.powerUnitText(o)]
                    : ['Shared by apps', D.status().providers + '   ·   diagnostic link ' + D.status().diag + '   ·   charge ' + (isNum(d.soc) ? Math.round(d.soc) + '%' : '--') + '   ·   power ' + (isNum(d.kw) ? d.kw.toFixed(1) + ' kW' : '--')],
                ['Drive mode (car)', (d.driveMode || '-') + '   ·   raw: ' + rawOf('statusFESVehicleDynamicSwitchHMI') + '  ' + rawOf('statusSwitchDriveDynamicSport2')],
                ['Range (car)', 'fuel ' + (isNum(d.frange) ? Math.round(d.frange) : '--') + '  electric ' + (isNum(d.erange) ? Math.round(d.erange) : '--')
                    + '   ·   tank ' + (isNum(d.fuelPct) ? Math.round(d.fuelPct) + '% (' + (d.fuelPctFrom === 'engine' ? 'engine unit' : 'litres') + ')' : '--') + '   ·   raw: ' + rawOf('statusRangeTankStatus')],
            ];
            cv.text(((ctx.spec && ctx.spec.title) || 'AK Map Test') + ' ' + ((ctx.spec && ctx.spec.version) || ''), 48, 80, 44, t.text, { font: 'bold', literal: true });
            lines.forEach(([k, v], i) => {
                // (rows 56 apart: the sixth ran into the notice along the bottom)
                // (the row names and the first row's state in the build's language; the readings as they are)
                cv.text(k, 48, 150 + i * 56, 22, t.dim, { font: 'bold' });
                cv.text(String(v).slice(0, 120), 330, 150 + i * 56, k.indexOf('(car)') >= 0 ? 17 : 22, t.text, { font: 'label', literal: i > 0 });
            });
            creditFooter(cv, t);
            return ui.image('MAIN_GFX', cv);
        }
        ctx.loop('MAIN', 2, render);
        Promise.resolve().then(render).catch((e) => log.warn('first render: ' + (e && e.stack || e)));
    },
});
