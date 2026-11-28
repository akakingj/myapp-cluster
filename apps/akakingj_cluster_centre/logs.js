'use strict';
/**
 * logs.js - what's needed to find a problem on the car, gathered into one text, and ways to get it out:
 *   - QR codes on the app's screen (qr.js): photograph them and send the photos; tools/decode_logs.py puts
 *     the text back together. No network needed: the unit's firewall lets nothing connect in, and an app's
 *     traffic out only through the uids the uplink allows, so a phone can't fetch from an app.
 *   - a file on any USB stick plugged into the car (/media/<label>, as the unit mounts sticks) and in the app's
 *     data folder.
 *
 * A code's text (1.11.1 / Layouts 0.67.2 / Centre 0.16.5): "CLG2 <bundle id> <n>/<count> <a slice of the zlib-deflated
 * bundle in base45 (RFC 9285)>." - alphanumeric mode (qr.js), the last '.' not the data's (a reader may drop a last
 * space). About 30 % fewer codes than CLG1's base64 in byte mode (Info's log of 27 Nov 16:35: 21 codes, now 15). tools/decode_logs.py reads both.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { encode, capacityAlnum, ALNUM } = require('./qr');
/* the screen's two lines in the app's language (the Store builds the apps in Korean); English without the kit */
let lang = 'en';
try { lang = require('./kit/i18n').getLanguage(); } catch (e) { /* tools and tests: English */ }
const KO = /^ko/.test(lang);

const RENDER_LOG = '/var/opt/cluster-render/log/cluster-render.log';
/* where the unit mounts USB sticks (udisks: /media/<label>); nothing else is written to */
const MEDIA_ROOTS = ['/media', '/run/media'];
/* per code: version 15 at level M holds 600 alphanumeric characters; the header ('CLG2 ABCDE 99/99 ') 17, the end '.' 1 */
const CHUNK = capacityAlnum(15, 'M') - 18;

/** Bytes as base45 (RFC 9285): two bytes in three characters, a last odd byte in two. */
function base45(buf) {
    let out = '';
    for (let i = 0; i < buf.length; i += 2) {
        if (i + 1 < buf.length) {
            const n = buf[i] * 256 + buf[i + 1];
            out += ALNUM[n % 45] + ALNUM[Math.floor(n / 45) % 45] + ALNUM[Math.floor(n / 2025)];
        } else out += ALNUM[buf[i] % 45] + ALNUM[Math.floor(buf[i] / 45)];
    }
    return out;
}

/** The last `lines` lines of a file (and its rotated .1 when the file is short), or why not. */
function tail(file, lines) {
    const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
    let text = read(file);
    if (text === null) {
        try { fs.accessSync(file); } catch (e) { return '(' + file + ': ' + (e.code || e.message) + ')'; }
        return '(' + file + ': not readable)';
    }
    let ls = text.split('\n');
    if (ls.length < lines) { const old = read(file + '.1'); if (old) ls = old.split('\n').concat(ls); }
    return ls.slice(-lines).join('\n');
}

/** Another app's log beside this one (oap_<uid>/data/<id>.log), when this app can read it. */
function siblingLog(dataDir, id, lines) {
    try {
        const root = path.join(dataDir, '..', '..');
        for (const d of fs.readdirSync(root)) {
            const f = path.join(root, d, 'data', id + '.log');
            if (fs.existsSync(f)) return tail(f, lines);
        }
    } catch (e) { /* not listable */ }
    return '(' + id + '.log not found beside this app)';
}

/** The bundle as text: a header, then each [title, body] section. */
function bundle(head, sections) {
    return ['=== ' + head + ' ===', 'at ' + new Date().toISOString()].concat(...sections.map(([t, b]) => ['', '--- ' + t + ' ---', String(b == null ? '' : b)])).join('\n') + '\n';
}

/** Writes the text to the app's data folder and every writable USB stick: [{ file } | { dir, error }]. */
function save(text, dataDir, name) {
    const out = [], file = name || 'cluster-logs-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    const tryDir = (dir) => {
        // (the unit's node throws EEXIST for a folder that is there, even with recursive)
        try { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { if (e.code !== 'EEXIST') throw e; } fs.writeFileSync(path.join(dir, file), text); out.push({ file: path.join(dir, file) }); } catch (e) { out.push({ dir, error: e.code || e.message }); }
    };
    if (dataDir) {
        tryDir(path.join(dataDir, 'exports'));
        // keep the newest five
        try {
            const d = path.join(dataDir, 'exports');
            fs.readdirSync(d).filter((f) => /^cluster-logs-/.test(f)).sort().slice(0, -5).forEach((f) => fs.unlinkSync(path.join(d, f)));
        } catch (e) { /* nothing to tidy */ }
    }
    MEDIA_ROOTS.forEach((root) => {
        let names = [];
        try { names = fs.readdirSync(root); } catch (e) { return; }
        names.forEach((n) => {
            const p = path.join(root, n);
            let st;
            try { st = fs.statSync(p); } catch (e) { return; }
            if (!st.isDirectory()) return;
            // /run/media/<user>/<label>: one level more
            let inner = [];
            try { inner = root === '/run/media' ? fs.readdirSync(p).map((x) => path.join(p, x)) : [p]; } catch (e) { inner = [p]; }
            inner.forEach((d) => tryDir(path.join(d, 'cluster-logs')));
        });
    });
    return out;
}

