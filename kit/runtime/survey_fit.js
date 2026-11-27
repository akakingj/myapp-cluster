'use strict';
/**
 * survey_fit.js - a signal survey's declarations, fitted to THIS car's interface catalog when the app is built or
 * installed on it (Node 8: it runs on the head unit).
 *
 * An app may only read what its manifest declares, and declaring a field with an access the car's catalog lacks (r:
 * a getter, s: a notifier), an event without its eventId or a service the car hasn't got gets the whole app refused
 * by the head unit's installer. So a survey - reading services whose names are known from one car's catalog, to see
 * whether anything comes - can't be written into app.json "signals" for every car. Instead app.json "survey" says
 * what to look for (by service and member name, and by name patterns over the whole catalog), and this file, given
 * the car's own catalog, adds to the manifest only what that catalog has, with the accesses it has:
 *
 *   - a field: r where the catalog gives it a getter (id 1 - 32767), s where it gives a notifier (id 32768 - 65535);
 *     a group marked readOnce gets r alone (read once at the start); neither: left out
 *   - an event (broadcast): only with a valid eventId (32768 - 65535)
 *   - a service the catalog lacks, or with no instance it names ('1', 'Main_Instance', else its first): left out
 *   - never a method, never a setter (w): the survey only reads
 *   - a service the app already declares (app.json "signals", the platform's own) is never touched
 *   - at most request.max members (60) in all, the groups' order deciding which go
 *
 * What it added and left out goes to survey-signals.json next to this file, which the app reads; done again (the
 * installer runs it twice: a check, then the install) it first takes out what it added before (that file's "added"),
 * so the result is the same. Without a readable catalog nothing is added and the app installs as it would without a
 * survey.
 *
 * (The accesses as deploy/mgu-app-install.sh's optional_missing in akakingj/myapp-id7 already trims them for every
 * app: a getter for r, a notifier for s. The ids' ranges are SOME/IP's: methods and getters under 0x8000, events and
 * notifiers from it.)
 *
 *   request (app.json "survey"): { max: 60, groups: [ { id, iface | ifaceMatch | match, fields: '*' | 'regex',
 *       events: '*' | 'regex', sign, readOnce, fast } ] }
 *     iface: one service; ifaceMatch: every service whose name matches; match: every service whose name matches
 *     (all its fields and events) and every field or event of any other service whose name matches
 *   fit(manifest, request, catalog, previous) -> report (manifest changed in place)
 *   catalogLines(catalog, request) -> ['<iface>|i:<instances>|f:<field>:<g?n?>,…|e:<event>,…|m:<methods>']
 *
 *   node survey_fit.js <catalog.json> <manifest.json> <kit dir>   (reads survey-request.json, writes
 *     survey-signals.json there and the manifest in place)
 */
const fs = require('fs');
const path = require('path');

const REQUEST = 'survey-request.json', REPORT = 'survey-signals.json';
const validId = (n, lo, hi) => typeof n === 'number' && Math.floor(n) === n && n >= lo && n <= hi;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const idOf = (x) => (isObj(x) ? x.id : x);

/** A catalog part (fields / events / methods) as { name: definition }, whether it is an object or a list. */
function byName(part) {
    const out = {};
    if (Array.isArray(part)) part.forEach((e) => { if (isObj(e) && e.name) out[e.name] = e; });
    else if (isObj(part)) Object.keys(part).forEach((k) => { out[k] = isObj(part[k]) ? part[k] : {}; });
    return out;
}

/** The instance to read a service on: '1', else 'Main_Instance', else the catalog's first; null with none. */
function instanceOf(catalog, iface) {
    const ids = catalog && catalog.instanceIDs && catalog.instanceIDs[iface];
    if (!isObj(ids)) return null;
    const keys = Object.keys(ids).filter((k) => ids[k] !== null && ids[k] !== undefined);
    return keys.indexOf('1') >= 0 ? '1' : keys.indexOf('Main_Instance') >= 0 ? 'Main_Instance' : keys[0] || null;
}

