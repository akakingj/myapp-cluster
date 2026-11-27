'use strict';
/**
 * adas_probe.js - whether this car's head unit gets what the instrument cluster's assisted driving view is drawn
 * from (lanes, the cars around, the cruise control and the steering assist), for Settings > Driving assistant check.
 * Read only: it subscribes and lists, it never calls a method or writes a field.
 *
 *   - The services the view is built from on a G05 (de.bmw.dass.*, as shared/dap.js reads them), each subscribed
 *     with its broadcast: whether this car's catalog has it (the installer made its config), whether anything
 *     provides it, how many values came and the last one.
 *   - The head-up display's own data (DisplayDataServer.functionalLibraryData): the HUD is fed from the head unit,
 *     so what the HUD shows of the driving assistant may come this way; its members that look like the driving
 *     assistant's are picked out.
 *   - The head unit's service catalog (/etc/oap/someip/someip-interfaces.json): every service whose name looks like
 *     the driving assistant's, with its fields and broadcasts, to be declared in app.json by a later version.
 *   - Every member (field, broadcast, method) of any service in that catalog whose name looks like the brakes', the
 *     parking brake's or Auto Hold's (BRAKE_RE): the cluster draws its AUTO H light under the apps' layers (2026-11-26,
 *     the parking brake's over them), so an app would draw it itself if the head unit gets its state. Listed only: a
 *     member is read once an app.json declares it (tools/known_signals.json).
 *   - (1.10.25) Every member of any service in that catalog named for a speed limit or a traffic sign, and every member of
 *     a service named so (SIGN_RE, SIGN_IFACE_RE), and whether TrafficSignRecognition / SignRecognitionFrontCamera are
 *     in it: the camera's sign, which vSLISpeedValue is not. Listed only: declaring a service the catalog does not have
 *     gets the app refused by the head unit (tools/known_signals.json), so it is declared once its names are known.
 *   - The speed limit in the HUD's data (xSpeedLimitAssist: vSLISpeedValue, vSLISymbol, statusVZA ..., and any other
 *     member named for a speed limit): each change logged at once, with the car's speed and the time, to match the
 *     figures to the speed limit sign the cluster shows.
 *
 * The cluster's picture itself is drawn in the cluster, from the car's own bus: nothing of it reaches the head
 * unit, so only its data can be looked for here.
 *
 * Everything goes to cluster-info-adas.log in the app's data folder too (the catalog once, each source's first three
 * values and one a minute, every change of state; at most 2 x 256 KiB).
 *
 *   const pr = startAdasProbe(ctx, log, { want: () => settings.get('adasCheck') !== 'off' });
 *   pr.status()   -> { sources: [...], hud: {...}, catalog: {...} }
 */
const fs = require('fs');
const path = require('path');

const CATALOG = process.env.SOMEIP_CATALOG || '/etc/oap/someip/someip-interfaces.json';
const SOURCES = [
    { iface: 'de.bmw.dass.AssistedDrivingViewFunctionInput', name: 'assistedDrivingViewFunctionInputIbVip', short: 'cruise control (IbVip)' },
    { iface: 'de.bmw.dass.pad.communication.AssistedDrivingViewLateralFunctionInput', name: 'lateralFunctionInputAssistedDrivingView', short: 'steering assist (lateral)' },
    { iface: 'de.bmw.dass.driverassistanceapplications.AssistedDrivingViewLateralCollisionAvoidance', name: 'assistedDrivingViewLcaInput', short: 'lane warnings (LCA)' },
    { iface: 'de.bmw.dass.pad.communication.ObjectListSuAAR', name: 'suAARObjectList', short: 'cars around (object list)' },
];
const HUD = { iface: 'de.bmw.infotainment.displaydataserver.DisplayDataServer', name: 'functionalLibraryData' };
/* a service's name that looks like the driving assistant's (or the HUD's) */
const IFACE_RE = /\.dass\.|assistedDriving|driverAssist|drivingAssist|kafas|\badas|objectList|surround|laneDeparture|laneChange|laneKeep|headUp|\bhud|displaydataserver/i;
/* a member of the HUD's data that looks like the driving assistant's */
const MEMBER_RE = /acc|cruise|lane|ldw|lka|lcw|lca|assist|object|target|distance|gap|follow|steer|lateral|longitud|vehicle(ahead|front)|warn|collision|speedlimit|sli\b/i;
/* a member of the HUD's data that belongs to the speed limit (Speed Limit Info, its assist: VZA; pia.pia...SliNpi: the
   driver's choice of showing it, in the cluster and in the HUD) - not the limiter (statusLimiter) */
