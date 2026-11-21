'use strict';
/**
 * data.js - every reading both apps show (Cluster Centre's pages, Cluster Layouts' digital layout), in one object (data()), in base units: speeds km/h,
 * temperatures °C, pressures bar, torque Nm, power kW.
 *
 *   car signals (kit/car.js): speed, rpm, gear, stage, oil, coolant, torque, g (long / lat)
 *   MDrive.dataDisplayGearbox: the S / M programme
 *   EnvironmentalInformation.ExteriorTemperature: outside
 *   BasicDataSet.basicDataSet: gearbox oil
 *   Efficiencytainment2.statusBatteryTemperature: the battery's temperature (avg / min / max)
 *   KombiIF.statusDisplayElectricalPowerDistribution: the car's power distribution figures
 *   KombiIF.statusBordcomputerAverage / statusBordcomputerTravelData: the car's own trip computer (trip 1's average
 *     fuel economy in the unit the car shows it, the distance and the driving time; as Live Data reads them), read-only
 *   the engine unit over UDS (config.dme, as M Vitals reads it): intake air, fuel pressures (high, low), boost
 *     target and actual, ignition timing; the gearbox unit: its oil temperature
 * (No xDrive split: neither the car's split signal nor the transfer case's front torque gave usable readings on the
 * car, Nov 9 2026: removed.)
 *   eDrive Live, through the shared folder: battery charge and power
 *   the battery unit (SME) over UDS: its charge, only while no app shares one (eDrive Live not running), every 15 s
 *
 * The diagnostic reads are the slow part: only the values the page on screen needs are read, about twice a
 * second (want(keys)); the rest every 10 s; none while nothing is shown or nothing wants them (the car shows
 * "Diagnostic mode active" while they run), and none - nor eDrive Live asked for anything - while the car is switched
 * off (kit/awake.js: its own state, else moved or ran in the last 3 min). "Shown" is a setting, on with the car
 * locked: Nov 10 2026 these reads and eDrive Live's for the shared power kept a locked car from sleeping ("Battery
 * management: malfunction while shutting down the vehicle electronics", body controller 801C16 - 801C18).
 */
const Car = require('./kit/car');
const { Diag } = require('./kit/diag');
const { DidReader } = require('./kit/dids');
const { startProviders } = require('./providers');
const { createFuse } = require('./kwfuse');
const Awake = require('./kit/awake');

const isNum = (v) => typeof v === 'number' && isFinite(v);
const PROGRAMS = { S_MINUS_PROGRAMM: 'S', M_MINUS_PROGRAMM: 'M', 1: 'S', 2: 'M' };
const DME_KEYS = ['iat', 'hpfp', 'lpfp', 'timing', 'boostCtl', 'egs', 'pedal', 'throttle', 'tank'];
/* (read twice a round while shown: they move with the right foot) */
const FAST_KEYS = ['pedal', 'throttle'];
/*
 * (Layouts 0.39.1) the high-voltage battery's charge from the battery unit (SME, 0x07) itself, as eDrive reads it:
 * plug-in hybrids DDBC (0.1 %; fully electric cars answer it with no data bytes, so min 0.5), fully electric E5CE
 * (0.01 %). Only while no app shares a charge: two apps asking the battery unit in turn left both without answers.
 */
const HV = { ecu: 7, soc: [
    { did: 'DDBC', bytes: 2, at: 0, factor: 0.1, offset: 0, min: 0.5, max: 100 },
    { did: 'E5CE', bytes: 2, at: 0, factor: 0.01, offset: 0, min: 0, max: 100 }] };
const HV_EVERY_MS = 15000, HV_ALONE_MS = 10000;
/* (0.39.1) the engine unit answers in well under 100 ms: a read that hasn't in 1.5 s won't, and the next one shouldn't
 * wait 4 s (the kit's default) behind it - the pedal and the throttle went stale behind such waits */
const DME_TIMEOUT_MS = 1500;
/** One identifier's value out of its record (62 <DID> <data>), as kit/dids.js reads it; null when implausible. */
function didValue(u, c) {
    const at = 3 + (c.at || 0), n = c.bytes || 1;
    if (!u || u.length < at + n) return null;
    let raw = 0;
    for (let i = 0; i < n; i++) raw = raw * 256 + u[at + i];
    if (c.signed && raw >= Math.pow(2, 8 * n - 1)) raw -= Math.pow(2, 8 * n);
    const v = raw * (c.factor == null ? 1 : c.factor) + (c.offset || 0);
    return (c.min != null && v < c.min) || (c.max != null && v > c.max) ? null : v;
}
/** A reply to several identifiers (62 <DID> <data> <DID> <data> ...) taken apart by each record's length: { did: record } or null. */
function splitReply(u, lens) {
    if (!u || u[0] !== 0x62) return null;
    const out = {};
    for (let i = 1; i < u.length;) {
        if (i + 2 > u.length) return null;
        const did = (u[i] << 8) | u[i + 1], n = lens[did];
        if (n == null || out[did] || i + 2 + n > u.length) return null;
        out[did] = [0x62, u[i], u[i + 1]].concat(Array.prototype.slice.call(u, i + 2, i + 2 + n));
        i += 2 + n;
    }
    return out;
}

/*
 * The driving mode, as the car's FES service sends it: BMW's FES mode table (TAB_FES_MODUS_ARG in the G05's
 * body unit, BDC_G05), by name or number, shown as the stock cluster names them. A plug-in hybrid's modes
 * (PHEV_...) carry the eDrive mode in the name: HYBRID, ELECTRIC, BATTERY CONTROL.
 */
const FES_MODES = [
    [0x01, 'SPORT_DYNAMIC', 'SPORT'], [0x02, 'SPORT_EXPERT', 'SPORT+'], [0x03, 'SPORT_INDIVIDUAL', 'SPORT INDIVIDUAL'],
    [0x04, 'COMFORT', 'COMFORT'], [0x05, 'COMFORT_PLUS', 'COMFORT+'], [0x06, 'COMFORT_INDIVIDUAL', 'COMFORT INDIVIDUAL'],
    [0x07, 'ECO_PRO_EFFICIENT', 'ECO PRO'], [0x08, 'ECO_PRO_PLUS', 'ECO PRO+'], [0x09, 'ECO_PRO_INDIVIDUAL', 'ECO PRO INDIVIDUAL'],
    [0x0A, 'ADAPTIVE', 'ADAPTIVE'], [0x0B, 'OFFROAD_ICE', 'OFFROAD SNOW'], [0x0C, 'OFFROAD_SMOOTH', 'OFFROAD GRAVEL'],
    [0x0D, 'OFFROAD_GRIP', 'OFFROAD SAND'], [0x0E, 'OFFROAD_ROUGH', 'OFFROAD ROCK'],
    [0x0F, 'PHEV_SPORT_STANDARD', 'SPORT'], [0x10, 'PHEV_SPORT_INDIVIDUAL', 'SPORT INDIVIDUAL'],
    [0x11, 'PHEV_HYBRID_STANDARD', 'HYBRID'], [0x12, 'PHEV_HYBRID_ECO', 'HYBRID ECO PRO'], [0x13, 'PHEV_HYBRID_COMFORT', 'HYBRID COMFORT'],
    [0x14, 'PHEV_ELECTRIC_STANDARD', 'ELECTRIC'], [0x15, 'PHEV_ELECTRIC_INDIVIDUAL', 'ELECTRIC INDIVIDUAL'],
    [0x16, 'PHEV_BATTERY_CONTROL', 'BATTERY CONTROL'],
    // by name only (number not known): a plug-in hybrid's Sport Plus is its XtraBoost
    [-1, 'SPORT_PLUS', 'SPORT+'], [-1, 'PHEV_SPORT_PLUS', 'XTRABOOST'],
];
const norm = (str) => String(str).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
/** Every leaf of a value: { key (its field name), v }. */
function leaves(v, out, key) {
    out = out || [];
    if (v && typeof v === 'object') Object.keys(v).forEach((k) => leaves(v[k], out, k));
    else out.push({ key: key || '', v });
    return out;
}
/**
 * The mode a value names: an enum name from the table (the longest that matches, so PHEV_ELECTRIC_INDIVIDUAL
 * before ELECTRIC), else a number from it in a field named like a mode; null for none or an invalid value.
 * XtraBoost (a boost state some modes allow) is added when a string says it is active.
 * ice: a petrol or diesel car (Settings > Vehicle): its own modes only (Sport, Sport+, Comfort, Eco Pro,
 * Adaptive, the off-road ones), never a plug-in hybrid's names, and no XtraBoost.
 */
