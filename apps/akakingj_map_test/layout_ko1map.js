'use strict';
/**
 * layout_ko1map.js - "KO 1 Map", AK Map Test's one layout (0.1.0, a trial on personal-kr-extend): KO 1's two digital round dials, smaller and
 * further out, over the CarPlay map laid under the whole layout. The layout tells Waze on cluster (akakingj/idrive-apps
 * extend-map, waze-on-cluster with "under") to draw the map on the panel at MAP_RECT in the renderer's ambient class,
 * below every layer of the layout (map_window.js: "panel 280 46 1360 600 under"), whatever the centre is set to.
 *
 * The map's place: down to the car's own bottom strip (y 646, which the layout leaves clear), in the phone's own
 * proportions (1088 x 480 at 1.25: 1360 x 600), centred, its top 46 px down so the phone's safe area (its turn card;
 * waze-on-cluster's 476 x 306 at 306,72 of the frame) starts below the camera cowl (layout_common NOTCH, to y 128).
 * Under it a black base, also in the ambient class but below the map (z -100): where there is no map (a Waze on
 * cluster that does not read "under", the stock build, or no phone) the panel is black there, never the stock cluster
 * showing through. The dials low and in from the edges, clear of the KOMBI's warning lights at the top corners
 * (TELLTALE_ZONES). Over the map a light veil (VEIL) and, under each dial, a black disc as KO 1's own background (its
 * face leaves a ring clear between it and the rim), and a dark plate under each readout at the top. The speed in
 * figures is the speedometer's own. The phone keeps its turn card in the frame's middle (its safe area), between the dials.
 */
const C = require('./layout_common');
const K = require('./layout_ko1').parts;
const KO1 = require('./layout_ko1');

/** Where the map is drawn under the layout (the panel's pixels) */
const MAP_RECT = { x: 280, y: 46, w: 1360, h: 600 };
const VEIL = 0.22;                       // the map darkened by this much (black over it)
/* The KOMBI's own warning lights over the panel's top outer corners (AUTO H and the parking brake at the top
 * right, measured from a photo of the car: about x 1745-1900, y 190-290), with a margin; the same kept clear at the
 * left so the dials stay alike. The dials (and their black discs) stay out of them (0.1.2). */
const TELLTALE_ZONES = [{ x: 1730, y: 180, w: 190, h: 125 }, { x: 0, y: 180, w: 190, h: 125 }];
const R = 168, CY = 448;                 // the dials' radius and centre height: low, their glow (0.94 R + 40) above the strip (646)
const SX = 284, RX = 1920 - 284;         // their centres: in from the edges, their tops clear of TELLTALE_ZONES

/** A flat rectangle of one colour and alpha, in a class and at a z of its own */
const plate = (key, x, y, w, h, colour, alpha, extra) => Object.assign({ key, kind: 'flat', x, y, w, h, colors: () => ({ color: [colour, alpha] }) }, extra || {});
/** A black disc under a dial, radius R + 2 (the ring shader: KO 1's own background where the face leaves it) */
const disc = (key, cx) => {
    const d = K.arc(key, cx, CY, (R + 2) / 2, R + 2, -180, 180, 2, { kind: 'ring', z: -60, colors: (t) => ({ fill1: t.bg }) });
    d.params = { u_geo: d.params.u_geo, u_span: d.params.u_span };
    return d;
};

function pieces(o) {
    return [
        // (bg...: a background, which may go under the cowl and into the corners: tools/clearance.js)
        // the black base under the map (ambient, below it): the stock cluster never shows through the layout
        plate('bgMapBase', 0, 0, 1920, MAP_RECT.y + MAP_RECT.h, '#000000', 1, { klass: 'ambient', z: -100 }),
        plate('bgMapVeil', MAP_RECT.x, MAP_RECT.y, MAP_RECT.w, MAP_RECT.h, '#000000', VEIL, { z: -150 }),
        disc('speedDisc', SX), disc('rpmDisc', RX),
        plate('clockPlate', 508, 36, 220, 50, '#000000', 0.62, { z: -120 }),
        plate('outsidePlate', 1192, 36, 220, 50, '#000000', 0.62, { z: -120 }),
        C.text('clock', 520, 44, 200, 34, C.clock, K.white),
        C.text('outside', 1200, 44, 200, 34, (d) => C.outsideText(o, d.outside), K.white),
    ].concat(K.dial(o, 'speed', SX, CY, R), K.dial(o, 'rpm', RX, CY, R));
}

module.exports = {
    TELLTALE_ZONES, DIALS: [{ cx: SX, cy: CY, r: R + 2 }, { cx: RX, cy: CY, r: R + 2 }],
    id: 'ko1map',
    title: 'KO 1 Map',
    font: 'light',
    palette: KO1.palette,
    gearText: C.gearText,
    ownStripGauges: true,   // (KO 1's: its own fuel arc, and a plug-in hybrid's charge)
    places: [],             // (no trip computer: the map is its centre)
    // the map under the layout, always (main.js: map_window.js "under"), not only with the Waze centre
    mapWindow: Object.assign({ under: true }, MAP_RECT),
    mapAlways: true,
    pieces,
};