const SLI_RE = /speedlimit|vsli|vza|slinpi/i;
/* a service member that looks like the brakes', the parking brake's or Auto Hold's (CDS.statusHandBrake is one) */
const BRAKE_RE = /hold|hand_?brake|park_?brake|parking_?brake|standstill|stillstand|brake|bremse|\bepb|\bdsc|\bhdc|drive_?away|anfahr/i;
/* (1.10.25) the real speed limit sign: vSLISpeedValue is only the limit Speed Limit Assist has taken for the limiter or
   the cruise control (Nov 24 and 27 2026 logs). Any member of any service named for a speed limit or a traffic sign, and
   every member of a service named so - to find the camera's sign or the traffic sign recognition (on another car:
   de.bmw.dass.TrafficSignRecognition, presentClassLimitSpeed x 5; SignRecognitionFrontCamera's list of signs) */
const SIGN_RE = /speed_?limit|traffic_?sign|sign_?recognition|vsli|vza|(^|[^a-z])sli|tsr\b/i;
const SIGN_IFACE_RE = /traffic_?sign|sign_?recognition|speed_?limit/i;
/* the services looked for by name, at the end of the service's name */
const SIGN_SERVICES = ['TrafficSignRecognition', 'SignRecognitionFrontCamera', 'TrafficSignRecognitionFrontCamera'];
const LOG_MAX = 256 * 1024;

/** Every leaf of a value as 'a.b.c=v' (arrays: their length and the first two), at most `max`. */
function leaves(v, max) {
    const out = [];
    const walk = (x, p, d) => {
        if (out.length >= max) return;
        if (x === null || typeof x !== 'object') { out.push(p + '=' + (typeof x === 'string' ? JSON.stringify(x) : String(x))); return; }
        if (d > 6) { out.push(p + '=…'); return; }
        if (Array.isArray(x)) { out.push(p + '.length=' + x.length); x.slice(0, 2).forEach((e, i) => walk(e, p + '[' + i + ']', d + 1)); return; }
        Object.keys(x).forEach((k) => walk(x[k], p ? p + '.' + k : k, d + 1));
    };
    walk(v, '', 0);
    return out;
}

/** The HUD data's speed limit members as 'a.b=v', its figures (...SpeedValue) first (a value sent as JSON text read as
 *  JSON). */
function sliOf(v) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } }
    const all = leaves(v, 400).filter((l) => SLI_RE.test(l.split('=')[0])), fig = (l) => /speedvalue/i.test(l.split('=')[0]);
    return all.filter(fig).concat(all.filter((l) => !fig(l)));
}

/** A catalog service's members by kind: { fields: [names], broadcasts: [...], ... }. */
function partsOf(entry) {
    const parts = {};
    Object.keys(entry || {}).forEach((k) => {
        const v = entry[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) parts[k] = Object.keys(v);
        else if (Array.isArray(v)) parts[k] = v.map((e) => (e && typeof e === 'object' ? e.name || JSON.stringify(e).slice(0, 40) : String(e)));
    });
    return parts;
}

/** The catalog's services whose name matches: [{ iface, parts: { fields: [names], broadcasts: [...], ... } }], and
 * (brakes) every member of any service whose name matches BRAKE_RE: [{ iface, kind, name }]. */