function modeOf(v, ice) {
    const ls = leaves(v);
    const TABLE = ice ? FES_MODES.filter((m) => !/^PHEV_/.test(m[1])) : FES_MODES;
    let best = null;
    ls.filter((l) => typeof l.v === 'string').forEach((l) => {
        const s = norm(l.v);
        if (/INVALID|UNGUELTIG|NOT_|_NOT|UNAVAILABLE|INITIALI/.test(s)) return;
        TABLE.forEach((m) => {
            const hit = s === m[1] || s.endsWith('_' + m[1]) || s.startsWith(m[1] + '_') || s.indexOf('_' + m[1] + '_') >= 0;
            if (hit && (!best || m[1].length > best[1].length)) best = m;
        });
    });
    if (!best) {
        const n = ls.find((l) => typeof l.v === 'number' && /mode|modus|switch|fes|programm|state|status|value/i.test(l.key) && TABLE.some((m) => m[0] === l.v));
        if (n) best = TABLE.find((m) => m[0] === n.v);
    }
    if (!best) return null;
    const boost = !ice && ls.some((l) => typeof l.v === 'string' && /XTRA_?BOOST|EXTRA_?BOOST/.test(norm(l.v)) && !/NOT|INACTIVE|OFF|INVALID/.test(norm(l.v)));
    return boost && !/XTRABOOST/.test(best[2]) ? best[2] + ' XTRABOOST' : best[2];
}

/**
 * The ranges in a value of KombiIF.statusRangeTankStatus, by field name (they differ by car): range /
 * Reichweite with electric (elec, ev, hv, bev, batt) -> carErange, total -> carTrange, else carFrange; a fuel
 * level -> fuelLevel. Kilometres; 0xFFFE and up are invalid. Returns { name: number }.
 */
/* A range no car gives: a range signal's 12-bit "no value" marks (0xFFD-0xFFF: 4093 km on a G-series plug-in hybrid
 * at 8 % charge, Nov 2026), and an electric range past MAX_ERANGE km. */
const RANGE_NONE = 0xFFD, MAX_ERANGE = 1000;
const rangeOk = (n, electric) => typeof n === 'number' && isFinite(n) && n >= 0 && n < RANGE_NONE && (!electric || n <= MAX_ERANGE);

function rangesOf(v) {
    const out = {};
    leaves(v).forEach((l) => {
        const n = l.v, key = String(l.key).toLowerCase();
        if (typeof n !== 'number' || !isFinite(n) || n < 0 || n >= 0xFFFE) return;
        if (/range|reichweite/.test(key)) {
            const electric = /elec|(^|[^a-z])ev|hv|bev|batt|edrive/.test(key);
            if (!rangeOk(n, electric)) return;
            if (electric) out.carErange = n;
            else if (/total|gesamt|overall|sum/.test(key)) out.carTrange = n;
            else out.carFrange = n;
        } else if (/level|fill|inhalt|volume|liter/.test(key) && /fuel|tank|kraftstoff/.test(key)) {
            // the tank's own level (litres), not its left/right halves (a saddle tank's; 0 and 77 on a G05 PHEV
            // with 38 L in its 69 L tank)
            const half = /left|right|links|rechts/.test(key);
            if (!half) { out.fuelLevel = n; out.fuelWhole = true; } else if (!out.fuelWhole && out.fuelLevel === undefined) out.fuelLevel = n;
        }
    });
    delete out.fuelWhole;
    return out;
}

/* the trip computer's fuel economy unit (KombiIF statusUnitOfMeasurementConsumptionBC, by name or number) */
const CONS_UNITS = { VERBRAUCH_IN_L_S_100KM: 'l100', VERBRAUCH_IN_MPG_UK: 'mpguk', VERBRAUCH_IN_MPG_US: 'mpg', VERBRAUCH_IN_KM_S_L: 'kml', 1: 'l100', 2: 'mpguk', 3: 'mpg', 4: 'kml' };

/** Find objects holding `key` anywhere in a signal's value. */
function entries(v, key, out) {
    out = out || [];
    if (v && typeof v === 'object') { if (key in v) out.push(v); else Object.keys(v).forEach((k) => entries(v[k], key, out)); }
    return out;
}

/** The first value under `key` however deep the binding wraps it. */
function one(v, key, depth) {
    if (!v || typeof v !== 'object' || (depth || 0) > 6) return undefined;
    if (key in v) return v[key];
    for (const k of Object.keys(v)) { const r = one(v[k], key, (depth || 0) + 1); if (r !== undefined) return r; }
    return undefined;
}

