# AK Map Test (0.1.3, a trial on akakingj/myapp-cluster, branch extend)

*A trial copy of [AK Cluster Layouts](../akakingj_cluster_layouts/README.md) with one layout, kept apart from it so
Cluster Layouts stays as it is while this is tried.*

**KO 1 Map**: KO 1's two digital round dials, smaller (radius 176) and further out, each on a black disc, over the
CarPlay map laid under the whole layout: the map 1360 x 600 at 280,46 (the phone's 1088 x 480 at 1.25), from just
below the camera cowl's line down to the car's own strip, whatever the centre is set to. The app writes
`panel 280 46 1360 600 under` to `/dev/shm/cluster-info/map_window.txt` (map_window.js); Waze on cluster with "under"
(akakingj/myapp-map, branch test) draws the map there in the renderer's ambient class, below every layer of the
layout. Under the map a black base, also ambient but below it (engine.js here: a piece's `klass`; the app's own copy,
not shared/): with a Waze on cluster that doesn't read "under" (the MGU Store's own build), or no phone, the middle is
black, never the stock cluster showing through. Over the map a light veil (22 % black) and a dark plate under readouts 1
and 2 at the top; the speed in figures is the speedometer's own.

**Using it.** Show on the cluster is Off until turned on. Turn AK Cluster Layouts' Show off first (both would draw on
the panel and both use the map window file), then this one on; back the other way after. Stationary first: the
cluster's load with the whole map under a layout has not been checked on the car.

Tests: `node tools/test_map_test.js` (its own checks, and tools/test_engine.js, clearance.js and check_fit.js on this
app through `LAYOUTS_APP`). Its settings, page and logs are Cluster Layouts' (main.js, menu.js), with its own id,
title, log name and render client name.
