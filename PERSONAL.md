# Personal build (akakingj) — G20 320i petrol

Based on eroobeeroo/idrive7-cluster-info 0.28.1 (PolyForm Noncommercial 1.0.0: change and share for
noncommercial use only), with PR #8 (lb-ft and a pressure unit setting).

## Apps (installed beside the originals, never in their place)
| Original | ID here | Title |
|---|---|---|
| cluster_layouts | akakingj_cluster_layouts | AK Cluster Layouts |
| cluster_centre | akakingj_cluster_centre | AK Cluster Centre |
| cluster_info | akakingj_cluster_info | AK Cluster Info |

The `akakingj_` prefix is used by no other app in the Store's known sources (cauliflowermossgrape/idrive7-apps,
robertnisipeanu/idrive-apps, eroobeeroo/idrive7-apps, IterioDev/car-apps; checked 11 Nov 2026).
Icons: a gauge with an M-coloured accent and L / C / I (`icon.png` in each app's folder; `kit/tools/make_icon.js krgauge-L`).

MGU Store: Settings > Add source > `akakingj/myapp-cluster` > branch `main` (moved Nov 19 2026 from the fork akakingj/idrive7-cluster-info, branch personal-kr; its history kept).
Remove the original Cluster Layouts / Centre / Info (or turn their Show off): both would draw on the cluster.

## Language
The Store builds the apps in Korean (`mgu-repo.json`: `--language ko`): the iDrive screens, the settings and their
choices are Korean (`kit/runtime/locales/ko.tsv`, then `python3 kit/tools/sync_locales.py ko`; the font is Noto Sans
KR, `kit/localization/fonts/korean.json`). The cluster display itself stays English (OIL, COOLANT, km/h ...).
The package keeps its plain version (no `-ko` suffix): the Store looks for `dist/<id>@<version>.tgz`.
`node tools/test_korean.js` fails on a name with no Korean.

## Defaults
| App | Setting | Original > here |
|---|---|---|
| Layouts, Centre | Vehicle | Auto > Petrol or diesel |
| Layouts, Centre | Fuel tank | 69 > 59 L |
| Layouts, Centre | Speed, temperature | mph, °F > km/h, °C |
| Layouts, Centre, Info | Torque, pressure | Nm (lb-ft), auto > kgm, psi |
| Layouts, Centre | Power unit (new) | hp (PS, kW) |
| Layouts, Centre | Time zone | US Eastern > Korea / Japan (UTC+9) |
| Layouts | Red zone from, rev scale | 7000, 8000 > 6000, 7000 |
| Centre | Rev limit when warm, shift light flashes at | 6500, 6200 > 6000, 5700 |
| Info | Panel slots 1-3 | power, battery, oil > boost, torque, oil |

## Added
- Skin (Layouts > Display, Centre > Look and size, Info > Screen; or the Car profile's Units and display > Skin
  for every app): Classic (the default, as before) or iDrive 7, the iDrive screens drawn as the head unit's own (the
  kit's themes.js / gauges.js / sheet.js, as akakingj/idrive7-apps car-profile-test): orange name and focus, flat tabs
  and bar, settings split into a list and a preview. The cluster display itself stays as each layout draws it.
- Cluster Info > Show the panel Off takes the HUD's turn arrows off too. (1.6.12..1.6.23 also had a lane change
  warning on the HUD from the driving assistant's de.bmw.dass lane change service; on a G20 and a G21 the head unit
  reported that service not available, so 1.6.24 took it out. 1.6.25 has it back from the door mirror lamps, BDC 22 D347, read only.)