function startData(ctx, opts) {
    const { log } = ctx;
    const cfg = ctx.spec.config || {}, S = cfg.scaling || {};
    let carPress = null;     // the car's pressure unit (BAR, KPA, PSI: Vehicle statusNewCurrentUnitsStatusExt, below)
    const sc = (k, raw) => {
        const c = S[k];
        if (!c || raw === undefined || raw === null || raw === c.invalid || typeof raw !== 'number' || (c.invalidFrom != null && raw >= c.invalidFrom)) return null;
        if (c.signed16 && raw > 32767) raw -= 65536;
        return raw * c.factor + (c.offset || 0);
    };
    /** The first number in a value whose field name matches re (else the first number at all). */
    const numberIn = (v, re) => { const ls = leaves(v).filter((l) => typeof l.v === 'number'); const m = ls.find((l) => re.test(l.key)) || ls[0]; return m ? m.v : undefined; };
    const car = new Car(ctx, ['rpm', 'speed', 'temps', 'gear', 'torque', 'accel']);
    // shown and the car switched on: the only time anything is asked of the car's units or of eDrive Live
    // (moving or running from the car's own samples while they still come: the last rpm kept after the samples stopped
    // - the engine switched off without a last 0 - counted the car as running for ever, and it was asked of while parked)
    let sampleAt = 0;
    car.onSample(() => { sampleAt = Date.now(); });
    const awake = Awake.watch(ctx, log, { sample: () => { if (Date.now() - sampleAt > 3000) return {}; const c = car.data(); return { speed: c.speed, rpm: c.rpm }; } });
    const active = () => (!opts || !opts.shown || opts.shown()) && awake.on();
    car.onSample(() => fresh_());
    const x = { at: {} };          // readings that are not the kit's: value and when it came
    /* fresh: whoever shows the data hears of each new reading at once (the engine draws it then, not at its
     * next tick) */
    const freshFns = [];
    /** Settings > Vehicle: 'ice' for a petrol or diesel car (no high-voltage battery), else a plug-in hybrid. */
    /*
     * The vehicle (Settings > Vehicle): a plug-in hybrid, a petrol or diesel car, or Auto (the default): found
     * from the car itself, as other apps identify a car before they assume anything about it: a plug-in hybrid's
     * drive mode names (PHEV_...) or an answer from its high-voltage battery unit say plug-in hybrid; that unit
     * not answering (with the diagnostic link up) says petrol or diesel. Until then: a plug-in hybrid.
     */
    const setting = (k) => (ctx.settings && ctx.settings.get ? ctx.settings.get(k) : undefined);
    const detected = { vehicle: null, why: 'not yet known' };
    let dmeAnswered = false;
    const detect = (v, why) => { if (detected.vehicle !== v) { detected.vehicle = v; detected.why = why; log.info('vehicle: ' + v + ' (' + why + ')'); } };
    /* Settings > Vehicle: Plug-in hybrid, Petrol, Diesel (0.35.7; 'ice', the petrol-or-diesel of before, as Petrol) or Auto */
    const setVehicle = () => { const v = setting('vehicle'); return v === 'petrol' || v === 'diesel' || v === 'ice' ? 'ice' : v === 'phev' ? 'phev' : null; };
    const vehicleNow = () => setVehicle() || detected.vehicle || 'phev';
    /** the engine's fuel: Diesel as set, else petrol (Auto: the car's engine unit is read as a petrol one) */
    const fuelNow = () => (setting('vehicle') === 'diesel' ? 'diesel' : 'petrol');
    const ice = () => vehicleNow() === 'ice';
    const fresh_ = () => { for (const f of freshFns) { try { f(); } catch (e) { /* the listener's own */ } } };
    const put = (k, v) => { if (isNum(v)) { const ch = x[k] !== v; x[k] = v; x.at[k] = Date.now(); if (ch) fresh_(); } };
    const fresh = (k, ms) => isNum(x[k]) && Date.now() - x.at[k] < (ms || 30000);
    const status = {};
    const watch = (iface, handlers, what, o) => ctx.signals.watch(iface, '1', handlers, log, o)
        .then((s) => { status[what] = s.error ? 'error: ' + s.error : 'subscribed'; });

    watch('de.bmw.infotainment.misc.MDrive', {
        dataDisplayGearbox: (v) => { const raw = v && typeof v === 'object' ? (v.dataDisplayGearbox !== undefined ? v.dataDisplayGearbox : Object.keys(v).map((k) => v[k])[0]) : v; x.mode = PROGRAMS[raw] || null; },
    }, 'drive programme');
    // the driving experience switch and, on a plug-in hybrid, the eDrive mode
    // (each signal's raw value is kept for the Signals screen; only its first 20 distinct values go to the log,
    // since the boost pressure in it changes all the time while driving)
    const raw = {}, rawLogged = {};
    // the battery's power between eDrive Live's readings (kwfuse.js; below: "the battery's power"), fed by the car's
    // own power signals here as they come
    const fuse = createFuse();
    /** A number under one of these field names however deep, or null; the binding's invalid values (all bits set) left out. */
    const numAt = (v, key) => { const e = entries(v, key)[0]; const n = e ? e[key] : undefined; return isNum(n) && n !== 255 && n !== 65535 && n !== 0x7FFF && n !== 0xFFFFFFFF ? n : null; };
    const fes = (name) => (v) => {
        const j = String(JSON.stringify(v));   // (undefined for a value that is none: 'undefined', not a throw)
        if (raw[name] !== j) {
            raw[name] = j;
            const n = rawLogged[name] = (rawLogged[name] || 0) + 1;
            if (n <= 20) log.info('raw ' + name + ': ' + j.slice(0, 400) + (n === 20 ? '  (further changes not logged)' : ''));
        }
        if (!/Switch/.test(name)) return;
        // a plug-in hybrid's mode names identify one
        if (setVehicle() !== 'ice' && /PHEV_/.test(JSON.stringify(v))) detect('phev', 'its drive modes are a plug-in hybrid\'s');
        const m = modeOf(v, ice());
        // the HMI's switch field is the one the stock cluster names; the other only while that one says nothing
        const fromHmi = /HMI/.test(name);
        if (m && (fromHmi || x.driveModeFrom !== 'statusFESVehicleDynamicSwitchHMI' || Date.now() - (x.at.driveMode || 0) > 60000)) { x.driveMode = m; x.at.driveMode = Date.now(); x.driveModeFrom = name; }
    };
    watch('de.bmw.infotainment.drivingexcitement.FES', {
        statusFESVehicleDynamicSwitchHMI: fes('statusFESVehicleDynamicSwitchHMI'),
        // the sport display's boost over atmosphere, boost without diagnostics: hundredths of a bar
        // (config.scaling.boost, factor 0.01: tenths read ten times too high against the engine unit and
        // M Vitals, issue #7); 254 and up: none. Each raw value goes to the log once a minute. (0.39.3) In the car's
        // pressure unit, as BMW's sport display shows it: 0.01 bar (or 1 kPa) a step, but 0.1 psi a step on a car set
        // to psi (idrive7-apps issue #186: 20 psi, raw 200, read as 2.0 bar, 29 psi)
        statusSwitchDriveDynamicSport2: (v) => {
            fes('statusSwitchDriveDynamicSport2')(v);
            const b = v && typeof v === 'object' ? v.displayBoostPressure : undefined;
            const bs = S.boost || {}, factor = isNum(bs.factor) ? bs.factor : 0.01, invalid = isNum(bs.invalid) ? bs.invalid : 254;
            if (isNum(b) && Date.now() - (x.at.boostRawLog || 0) > 60000) { x.at.boostRawLog = Date.now(); log.info('raw FES boost ' + b + ' (max ' + (v && v.displayMaximumValueBoostPressure) + ')'); }
            if (isNum(b) && b >= 0 && b < Math.min(254, invalid)) {
                const bar = carPress === 'PSI' ? b * 0.1 / 14.5038 : b * factor + (bs.offset || 0);
                // a car whose sport display sends no boost sends one value all along: the sport display counts once it moves
                if (!isNum(x.boostCarFirst)) x.boostCarFirst = bar; else if (Math.abs(bar - x.boostCarFirst) >= 0.03) x.boostCarMoved = true;
                put('boostCar', bar);
            }
        },
        // the sport display's powertrain power (+ driving, - recuperating; its unit fitted in kwfuse.js)
        displaySportPowertrain: (v) => {
            fes('displaySportPowertrain')(v);
            const p = numAt(v, 'displaySportPowerPowertrain');
            if (p !== null) fuse.signal(Date.now(), 'sport', p);
        },
    }, 'driving mode');
    watch('de.bmw.infrastructure.EnvironmentalInformation', { ExteriorTemperature: (v) => put('outside', sc('ambient', v && v.temperatureExterior)) }, 'outside temperature');
    watch('de.bmw.infrastructure.analytics.BasicDataSet', {
        basicDataSet: (v) => {
            const g = sc('gearboxTemp', v && v.valueTemperatureTransmissionOil);
            if (isNum(g) && g > -40 && g < 160) put('gearbox', g);
        },
    }, 'basic data set');
    watch('de.bmw.infotainment.drivingexcitement.Efficiencytainment2', {
        statusBatteryTemperature: (v) => {
            const e = entries(v, 'actualValueTemperatureHighVoltageStorage')[0];
            const bt = (raw) => { const t = sc('batteryTemp', raw); return isNum(t) && t > -30 && t < 70 ? t : null; };
            if (e) { put('battTemp', bt(e.actualValueTemperatureHighVoltageStorage)); put('battMin', bt(e.actualValueTemperatureHighVoltageStorageMinimum)); put('battMax', bt(e.actualValueTemperatureHighVoltageStorageMaximum)); }
        },
        /* The stock cluster's own power meter: electric drive and recuperation, relative (%). Found in the car's catalog
         * (Nov 10 2026 log); the fastest candidate for the kW gauges, fitted to eDrive Live's readings (kwfuse.js). Re-read
         * every 2 s too: a value that doesn't change may not be notified. */
        statusPowerRelativHybrid: (v) => {
            fes('statusPowerRelativHybrid')(v);
            const drive = numAt(v, 'displayActualValuePowerRelativeDrivingElectric'), recup = numAt(v, 'displayActualValuePowerRelativeRecuperation');
            if (drive !== null || recup !== null) fuse.signal(Date.now(), 'rel', { drive: drive || 0, recup: recup || 0 });
        },
    }, 'battery temperature and power meter', { pollMs: 2000 });
    // the onboard computer's electric consumption now (x the speed: a power), as a third candidate
    watch('de.bmw.infotainment.resetlogic.ResetLogic', {
        currentConsumption: (v) => {
            fes('currentConsumption')(v);
            const c = numAt(v, 'consumptionElectricCurrentDigit');
            if (c !== null) fuse.signal(Date.now(), 'cons', c);
        },
    }, 'consumption now', { pollMs: 2000 });
    // the cruise control's set speed as the head-up display shows it (the driving assistant's view services send nothing
    // on this car): 0 or invalid while it is off; in the display's unit
    watch('de.bmw.infotainment.displaydataserver.DisplayDataServer', {
        functionalLibraryData: (v) => {
            fes('functionalLibraryData')(v);
            const c = numAt(v, 'cruiseCtrlSpeedHUD');
            if (c !== null) { x.cruiseSet = c; x.at.cruiseSet = Date.now(); }
        },
    }, 'cruise control (head-up display)', { pollMs: 2000 });
    /* the car's ranges (KombiIF.statusRangeTankStatus, as installed apps declare it): the fields' names
     * differ by car, so numbers are picked by their names - range / Reichweite, electric (elec, ev, hv, bev)
     * or fuel (fuel, tank, kraftstoff, combustion), and the tank's level; kilometres, invalid at 0xFFFF and up */
    const pickRanges = (v) => { const r = rangesOf(v); Object.keys(r).forEach((k) => put(k, r[k])); };
    // a long trip's distance with its wraps past 65,535 km (statusBordcomputerTravelData)
    const WRAP = 65536, LONG_MIN = 100 * 60;
    let lastLong = null;   // { km, min }: the last long trip's figures as sent, to see a wrap
    const unwrapTrip = (km, min) => {
        if (min === null || min < LONG_MIN) { lastLong = null; return km; }
        let k = Math.max(0, Math.min(30, Math.round(Number(setting('tripWraps')) || 0)));
        if (lastLong && lastLong.km >= 60000 && km < WRAP - 60000 && min >= lastLong.min) {
            k++;
            try { if (ctx.settings && ctx.settings.set) ctx.settings.set('tripWraps', k); } catch (e) { /* kept for this run */ }
            if (ctx.log) ctx.log.info('trip: its distance wrapped past 65,535 km (' + lastLong.km + ' -> ' + km + '): ' + k + ' wraps');
        }
        lastLong = { km, min };
        let out = km + WRAP * k;
        while (k > 0 && isNum(x.odometer) && out > x.odometer + 1) { k--; out -= WRAP; }
        return out;
    };
    // the odometer (km: KombiIF statusRangeTankStatus / VehicleInformation Range mileageKilometre): the trip since delivery
    const odometer = (v) => { const n = one(v, 'mileageKilometre'); if (isNum(n) && n > 0 && n < 2000000) put('odometer', n); };
    // steering angle and yaw rate (as installed apps declare them; scaling in config.scaling, raw values shown)
    watch('de.bmw.chassis.SteeringAngle', {
        ActualSteeringAngleDriver: (v) => { fes('ActualSteeringAngleDriver')(v); const a = sc('steer', numberIn(v, /angle|winkel/i)); if (isNum(a) && Math.abs(a) < 900) put('steer', a); },
    }, 'steering angle');
    watch('de.bmw.infotainment.vehicle.CDS2', {
        statusYawVelocityVehicle: (v) => { fes('statusYawVelocityVehicle')(v); const y = sc('yaw', numberIn(v, /yaw|gier|velocity/i)); if (isNum(y) && Math.abs(y) < 160) put('yaw', y); },
    }, 'yaw rate');
    // the engine's state (running, stopped, and why when the car says): strings shown as the car sends them
    watch('de.bmw.infotainment.vehicle.CDS', {
        statusEngineStatus: (v) => {
            fes('statusEngineStatus')(v);
            const ss = leaves(v).filter((l) => typeof l.v === 'string').map((l) => norm(l.v));
            const run = ss.find((t) => /RUNNING|STARTED|LAEUFT|ENGINE_ON|COMBUSTION_ON/.test(t) && !/NOT_/.test(t));
            const stop = ss.find((t) => /STOP|OFF|NOT_RUNNING|STILLSTAND/.test(t));
            if (run) { x.engineState = 'on'; x.at.engineState = Date.now(); } else if (stop) { x.engineState = 'off'; x.at.engineState = Date.now(); }
            const why = ss.find((t) => /REASON|GRUND|REQUEST|DEMAND|ANFORDERUNG/.test(t));
            if (why) x.startWhy = why.replace(/_/g, ' ');
        },
    }, 'engine status');
    // a range the car's vehicle information service sends (as installed apps declare it)
    watch('de.bmw.infrastructure.VehicleInformation', {
        Range: (v) => { fes('Range')(v); pickRanges(v); odometer(v); },
    }, 'range');
    /*
     * The tyres: pressure and temperature at each corner from the car's tyre monitor (TPMS), as bimmer-lab's Cluster
     * Themes reads it (MIT, Copyright (c) 2026 bimmer-lab). The car never notifies these (BMW's own x_call only reads
     * them), so they are read every 10 s. Pressure: 0.1 x raw in the car's pressure unit (Vehicle
     * statusNewCurrentUnitsStatusExt: bar, kPa or psi; 65532 and up none), kept in bar; temperature: raw - 40 degrees,
     * kept in C (this G05 sent raw 53-57 on a 10 C day, Celsius with the car set to F: so only a value no tyre in C
     * reaches is taken as F).
     */
    const TYRES = ['FL', 'FR', 'RL', 'RR'], PRESS_UNITS = { 1: 'BAR', 2: 'KPA', 3: 'PSI' }, PRESS_TO_BAR = { BAR: 1, KPA: 0.01, PSI: 1 / 14.5038 };
    let tyreRawLogged = false;
    const tyreBar = (raw) => {
        if (!isNum(raw) || raw < 0 || raw >= 65532) return null;
        const v = raw / 10, k = PRESS_TO_BAR[carPress];
        const bar = k ? v * k : v >= 0.5 && v <= 6 ? v : v >= 7 && v < 60 ? v / 14.5038 : v >= 60 && v <= 600 ? v / 100 : null;
        return isNum(bar) && bar > 0.3 && bar < 6 ? bar : null;
    };
    const tyreC = (raw) => {
        if (!isNum(raw) || raw < 0 || raw >= 65535) return null;
        const v = raw - 40, c = v > 85 ? (v - 32) * 5 / 9 : v;
        return c > -40 && c < 150 ? c : null;
    };
    const tyreRead = (key, conv, field) => (v) => {
        if (!tyreRawLogged) { tyreRawLogged = true; log.info('raw tyre ' + field + ': ' + JSON.stringify(v).slice(0, 300)); }
        TYRES.forEach((k) => { const r = conv(one(v, 'actualValue' + field + 'Tyre' + k + 'H')); if (r !== null) put(key + k, r); });
    };
    // (only for an app that shows them, opts.tyres: one that doesn't declare the services gets a warning a start)
    if (opts && opts.tyres) watch('de.bmw.infotainment.vehicle.TPMS', {
        statusTyrePressure: tyreRead('tyreP', tyreBar, 'Pressure'),
        statusTyreTemperature: tyreRead('tyreT', tyreC, 'Temperature'),
    }, 'tyres', { pollMs: 10000 });
    // the car's pressure unit: the tyre pressures and the sport display's boost come in it (every app: the boost)
    watch('de.bmw.infotainment.vehicle.Vehicle', {
        statusNewCurrentUnitsStatusExt: (v) => {
            const u = one(v, 'unitOfMeasurementAirPressure'), n = u && typeof u === 'object' ? (u.name || u.value) : u;
            const p = PRESS_UNITS[n] || (/BAR|KPA|PSI/.test(String(n)) ? String(n).match(/BAR|KPA|PSI/)[0] : null);
            if (p && p !== carPress) { carPress = p; log.info('car pressure unit: ' + p); }
        },
    }, 'units', { pollMs: 60000 });
    watch('de.bmw.infotainment.KombiIF', {
        statusRangeTankStatus: (v) => { fes('statusRangeTankStatus')(v); pickRanges(v); odometer(v); },
        // the trip computer (0.45.0): trip 1's average fuel economy, tenths, in the unit the car's trip computer
        // shows (l/100 km, km/l, mpg); 65535 left out (no value). 0 kept (a trip just reset: the car shows 0.0, so
        // does the cluster - not the last trip's figure). The unit taken from every reply: the car's own unit changed
        // (on the MGU) with no figure in it drops the old figure, which was in the old unit.
        statusBordcomputerAverage: (v) => {
            fes('statusBordcomputerAverage')(v);
            const c = numAt(v, 'consumptionAverage1BC1'), u = one(v, 'statusUnitOfMeasurementConsumptionBC'), n = u && typeof u === 'object' ? (u.name || u.value) : u;
            const unit = CONS_UNITS[n] || null;
            if (unit && unit !== x.avgConsUnit) { if (c === null) x.avgCons = undefined; x.avgConsUnit = unit; }
            if (c !== null && c >= 0) put('avgCons', c / 10);
        },
        // the distance (km) and the driving time on the trip computer
        // (0.48.4) its figures follow the head unit's Trip data > "values shown since" choice (start, refuelling,
        // charging, own reset: seen on a G-series plug-in hybrid, Nov 19 2026); "since delivery" is longer than the
        // distance's field holds (236345 km): no value comes, so the odometer is that trip's distance. A choice's
        // driving time with no value drops the last one's.
        // (0.48.8) its distance is 16 bits: past 65,535 km it starts from 0 again (a plug-in hybrid's own-reset trip:
        // 119,110 km on the car, 53,575 sent, Nov 19 2026). A long trip - its driving time 100 h or more, which a
        // tankful or a day's driving never is - gets Settings > "Trip distance past 65,535 km" x 65,536 km added, never
        // past the odometer; a wrap seen while it counts (from 60,000 up to under 5,536) adds one to that setting.
        statusBordcomputerTravelData: (v) => {
            fes('statusBordcomputerTravelData')(v);
            const km = one(v, 'wayPassed'), h = one(v, 'rideDurationHours'), m = one(v, 'rideDurationMinutes');
            const min = isNum(h) && h >= 0 && h < 0xFFFE && isNum(m) && m >= 0 && m < 60 ? h * 60 + m : null;
            if (min !== null) put('tripMin', min); else if (h !== undefined) x.tripMin = undefined;
            if (isNum(km) && km >= 0 && km < 0xFFFE) put('tripKm', unwrapTrip(km, min));
            else if (km !== undefined) { if (isNum(x.odometer)) put('tripKm', x.odometer); else x.tripKm = undefined; }
        },
        // the cluster's own electric range (in this car's catalog), in the unit the cluster shows: miles on a car
        // set to miles (read as km it came out 1.6 times too low), so by the app's speed unit; kept here in km.
        // (Its displayRangeMaximum is the scale's end, not a range.)
        displayRangeElectricVehicle: (v) => {
            fes('displayRangeElectricVehicle')(v);
            const n = numberIn(v, /^displayRangeElectricVehicle$/);
            const miles = !(ctx.settings && ctx.settings.get && ctx.settings.get('speedUnit') === 'kmh');
            if (isNum(n) && rangeOk(n) && rangeOk(miles ? n * 1.609344 : n, true)) put('carErange', miles ? n * 1.609344 : n);
        },
        statusDisplayElectricalPowerDistribution: (v) => {
            const e = entries(v, 'displayRepartitionDriveElectricPower')[0];
            if (!e || e.displayRepartitionDriveElectricPower === 255) return;
            ['Drive', 'AirConditioning', 'ElectricSeatHeater'].forEach((k, i) => {
                const raw = e['displayRepartition' + k + (k === 'ElectricSeatHeater' ? '' : 'ElectricPower')];
                if (isNum(raw) && raw !== 255) put(['pdDrive', 'pdClimate', 'pdSeats'][i], raw);
            });
        },
    }, 'power distribution', { pollMs: 15000 });

    /* ---------- the engine unit, the gearbox unit and the transfer case over UDS ---------- */
    const dme = Object.assign({ ecu: 18 }, cfg.dme || {});
    Object.keys(dme).forEach((k) => { if (Array.isArray(dme[k])) dme[k] = dme[k].map((c) => Object.assign({ timeoutMs: DME_TIMEOUT_MS }, c)); });
    const link = new Diag(ctx.signals, log);
    link.quiet = true;
    link.init();
    const rd = new DidReader(link, { ecu: dme.ecu });
    const fail = {}, tried = {};
    let baro = 101.3, baroT = 0, wanted = [], wantedT = 0, timer = null;
    /* the battery unit's charge (HV): while shown and no app has shared a charge for HV_ALONE_MS, not on a petrol or
     * diesel car, every HV_EVERY_MS; five misses in a row (no battery unit, or another app holding it): 5 minutes */
    const hv = Object.assign({}, HV, cfg.battery || {});
    let hvAt = 0, hvMiss = 0, sharedAt = Date.now();
    const hvDue = () => {
        const now = Date.now(), p = providers.readings();
        if (isNum(p.soc) || providers.powerShared()) { sharedAt = now; return false; }
        return !ice() && (hv.soc || []).length > 0 && now - sharedAt >= HV_ALONE_MS
            && now - hvAt >= (hvMiss >= 5 ? 300000 : HV_EVERY_MS);
    };
    async function readOne(k) {
        if (k === 'fast') return readFast(fastKeys);
        if (k === 'hvSoc') {
            hvAt = Date.now();
            const v = await rd.value('hvSoc', hv.soc.map((c) => Object.assign({ ecu: hv.ecu }, c)));
            if (v !== null) { hvMiss = 0; put('socSme', v); } else hvMiss++;
            return v;
        }
        if (k === 'boostCtl') {
            if (Date.now() - baroT > 60000) { baroT = Date.now(); const b = await rd.value('baro', dme.baro); if (b !== null) baro = b; }
            const tg = await rd.value('boostTarget', dme.boostTarget);
            if (tg === null) return null;
            const ac = await rd.value('boostActual', dme.boostActual);
            // bar over the outside air, from 0: a closed throttle's vacuum reads 0, not below it
            put('boostTarget', Math.max(0, (tg - baro) / 100));
            if (ac !== null) put('boostActual', Math.max(0, (ac - baro) / 100));
            return tg;
        }
        // (the high-voltage battery is eDrive Live's alone: its charge and power come from its shared file, below.
        // Two apps asking the battery unit in turn left both without answers, eDrive Live showing 'NO REPLY'.)
        const v = await rd.value(k, dme[k]);
        // (the pedal: the engine unit's own normalised pedal angle, as Live Data reads it; the car's pedal signal's
        // scaling is unconfirmed, its value kept apart and used only when the engine unit has none)
        // (the throttle: the throttle valve's opening, its lower stop 0 %, as Live Data reads it - not the pedal)
        // (the tank: the engine unit's own fill in %, OBD PID 0x2F, as Live Data's 'Fuel tank level' reads it)
        if (k === 'tank') { if (v !== null) put('fuelPctDme', Math.max(0, Math.min(100, v))); return v; }
        if (v !== null) putDme(k, v);
        return v;
    }
    const putDme = (k, v) => { const pct = k === 'pedal' || k === 'throttle'; put(k === 'egs' ? 'gearbox' : pct ? k + 'Dme' : k, pct ? Math.max(0, Math.min(100, v)) : v); };
    /*
     * (0.39.1) The pedal and the throttle together, in one request (22 <pedal> <throttle>, as Live Data reads several
     * at once): once each has answered alone with a DID (its record's length then known). Refused or not taken apart
     * twice: each alone again. Read every other turn while shown, the engine on or not (on electricity the pedal
     * still moves): before, one of them a turn, twice a 10 s round, each waiting behind the rest - slow next to the
     * revs and the boost (the car's own signals), and gone ('--') behind a reading that didn't answer.
     */
    let pairOff = 0, fastKeys = [];
    async function readFast(keys) {
        const cs = keys.map((k) => (dme[k] || [])[rd.pick[k] || 0]);
        const raw = (c) => (c ? rd.raws[rd.key(c)] : null);
        if (keys.length === 2 && pairOff < 2 && cs.every((c, i) => c && c.did && rd.pick[keys[i]] !== undefined && raw(c) && raw(c).ok)) {
            const dids = cs.map((c) => parseInt(c.did, 16)), lens = {}, data = [];
            cs.forEach((c, i) => { lens[dids[i]] = raw(c).bytes.split(' ').length - 3; data.push(dids[i] >> 8, dids[i] & 0xFF); });
            let u = null;
            try {
                u = await link.physical(dme.ecu, 0x22, data, DME_TIMEOUT_MS, (r) => (r[0] === 0x62 && dids.indexOf((r[1] << 8) | r[2]) >= 0) || (r[0] === 0x7F && r[1] === 0x22));
            } catch (e) { u = null; }
            const parts = splitReply(u, lens);
            if (parts && dids.every((d) => parts[d])) {
                let got = 0;
                keys.forEach((k, i) => { const v = didValue(parts[dids[i]], cs[i]); if (v !== null) { got++; putDme(k, v); } });
                if (got) return got;
            }
            if (u) { pairOff++; log.info('pedal and throttle in one request: ' + (u[0] === 0x7F ? 'refused' : 'not taken apart') + (pairOff >= 2 ? ', each alone from now' : '')); }
        }
        let got = 0;
        for (const k of keys) { if ((await readOne(k)) !== null) got++; }
        return got || null;
    }
    let slowAt = 0, queue = [];
    /*
     * One turn: one reading, round-robin: what the layout wants, every DME reading every 10 s.
     * Only while shown: each read puts "Diagnostic mode active" on the cluster.
     */
    let lastPollErr = '';
    async function poll() {
        const on = active();
        const now = Date.now(), wantedNow = on && now - wantedT < 3000;
        const usable = (k) => (k === 'boostCtl' ? (dme.boostTarget || []).length
            : (dme[k] || []).length);
        const ready = (k) => !((fail[k] || 0) >= 3 && Date.now() - (tried[k] || 0) < 30000);
        if (!queue.length && on) {
            /* With the engine off (on electricity) the engine unit's readings don't move: only the every-10 s round.
             * Each read is a request through the car's gateway, the one eDrive Live's battery reads go through. */
            const engineOff = car.data().engineOn === false;
            // the pedal and the throttle (when shown): every other turn, both in one request (readFast)
            fastKeys = wantedNow ? wanted.filter((k) => FAST_KEYS.indexOf(k) >= 0).filter(usable) : [];
            let rest = wantedNow && !engineOff ? wanted.filter((k) => DME_KEYS.indexOf(k) >= 0 && FAST_KEYS.indexOf(k) < 0) : [];
            if (wantedNow && now - slowAt > 10000) { slowAt = now; DME_KEYS.forEach((k) => { if (FAST_KEYS.indexOf(k) < 0 && rest.indexOf(k) < 0) rest.push(k); }); }
            rest = rest.filter(usable);
            queue = [];
            if (fastKeys.length) { queue.push('fast'); rest.forEach((k) => queue.push(k, 'fast')); } else queue = rest;
        }
        const turn = on && hvDue() ? ['hvSoc'] : on && queue.length ? [queue.shift()] : [];
        let asked = 0;
        try {
            if (link.available) {
                for (const k of turn) {
                    if (!ready(k)) continue;
                    asked++;
                    tried[k] = Date.now();
                    const v = await readOne(k);
                    // (the battery unit's misses its own: hvMiss)
                    fail[k] = v === null && k !== 'hvSoc' ? (fail[k] || 0) + 1 : 0;
                    if (v !== null && k !== 'hvSoc') dmeAnswered = true;
                }
            }
        } catch (e) { const m = String(e); if (m !== lastPollErr) { lastPollErr = m; log.warn('diagnostic poll: ' + m); } }   // (once per distinct error)
        // the next reading soon, with a gap so the link isn't held; nothing asked, the link down or every reading
        // resting after failures: no spinning, a look again soon
        // (at most 4 a second: these share the diagnostic gateway with eDrive Live's battery reads, 10 a second)
        timer = setTimeout(poll, !turn.length ? 2000 : 250);
    }
    timer = setTimeout(poll, 1500);

    /* ---------- eDrive Live's charge and power, asked for while shown ---------- */
    const providers = startProviders(log, { onChange: () => fresh_() });
    /* Auto vehicle: a plug-in hybrid by its drive modes (above), eDrive Live sharing its battery readings or the
     * car giving an electric range; none of these in 90 s shown, while the engine unit answers (so the link is up),
     * a petrol or diesel car. A later sign of a plug-in hybrid changes it back. */
    /* The power gauges' ends: eDrive Live's (the battery's discharge and charge limits), the largest it has
     * shared, rounded up (10 kW, 5 kW): a scale that holds still while the limits move with the cells'
     * temperature and charge. */
    const kwEnds = { out: null, in: null };
    const endsOf = (p) => {
        if (isNum(p.kwOut) && p.kwOut > 0) kwEnds.out = Math.max(kwEnds.out || 0, Math.ceil(p.kwOut / 10) * 10);
        if (isNum(p.kwIn) && p.kwIn > 0) kwEnds.in = Math.max(kwEnds.in || 0, Math.ceil(p.kwIn / 5) * 5);
        return kwEnds;
    };
    /* The battery's power between eDrive Live's readings (kwfuse.js): its readings fitted to the power at the wheels
     * from the car's speed and acceleration, many times a second. Settings > kW: Fast (the default) or Readings only. */
    let lastKwAt = null;
    /* the G meter's acceleration (JDM 2: gLatZ, gLongZ, g): each axis's offset learned while the car stands and taken
     * off (as Car Vitals: an owner's car read 0.6-0.7 g idling; parked on a slope, the slope too until the next stop),
     * then smoothed over about 150 ms (as G Force) */
    const gz = { gLat: { z: 0, n: 0, s: null }, gLong: { z: 0, n: 0, s: null } };
    let gStill = 0, gAt = 0;
    const gZeroed = (o, tNow) => {
        if (!isNum(o.speed) || o.speed > 0.5) gStill = 0; else if (!gStill) gStill = tNow;
        const standing = gStill > 0 && tNow - gStill > 2000, dt = gAt ? Math.min(500, Math.max(0, tNow - gAt)) : 0;
        gAt = tNow;
        const k = dt > 0 ? 1 - Math.exp(-dt / 150) : 1;
        ['gLat', 'gLong'].forEach((key) => {
            const g = o[key], z = gz[key];
            if (!isNum(g) || Math.abs(g) > 3) return;    // (a road car can't pull 3 g: a bad sample)
            if (!o.demo && standing && Math.abs(g) <= 1) { z.n = Math.min(z.n + 1, 50); z.z += (g - z.z) / z.n; }
            const v = g - (o.demo ? 0 : z.z);
            z.s = z.s === null ? v : z.s + (v - z.s) * k;
            o[key + 'Z'] = Math.round(z.s * 100) / 100;
        });
    };
    const fastKw = () => setting('kwFast') !== 'off';
    let shownFor = 0;
    const vehicleTimer = setInterval(() => {
        if (setVehicle()) return;
        const p = providers.readings();
        if (providers.powerShared() || isNum(p.soc)) return detect('phev', 'eDrive Live shares its battery readings');
        if (fresh('socSme', 60000)) return detect('phev', 'the battery unit answers with its charge');
        if (fresh('carErange', 120000) && x.carErange > 0) return detect('phev', 'the car gives an electric range');
        if (opts && opts.shown && active()) shownFor += 5000;
        if (!detected.vehicle && dmeAnswered && shownFor >= 90000) detect('ice', 'no drive modes, electric range or eDrive Live of a plug-in hybrid (the engine unit answers)');
    }, 5000);
    // while shown with the car on, ask eDrive Live to share; otherwise let go at once (providers.js: Cluster Info's file)
    const wantTimer = setInterval(() => { if (opts && opts.shown && active()) providers.want({ power: true, values: ['soc', 'battery', 'oil'] }); else providers.release(); }, 1000);

    return {
        car,
        /** Everything now, in base units. */
        data() {
            const d = car.data(), p = providers.readings();
            // ranges: an app that shares them first (eDrive Live), else the car's own signal
            // the battery: eDrive Live's (it alone reads the battery unit); its power between readings from the car's
            // own speed and acceleration (kwfuse.js), with Settings > kW: Fast
            const tNow = Date.now();
            if (!d.demo) {
                fuse.sample(tNow, { speed: d.speed, gLong: d.gLong, engineOn: d.engineOn });
                // (a new reading: taken a little before eDrive Live wrote it)
                if (isNum(p.kw) && isNum(p.kwAt) && p.kwAt !== lastKwAt) { lastKwAt = p.kwAt; fuse.measure(p.kwAt - 100, p.kw); }
            }
            const fz = !d.demo && fastKw() ? fuse.now(tNow) : null;
            const o = Object.assign({}, d, { mode: x.mode, soc: isNum(p.soc) ? p.soc : !d.demo && fresh('socSme', 60000) ? x.socSme : undefined,
                kw: fz ? fz.kw : isNum(p.kw) ? p.kw : undefined, kwRead: isNum(p.kw) ? p.kw : undefined, kwFused: !!(fz && fz.fused), kwModel: fz && fz.model ? fz.model : undefined, kwOut: endsOf(p).out || undefined, kwIn: kwEnds.in || undefined, driveMode: x.driveMode,
                erange: isNum(p.erange) && rangeOk(p.erange, true) ? p.erange : fresh('carErange', 120000) ? x.carErange : undefined,
                frange: isNum(p.frange) && rangeOk(p.frange) ? p.frange : fresh('carFrange', 120000) ? x.carFrange : undefined,
                trange: fresh('carTrange', 120000) ? x.carTrange : undefined, fuelLevel: fresh('fuelLevel', 120000) ? x.fuelLevel : undefined });
            // the tyres: { p: { FL.. } bar, t: { FL.. } C }, each fresh for a minute (read every 10 s)
            o.tyres = { p: {}, t: {} };
            ['FL', 'FR', 'RL', 'RR'].forEach((k) => { if (fresh('tyreP' + k, 60000)) o.tyres.p[k] = x['tyreP' + k]; if (fresh('tyreT' + k, 60000)) o.tyres.t[k] = x['tyreT' + k]; });
            ['steer', 'yaw', 'outside', 'gearbox', 'battTemp', 'battMin', 'battMax', 'pdDrive', 'pdClimate', 'pdSeats', 'iat', 'hpfp', 'lpfp', 'timing', 'boostTarget', 'boostActual']
                .forEach((k) => { if (!d.demo && fresh(k, 60000)) o[k] = x[k]; });
            // the trip computer (read every 15 s and on its notices: kept 2 minutes)
            ['avgCons', 'tripKm', 'tripMin'].forEach((k) => { if (!d.demo && fresh(k, 120000)) o[k] = x[k]; });
            if (!d.demo && fresh('odometer', 600000)) o.odometer = x.odometer;   // (0.48.8: the ODO readout)
            if (isNum(o.avgCons)) o.avgConsUnit = x.avgConsUnit;
            // boost: the car's sport display's, as BMW's sport display shows it (once it has moved), else the engine unit's
            // (fast, while a layout wants it; its target is the engine unit's alone)
            if (!d.demo && fresh('boostCar', 5000) && (x.boostCarMoved || !isNum(o.boostActual))) o.boostActual = x.boostCar;
            // (the engine unit's only: the car's pedal signal's scaling is unconfirmed - Redline saw 60-96 % at a light
            // touch with it - so its value goes to the log alone, never on the cluster)
            // (kept 8 s: a round of the engine unit's readings can take 3 s or more while driving, its replies slower)
            if (!d.demo) { o.pedal = fresh('pedalDme', 8000) ? x.pedalDme : undefined; o.throttle = fresh('throttleDme', 8000) ? x.throttleDme : undefined; }
            if (d.demo) Object.assign(o, demo(d));
            if (isNum(o.iat) && isNum(o.outside)) o.iatRise = o.iat - o.outside;
            if (isNum(o.battTemp) === false && p.battery !== undefined) o.battTemp = p.battery;
            o.engineOn = isNum(o.rpm) ? o.rpm > 300 : undefined;
            // the engine's power (kW) from its own torque (the crankshaft's, FES) and speed
            if (isNum(o.torque) && isNum(o.rpm)) o.enginePower = o.engineOn ? o.torque * o.rpm / 9549.3 : 0;
            // no electric range from the car or an app yet: an estimate from the charge and the range a full battery
            // gives (Settings > Electric range when full, miles), shown with '~'
            if (!isNum(o.erange) && isNum(o.soc) && !ice()) {
                const full = Number(ctx.settings && ctx.settings.get && ctx.settings.get('eFull')) || Number(cfg.eFullMiles) || 31;
                o.erange = Math.max(0, o.soc) / 100 * full * 1.609344; o.erangeEst = true;
            }
            // the tank's fill, 0..100 %: the engine unit's own (OBD tank level, the one Live Data shows) while it
            // answers, else the car's litres over the tank's size (config.tankLitres: 69 for an X5 45e). The two
            // differ by a few % (the car's litres are whole litres, its gauge's own reckoning): Settings > Fuel %
            // from picks one.
            const tank = Number(setting('tankLitres')) || Number(cfg.tankLitres) || 69;   // Settings > Fuel tank size
            const byLitres = isNum(o.fuelLevel) ? Math.max(0, Math.min(100, o.fuelLevel / tank * 100)) : undefined;
            const byDme = !d.demo && setting('fuelFrom') !== 'litres' && fresh('fuelPctDme', 60000) ? x.fuelPctDme : undefined;
            o.fuelPct = isNum(byDme) ? byDme : byLitres;
            o.fuelPctFrom = isNum(byDme) ? 'engine' : isNum(byLitres) ? 'litres' : undefined;
            if (o.engineOn === undefined && Date.now() - (x.at.engineState || 0) < 60000) o.engineOn = x.engineState === 'on';
            if (x.startWhy) o.startWhy = x.startWhy;
            // the cruise control: on with a set speed (the head-up display's), off at 0
            if (!d.demo && Date.now() - (x.at.cruiseSet || 0) < 10000) o.cruise = { on: x.cruiseSet > 0 && x.cruiseSet < 250, set: x.cruiseSet > 0 && x.cruiseSet < 250 ? x.cruiseSet : undefined };
            gZeroed(o, tNow);
            return o;
        },
        /** The page on screen needs these (data keys): read them fast. */
        want(keys) { wanted = keys.map((k) => (k === 'boostTarget' || k === 'boostActual' ? 'boostCtl' : k === 'gearbox' ? 'egs' : k)); wantedT = Date.now(); },
        status: () => Object.assign({ car: awake.why() + (awake.on() ? '' : ' - nothing asked of the car'), diag: link.available ? 'up' : 'down', providers: providers.list().join(', ') || 'none', raw, kwFit: fuse.fit(),
            // which candidate answered for each engine-unit reading ('5814', 'OBD 49' ...), for the app's page
            dme: Object.keys(rd.pick).reduce((m, k) => { const c = (dme[k === 'boostActual' || k === 'boostTarget' ? k : k] || [])[rd.pick[k]]; if (c) m[k] = c.obd ? 'OBD ' + String(c.obd).toUpperCase() : c.did; return m; }, {}) }, status),
        /** The vehicle in use: { vehicle 'phev' | 'ice', fuel 'petrol' | 'diesel' (ice), how: 'set' | 'found' | 'assumed', why }. */
        vehicle: () => ({ vehicle: vehicleNow(), fuel: vehicleNow() === 'ice' ? fuelNow() : null, how: setVehicle() ? 'set' : detected.vehicle ? 'found' : 'assumed', why: detected.why }),
        /** fn() on each new reading (the car's speed and rpm samples, every changed reading). */
        onFresh(fn) { freshFns.push(fn); },
        /** The car's state (kit/awake.js): { on, parked, why }. */
        awake: () => ({ on: awake.on(), parked: awake.parked(), why: awake.why() }),
        stop() { clearTimeout(timer); clearInterval(wantTimer); clearInterval(vehicleTimer); providers.stop(); },
    };
}

