'use strict';
/**
 * map_host.js - the Waze centre's map in the layout's window. cluster-render hosts Waze on cluster's map (the `map`
 * target) on this app's own target (panel) at the window, drawn under the layout's layers there (PROTOCOL.md "Hosting
 * from layers"), the layout leaving the window open. So the KOMBI's own map screen, which it draws over the map in
 * the map slot (its speed readout, its edge shading, its vignette), is not seen through the window.
 *
 * Sent once per window (the client keeps it and sends it again after a reconnect); taken back (unhost) when the
 * layout stops showing or its centre is not Waze. A cluster-render without hosting from layers (hello host_layers),
 * or a Waze on cluster that doesn't follow its host, leaves the map in its slot, seen through the window.
 */
const TARGET = 'map';

function startMapHost(log, client) {
    let held = '';
    /** r: the window { x, y, w, h } on the panel to host the map in, or null to let it go. */
    function set(r) {
        const key = r ? [r.x, r.y, r.w, r.h].map((v) => Math.round(v)).join(' ') : '';
        if (key === held) return;
        if (!r) {
            client.unhost(TARGET);
            log.info('map window: given back (Waze on cluster\'s map to its own slot)');
        } else {
            const [x, y, w, h] = key.split(' ').map(Number);
            client.host('panel', { target: TARGET, x, y, w, h });
            log.info('map window: panel ' + key + ' (Waze on cluster\'s map hosted there, under the layout)');
        }
        held = key;
    }
    return { set, holding: () => held !== '' };
}

module.exports = { startMapHost, TARGET };