function scanCatalog(file, re) {
    let db;
    try { db = JSON.parse(fs.readFileSync(file || CATALOG, 'utf8')); } catch (e) { return { list: [], brakes: [], signs: [], signServices: [], total: 0, error: 'catalog not readable: ' + (e.code || e.message) }; }
    const ifs = db.interfaces || {}, list = [], brakes = [], signs = [];
    Object.keys(ifs).forEach((iface) => {
        const parts = partsOf(ifs[iface]), signIface = SIGN_IFACE_RE.test(iface);
        Object.keys(parts).forEach((kind) => parts[kind].forEach((name) => {
            if (BRAKE_RE.test(name)) brakes.push({ iface, kind, name });
            if (signIface || SIGN_RE.test(name)) signs.push({ iface, kind, name });
        }));
        if ((re || IFACE_RE).test(iface)) list.push({ iface, parts });
    });
    list.sort((a, b) => a.iface.localeCompare(b.iface));
    brakes.sort((a, b) => a.iface.localeCompare(b.iface) || a.name.localeCompare(b.name));
    signs.sort((a, b) => a.iface.localeCompare(b.iface) || a.name.localeCompare(b.name));
    // the services looked for by name: in this catalog (their names) or not
    const signServices = SIGN_SERVICES.map((n) => {
        const found = Object.keys(ifs).filter((i) => i === n || i.endsWith('.' + n));
        return { name: n, found, what: found.length ? 'in the catalog (not declared by this app: no value read yet)' : 'not in this car\'s catalog' };
    });
    return { list, brakes, signs, signServices, total: Object.keys(ifs).length, error: null };
}

/** One line for a brakes' member: 'de.bmw.infotainment.vehicle.CDS  fields statusHandBrake'. */
const brakeLine = (b) => b.iface + '  ' + b.kind + ' ' + b.name;

/** One line for a catalog entry: 'de.bmw.dass.X  fields a, b  broadcasts c'. */
const catalogLine = (e) => e.iface + '  ' + Object.keys(e.parts).filter((k) => e.parts[k].length).map((k) => k + ' ' + e.parts[k].join(', ')).join('  ');

