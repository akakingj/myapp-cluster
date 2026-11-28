'use strict';
/**
 * layout_adas.js - "ADAS": the cluster as one wide night road, after the new cars' driving-assistant views. No gauges:
 * the road ahead fills the screen down to the car's own bottom strip (shaders.js ADAS_FS: the sky, the horizon's glow,
 * low hills, the ground's faint grid, three lanes with ours lit in the look's colour and the lane dashes going by with
 * the distance driven) with our car from behind at its foot, the speed in large figures on the left and the engine
 * speed on the right. Its colours follow the drive mode. The first step of the ADAS theme (docs: the plan of
 * 2026-11-28, 2-D): the road is straight and empty for now - the cars round us, its bends and the turn arrows come
 * with the driving assistant's recordings. With the map or the stock centre in the middle, Pulse's pieces round it (as
 * Simple). An original design.
 */
const C = require('./layout_common');
const P = require('./layout_pulse');

const PALETTES = {
    comfort: {
        bgTop: '#020306', bgBottom: '#010204', sky: '#14306e', horizon: '#ff9a5c', ground: '#03050a', line: '#c8d6ec',
        accent: '#2f7dff', body: '#9aa6b4', text: '#f4f8ff', glow: '#4a9cff', dim: '#8d99a6', red: '#ff3b30', tick: '#3a4a5c', mode: 'COMFORT',
    },
    sport: {
        bgTop: '#040203', bgBottom: '#020102', sky: '#2a0e2a', horizon: '#ff6a3a', ground: '#060305', line: '#e8d2cc',
        accent: '#ff2a2a', body: '#3a3d44', text: '#ffffff', glow: '#ff4a30', dim: '#b8a49c', red: '#ffffff', tick: '#5a3a30', mode: 'SPORT',
    },
    efficient: {
        bgTop: '#010403', bgBottom: '#010302', sky: '#0b3030', horizon: '#9fe8c0', ground: '#020605', line: '#cfe8e0',
        accent: '#56e07a', body: '#c9d0d6', text: '#effffa', glow: '#2ad6a6', dim: '#93aba5', red: '#ff3b30', tick: '#2c4d45', mode: 'EFFICIENT',
    },
};

/* the scene: down to the strip's line (layouts.js cuts it there), the horizon at 330, our lane 560 px wide at its foot */
const SCENE_H = C.STRIP_Y, HORIZON = 330, LANE_HALF = 280;
/* our car: its own small layer at the road's foot */
const CAR = { x: 760, y: 436, w: 400, h: 210 };
/* the two figures, either side of the road, clear of the glass's slanted corners and the top middle's cowl */
const SPEED = { x: 130, y: 210, w: 520, h: 200 }, RPM = { x: 1290, y: 240, w: 500, h: 140 };

const big = (t) => ({ color: [t.text, 1], glow: [t.glow, 0.5] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.glow, 0] });
/* the engine speed: red from the red zone, to 50 rpm with a thousands comma, OFF with the engine off */
const rpmNum = (d) => (d.engineOn === false ? 'OFF' : C.isNum(d.rpm) ? String(C.rpmShown(d)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '--');
const rpmC = (o) => (t, d) => {
    const hot = C.isNum(d.rpm) && d.engineOn !== false && d.rpm >= C.rpmScale(o).red * 1000;
    return { color: [hot ? '#ff3b30' : t.text, 1], glow: [hot ? '#ff3b30' : t.glow, 0.45] };
};

/* the distance driven, for the lane dashes and the grid: from the speed, every frame (standing still when the car does) */
function roadRun() {
    let run = 0;
    return (d, dt) => {
        const kmh = C.isNum(d.speed) ? Math.max(0, d.speed) : 0;
        run = (run + kmh / 3.6 * dt / 1000) % 900;
        return { u_run: [Math.round(run * 100) / 100] };
    };
}
const sceneColours = (t) => ({ sky: t.sky, horizon: t.horizon, ground: t.ground, line: t.line, accent: t.accent, body: t.body });

module.exports = {
    id: 'adas',
    title: 'ADAS',
    speedGauge: false,       // (the speed in figures only)
    ownStripGauges: true,    // (no fuel and charge bars over the strip: no gauges at all)
    sliHome: { x: 390, y: 470 },
    // (on Pulse's: its pieces with the map or the stock centre take their colours from it)
    palette: (lookId) => Object.assign({}, P.palette(lookId), PALETTES[lookId] || PALETTES.comfort),
    gearText: C.gearText,

    pieces(o) {
        // (with the map or the stock centre in the middle: Pulse's pieces round its window, as Simple's)
        if (o.centre === 'map' || o.centre === 'stock') return P.pieces(o);
        return [
            { key: 'bgRoad', kind: 'adas', x: 0, y: 0, w: 1920, h: SCENE_H, params: { u_part: [0], u_road: [HORIZON, 960, LANE_HALF, 0] },
                colors: sceneColours, frame: roadRun() },
            { key: 'egoCar', kind: 'adas', z: -30, x: CAR.x, y: CAR.y, w: CAR.w, h: CAR.h, params: { u_part: [1], u_road: [HORIZON, 960, LANE_HALF, 0] },
                colors: sceneColours },
            C.text('speedDigits', SPEED.x, SPEED.y, SPEED.w, SPEED.h, (d) => C.speedText(o, d), big),
            C.text('speedUnit', SPEED.x, SPEED.y + SPEED.h + 6, SPEED.w, 30, C.speedUnit(o).toUpperCase(), lbl, { tracking: 0.3 }),
            C.text('rpmDigits', RPM.x, RPM.y, RPM.w, RPM.h, rpmNum, rpmC(o)),
            C.text('rpmUnit', RPM.x, SPEED.y + SPEED.h + 6, RPM.w, 30, 'RPM', lbl, { tracking: 0.3 }),
        ];
    },
};