/** The QR codes for a text: { id, codes: [{ size, get(x, y) }] }. */
const packed = (text) => base45(zlib.deflateSync(Buffer.from(text, 'utf8'), { level: 9 }));
/** How many codes a text takes. */
function codeCount(text) { return Math.max(1, Math.ceil(packed(text).length / CHUNK)); }
function codes(text) {
    const z = packed(text);
    const id = Date.now().toString(36).slice(-5).toUpperCase(), n = Math.max(1, Math.ceil(z.length / CHUNK));
    const list = [];
    for (let i = 0; i < n; i++) {
        const payload = 'CLG2 ' + id + ' ' + (i + 1) + '/' + n + ' ' + z.slice(i * CHUNK, (i + 1) * CHUNK) + '.';
        list.push(encode(payload, { ecl: 'M', maxVersion: 15, alnum: true }));
    }
    return { id, codes: list, bytes: z.length };
}

/** Draws a code at x, y, `px` pixels a module, with a white quiet zone of 4 modules, on a canvas or recorder
 * (fillRect): each row's dark runs as one rectangle. */
function draw(cv, q, x, y, px) {
    const quiet = 4 * px, full = (q.size + 8) * px;
    cv.fillRect(x, y, full, full, '#ffffff');
    for (let r = 0; r < q.size; r++) {
        let start = -1;
        for (let c = 0; c <= q.size; c++) {
            const dark = c < q.size && q.get(c, r);
            if (dark && start < 0) start = c;
            if (!dark && start >= 0) { cv.fillRect(x + quiet + start * px, y + quiet + r * px, (c - start) * px, px, '#000000'); start = -1; }
        }
    }
    return full;
}

/**
 * Where save() put the full logs, as the Logs page says it: { en, ko, file } - on a USB stick; a stick the head unit
 * mounts read-only for the apps here (EROFS: the owner's car, two different sticks, Cluster Info and AK Cluster ID8
 * alike) and the file in the app's data folder instead; or no stick at all. layout: Layouts' wording of the last.
 */
function savedNote(saved, again) {
    const isData = (r) => /[\\/]exports[\\/]/.test(r.file || '');
    const usb = (saved || []).filter((r) => r.file && !isData(r)), failed = (saved || []).filter((r) => r.dir && r.error);
    const inData = (saved || []).filter((r) => r.file && isData(r));
    if (usb.length) return { en: 'The full logs are also on the USB stick: ', ko: '전체 로그는 USB에도 저장했습니다: ', file: usb[0].file };
    if (failed.length) return { en: 'The USB stick is read-only, so it cannot be written: the full logs are saved in the app data folder: ',
        ko: 'USB가 읽기 전용이라 저장할 수 없습니다. 로그는 앱 데이터 폴더에 저장됨: ', file: inData.length ? inData[0].file : '' };
    return { en: 'Plug in a USB stick and press ' + (again || 'Logs again from the start') + ' for the full logs as a file',
        ko: 'USB를 꽂고 처음부터 로그 버튼을 다시 누르면 전체 로그를 파일로 저장합니다', file: '' };
}

/** An app's Logs button: press() saves the full bundle (bundleOf(true)) to the data folder and the USB sticks as
 * cluster-logs-<tag>-<time>.txt and shows the short one's (bundleOf(false)) codes, three a page; each press the next
 * page, after the last none. draw(cv, t, W) draws the page shown. btn: the button's name on the page ({ en, ko };
 * Logs: AK Cluster Info's Test log has its own, 1.13.0). */
function pager(bundleOf, dataDir, log, tag, btn) {
    btn = btn || { en: 'Logs', ko: '로그' };
    const PER = 3;
    let view = null;
    return {
        active: () => !!view,
        close() { view = null; },
        press() {
            if (view) { view.page++; if (view.page * PER >= view.codes.length) view = null; return; }
            const saved = save(bundleOf(true), dataDir, 'cluster-logs-' + tag + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt');
            saved.forEach((r) => log && log.info('logs: ' + (r.file ? 'saved ' + r.file : r.dir + ': ' + r.error)));
            view = { codes: codes(bundleOf(false)).codes, page: 0, saved };
        },
        draw(cv, t) {
            const n = view.codes.length, pages = Math.ceil(n / PER), first = view.page * PER;
            const note = savedNote(view.saved), last = Math.min(n, first + PER);
            cv.text(KO ? btn.ko + ': 코드를 하나씩 사진으로 찍으세요 (' + pages + '쪽 중 ' + (view.page + 1) + '쪽, 코드 ' + (first + 1) + '-' + last + ' / ' + n + '). 다음 쪽은 ' + btn.ko + ' 버튼'
                : btn.en + ': photograph each code (page ' + (view.page + 1) + ' of ' + pages + ', codes ' + (first + 1) + '-' + last + ' of ' + n + '), then press ' + btn.en + ' for the next', 40, 34, 20, t.text, { font: 'bold', literal: true });
            cv.text((KO ? note.ko : note.en) + note.file, 40, 62, 16, t.dim, { font: 'label', literal: true });
            view.codes.slice(first, first + PER).forEach((q, i) => {
                const px = Math.max(3, Math.floor(420 / (q.size + 8)));
                draw(cv, q, 40 + i * 520, 84, px);
                cv.text(String(first + i + 1) + ' / ' + n, 40 + i * 520 + 180, 84 + (q.size + 8) * px + 22, 18, t.text, { font: 'bold', literal: true });
            });
        },
    };
}

module.exports = { tail, siblingLog, bundle, save, savedNote, codes, codeCount, base45, draw, pager, RENDER_LOG, CHUNK };