const re = (s) => (s instanceof RegExp ? s : new RegExp(String(s), 'i'));
const picks = (want, name) => !!want && (want === '*' || re(want).test(name));

/** A field's accesses from the catalog: 'r' (a getter), 's' (a notifier), 'rs'; readOnce: 'r' alone. */
function fieldFlags(def, readOnce) {
    const get = def && validId(idOf(def.getter), 1, 32767), note = def && validId(idOf(def.notifier), 32768, 65535);
    return (get ? 'r' : '') + (note && !readOnce ? 's' : '');
}

/**
 * What the request finds in the catalog, in the groups' order: { items: [{ iface, instance, kind: 'field' |
 * 'event', member, flags, group, sign, readOnce, fast }], dropped: [{ iface, member, kind, group, why }] }. taken: the
 * services the app declares itself (left alone). At most request.max items; the rest dropped.
 */
function plan(request, catalog, taken, all) {
    const defs = (catalog && catalog.interfaces) || {}, items = [], dropped = [], seen = {};
    const max = request && request.max > 0 ? request.max : 60;
    const names = Object.keys(defs).sort();
    const isTaken = (i) => !!(taken && taken[i]);
    const add = (g, iface, kind, member, def) => {
        const key = iface + '\n' + kind + '\n' + member;
        if (seen[key]) return;
        seen[key] = true;
        const base = { iface, kind, member, group: g.id };
        if (all) { items.push(Object.assign(base, { def })); return; }
        if (kind === 'field') {
            const flags = fieldFlags(def, !!g.readOnce);
            if (!flags) { dropped.push(Object.assign(base, { why: g.readOnce ? 'no getter' : 'no getter or notifier' })); return; }
            items.push(Object.assign(base, { instance: instanceOf(catalog, iface), flags, sign: !!g.sign, readOnce: !!g.readOnce, fast: !!g.fast }));
        } else {
            if (!validId(def && def.eventId, 32768, 65535)) { dropped.push(Object.assign(base, { why: 'no valid eventId' })); return; }
            items.push(Object.assign(base, { instance: instanceOf(catalog, iface), flags: 'e', sign: !!g.sign, readOnce: false, fast: !!g.fast }));
        }
    };
    /* one service: its fields and events the group asks for (all: whole) */
    const service = (g, iface, whole, memberRe) => {
        const d = defs[iface];
        if (!isObj(d)) { dropped.push({ iface, member: '', kind: 'service', group: g.id, why: 'not in this car\'s catalog' }); return; }
        if (isTaken(iface)) { dropped.push({ iface, member: '', kind: 'service', group: g.id, why: 'declared by the app already' }); return; }
        if (!all && !instanceOf(catalog, iface)) { dropped.push({ iface, member: '', kind: 'service', group: g.id, why: 'no instance in the catalog' }); return; }
        const fields = byName(d.fields), events = byName(d.events);
        Object.keys(fields).sort().forEach((n) => { if (whole || picks(g.fields, n) || (memberRe && memberRe.test(n))) add(g, iface, 'field', n, fields[n]); });
        Object.keys(events).sort().forEach((n) => { if (whole || picks(g.events, n) || (memberRe && memberRe.test(n))) add(g, iface, 'event', n, events[n]); });
    };
    ((request && request.groups) || []).forEach((g) => {
        if (g.iface) service(g, g.iface, false);
        else if (g.ifaceMatch) names.filter((i) => re(g.ifaceMatch).test(i) && !isTaken(i)).forEach((i) => service(g, i, false));
        else if (g.match) {
            const m = re(g.match);
            names.forEach((i) => {
                if (isTaken(i) || !isObj(defs[i])) return;
                if (m.test(i)) { service(g, i, true); return; }
                const hit = Object.keys(byName(defs[i].fields)).concat(Object.keys(byName(defs[i].events))).some((n) => m.test(n));
                if (hit) service(g, i, false, m);
            });
        }
    });
    if (!all) items.splice(max).forEach((it) => dropped.push({ iface: it.iface, member: it.member, kind: it.kind, group: it.group, why: 'over the ' + max + ' limit' }));
    return { items, dropped };
}