- Layouts > Fuel % from: Engine unit (default; its own tank level, OBD PID 0x2F, the % Live Data shows) or
  Litres / tank size (the car's whole litres over Fuel tank size: a few % lower on a G20). The litres stay the fallback
  while the engine unit doesn't answer.
- Layouts > Readout 1 / Readout 2 / Main readout (petrol or diesel): the centre display's top left and right (where the
  time and outside temperature were over the car's own bottom strip) and the line under the digital speed: intake
  air, gearbox oil (TRANS), oil, coolant, boost, engine power, torque, throttle, accelerator pedal, timing, the gear
  (GEAR D4 / S3 / M2, P R N), or Nothing (each of them, under the speed too).
  JDM 1 (Arc tach until 0.30.1): the gear in the arc on or off (with the full-screen form, gone in 0.34.0); not shown twice when the gear is the readout
  under the speed.
  Classic M: Centre readout: bottom line (the coolant by default). Short names where
  the box is narrow (IAT 31°, TRANS 78°, BST 14.5, HP 211).
- Layouts > Speedometer gauge / Tach gauge: the small gauge in the analog dials (Analog sport, Digital round, Retro,
  Classic M): the layout's own, or any of the readings above, or fuel.
- Shift point and red zone as cauliflowermossgrape's Redline app: the red line less Shift point before redline
  (300 rpm); Cold-engine rev guard (on/off) lowers it to Cold rev limit (4500 rpm) with the oil at 30 °C, back at
  Oil warm at (80 °C). The red zone, amber zone, M's lit blades and the red gear follow it (M, Sport, Analog sport,
  Digital round, Retro, Classic M, GT3, Track's shift lights).
- M and Sport: the red zone and the amber zone before it (Amber zone before the red zone, 700 rpm; 0: none) filled
  across the blade / band, not a thin line.
- Layout in Sport / Layout in ECO PRO: another layout while the car's drive mode switch is in a sport mode or ECO PRO
  ('Same as Layout' by default), switched once the mode has held 1.5 s; the gear selector's S doesn't switch it.
- Temperature gauges (C - H, the default; or the original's scale and figures): the analog layouts' coolant, oil and
  gearbox oil gauges as the car's own, C at the cold end, H at the hot end, the needle in the middle once warm
  (coolant 80-105 °C, oil 85-115, gearbox oil 65-95), red towards H.
- Temperature colours (on): the readouts' and the small gauges' temperatures blue while cold (oil and coolant under
  60 °C, gearbox oil under 50) and red when too hot (Readouts and gauges > Oil / Coolant / Gearbox is too hot at: 130,
  118, 115; intake air from 60). The same temperatures start the red zone of every layout's temperature gauges (the
  small gauges, the scales, C - H, the M layout's bars) and turn Digital dash's, GT3's, Pulse's and Modern wide's
  figures red.
- Shift warning (off): the digital speed and the gear red at the shift point, in the layouts without their own
  (not M, Sport, GT3, Track).
- Settings in sections (the app's own settings page): Show, Layout and Colours at the top, then Display, Readouts and
  gauges, Red zone and shift, Units and clock, Car, each opening its own list (kit/runtime/sheet.js: a setting's
  "section" in app.json; none: one list, as before). Cluster Centre: Show, then Pages, Custom page 1, Custom page 2,
  Look and size, Shift light and warm-up, Warnings, Units and clock, Car. Cluster Info: Show and Panel position, then
  Panel items, HUD, Units, Screen. The HMI's own list (only without the renderer) stays one list, each heading
  with its section ahead ('Custom page 1: Slot 1').
- Engine power = crankshaft torque (FES statusActualValueTorque2) x rpm / 9549: a calculation; on a tuned car
  (JB4) it may differ from the real power.
- Accelerator pedal and throttle, apart (the pedal is the driver's request, the throttle the valve's opening): both
  from the engine unit as Live Data reads them (pedal: DIDs 5814, 480B, OBD 0x49; throttle: 4600, 5858, OBD 0x11),
  read twice a round while shown and kept 8 s (a round can take 3 s or more while driving). The car's
  `AcceleratorPedal` signal is not used (its scaling unconfirmed). Check against Live Data.
- Centre: engine power and the accelerator pedal for the custom pages' slots.
- Layouts 0.35.0: every fixed place (gauges, tiles, rows, boxes) can be set on the page per layout (layouts.js placesFor).
- Layouts 0.34.0: always the car's own bottom strip; the full-screen form (and Settings > Bottom strip, Cluster: M car,
  Frame behind the gear box, Background, JDM 1: the gear in the arc) removed. Layout 'ID6 M' (0.33.0; an original
  design after the M cars' analog clusters of the mid 2010s), the E9x-style one renamed 'Old M'.
- Layout 'GM' (Twin cowl until 0.30.1; an original design after the idea of a twin-dial cluster with a raised centre cowl): the tach
  left and the speedometer right, each with a ring of ice-blue light inside its scale and a red needle; between them
  a chrome arch over two small round gauges (the coolant C - H and the fuel E - F; Settings > Small gauge in the tach /
  in the speedometer pick others) and a pale grey display with dark figures: the speed, the gear (not over the car's
  strip), the fuel range (over the strip: Centre readout: bottom line), the time and the outside temperature (over
  the strip: Readout 1 / 2). An M car: the dials swapped (the tach under the M boxes), no arch on the full screen.
- Layout 'JDM 2' (0.31.0; an original design after the idea of a Japanese grand tourer's digital cluster): a carbon-weave
  panel, a tach with its scale as a broad coloured band, a G meter from the car's own acceleration, the gear in a
  glossy disc, small coolant and fuel gauges (layout_jdm2.js, shaders.js JDM_FS).
- Layout 'JDM 1' (Arc tach until 0.30.1; an original design after the idea of a three-ring sports-car cluster): three round dials under
  chrome rings, the tach in the middle in front, a smaller dial either side tucked behind it (each side ring ends where
  it goes behind the tach's). The tach: a needle round numerals, the red zone along its ring (lower while the oil is
  cold), the main readout above the hub, the digital speed bottom right, the gear bottom left (Arc tach: the gear in
  the arc; not over the car's strip). The side dials: the coolant C - H on the left, the fuel F - E on the right
  (Small gauge in the speedometer / tach pick others), a readout at each foot (over the strip Readout 1 / 2). Freedom
  removed (saved as it: Arc tach).
- Car profile (akakingj/idrive7-apps, branch car-profile, apps/car_profile 1.2.0): the three apps follow what it sets
  in /dev/shm/car-profile.json, as its apps do (kit/runtime/mgu.js Settings, app.json "profile"; checked every 3 s, a
  change applied at once). Layouts: Red zone from (redline), Shift point below the red zone by (shiftBefore), Rev
  scale up to (rpmScale), Cold-engine rev guard (coldGuard), Cold engine: shift point (coldLimit), oil warm at
  (warmOil), too hot at (hotOil, hotCoolant, hotGearbox), the speed, temperature, torque, pressure and power units.
  Centre: the same red line, shift point before it, guard, cold limit and oil warm at, Shift light: starts at
  (lightStart), Warnings: oil / coolant / gearbox above (hotOil, hotCoolant, hotGearbox), the five units. Info: Oil
  warm at, too hot at (the three) and the temperature, torque and pressure units. A setting the profile sets shows its value and can't be changed in the
  app; one it leaves to each app (or its Auto, 0, where the setting has no 0) or no Car profile: the app's own, kept
  all along. Centre's settings per driver keep each driver's own values, not the profile's.
- One shift point everywhere, as the idrive7-apps kit's (engine.js Engine.coldShift, Redline's and Warm-Up's): the red
  line less Shift point before redline; with the guard, from the cold limit at 30 °C oil up to normal at Oil warm at.
  Layouts' shift warning and Centre's shift light (Shift light: flashes at: Auto, the default, reset once) flash there;
  Centre's warm-up page shows it as its rev limit while cold (Redline's cold LIMIT, Warm-Up's rev limit), the redline
  once warm; Layouts' red zone starts Shift point before redline above it. tools/test_centre.js checks Centre's and
  Layouts' agree.
- The HUD shared with Redline: while another app holds it (the idrive7-apps kit's claim, /dev/shm/mgu-hud/<id>, fresh
  6 s: Redline's HUD on), Cluster Info's panel on the HUD and its turn arrows step aside (Redline's tach sits where the
  arrows go), back once the claim goes stale; Info's status page says who holds it. Info doesn't claim the HUD or stand
  on it, so Redline's HUD is never switched off for it.
- The oil amber while warming (60 °C up to Oil warm at), as the Redline app's HUD: Layouts' readouts and small gauges'
  figures, Centre's oil tile, Info's panel. Too hot red (Info: before amber).
- Too hot, one set of temperatures: the Car profile's Too hot group (oil, coolant, gearbox) sets Layouts', Centre's
  Warnings and Info's, and Redline's (HUD and page), M Vitals' and Warm-Up's (oil) too. Unset, each keeps its own
  default (the cluster 130 / 118 / 115 °C, Redline 130 / 112 / 120, M Vitals 125 / 112 / 120, Warm-Up oil 125).
  Red at that temperature and above everywhere. Its choices: oil and coolant 110-140 °C, gearbox 80-130 (in 5s);
  each app's list takes all of them.

## Since 0.36 (Nov 16-18 2026)
Branches: `main` is what the Store installs (other drivers use it too); every change goes to `test` first, checked on
the car, then moved to `main` (in the fork they were `personal-kr` / `personal-kr-test`).
- Safety first: the cluster must never go dark. Each layout at most 60 layers, under 600 KB at start
  (tools/test_engine.js), GPU cost measured in the demo (swiftshader) against the other layouts, nothing cut off at a
  layer's edge, no clash with the cowl, the corners, the warning lights or the strip (tools/clearance.js), every text in
  its box at its widest figures (tools/check_fit.js), Node 8.16 (tools/test_node8.js).
- Layouts 0.37-0.41: JDM 1 redrawn as an 80s Japanese digital dash (wide font, its colours by drive mode: comfort green,
  sport red, ECO teal; the rev bar's lines to the panel's top), a cup of water over its left box sloshing with the G
  (clear by default, paper, or off: Settings > JDM 1: cup of water, or the page); JDM 2 moved left with a beginner's
  mark (wakaba, an original drawing) on its right; ID6 M's centre display as 20's; Settings > Fuel and charge bars at
  the bottom; the G one way for every app (driver-felt: accelerating moves the dot down, a left turn to the right).
- Layouts 0.42: a plug-in hybrid's battery charge on every layout by default (ID6 M's and Old M's small gauge by the
  tach shows the charge, as the others' bars); the Car profile's shift point (an rpm), G maximum and swaps.
- Layouts 0.43: JDM 1's page has a Water cup view: the cup large on the head unit's screen (cup_view.js, no other app
  needed). Kit: Recorder/Canvas fill() for convex shapes; the software path plays a fan as one shape.
- Layouts 0.44: KO 1 (digital round dials, a glowing arc, ECO a fan of slats) and KO 2 (analog), originals after the
  look of mid 2020s Korean saloons' screens; GM's speed in the middle of its display; the battery icon's nub inside its
  square.
- Layouts 0.45-0.46: the car's own trip computer (KombiIF statusBordcomputerAverage / TravelData, read-only; confirmed
  on the car Nov 18 2026): Average fuel economy, Trip distance, Driving time, and the Fuel range and the Clock, in
  every readout place; Settings > Fuel economy unit (as the car, km/L, L/100km, mpg). KO 1 / KO 2 show a trip
  computer whose lines are set on the page (Trip computer: line 1-3); 20's, ID6 M, Old M and GM: Settings > Centre
  display: Speed or Trip computer (per layout on the page; with Speed the lines' places are hidden).
- Centre 0.12: the shift light flashes at the Car profile's shift point (an rpm). Info 1.8: the blind spot sign from
  the door mirror lamps (BDC D347, read only, never written).
- Layouts 0.46.1, Centre 0.12.3 (Nov 18 2026, from the car): Centre - a page's name at 30 px (was 22), each tile's
  unit right after its figures on their baseline at 0.46 of their size (was small at the tile's top right; engine.js
  text `lead`: the unit starts after the figures as set, however many). KO 1 / KO 2 - the arc across each dial's foot
  inside the open foot (212-148 degrees, was 228-132: on KO 2 it ran over the 0, the last numeral and the needle at
  rest), its end marks just outside its ends. The clock readout with AM / PM (12-hour clock), and no TIME before it. AVG: the average economy's
  name in every place. The trip computer's 0.0 (a trip just reset) shown as 0.0, not -- nor the last trip's figure; the
  car's economy unit changed on the MGU with no figure yet drops the old figure. The fuel gauge marked 0, 1/2, 1 as the
  car's own (KO's foot, a fuel gauge set in a place; M's bar 0 and 1).
- Layouts 0.47.0, Centre 0.12.4 (Nov 18 2026): the G as the driver feels it everywhere, with no setting (the Car profile
  1.6.0 dropped its G direction too; G-Force, M Vitals and Water Cup the same): JDM 2's G meter and JDM 1's cup lost
  their swaps (gFlipLat, gFlipLong). JDM 2's dot has a trail, as the iDrive G-Force app's: where it was over the last
  2 s (16 places, 125 ms apart) joined by a thin line fading with age, drawn in the meter's own shader (no new piece;
  only inside the meter; 0.47.1: a stream of small dots fading smoothly with age as G-Force's, 16 places 100 ms apart,
  four packed in a vec4 so the meter's shader keeps within the 29 uniform vectors the cluster already runs).
  Shared engine: a piece's dyn uniforms sent one by one when each changes (the trail's numbers not with every move of
  the dot), more than 4 numbers as an array of vec4.
- Layouts 0.47.1: the gear readout without its name (D1, S2, M3, R, P), in every place and under a main readout.
- Layouts 0.47.2: JDM 2's trail a thin line again (the owner's choice after weighing the load), through 16 places
  200 ms apart (3.2 s) on to the dot, each piece fading smoothly with age and the oldest shrinking away; worked out
  only inside the trail's bounding circle (sent with it: a parked car's trail is a point, nothing worked out).
  JDM 2: G meter size 1.2 g too (the Car profile's G-force circle up to: 1, 1.2, 1.5, 2).
- Layouts 0.48.0, Centre 0.13.0, Info 1.9.0 (Nov 18 2026): IBM Plex Sans Condensed (SIL OFL 1.1, from Google Fonts) in
  place of Barlow Semi Condensed - SemiBold for the 'bold' atlas (every layout but ID7 M, ID8 M and JDM 1, kept in
  Orbitron and Michroma; Centre's modern look), Regular for 'light' (KO 1, KO 2; Centre's native look); Info's panel on
  the cluster and the HUD in its own Plex SemiBold atlas (plex_font.js, tools/bake_info_font.py; kit fonts.register),
  its iDrive pages in the kit's faces as before. Plex's figures are about 6 % wider: 20's trip names a third of the box
  (was 0.3), Track's figures 10 px from the tiles' edges, Centre's figures no taller than '-888' / '88.8' / '8888' and
  their unit fit across a tile, Info's value columns 1.06 of the panel's height (was 1.0). Every dial's numerals now
  keep clear of the ticks: each goes in from its ring by how much wider than tall it is towards the ticks
  (shaders.js numeralIn: a '220' at three o'clock in, a '4' at twelve as it was), for the narrow faces only (JDM 1's
  Michroma dial unchanged). The layout pictures on the page made again (tools/make_previews.py).
- Layouts 0.48.1, Centre 0.13.1: 90's numerals closer to its ticks (their ring 230 / 214, was 218 / 200). The shaders'
  new notes kept out of the GLSL, and the numerals' helpers only in the dial programs: each piece sends its own program,
  so a comment in the text program went some 30 times a layout - the start-up was up to 33 KB more (ID8 M 588 KB of
  600); now as before today (the most 555 KB), JDM 2 11 KB more for its trail (497 KB).
- Layouts 0.48.2, Centre 0.13.2: each program sent without its comments, indentation and empty lines (engine.js
  tight; the preprocessor's lines whole; tools/test_tight.js: every program's words and signs the same). The renderer
  takes no shared program, so each piece sends its own: the start-up 16-67 KB less a layout, the most now 487 KB
  (ID8 M, plug-in hybrid; was 555), every layout's picture pixel for pixel the same.
- Layouts 0.48.3: 90's and 20's numerals their dials' share as Old M's and ID6 M's (0.11 of the radius the
  speedometer's, 0.13 the tach's; they were 0.14 / 0.18-0.2, crowded), a little further out for it.
- Info 1.9.1: the panel's text smaller, its height kept (the kW 0.46 of it, was 0.54; a value 0.42, was 0.5; its label
  0.19, was 0.22), and its ends' margins alike: the kW's figures right-aligned in a column for "188" / "-88" (the
  widest a battery gives; a rarer "-1xx" reaches into the padding), a value at the far end centred with as much room
  outside it as the meter's padding (edgePad). On the cluster 192-428 px wide, was 220-448.
- Layouts 0.48.4, Centre 0.13.3 (Nov 19 2026, from a G-series plug-in hybrid): a range signal's 12-bit "no value"
  marks (0xFFD-0xFFF) left out - the car sent an electric range of 4093 at 8 % charge, and the layouts showed it as
  4093 km - and no electric range past 1000 km taken, from the car or an app (shared/data.js rangeOk).
  The logs gain "trip data signals": on that car the trip computer's distance, time and economy follow the head
  unit's Trip data > "values shown since" choice (start 48 km, refuelling 108, charging 48, own reset 53464 km),
  but "since delivery" (236345 km) never comes in statusBordcomputerTravelData; every field of the reset-logic
  services and the catalog's trip fields are listed, to find the one each choice comes in.
  The readouts made for six-figure distances (a trip since delivery, 236345 km) and 9999-hour driving times: the
  fit samples 999999 km / 9999:59 (check_fit), and a trip computer line's figures a gap clear of its name, a long
  figure set smaller rather than squeezed (fitText room 0.88), and every line's figures one size (the smallest any
  line needs, as a rule the distance's), not each its own. The driving time's name TIME (was DRIVE).
  "Since delivery" chosen: the distance comes with no value (too long for its field), so the trip shows the odometer
  (mileageKilometre, km) and no driving time; any choice's driving time with no value drops the last choice's.
- Layouts 0.48.5, Centre 0.13.4, Info 1.9.2 (Nov 19 2026, a robustness pass): every signal handler of the three fed
  odd values (none, numbers for structs, nested junk) while the cluster shows and the layouts change - now no throw
  (shared/data.js: the raw log of a value that is none, the gearbox signal's struct); kit: a read or notice with no
  value never reaches a handler (signals.js), a value that is no struct never reaches the car's readers (car.js).
  Checked again: Node 8 syntax and APIs over all shipped code, 52 layers at most (60), 487 KB at most (600).
- Layouts 0.48.6, Centre 0.13.5 (Nov 19 2026, the plug-in hybrid's trip data signals log): with "since delivery"
  the trip computer's statusBordcomputerTravelData keeps the last choice's figures (53487 km, 675:27), no "no value";
  the head unit's own trip data, ResetLogic.bcDataAll (activeResetLogic: the active choice) and ResetLogic.gwsz
  (drivenDistance: the odometer), are now watched (both "rs", from that car's catalog): with a delivery choice the trip
  is the odometer, and the driving time and fuel economy that choice's own where bcData names them (tripOf: the
  active choice's entry, its distance, hours / minutes or duration, consumption with its scale, each checked for a
  sensible size), else none rather than the last choice's (the trip computer's economy then waits too). Their raw
  values are logged, to read bcData's layout from them.
- Layouts 0.48.7: the logs' QR codes about a third as many (45 were 15 pages, now about 16 codes, 6 pages): the catalog
  listings (range, power, cruise control, time signals, found long since) and the trip list past the reset-logic and
  trip computer services left to the USB file, the render log's last 20 lines (was 50).
- Layouts 0.48.8, Centre 0.13.6: ResetLogic.bcDataAll and gwsz out again (0.48.6-0.48.7). On the plug-in hybrid they
  answered only their defaults (the active choice 0, every figure 0, gwsz 0; the service's currentConsumption too,
  Nov 19 2026 15:18): the cluster keeps the trip data there, not the head unit. The trip stays the trip computer's
  (statusBordcomputerTravelData / Average).
  The trip computer's distance is 16 bits: past 65,535 km it starts from 0 again (that car's own-reset trip: 119,110 km
  on the car, 53,575 sent, 65,536 apart). A long trip (its driving time 100 h or more) gets Settings > Car > "Trip
  distance past 65,535 km" x 65,536 km added, never past the odometer, and a wrap seen while it counts (60,000+ to
  under 5,536) adds one to that setting. New readout ODO: the odometer (mileageKilometre), the trip since delivery -
  with "since delivery" chosen the car sends nothing new on the trip signal (its last choice's figures stay).
  tools/preview.js: --centreView trip --tripKm --tripMin.

## Demo
`cluster_demo.bat` (Windows) or `node tools/cluster_demo.js`.