/** Demo values for the readings the kit's simulator has none of. */
function demo(d) {
    const t = Date.now() / 1000, rpm = d.rpm || 1500;
    return {
        outside: 9, gearbox: 72 + 4 * Math.sin(t / 50), iat: 34 + 6 * Math.sin(t / 20), hpfp: 50 + rpm / 40, lpfp: 5.2 + 0.2 * Math.sin(t),
        timing: 18 - rpm / 800, pedal: Math.max(0, Math.min(100, (isNum(d.torque) ? d.torque : 40) / 4.2)), throttle: Math.max(0, Math.min(100, (isNum(d.torque) ? d.torque : 40) / 4.6 + 3)), boostTarget: Math.max(0, (rpm - 1500) / 4000), boostActual: Math.max(0, (rpm - 1600) / 4100),
        battTemp: 27, battMin: 25, battMax: 29, soc: 64, kw: -12 + 25 * Math.sin(t / 7), pdDrive: 60, pdClimate: 25, pdSeats: 15,
        avgCons: 11.7, avgConsUnit: 'kml', tripKm: 126, tripMin: 150, odometer: 48210,
        erange: 29, frange: 520, fuelLevel: 38,
        tyres: { p: { FL: 2.48, FR: 2.50, RL: 2.62, RR: 2.60 }, t: { FL: 24, FR: 25, RL: 27, RR: 26 } },
    };
}

module.exports = { startData, DME_KEYS, FAST_KEYS, entries, modeOf, rangesOf, FES_MODES };