/**
 * Adds to manifest.proxies what plan() finds, each service on its instance with its fields' accesses and its events
 * (never methods). previous: the last report (its "added" services are taken out first). Returns the report.
 */
function fit(manifest, request, catalog, previous) {
    const proxies = manifest.proxies || (manifest.proxies = {});
    ((previous && previous.added) || []).forEach((i) => { delete proxies[i]; });
    const report = { v: 1, at: new Date().toISOString(), catalog: false, max: (request && request.max) || 60, declared: [], dropped: [], added: [] };
    if (!catalog || !isObj(catalog.interfaces) || !Object.keys(catalog.interfaces).length) {
        report.error = 'no catalog: nothing declared';
        return report;
    }
    report.catalog = true;
    const taken = {};
    Object.keys(proxies).forEach((i) => { taken[i] = true; });
    const p = plan(request, catalog, taken);
    p.items.forEach((it) => {
        const e = proxies[it.iface] || (proxies[it.iface] = { instances: it.instance });
        if (report.added.indexOf(it.iface) < 0) report.added.push(it.iface);
        if (it.kind === 'field') (e.attributes || (e.attributes = {}))[it.member] = it.flags;
        else (e.broadcasts || (e.broadcasts = [])).push(it.member);
    });
    report.declared = p.items;
    report.dropped = p.dropped;
    return report;
}

/** One line a service, for each service the request's groups touch in the catalog (what it has, not what was kept). */
function catalogLines(catalog, request) {
    const defs = (catalog && catalog.interfaces) || {};
    const lines = [];
    // every member the groups ask for, whatever its accesses and instances, the app's own services too, no limit
    const p = plan(request, catalog, {}, true);
    const by = {};
    p.items.forEach((it) => { (by[it.iface] || (by[it.iface] = { f: [], e: [] }))[it.kind === 'field' ? 'f' : 'e'].push(it.member); });
    Object.keys(by).sort().forEach((i) => {
        const d = defs[i] || {}, fields = byName(d.fields), ids = (catalog.instanceIDs || {})[i];
        by[i].f.sort(); by[i].e.sort();
        const f = by[i].f.map((n) => n + ':' + (validId(idOf(fields[n].getter), 1, 32767) ? 'g' : '') + (validId(idOf(fields[n].notifier), 32768, 65535) ? 'n' : ''));
        lines.push(i + '|i:' + (isObj(ids) ? Object.keys(ids).join(',') : '-') + '|f:' + f.join(',') + '|e:' + by[i].e.join(',') + '|m:' + Object.keys(byName(d.methods)).length);
    });
    return lines;
}

/** The files version: kit dir with survey-request.json; the report written beside it. Returns the report or null. */
function fitFiles(catalogPath, manifestPath, kitDir, log) {
    let request;
    try { request = JSON.parse(fs.readFileSync(path.join(kitDir, REQUEST), 'utf8')); } catch (e) { return null; }
    let catalog = null, previous = null, why = null;
    try { catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')); } catch (e) { why = 'catalog not readable: ' + (e.code || e.message); }
    try { previous = JSON.parse(fs.readFileSync(path.join(kitDir, REPORT), 'utf8')); } catch (e) { /* none yet */ }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const report = fit(manifest, request, catalog, previous);
    if (why) report.error = why;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(kitDir, REPORT), JSON.stringify(report, null, 1));
    if (log) log('signal survey: ' + report.declared.length + ' declared, ' + report.dropped.length + ' left out' + (report.error ? ' (' + report.error + ')' : ''));
    return report;
}

if (require.main === module) {
    const a = process.argv.slice(2);
    if (a.length < 3) { console.error('usage: node survey_fit.js <catalog.json> <manifest.json> <kit dir>'); process.exit(2); }
    try { fitFiles(a[0], a[1], a[2], (m) => console.log('  ' + m)); } catch (e) { console.error('signal survey: ' + e.message); process.exit(1); }
}

module.exports = { fit, plan, catalogLines, fitFiles, instanceOf, fieldFlags, byName, REQUEST, REPORT };
