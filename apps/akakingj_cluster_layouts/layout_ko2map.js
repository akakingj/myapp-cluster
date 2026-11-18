'use strict';
/**
 * layout_ko2map.js - "KO 2 Map" (0.49.0, a trial on personal-kr-extend): KO 2's two analog dials, smaller and further
 * out, over the CarPlay map laid under the whole layout. The layout tells Waze on cluster (akakingj/idrive-apps
 * extend-map, waze-on-cluster with "under") to draw the map on the panel at MAP_RECT in the renderer's ambient class,
 * below every layer of the layout (map_window.js: "panel 280 46 1360 600 under"), whatever the centre is set to.
 *
 * The map's place: down to the car's own bottom strip (y 646, which the layout leaves clear), in the phone's own
 * proportions (1088 x 480 at 1.25: 1360 x 600), centred, its top 46 px down so the phone's safe area (its turn card;
 * waze-on-cluster's 476 x 306 at 306,72 of the frame) starts below the camera cowl (layout_common NOTCH, to y 128). Under it a
 * black base, also in the ambient class but below the map (z -100): where there is no map (a Waze on cluster that
 * does not read "under", the stock build, or no phone) the panel is black there, never the stock cluster showing
 * through. Over the map a light veil (VEIL) so the dials' figures stand out, and a dark plate under each readout at
 * the top. The phone keeps its turn card in the frame's middle (its safe area), between the dials.
 */
const C = require('./layout_common');
const K = require('./layout_ko1').parts;
const KO2 = require('./layout_ko2');

/** Where the map is drawn under the layout (the panel's pixels) */
const MAP_RECT = { x: 280, y: 46, w: 1360, h: 600 };
const VEIL = 0.22;                       // the map darkened by this much (black over it)
const R = 176, CY = 350;                 // the dials' radius and centre height (KO 2's map form: 196 at 368)
const SX = 196, RX = 1920 - 196;         // their centres: 20 px from the panel's edges, as KO 2's map form

/** A flat rectangle of one colour and alpha, in a class and at a z of its own */
const plate = (key, x, y, w, h, colour, alpha, extra) => Object.assign({ key, kind: 'flat', x, y, w, h, colors: () => ({ color: [colour, alpha] }) }, extra || {});

function pieces(o) {
    const top = [
        C.text('clock', 520, 44, 200, 34, C.clock, K.white),
        C.text('outside', 1200, 44, 200, 34, (d) => C.outsideText(o, d.outside), K.white),
    ];
    return [
        // the black base under the map (ambient, below it): the stock cluster never shows through the layout
        // (bg...: a background, which may go under the cowl and into the corners: tools/clearance.js)
        plate('bgMapBase', 0, 0, 1920, MAP_RECT.y + MAP_RECT.h, '#000000', 1, { klass: 'ambient', z: -100 }),
        plate('bgMapVeil', MAP_RECT.x, MAP_RECT.y, MAP_RECT.w, MAP_RECT.h, '#000000', VEIL, { z: -150 }),
        plate('clockPlate', 508, 36, 220, 50, '#000000', 0.62, { z: -120 }),
        plate('outsidePlate', 1192, 36, 220, 50, '#000000', 0.62, { z: -120 }),
        // the speed in figures at the bottom, between the dials, above the car's strip
        plate('speedPlate', 852, 552, 216, 92, '#000000', 0.62, { z: -120 }),
        C.text('speedDigits', 870, 558, 180, 62, (d) => C.speedText(o, d), K.white),
        C.text('speedDigitsUnit', 870, 621, 180, 18, C.speedUnit(o), K.lbl, { tracking: 0.12 }),
    ].concat(KO2.parts.dial(o, 'speed', SX, CY, R), KO2.parts.dial(o, 'rpm', RX, CY, R), top);
}

module.exports = {
    id: 'ko2map',
    title: 'KO 2 Map',
    font: 'light',
    palette: KO2.palette,
    gearText: C.gearText,
    ownStripGauges: true,   // (KO 2's: its own fuel arc, and a plug-in hybrid's charge)
    places: [],             // (no trip computer: the map is its centre)
    // the map under the layout, always (main.js: map_window.js "under"), not only with the Waze centre
    mapWindow: Object.assign({ under: true }, MAP_RECT),
    mapAlways: true,
    pieces,
};