function startAdasProbe(ctx, log, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const want = opts.want || (() => true);
    const dir = opts.dir || ctx.dataDir || '.';
    const file = path.join(dir, 'cluster-info-adas.log');
    const state = SOURCES.concat([HUD]).map((s) => ({ iface: s.iface, name: s.name, short: s.short || 'HUD data (DisplayDataServer)',
        status: 'not started', available: false, count: 0, last: null, lastAt: 0, logged: 0, loggedAt: 0, sub: null }));
    const hud = state[state.length - 1];
    let catalog = null, started = false, said = {};
    const sli = { now: [], key: null, changes: [] };      // the speed limit members now, and their last changes

    function write(line) {
        try {
            try { if (fs.statSync(file).size > LOG_MAX) fs.renameSync(file, file + '.1'); } catch (e) { /* none yet */ }
            fs.appendFileSync(file, new Date(now()).toISOString() + ' ' + line + '\n');
        } catch (e) { /* the data folder not writable: the page still shows it */ }
    }
    const note = (s, what) => {
        if (said[s.iface] === what) return;
        said[s.iface] = what;
        write(s.short + ': ' + what);
        if (log) log.info('driving assistant check: ' + s.short + ': ' + what);
    };

    function onValue(s) {
        return (v) => {
            const t = now();
            s.count++; s.last = v; s.lastAt = t;
            if (s === hud) onSli(v, t);
            if (s.logged < 3 || t - s.loggedAt > 60000) {
                s.logged++; s.loggedAt = t;
                write(s.short + ' value ' + s.count + ': ' + JSON.stringify(v).slice(0, 4000));
            }
        };
    }

    /* the speed limit members: each change written at once (the HUD's data comes every 2 s or on a change) */
    function onSli(v, t) {
        const now = sliOf(v), key = now.join('  ');
        if (key === sli.key) return;
        sli.key = key; sli.now = now;
        let o = v;
        if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = {}; } }
        const kmh = o && o.speed && typeof o.speed.kmH === 'number' ? o.speed.kmH : null;
        const line = (kmh === null ? '' : 'at ' + kmh + ' km/h  ') + (key || '(none)');
        sli.changes.unshift({ at: t, line });
        sli.changes.length = Math.min(sli.changes.length, 8);
        write('speed limit: ' + line);
        if (log) log.info('driving assistant check: speed limit: ' + line);
    }

    function start() {
        if (started) return;
        started = true;
        catalog = scanCatalog(opts.catalog);
        write('catalog ' + (opts.catalog || CATALOG) + ': ' + (catalog.error || catalog.list.length + ' of ' + catalog.total + ' services look like the driving assistant\'s or the HUD\'s'));
        catalog.list.forEach((e) => write('  ' + catalogLine(e)));
        if (!catalog.error) {
            write('catalog: ' + catalog.signs.length + ' members look like a speed limit\'s or a traffic sign\'s');
            catalog.signs.forEach((b) => write('  ' + brakeLine(b)));
            catalog.signServices.forEach((v) => write('  ' + v.name + ': ' + v.what + (v.found.length ? ' - ' + v.found.join(', ') : '')));
            if (log) {
                log.info('driving assistant check: ' + catalog.signs.length + ' speed limit / traffic sign members');
                catalog.signServices.forEach((v) => log.info('driving assistant check: ' + v.name + ': ' + v.what + (v.found.length ? ' - ' + v.found.join(', ') : '')));
                catalog.signs.slice(0, 40).forEach((b) => log.info('driving assistant check: signs: ' + brakeLine(b)));
            }
        }
        if (!catalog.error) write('catalog: ' + catalog.brakes.length + ' members look like the brakes\', the parking brake\'s or Auto Hold\'s');
        (catalog.brakes || []).forEach((b) => write('  ' + brakeLine(b)));
        if (log) log.info('driving assistant check: ' + (catalog.error || catalog.list.length + ' catalog services, ' + catalog.brakes.length + ' brake members'));
        if (log && !catalog.error) catalog.brakes.slice(0, 40).forEach((b) => log.info('driving assistant check: brakes: ' + brakeLine(b)));   // (all in the adas log)
        state.forEach((s) => {
            s.status = 'subscribing';
            Promise.resolve().then(() => ctx.signals.watch(s.iface, '1', { [s.name]: onValue(s) }, log, s === hud ? { pollMs: 2000, active: want } : undefined))
                .then((sub) => {
                    s.sub = sub;
                    if (sub && sub.error) s.status = /no SOME\/IP config/.test(sub.error) ? 'not in this car\'s catalog' : 'error: ' + sub.error;
                    else s.status = 'subscribed';
                    note(s, s.status);
                })
                .catch((e) => { s.status = 'error: ' + e; note(s, s.status); });
        });
    }

    /** Each source's state now, for the page. */
    function sources() {
        const t = now();
        return state.map((s) => {
            const avail = !!(s.sub && s.sub.available);
            const what = s.status !== 'subscribed' ? s.status
                : !avail && !s.count ? 'in the catalog, nothing provides it'
                    : !s.count ? 'provided, no value yet' : 'values coming';
            note(s, what);
            return { short: s.short, iface: s.iface, what, available: avail, count: s.count,
                age: s.lastAt ? t - s.lastAt : null, sample: s.last === null ? '' : JSON.stringify(s.last) };
        });
    }

    /** The HUD data's members that look like the driving assistant's, as 'name=value'. */
    function hudMembers(max) {
        if (hud.last === null) return [];
        return leaves(hud.last, 400).filter((l) => MEMBER_RE.test(l.split('=')[0])).slice(0, max || 30);
    }

    const timer = opts.manual ? null : setInterval(() => { if (want()) start(); }, 1000);
    if (timer && timer.unref) timer.unref();
    if (want()) start();

    return {
        start,
        started: () => started,
        stop() { if (timer) clearInterval(timer); },
        status: () => ({ started, sources: started ? sources() : [], hud: hudMembers(30), sli: { now: sli.now, changes: sli.changes },
            catalog: catalog || { list: [], brakes: [], signs: [], signServices: [], total: 0, error: null } }),
        file,
    };
}

module.exports = { startAdasProbe, scanCatalog, catalogLine, brakeLine, leaves, sliOf, SOURCES, HUD, IFACE_RE, MEMBER_RE, SLI_RE, BRAKE_RE, SIGN_RE, SIGN_SERVICES };
