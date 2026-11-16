# tools/mgu: the MGU screen in the cluster demo

The app's own centre-display screen, as the car shows it, for `tools/cluster_demo.js` (it starts `emu.js` itself;
`node tools/cluster_demo.js --no-mgu` without it). The app runs on the PC with the kit (`kit/tools/hu-stub.js`), and
the browser draws what it sends with the head unit's renderer compiled to WebAssembly.

| Files | From | Licence |
|---|---|---|
| `emu.js`, `web/index.html`, `web/emu-app.js`, `web/emu.css` | [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) `kit/tools/emu.js`, `kit/emu/web/` (commit e74194f), changed here as `emu.js`'s header says | MIT, Copyright (c) 2026 cauliflowermossgrape |
| `web/gfx/mgu-gfx.js`, `web/gfx/mgu-gfx-wasm.js`, `web/gfx/mgu-gfx-wasm.wasm` | the same repository, `kit/emu/web/gfx/` (unchanged) | GPL-3.0-or-later (`gfx-src/LICENSE`; parts also MIT, `gfx-src/LICENSE.mgu-renderd`) |
| `gfx-src/` | their corresponding source: `kit/emu/wasm/` and `kit/renderd/src/` (`gfx.c`, `gfx.h`, `dialect.c`, `dialect.h`, `proto.h`) of the same commit, unchanged; `build.sh` builds the WebAssembly in the original repository's layout | GPL-3.0-or-later |
| `stage.js`, `preload.js` | this repository | as the repository |

`stage.js` stages an app as `kit/tools/build.py --language ko` does for what runs here (the app's code, the kit, the
Korean words and font, the localised settings) into a temporary folder; nothing of BMW's SDK is used or written. Each
app's settings on the PC are kept in `.demo/mgu/<id>/` (not in git).
