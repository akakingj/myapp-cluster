'use strict';
/**
 * stage.js - an app staged to run on the PC as the MGU Store builds it (kit/tools/build.py --language ko), in
 * JavaScript alone: no Python, no SDK. Only what kit/tools/hu-stub.js reads: source/javascript/ with the app's code
 * (main.js as app.js, its .wad files) and kit/ (kit/runtime, the Korean font, locale.json with the Korean words,
 * app-spec.json with the settings' labels in Korean). Nothing here goes to the car or to GitHub: it is written to
 * a temporary folder.
 *
 *   const { stageApp } = require('./stage');
 *   const dir = stageApp('akakingj_cluster_layouts', os.tmpdir() + '/akcl-mgu');   // -> <out>/<id>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KIT = path.join(ROOT, 'kit');

function copyDir(from, to) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach((f) => {
        const a = path.join(from, f), b = path.join(to, f);
        if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
    });
}

/* kit/tools/localize.py: localize_spec, text */
function localizeSpec(spec, words) {
    const text = (v) => { const s = String(v); return (Object.prototype.hasOwnProperty.call(words, s) ? words[s] : s).replace(' (default)', ' ' + (words['(default)'] || '(default)')); };
    const s = JSON.parse(JSON.stringify(spec));
    s.title = text(s.title);
    (s.screens || []).forEach((sc) => {
        if ('title' in sc) sc.title = text(sc.title);
        (sc.buttons || []).forEach((b) => { b[1] = text(b[1]); });
        (sc.items || []).forEach((it) => { if (it.length > 2 && typeof it[2] === 'string') it[2] = text(it[2]); });
    });
    (s.settings || []).forEach((st) => {
        st.label = text(st.label);
        if (typeof st.section === 'string') st.section = text(st.section);
        (st.options || []).forEach((o) => { o[1] = text(o[1]); });
    });
    return s;
}

/**
 * Windows has no Unix sockets: the renderer's socket is a named pipe there (\\.\pipe\...), which fs.statSync does not
 * see as a socket. The staged renderd.js takes a pipe's name as there (this copy only; kit/runtime is unchanged).
 */
function patchRenderd(file) {
    const src = fs.readFileSync(file, 'utf8');
    const a = 'const isSocket = (p) => { try { return fs.statSync(p).isSocket(); } catch (e) { return false; } };';
    if (src.indexOf(a) < 0) throw new Error('stage: renderd.js isSocket not found');
    fs.writeFileSync(file, src.replace(a, 'const isSocket = (p) => { if (/^\\\\\\\\[.?]\\\\pipe\\\\/.test(p)) return true; try { return fs.statSync(p).isSocket(); } catch (e) { return false; } };'));
}

function stageApp(id, outRoot, language) {
    language = language || 'ko';
    const adir = path.join(ROOT, 'apps', id);
    const spec = JSON.parse(fs.readFileSync(path.join(adir, 'app.json'), 'utf8'));
    const words = language === 'en' ? {} : JSON.parse(fs.readFileSync(path.join(KIT, 'runtime', 'locales', language + '.json'), 'utf8'));
    const stage = path.join(outRoot, id), js = path.join(stage, 'source', 'javascript'), kit = path.join(js, 'kit');
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(kit, { recursive: true });
    // the app's code (build.py: *.js, main.js as app.js; .wad / .wasm and the licences as they are)
    fs.readdirSync(adir).forEach((f) => {
        const p = path.join(adir, f);
        if (fs.statSync(p).isDirectory()) return;
        if (f.endsWith('.js')) fs.copyFileSync(p, path.join(js, f === 'main.js' ? 'app.js' : f));
        else if (/\.(wasm|wad|pack)$/.test(f) || f === 'LICENSE' || f === 'NOTICE') fs.copyFileSync(p, path.join(js, f));
    });
    // the kit
    copyDir(path.join(KIT, 'runtime'), kit);
    patchRenderd(path.join(kit, 'renderd.js'));
    if (language === 'ko') {
        try { fs.unlinkSync(path.join(kit, 'fonts', 'cjk.json')); } catch (e) { /* none */ }
        ['korean.json', 'OFL-NotoSansKR.txt'].forEach((f) => fs.copyFileSync(path.join(KIT, 'localization', 'fonts', f), path.join(kit, 'fonts', f)));
    }
    const s = localizeSpec(spec, words);
    const rt = {};
    ['id', 'title', 'version', 'screens', 'settings', 'config', 'startWidget'].forEach((k) => { rt[k] = s[k] === undefined ? null : s[k]; });
    rt.id = rt.id || id;
    rt.stateIds = {};
    (s.screens || []).forEach((sc, i) => { rt.stateIds[sc.name] = i + 1; });
    rt.stateIds.SETTINGS = (s.screens || []).length + 1;
    fs.writeFileSync(path.join(kit, 'app-spec.json'), JSON.stringify(rt, null, 1));
    fs.writeFileSync(path.join(kit, 'locale.json'), JSON.stringify({ language, strings: words }));
    return stage;
}

module.exports = { stageApp, localizeSpec };
