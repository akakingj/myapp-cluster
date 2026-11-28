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
Icons, white line art with an M-coloured accent (`icon.png` in each app's folder; `kit/tools/make_icon.js kr-cluster`): Layouts
an instrument cluster (`kr-cluster`), Centre the trip, a speedometer over its odometer (`kr-trip`), Info a windscreen
with a head-up display (`kr-hud`).

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
  distance fix: times the trip passed 65,535 km (usually 0)" (Korean: 트립 거리 보정: 65,535 km를 넘은 횟수, Nov 28:
  the owner found the old wording unclear) x 65,536 km added, never past the odometer, and a wrap seen while it counts (60,000+ to
  under 5,536) adds one to that setting. New readout ODO: the odometer (mileageKilometre), the trip since delivery -
  with "since delivery" chosen the car sends nothing new on the trip signal (its last choice's figures stay).
  tools/preview.js: --centreView trip --tripKm --tripMin.
- Layouts 0.48.9, Centre 0.13.7: eroobeeroo's kwfuse (Nov 19 2026): the fast kW sits on the battery reading (each
  car-signal model carries its average gap to it) and is shown as computed, with no easing lag.
  The cluster's names for the trip figures are one set in every skin: ODO, AVG, RANGE (the fuel range), TIME. JDM 1's
  readout under the speed: its name, then the value (RANGE   520 km).
- Layouts 0.48.10: a readout's name sits small above its value everywhere: the main readout in 20's, ID6 M, KO 1,
  KO 2, Old M and JDM 2, and the side readings of JDM 2, Track and the pods (C.reading).
- Layouts 0.49.0, Centre 0.13.8 (shared shaders.js: BAND_FS u_yellow): the shift lights as four settings, each the Car
  profile's (1.7.0) where it sets one: Yellow light at (lightStart; Auto: 700 rpm under the red), Red shift
  light from (lightRed; the red zone; Auto: the redline), Shift now warning at (shiftAt, may be past the red), Max rpm
  (rpmScale); the Redline the limiter. Yellow replaces Amber zone below the red zone (ID6 M, ID7 M, ID8 M: the amber
  zone from it). Track and GT3 with Yellow set: the rpm bar white up to it, turning yellow towards the red zone, red
  from there, the shift lights from it to the warning. New layout Simple (layout_simple.js): the engine speed, the
  speed and the gear on one baseline, their units under them, the trip computer's three lines under a rule; the
  engine speed yellow / red, at the warning the speed and gear red too. The page's pictures made again
  (make_previews.py: Simple, and the readout-name changes of 0.48.x).
- Layouts 0.49.1: Simple with the map or the stock centre (Pulse's pieces) takes Settings > At the shift now warning:
  the speed and the gear red, as Pulse does.
- Layouts 0.49.2, Centre 0.13.9: boost (and the boost target) read from the engine unit start at 0: a closed throttle's
  vacuum (below the outside air) reads 0 psi / 0.00 bar / 0 kPa, not a minus figure.
  Boost is the car's sport display's first, as BMW's sport display shows it (once it has moved: a car whose sport
  display sends none sends one value all along), the engine unit's only without it; the target stays the engine unit's.
- Layouts 0.50.0: with the map or the stock centre over the car's strip, every layout but ID7 M and ID8 M leaves the
  middle of the map area open (layout_common.MAP_VIEW, x 592-1338, y 120-600; Waze on cluster's window too) and
  covers the cluster's own speed readout at its left edge (STOCK_SPEED): the stock fins, "km/h", speed limit sign
  and "1/min" no longer show cut off at the window's edges.
  0.50.1: the cluster's own speed readout shows beside the view instead (STOCK_SPEED, x 426-592, y 326-424, from just
  inside the fin's tip: the dials end at x 410; measured at 0 km/h, a three-digit speed not yet seen on the car).
  ID7 M with the map: its window reaches from under the camera's cowl to the foot of the map area (711, 130,
  498 x 470, was 263 high), the speed in the left card and the gear in the right one, under their gauges.
- Layouts 0.52.2, Centre 0.14.2, Info 1.10.2 (Nov 22 2026; the kit's car.js): the layouts' speed lags the cluster's
  and the HUD's by about a figure (56 on the HUD, 55 accelerating, 57 slowing). Its signal is Vehicle2.statusCarSpeed2
  (the centre of gravity's, not the indicated speed), through the head unit and the renderer back to the KOMBI. The
  logs' "speed signals": the speed, rpm and acceleration samples a second and their gaps (car.rates(), the last 10 s),
  and every catalog field with speed / Geschwindigkeit / Tacho / Anzeige / displayed / indicated in its name or members,
  to find the indicated speed if the head unit has it.
- Layouts 0.52.3 (Nov 22 2026): the speed figure holds until the speed is 0.75 past it (C.speedShown), as the cluster's
  does: plain rounding flickered 79 / 80 about 79.5 and turned before the cluster's figure.
- Layouts 0.52.4 (Nov 22 2026): the rpm figures (GT3, Pulse, Simple, Track) in tens, held until the rpm is 15 past
  the one shown (C.rpmShown), in place of fifties.
- Info 1.10.3, 1.10.4 (Nov 22 2026): with no Waze map on the HUD the HUD panel is sized to the glass (r.glass: up to 58 high,
  its bottom right at HUD_SEEN's less 4), not to the standard map's picture, and the directions are 16 % bigger
  (nav_view SCALE 0.72, 173 x 132; MAP_SCALE 0.62 over a Waze map on the HUD). The room between the turn signals
  (y 148) and the glass's bottom (356) is 200 px for both; the owner chose the directions first.
- Info 1.10.5 (Nov 22 2026): Settings > Driving assistant check (off by default; adas_probe.js, read only), to see on
  the G20 whether the head unit gets the cluster's assisted driving view data (the four de.bmw.dass.* services of
  shared/dap.js, all optional in app.json, and DisplayDataServer.functionalLibraryData), and which such services
  its catalog has; the page shows it, cluster-info-adas.log keeps it. The owner asked for it in Info, not AK Map Test.
- Info 1.10.6, Centre 0.14.3, Layouts 0.52.5 (Nov 22 2026): each app's Logs its own (logs.pager in shared/logs.js:
  codes three a page, the full file cluster-logs-<info|centre>-<time>.txt on USB sticks and in its data folder); Cluster
  Layouts' logs no longer carry Cluster Centre's log or Cluster Info's, so its codes stay few. Info's: its page's rows,
  the overlay, the raw turn signals, the driving assistant check and its log, the directions' log, its own log.
- Layouts 0.52.6 (Nov 23 2026): its Logs file is cluster-logs-layout-<time>.txt, like Info's and Centre's.
- Info 1.10.7 (Nov 23 2026): the directions' lanes up to 36 of the board's 240 wide (lane_draw.js CELL_WIDE; 29
  before, still 29 each for 7 or 8 lanes), the arrows as they were: wider lane boards, as the owner asked.
- Info 1.10.8 (Nov 23 2026): the lane board and its arrows 82 % as high (lane_draw.js LOW, from y 17.4; nav_view's
  lanes part 47 high from 15): the directions 173 x 132 (149 x 114 over a Waze map), as the owner asked.
- Info 1.10.9, Layouts 0.52.7, Centre 0.14.4 (Nov 23 2026; the owner asked for a toll gate picture): nav.js keeps the
  tollgate event (kind 'toll'; it was skipped), nav_view shows TOLL for it, for straight on to a road named
  톨게이트 / 요금소 / ...TG, or for lanes with TOLL_* info; nav_draw's tollGate (original, after
  the owner's sketch: one gate, a beam on two short legs across the road narrowing away) with 'Toll gate'
  (ko 톨게이트) over the distance; lane_draw tints TOLL_ETC lanes blue (half for
  TOLL_ETC_CASH). None of the three seen from TMAP over CarPlay yet (INCLUDE_TOLLGATES was rejected by the car on the
  Nov 22 drive; cluster-info-nav.log will show what a toll plaza sends).
- Centre 0.14.5 (Nov 23 2026): Shift light: starts at offers 6500 and 7000 too, as the Car profile's lightStart does
  (kit/tools/test_car_profile.js, brought up to Layouts' econUnit / redLight / yellowLight and now in CI, found it).
- Layouts 0.53.0, Centre 0.14.6, Info 1.10.10 (Nov 23 2026; the owner's Retro M memo): a new layout, Retro M (retro_m,
  before Old M; 90's as it was): black dials on a grey plastic panel after a VDO-era M car (drawn anew from the memo's
  numbers: no picture, theme or lettering of VDO Classic M's), white IBM Plex Sans Condensed figures (font_cond.wad,
  in Cluster Layouts' folder alone: tools/bake_font.py 'cond'), bar ticks, orange needles; the trip computer's average
  economy hanging in the speedometer, the oil in the tach, fuel and coolant dials at the ends, the gear's window and
  the M stripes between; the speedometer's window a place (speedWin, the odometer). One set of colours. Each dial one
  RMDIAL_FS layer with the panel round it, the panel between in RMBG_FS pieces (the largest piece 530 x 530); the dials
  at y 360 so their rings clear the cowl's corners (tools/clearance.js: rmdial round at u_c). Centre and Info: the
  Korean for Retro M's place (kit locales), and Centre's shared font list. Every layout's name in English in Korean
  too (Simple, Track: they were 간단, 트랙), as the owner asked.
- Centre 0.14.16 (Nov 24 2026): its icon's odometer reads 320 (make_icon.js kr-trip), as the owner asked.
- Layouts 0.56.2 (Nov 24 2026): the page's layout pictures (previews.wad, tools/make_previews.py) drawn again
  after 0.55.4 - 0.56.1 (Retro M's needle over its window, JDM 1's water). The tests no workflow ran (awake, dap,
  frozen, fuel, korean, kwfuse, oilpress, presence, readouts, strip_fuel, tight) run in tests.yml with the others.
- Layouts 0.56.3 (Nov 24 2026): KO 2's trip computer three lines, as KO 1's (Trip computer: line 1-3; the
  distance, the driving time and the average economy as they come), as the owner asked.
- Layouts 0.56.4 (Nov 24 2026): a plug-in hybrid's Power % as the other rev counters' in Retro M and JDM 1, as the
  owner asked. Retro M: RMDIAL_FS u_mz (0 a quarter round, the regeneration below it to -100 in green ticks over a
  band, no figures there), eDRIVE / eBOOST / CHARGE round it (layouts.js withPowerWords); it stopped at 0 before.
  JDM 1: RTACH_FS u_zero (lit from the 0 either way, below it green), the 0 on the thousand nearest a quarter, 0 /
  50 / 100 on the thousands' figures (the rpm figures blank, no new layers: 56 of 60), POWER % with eDRIVE, CHARGE
  or eBOOST under it; the rpm figures stayed and 0 - 100 drew from the start before. GT3, Pulse, Simple and Track
  (figures only) left as they are. Centre 0.14.17: the same shared shaders.js.
- Layouts 0.58.1 (Nov 25 2026): the KOMBI's own lights placed from BMW's guide to the G-series cluster (TE18-0859,
  its warning lights' numbers) and a photo of the owner's G20 (Auto Hold and the parking brake): layout_common
  TURN_ARROWS (the turn signal arrows, AK Cluster ID8's measured places) and SIDE_LIGHTS, each as its shape in a few
  rectangles (an arrow's head and shaft, a round symbol, Auto Hold's words), not a box round it (lane departure, brakes,
  tyres, ABS, DSC on the glass's left; Auto Hold, parking brake, steering on its right; the lights, fog lights,
  engine and DSC off are lamps outside the glass). node tools/clearance.js --lights names what lies under them (not
  yet held by the test). Moved clear of them: JDM 1 at its own size (K 1, its side boxes in from the edges), GT3's
  side columns (x 150-410, 1510-1780), Track's speed (x 150-550), its right two tiles (1360-1780) and its shift
  lights (y 172, under the turn arrows), JDM 2's beginner's mark (smaller, further in). Those just touching them,
  made a little smaller: 90's and 20's dials 576 (600), Old M 576, ID6 M radius 288 (300), JDM 2's tach radius 240
  (248), Retro M's big dials 0.92 at x 590 / 1330, y 380 (the small dials at x 208 / 1712, y 480). With the map or
  the stock centre the side dials still lie under the side lights (the owner: the map's top is shaded anyway).
- Layouts 0.69.0, Centre 0.16.9, Info 1.12.2 (Nov 28 2026): warning signs on every layout (the owner's ask, first KO 1 and KO 2;
  then all, places chosen by layout_common.warnPlace, JDM 1 and JDM 2 their own warnHome): the
  camera's warnings (DS_ types) as Korean triangles 76 high, up to two, the first where the speed limit sign stood
  (right of the speedometer), the second mirrored by the tach; KO 1's and KO 2's speed limit sign moved into the
  speedometer's open foot (the owner's place, layout_common.sliInFoot; beside the map as before), with Settings > Speed limit sign On (a GPU piece "sign" sampling
  sign_atlas.js; layout_common.warnPlace/warnPieces; data.js d.roadSigns, the camera's event declared by the survey
  fit). The top middle is the driver camera's cowl (the owner reminded): NOTCH now kept clear by the speed limit sign
  too. shared/road_signs.js now holds the camera logic for Info and Layouts (Info takes it by name).
  Then (the owner, same day): the speed limit sign and the warning signs in one line, a row or a column
  (layout_common.signGroup, 12 px then 6 px clear; a row always with the speed limit sign leftmost), and no passing
  on the cluster as the owner's picture (tools/sign_art/no_passing.png; data.js keeps DS_ types and no passing, not
  its end). The owner's own places (signAt, layout_common.fixedGroup, from his marked-up sheets): Retro M a row
  under the M stripes below the gear, ID7 M a row centred under the speed, JDM 1 a row just over its left box, two left of its right edge and one right (its
  cup of water moved over the right box, the coolant and oil, the owner's call), Old M and ID6 M a row under the middle display (moved up for it), Track a column left of the speed,
  Simple a row under the speed (TIME moved under it), JDM 2 a column right of the tach (G meter and tach smaller,
  tach 30 px left); these moves only with Settings > Speed limit sign On.
- Layouts 0.69.1, Centre 0.16.10, Info 1.12.3 (Nov 28 2026, the owner's): a warning sign shows when the camera reads
  it, for 10 s, and a sign read after it takes its place (one event's several together) - shared/road_signs.js
  makeTracker; Info's HUD the same. No passing on the cluster stays, first, till its zone ends: an end sign
  (road_signs.npEnd), or 3 km driven since its sign (makeZone; the end's signal not known yet). The Logs' --- sli ---
  keeps every field of TrafficSignRecognition as it changes (the last 12), to find where the zone's end is.
  Info 1.12.3 also logs, once at the start, every name in the sign services' definitions (`sign definitions:`).
- Layouts 0.69.2, Centre 0.16.11, Info 1.12.4 (Nov 28 2026): the owner: BMW's no passing sign comes with its distance
  from the car's map. The Logs' --- sli --- now has the head-up display data's field names and each change of those
  about passing/tunnel/lane change (shared/road_signs NP_FIELD); Info, once at the start, the catalog's services and
  members named for no passing or the map's look ahead (`catalog no passing`). ID8 0.29.2 the same Logs.
- Info 1.13.0, Layouts 0.69.3, Centre 0.16.12, ID8 0.29.3 (Nov 28 2026, the owner's): two logs in Info - **Logs**
  (how the app works) and **Test log** (development and checks: pressing it starts the driving assistant check, the
  signal survey and research.js, the sign services' every field and the HUD data's no passing fields as they changed;
  pressed again they end and its codes show; with the sign definitions). Settings > Driving assistant check and
  [Start survey] gone. Each app's Logs keep its own working; the research lines left Layouts' and ID8's Logs. A link to
  download the logs as Waze on cluster's does needs a root service opening the hotspot's port: not for these apps (the
  owner chose the codes).
- Layouts 0.69.4, Centre 0.16.13, Info 1.13.1, ID8 0.29.5 (Nov 28 2026): the car's catalog (someip-interfaces.json,
  689 interfaces) names the camera's end of no passing WITHDRAWAL_NO_PASSING_SIGN (and GENERAL_WITHDRAWAL, the end of
  every restriction): no passing ends on them (before, the first was taken for a no passing sign and started the zone
  again). The same catalog has BMW's own no passing state: TrafficSignDisplayControl
  .displaySpeedLimitAndNoPassingRestriction.displayNoPassingRestriction (0 none, 1/3/5/7/8 no passing, 2/4/6 its repeal)
  with displayRemainingDistanceNoPassingRestriction, and DisplayDataServer2.functionalLibraryData.npiData (npiState,
  npiLabel KOREA / NPI_REPEAL_*) with vnpiDistance; not read yet (the Test log on a drive shows whether they come).
  From the same catalog's sign types (79): an empty place of the camera event's 20 (SIGNAL_UNFILLED) is never a sign
  (it matched traffic lights), STOPPING_RESTRICTION / NO_STANDING_ANYTIME get 주정차금지 (not the stop sign),
  DS_BYCICLE_CROSSING the bicycle, DS_GIVE_WAY_ROUNDABOUT the roundabout. Still "!" for want of a Korean picture:
  DS_ROAD_NARROW_*, DS_CROSS_ROAD*, DS_ROAD_FROM_*, DS_CONCAVE, DS_SNOW, DS_GRAVEL, DS_TWO_WAY_TRAFFIC,
  DS_LOW_FLYING_AIRCRAFT. The TrafficSignRecognition event also has recognitionNoPassing, displayTextMessageNpi and
  displaySpeedNPIDistance (raw UInt8s).
- Info 1.13.2 (Nov 28 2026): South Korea has no end of no passing sign; the navigation's map ends the zone (the owner).
  So the Test log keeps every change of the no passing fields on their own (the last 80): TrafficSignDisplayControl
  displayNoPassingRestriction + remaining distance, TrafficSignRecognition recognitionNoPassing / displayTextMessageNpi /
  displaySpeedNPIDistance, DisplayDataServer2 npiData / vnpiDistance (a new survey group, hud2: fitted on the G20's
  catalog it is declared, 44 members in all); each sign service's changes apart (30 each), so the camera's many
  events no longer push the others out. The 3 km fallback stays till a drive's log shows which field ends it.
- Info 1.14.10 (Nov 28 2026): the route's events in the Test log - the directions' own GuidanceEventList replies (a
  CarPlay route fills it too; asked with speed cameras since 1.14.0): "route:" lines in the map and guidance, the kinds
  of each reply when they change, every speed camera with its distance and icons, the guide and the phones' guiding
  flags - to see whether a CarPlay route (TMAP) brings speed cameras. From the 21:10 log (2 min, no route): the traffic
  lights' colour 0 while standing at a red light, 2 while driving through (so far: 0 red, 2 green, a guess), place x
  falling as the light nears (252 the most); MapApi / RIC again nothing.
- Info 1.14.9 (Nov 28 2026), from the owner's Test log of 20:30 (7 min, BMW's map and CarPlay's shown in turn, no
  destination; mark 1 the map opened, mark 2 a speed camera passed, on BMW's map; the steering assist on a moment):
  MapApiLinksSD, MapApiLinksSDLow and RICServiceGuidance "nothing provides it" - no map look ahead, no RIC guidance
  for an app without BMW's route (the cruise control was not on: one drive with it on is left to try). The camera's
  traffic lights came, ~24 a second (5966 values; colour 2 on every light seen so far): the 300 lines were full in 23
  s, so now a line when the light, its colour, state, arrow or direction change, its place alone every 2 s at most,
  and the count of values in the header. The camera's signs: SS_DISTANCE_IN seen as a supplemental sign, and
  DS_TRAFFIC_LIGHT.
- Info 1.14.8, Layouts 0.70.5, Centre 0.16.20 (Nov 28 2026; Layouts and Centre: the Korean catalog only): [Mark] (구간
  표시) in the left column, under Test log - while the checks run, "=== mark N ===" with the time and the speed in the
  camera signs, the traffic lights and the map and guidance, to line a moment up with the log (BMW's map opened, the
  driving assistant on or off: the owner's idea); and the driving assistant's state from the head-up display's data
  (activeCruiseControl.symbolACC, trafficJamAssist.steeringWheel and ldmHandsSymbol) in the map and guidance at each
  change ("assist:"), with no button. The test page counts the marks. Starting a test again clears the last one's
  sections from memory; the codes' file of each shown (exports/cluster-logs-info-test-*.txt, the newest five of the
  Logs' and the Test log's together) stays.
- Layouts 0.70.4, Centre 0.16.19 (and Info 1.14.7): the Logs' code pages - a code's number under it was drawn 2 px past
  the screen's bottom when the last code was smaller (a lower QR version, bigger modules): the codes sized so their
  number always fits (shared/logs.js).
- Info 1.14.7 (Nov 28 2026): speed cameras without BMW's route looked for (the owner's QR log study: wanted with
  CarPlay and no destination, not BMW's map). The Test log's survey reads, events only, the map's look ahead -
  de.bmw.infotainment.navigation.foresight.MapApiLinksSD and MapApiLinksSDLow (linksFrame: the links ahead and their
  attributes, warningSignPool with MapApiLinkTypes.Warning 85 SPEED_CAMERA / 86 TRAFFIC_ENFORCEMENT_CAMERA at an offset
  in cm along a link; sdMapMatchedPositionAndMPP: the map matching's status, the car's link and offset, the most
  probable path) - and RICServiceGuidance's ric_sendEvent (groups mapLinks, mapLinksLow, ricGuidance; 50 declared on the
  G20's catalog). GuidanceEventList's viewsChanged left out: the directions ask that service already. No method called.
  Section "map and guidance": how many of each came, the last matching status, and lines on a change (the warnings and
  the cameras on the links, with the link, its length, the offset and the direction, and how far ahead when the camera
  is on the car's own link; the position on a status change or every 30 s; RIC's events). Not shown anywhere yet: the
  drives to compare (BMW map hidden and no destination; CarPlay TMAP; BMW map shown, no destination; BMW route).
- Info 1.14.6, Layouts 0.70.3, Centre 0.16.18 (Nov 28 2026; Layouts and Centre: shared/road_signs.js parseSignsAt's
  new fields only, nothing they show): the camera signs' lines keep every field the camera gives for a sign, its meaning
  known or not - with 1.14.5 the camera's events left "every field", so the height (location.z), every position flag
  (l r o: several came true), the second supplemental sign, trafficSignForm, additionalInfo and variable are now on each
  sign's line ([z= flags= sup2= form= info= var=]); only what the catalog already told was dropped.
- Info 1.14.5 (Nov 28 2026): the Test log without what the car's catalog already told (the owner: 53 codes, the catalog
  checked): no sign definitions (the camera's types, the sign services' definitions, the catalog's no passing services:
  signs.js reads only the camera's own config, to count its types; the catalog file not read at all), no survey
  catalog (sign/assist), no HUD data field names, the driving assistant check without its catalog lists (the file keeps
  them), and the camera's events no longer among "every field as it changed" (a line each in camera signs). From the
  Nov 28 log: about 72 codes' worth down to some 15.
- Info 1.14.4 (Nov 28 2026): the road signs on the HUD go with the panel - Show the panel Off ([Show on the HUD] off)
  hides them too, as it did the turn signals and the lane change warning (the owner turned Info off and the signs still
  came on the HUD). Speed cameras are still read for Layouts and ID8 then (camera.json).
- Info 1.14.3, Layouts 0.70.2, Centre 0.16.17 (Nov 28 2026; Layouts and Centre: the Korean catalog only): [Show on the HUD] first in the page's left column (Settings > Show the panel: on the HUD
  or off; the button's label says which, 켜짐 / 꺼짐); "Where the Waze map is" taken out of Show the panel and Panel
  position hidden (the owner doesn't use them; a saved "map", the app's or a driver profile's, becomes the HUD).
- Info 1.14.2 (Nov 28 2026): the camera's traffic lights looked for, read only, not shown - the G20's catalog has
  de.bmw.environmentalmodel.TrafficLightRecognitionFrontCameraLegacy (event RecognitionTrafficLightCamera: UInt8s
  trafficLightID 63, PositionX / Y / Z 255, Status, Arrow, IndicateDirection, Color, qualityRecognitionTrafficLight 15 -
  the defaults: no traffic light), never subscribed before. The survey's new last group trafficLight (fitted to the
  catalog: a car without it is not refused; 45 declared on the G20's); the Test log's --- traffic lights --- has each
  change, the whole test (at most 300: HH:MM:SS km/h | id color status arrow dir x y z q, the figures as they come), and
  the head-up display's TRAFFIC_LIGHT_ symbols (DisplayDataTypes.VSLISign) as "hud:" lines to compare.
- Info 1.14.1, Layouts 0.70.1, Centre 0.16.16 (Nov 28 2026), from the owner's Test log of 16:30 (12 min in town, every
  road 50): (1) the Car profile's two new settings under Start on the cluster, Speed limit sign (signSpeedLimit) and No
  stopping signs (signNoStopping, off by default: NO_STANDING_ANYTIME was read 21 times of 45), followed by Layouts only
  (sliSign, and a new noStoppingSigns, off; ID8 0.30.1 the same) - Info and Centre have neither (road_signs.js wanted /
  makeTracker take { noStopping } only when given). (2) A side road's signs left off: the camera's event has each sign's
  place (location.x ahead, y aside, + left; locationInvalidFlags 0 valid) - the car's own road's at y -7.6 ... +2.2, the
  central reserve's +9.3, a side street's no entry at x 58, y -28.1 - so one more than SIDE_M = 12 m aside, its place
  valid, is not shown (Info's HUD, Layouts, ID8; parseSignsAt, ownRoad; a no passing end taken wherever it stands); the
  Test log marks it "side road: NO_ENTRY x=58 y=-28". (3) The speed limit never the head-up display's on this car: its
  vSLISpeedValue said 12 (60) with statusVZA STATUS_INACTIVE the whole drive while the sign said 50. Now (data.js
  limitSource): the sign's event within 10 s; its last figure kept 60 s after, "sign (kept)"; then --; the head-up
  display's only on a car whose sign never came and whose Speed Limit Assist is not STATUS_INACTIVE. (4) The distance
  to an announced limit is vSLIDistanceValues (LDM_VSLI_DIST_650_M ... OFF), not the name read before (never there):
  sliAhead works now. (5) The Test log keeps every camera event of the test, at most 300 lines (time, speed | type value
  place x y supplemental; ...), the changes of every field (the last 30) as before.
- Info 1.14.0, Layouts 0.70.0, Centre 0.16.15 (Nov 28 2026): speed cameras (the owner: "if it can see speed cameras,
  show fixed or mobile, on Info, Layouts and ID8"). Not the front camera's: BMW's navigation lists them among a route's
  events (GuidanceEventList queryContent, now asked with INCLUDE_SPEED_CAMERA and 8 events; Guidance.conclusiveDart),
  speedCamera and speedSectionCamera (구간단속), so only while a route runs and only for routes BMW knows the cameras
  of (its own navigation; a phone's route over CarPlay hands BMW its turns, not its cameras, as far as is known). Info's
  nav.js decodes them (decodeCamera: the distance, or one from the distances to the destination; inside a section; the
  icons), shows the nearest within 1000 m (or the section the car is in) first among the HUD's signs, and shares it in
  /dev/shm/cluster-info/camera.json ({ t, camera: { type } }, removed when none) for Layouts (providers camera, first
  of its two signs) and ID8. Fixed or mobile: the catalog has no field for it, only the icon BMW's map draws
  (speedCameraInfo.cameraIcon / endCameraIcon, ResourceID { id, url }) - a name with "mobile" in it is taken for mobile,
  any other for fixed; a guess till a drive's log shows the ids (the directions' log: `camera:` lines; the app's log:
  `speed camera:` once per kind and icon). The pictures, drawn after South Korea's enforcement signs (단속중, 이동식
  단속중, and 구간 단속; yellow, a camera; without the English line): tools/make_sign_art.py camera_sign,
  tools/sign_art/camera_*.png. Settings > Road signs on the HUD's "On" now says speed cameras too (ko re-translated).
- Info 1.13.3, Layouts 0.69.5, Centre 0.16.14 (Nov 28 2026): the 79 sign types of the car's catalog decided by the
  owner's table (tools/known_sign_types.json; shared/road_signs.js KNOWN, exact names first, the old rules only for a
  name not in it): VEHICLES_PROHIBITED no cars, DS_ONE_BUMP the speed hump, DS_CONCAVE bumpy road; the narrowing
  roads, junctions, two-way traffic and aircraft "!" till their Korean pictures (118/119/120/101/106/104/105/115/136,
  and 201 for ALL_VEHICLES_PROHIBITED, hidden till then); the 13 pictures no type uses left out of sign_art.js and
  sign_atlas.js (230 -> 158 KB, 190 -> 165 KB). The Logs / Test log code page: its lines below the title bar (the
  first was cut), the file's path shortened on a line of its own. Layouts' trip setting reworded: "Trip distance fix:
  times the trip passed 65,535 km (usually 0)", unit "times" (Korean 트립 거리 보정: 65,535 km를 넘은 횟수 (보통 0), 번).
  And Layouts (KO 1, KO 2 and the layouts with sign spots) shows the signs the HUD does (the owner: "the HUD's signs on
  Layouts and ID8 too"): give way, stop, no entry, no cars and no stopping as well as the warnings (data.js roadTracker
  takes RS.wanted; the atlas has them, make_sign_art.py REGULATORY emptied). ID8 0.29.6 the same.
- Info 1.12.1, Layouts 0.68.2, Centre 0.16.8 (Nov 27 2026): the Engine setting's M car choice reads just "M" in Korean (was
  가솔린, M 차량; the owner's ask), as in the Car profile and ID8. The translation changed, so all three up.
- Info 1.12.0, Layouts 0.68.1, Centre 0.16.7 (Nov 27 2026): the road signs the front camera reads on the HUD (signs.js) -
  the camera's event (SignRecognitionFrontCamera.TrafficSignRecognitionFrontCamera, once a sign; the survey of Nov 26
  read GIVE_WAY, DS_TRAFFIC_JAM, DS_SPLIPPERY_ROAD, DS_RIGHT_DOWNWARDS, DS_ANIMAL_CROSSING besides the limit and no
  passing) as South Korea's own signs (the owner's downloads of the government's designs, tools/sign_art/, cut out
  along the red or blue edge and shrunk to BMW's limit sign size (60 high; a triangle 69 wide) by tools/make_sign_art.py; 39 + 위험 "!"; the car's list of the
  camera's types logged once from its interface config, to drop the pictures this car never shows) right of BMW's "km/h", in its row (x 380, middle y 388, 60 high as BMW's limit sign - the owner: too small at 54; four triangles 6 apart to x 674), 10 s each;
  not the limit or no passing (the HUD shows those: the limit sign moves up for no passing, owner's photo). Place
  measured on the owner's HUD photo with the panel's text and the lane change sign as yardstick. Settings > Road signs
  on the HUD (on / sample / off). The survey reads the camera through the same subscription. ko.tsv: 4 lines, so all
  three apps up. test_cluster_info_signs.
- Layouts 0.68.0, Centre 0.16.6 (Nov 27 2026): the speed limit sign from the sign itself - Info 1.11.1's survey (17:35,
  21 min in town): de.bmw.dass.TrafficSignRecognition event TrafficSignRecognition, presentClassLimitSpeed x 5 (8/18/22 =
  40/90/110 as the camera read them), ~2 Hz; the HUD's vSLISpeedValue sat at 20 (100, the limiter's) all along. Layouts'
  app.json "survey" (one event) declares it at install only where the catalog has it; shared/data.js tsrStep, the HUD's
  only without it or after 10 s silent. Logs: a sign line first; sliSource, sliSign.
- Info 1.11.1, Layouts 0.67.2, Centre 0.16.5 (Nov 27 2026): the Logs' QR codes about 30 % fewer - "CLG2 <id> <n>/<count>
  <base45>." in alphanumeric mode (shared/qr.js encode alnum, shared/logs.js base45; Info's log of 16:35: 21 codes ->
  15), tools/decode_logs.py reads CLG1 and CLG2. Info's signal survey: one button, Start survey / Stop survey (조사 시작 /
  조사 중지; Start also sets the check to Signal survey), started driving too (no "stop the car first"), no asking again
  under 3 min; its record fitted to 15 codes (was 30). The translation changed: all three apps up.
- Layouts 0.67.1, Centre 0.16.4 (Nov 27 2026): a curve's speed is no limit. Info's log of 16:35 (cruise control on at
  102, then 112): vSLISymbol LDM_VZA_VSLI_COURSE with 10 (50) at 500 m ... OFF on a 100 road, then the 10 left with
  NO_SYMBOL till the next 100 sign; 0.67.0 would have shown 50 for ~20 s. Now the curve's figure is skipped, and the same
  figure after it with no symbol, till another figure or a limit sign (sliStep mem.course). The cruise control's speed
  never came in vSLISpeedValue (20 all along at 102 and 112).
- Layouts 0.67.0, Centre 0.16.3 (Nov 27 2026): the speed limit sign as the car's own - the last limit recognised, kept
  till another, cruise control or not (shared/data.js sliStep). Info's log of 27 Nov (a drive, the cruise control off):
  vSLISpeedValue x 5 is the limit the car knows (16: 80, 20: 100); a new one announced with vSLISymbol SPEED_LIMIT and
  vSLIDistance counting down (1.3 km ... 250 m), counted when reached (OFF / the symbol gone). 0 keeps it; over 28
  (140) ignored (the 30 of Nov 24: no Korean road is 150; motorways 100 / 110). The HUD's own sign display was off
  there (statusVZA INACTIVE, piaHUDSliNpi 0).
- Info 1.11.0, Layouts 0.66.2, Centre 0.16.2 (Nov 27 2026): Signal survey (Settings > Driving assistant check), to
  find the speed limit sign itself in one drive: app.json "survey" says what to look for, kit/runtime/survey_fit.js
  declares in the manifest only what the car's own catalog has (build.py on the car, as the Store builds; oapgen/gen.js
  for a .mgu install), read only, at most 60; survey.js subscribes them from [Start survey] to [End survey] / 30 min,
  each sign candidate's change with the HUD's speed and vSLI, and the record into Logs and exports/. Layouts and Centre
  have no survey: their manifests as before (test_survey_fit.js). Korean for the button and option: every app 0.0.1.
- Layouts 0.66.1, Centre 0.16.1 (Nov 27 2026): TAKEOVER_OCCURED counts as taken (shared/data.js sliOf): Info's log
  (04:16:44) has ldmAdditionalSign SET -> OCCURED -> SET the moment a limit is taken; the sign blinked '--' there.
- Layouts 0.66.0, Centre 0.16.0, Info 1.10.27 (Nov 27 2026): the fuel % is the engine unit's own (OBD tank level)
  only, its last answer held, '--' till it answers; the car's litres over a tank size, Settings > Fuel tank size and
  Fuel % from gone (the size meant nothing; the Car profile 1.15.0 no longer sets them). 0.65.0's Yellow light at Off
  taken back out (the shift lights need the yellow). The Car profile 1.14.0's Auto, kept: a G20's red from 6000, the
  shift now warning at 6500 where its red turns solid (Shift now warning at above Red light at), the redline 7000; an
  M3's yellow 6500, red and warning 7200, 8000.
- Layouts 0.64.1, Centre 0.15.7, Info 1.10.25 (Nov 27 2026): vSLISpeedValue is the limit Speed Limit Assist has taken
  for the limiter or the cruise control, not the camera's sign (Info's log of Nov 24: a value only with the limiter
  STATUS_ACTIVE or the cruise control on and ldmAdditionalSign TAKEOVER_SET, 0 with the limiter off at 60 km/h, the last
  one taken kept - AK Cluster ID8's log of Nov 27: 30 at 106 km/h on a motorway; the owner: with the cruise control on
  the figures come). The sign shows it only then (shared/data.js sliOf, as ID8 0.25.1's), '--' otherwise and 10 s after
  the head-up display's data stops; 0.63.1's last one kept is gone. Logs: --- sli --- (each change of Speed Limit
  Assist's data with the time and speed, the QR codes the last 8, the file 20; how often the data came); data now
  sliRaw, sliTakeover, sliLimiter, sliAgeS. A read-only USB stick (EROFS on two sticks): every Logs page says so and
  where the file is (shared/logs.js savedNote). Info: Settings > Driving assistant check (catalog) lists every member
  named for a speed limit or a traffic sign and every member of a service named so, and whether TrafficSignRecognition
  / SignRecognitionFrontCamera are in the catalog (listed only: a service the catalog lacks gets the app refused).
- Layouts 0.64.0, Centre 0.15.6, Info 1.10.24 (Nov 27 2026): the POWER and TORQUE gauges and readouts end at the
  engine's most from the Car profile 1.13.0 (powerMax kW, torqueMax Nm, hidden settings following it: on Auto the car's
  Sport Display's, FES statusVehicleDynamicEngineMaxValue), else at 200 kW and 450 Nm as before (layout_common
  powerTop / torqueTop; tools/test_gauge_tops.js). Centre and Info: the Korean row for Torque gauge up to.
- Layouts 0.63.1, Centre 0.15.5 (Nov 27 2026): the sign keeps the last limit the car read (the owner: the last one
  while driving; 0.63.0 went back to '--' after 10 s without a reading); '--' at 0 or none yet. The HUD's data is
  watched second instead of seventh: every watch's set-up waits for the one before (kit signals.js nativeTick), and on
  the car the figures came about 30 s after a start.
- Layouts 0.63.0, Centre 0.15.4 (Nov 27 2026): the speed limit sign shows the car's limit (shared/data.js:
  DisplayDataServer.functionalLibraryData xSpeedLimitAssist.vSLISpeedValue x 5). Info's QR log of Nov 27 2026: 14 at
  64 km/h, 10 at 23 - 24, 12 at 38 - 45, 8 at 35 (roads of 70, 50, 60, 40), and 16 with the cruise control at 82 on Nov
  18; vSLISymbol LDM_VZA_VSLI_SPEED_LIMIT only for a few seconds at each new limit (the HUD's pop-up), the value kept
  after it. countryCode LDM_CCODE_ECE; statusVZA STATUS_INACTIVE throughout. Centre: the same shared data.js.
- Layouts 0.62.2, Centre 0.15.3, Info 1.10.23 (Nov 26 2026): a setting the Car profile sets looks it in Settings (the
  owner: with the Car profile starting AK Cluster ID8, Layouts' Start on the cluster with the car looked changeable):
  its row dimmed, its value with "· Car profile", no arrow (kit sheet.js rows: held; it was already not opened).
  kit/tools/test_car_profile.js.
- Layouts 0.62.1 (Nov 26 2026): the speed limit sign's figures larger (the owner: too small to read at a glance) - the
  text box r 1.56 x 1.06 (from 1.44 x 0.8), still fitted to three wide figures (sliFit), the ring 0.16 of the radius
  (from 0.2): about 30 px tall, from 20 - 24. The places as before.
- Layouts 0.62.0, Centre 0.15.2 (Nov 26 2026): Settings > Display > Speed limit sign (sliSign, Off by default; the
  owner, Nov 26: BMW's sign does not show over Layouts): a red ring round a light disc with the figures, placed by
  layout_common.sliPlace at the point nearest BMW's own (528, 590) clear of the layout as drawn then (dials as circles,
  14 px), the KOMBI's lights, the map's window and the strip; z over everything (Retro M's dial quad hid it at the
  panel's own z). '--' until the car's value is known (Info's Driving assistant check). Two pieces: 58 at most (JDM 1,
  plug-in hybrid). Centre: the translation only. tools/test_sli.js. JDM 1: above TACH, inside the tach's curve
  (layout sliHome / sliSkip; the owner: the first places, top left and at the far left, stood apart); an arc band
  (KO 1's, KO 2's dials) in the way only where its box and circle meet; the figures fitted to the layout's face (sliFit).
- Layouts 0.62.0, Centre 0.15.2 (Nov 26 2026): Settings > Start on the cluster with the car (autoStart, Off; the Car
  profile's clusterStart: layouts on, id8 / none off). The owner: AK Cluster ID8 left on did not come up at a start -
  Layouts, also on and lighter, came up first and kept it. shared/presence.js ahead(other, me, since, auto): the app
  started with the car keeps the cluster whichever came up first; main.js turns Show on the cluster on at start, as
  the car wakes (parked -> not) and when it is chosen. tools/test_presence.js, kit/tools/test_car_profile.js.
- Info 1.10.22 (Nov 26 2026): Driving assistant check > Catalog also lists every member of any service in the head
  unit's catalog whose name looks like the brakes', the parking brake's or Auto Hold's (adas_probe BRAKE_RE; the
  screen first, the log all of them, the app log the first 40), to find whether the head unit gets Auto Hold's state:
  the cluster draws its AUTO H light under the apps' layers (the owner, Nov 26: the parking brake's shows over
  Layouts and AK Cluster ID8, Auto Hold's under both). Listed only, read nothing.
- Layouts 0.61.2, Centre 0.15.1, Info 1.10.21 (Nov 26 2026): a settings section's row counts its settings in Korean
  ("설정 7개"; English "1 setting" / "7 settings"), as AK Cluster ID8 0.21.0: it said "7 settings" in English in the
  Korean build too, put together from a number so the catalog never had it (kit sheet.js, since the sections of Nov 12).
- Layouts 0.61.1 (Nov 26 2026): JDM 2 with the car's strip: the tach lower and a little smaller (centre y 413, radius
  225, from 393 / 240) and the gear's disc lower and smaller (y 290, radius 92, from 262 / 100), each 30 px or more under
  the KOMBI's turn arrows - on the car (a photo, 2026-11-26) the arrows sat on the tach's rim and the disc's top: they
  stand about 10 - 15 px lower and further in than layout_common TURN_ARROWS. JDM 1 is clear of them.
- Info 1.10.20 (Nov 26 2026): Driving assistant check > Signals: the speed limit in the HUD's data
  (DisplayDataServer.functionalLibraryData xSpeedLimitAssist, seen on a G20 plug-in hybrid 2026-11-18: vSLISpeedValue
  16 with the cruise control set at 82, vSLISymbol LDM_VZA_VSLI_NO_SYMBOL, statusVZA STATUS_INACTIVE; pia.piaSliNpi 8,
  piaHUDSliNpi 0) - each change in cluster-info-adas.log and the app's log at once, with the car's speed; the page
  shows it and the last two changes. To learn whether vSLISpeedValue is the limit the cluster's sign shows, and its
  scale (16: 80 km/h in fives?), before Layouts and AK Cluster ID8 draw a sign of their own.
- Layouts 0.61.0, Centre 0.15.0 (Nov 26 2026): the clock is the car's own (shared/clock.js, data.js: KombiIF
  statusShowTimeDate, as AK Cluster ID8 takes it; --:-- until the car says; the demo's at 10:09): Settings > Time zone is
  gone, from the Car profile too (1.9.0). Fuel economy unit: km/L, L/100km, mpg (US) or mpg (UK), every Car profile fuel
  use unit taken; Auto (as the car's trip computer) is gone - a saved Auto, or none saved, becomes km/L, or mpg (US) with
  mph, once (main.js). Layouts and AK Cluster ID8 take turns on the cluster (shared/presence.js ahead: each keeps a file
  of its own with when it came up, the one up first keeps the cluster, the other waits - "Waiting: AK Cluster ID8 is on
  the cluster" on Layouts' page, "Waiting: AK Cluster Layouts is on the cluster" on ID8's; an older ID8, with no file
  of its own, is not waited for, as before). tools/known_signals.json: KombiIF statusShowTimeDate (rs), as MGU Styles
  and ID8 declare it on G20s. Gauge goes up to: 5000 rpm gone (the Car profile's too: no car's rev gauge ends below 6000, a
  diesel's included); a saved 5000 is 6000. Electric range when full is eFullKm: kept in km (30 - 100, 50 as it comes),
  shown in miles with mph (the kit's numberText, "unitBy": speedUnit; Settings' list and build.py's drop-down name both,
  "50 km / 31 mi"), the Car profile's eFullKm followed (1.9.0; its eFull in miles is no longer written); a saved eFull
  (miles) is its nearest km once and leaves the file (main.js). The electric range's bars and gauges are full at it
  (data.js erangeFull: Layouts' E-RNG, it was 100 km; Centre's ELECTRIC reading, it was 60 km), and Centre shows an
  estimate with ~ as Layouts does (readings.js view).
- Layouts 0.60.1, Centre 0.14.22, Info 1.10.19 (Nov 26 2026): Settings > BMW's bottom strip is On / Off after a test on
  a car (photos, 2026-11-26): On is the band at 18 (the trims of 6 and 12 px left pieces of the stock dials at the sides,
  nothing below the layout left more), Off hides it to BMW's gear letter (the wider gap showed the T of COMFORT).
  main.js moves a saved 0 / 6 / 12 / 18 to on and hide / hideWide to off. Centre and Info +0.0.1 for the translations
  (the six labels gone). Car > Vehicle is **Engine**, with the Car profile's and AK Cluster ID8's five choices (Auto,
  Diesel, Petrol, Petrol M car - a petrol car here, shared/data.js - and Plug-in hybrid), Layouts and Centre alike.
- Layouts 0.60.0, Centre 0.14.21, Info 1.10.18 (Nov 26 2026): the Waze centre's map hosted from layers (map_host.js:
  client.host('panel', { target: 'map', x, y, w, h }), unhost when the layout stops showing or the centre isn't Waze)
  in place of the map window file our waze-on-cluster read (map_window.txt, layout_window_file), so the MGU Store's
  own Maps on cluster (robertnisipeanu, cluster-render 0.8.x) puts the map in the layout's window and akakingj/myapp-map
  carries none of our own map code. cluster-render hosts only where the host has a seen layer over the rect and draws
  the map just under the lowest: bgMapHost, a clear flat over the window with the backgrounds (tools/test_engine.js).
  shared/cluster_render_client.js is cluster-render 0.8.14's (js/), for host('panel', ...); every app +1 for it.
- Layouts 0.59.0, Centre 0.14.20, Info 1.10.17 (Nov 25 2026): Settings > **BMW's bottom strip** (bottomExtra, Display),
  the owner's ask so both AK Cluster ID8 and Layouts can be tried on the car: 0 (nothing below the layout), 6 / 12 / 18
  (layouts.js blackBand: a black band that far below 646, over the drive mode and gear x 1196-1424 only to 658; 18 as it
  comes, to the row above the gear's window), hide and hideWide (the band at 18, then two covers to the screen's foot
  either side of GEAR_KEEP x 1384-1500 / GEAR_KEEP_WIDE x 1340-1500), at most 3 pieces, none in the gear's window
  (tools/test_engine.js). The band was to 662 before (658 over the drive mode). Centre and Info +0.0.1 for the
  translations.
- Layouts 0.58.0, Centre 0.14.19, Info 1.10.16 (Nov 25 2026), with Car profile 1.8.0: Settings > Fuel % from follows
  the Car profile's *Fuel % from*, as Fuel tank size does. New: Settings > **Speedometer up to** (260 km/h, 330 km/h
  for an M car: 0-330 by 30s, 200 mph) for every speedometer (layout_common.speedScale; Twin cowl's own scale went
  to it) and the speed-in-the-other-unit bar, and **Boost gauge up to** (the car's own gauges by their end in psi: 15, 20, 30
  psi - in bar and kPa 2.0 bar - and 45 psi, 3.0 bar - layout_common.BOOST_GAUGES; 0: each layout's own, 1.6 bar,
  the M layout's 0-3 bar / 0-40 psi) for every boost gauge and bar (boostShare: in psi on its psi end; the M
  layout's numbers as the car's own gauges - layout_common.boostTicks: 0 5 10 15, 0 10 20, 0 10 20 30, 0 15 30 45
  psi; bar x 10 and kPa / 10 the same figures, 0.0 1.0 2.0, 0.0 1.0 2.0 3.0 bar - its bar (MBAR_FS) taking a fourth and a fifth number, u_lab4). Boost gauge up to is set in
  the Car profile alone (hidden here): 0 is From the car's Sport Display - data.js boostMaxCar (FES
  displayMaximumValueBoostPressure, in the car's pressure unit, 0.5 - 4 bar taken), snapBoost to the least gauge (within 5 %) at
  or over it, redrawn once it comes; each layout's own (Centre 2 bar) until then. Speedometer up to and Boost gauge
  up to redraw the layout when changed (main.js's list of settings that do), each following the Car profile's. main.js setScales holds them for the
  readings' bars. Centre: Boost gauge up to (2 bar as it was) for its boost readings. Vehicle takes the Car
  profile's new Engine "Petrol, M car" as petrol. Info: the Korean words only.
- Layouts 0.57.0, Centre 0.14.18 (Nov 25 2026): every reading the car gives in every place, the same as AK Cluster
  ID8's, as the owner asked. Readout places add the rpm, the speed in the other unit, the outside temperature, the
  fuel level, oil pressure, the 12 V voltage, both fuel pressures, the boost target, this drive's peak boost and peak
  engine power, the 0-100 km/h (0-60 mph) time and the last upshift's rpm; gauge places oil pressure, voltage and
  both fuel pressures. data.js reads oil pressure (4436 / 586F less the ambient 4201 / F433 / OBD 33) and the voltage
  (5853 / F442 / OBD 42), a diesel only the standard forms (no oil pressure); layout_common.driveSample keeps the
  peaks, the 0-100 time and the last upshift for every layout (Track's tiles and GT3's shift box read them). The
  readouts, small gauges, Centre display, JDM 1's cup and JDM 2's left dial are set on the page alone (hidden from
  Settings: the owner sets them there); the page's sheet lists the values without "Same as in Settings".
  tools/test_oilpress.js. Centre: the same shared data.js.
  The page's free / open-source lines along its foot (the repo, official build, key) taken off, as the owner asked
  (main page and Signals); the licence and its Required Notice ship in the package's NOTICE (shared/NOTICE).
  The page looks as AK Cluster ID8's (the owner: the two apps alike, each keeping its own layout): an on / off pill
  under the cards with the status's dot, ID8's words and colours for the state (On the cluster / Off - BMW original
  cluster), "BMW's own cluster shows" over the picture while off. Info 1.10.15: the Korean words changed with them.
- Layouts 0.56.1, Centre 0.14.15 (Nov 24 2026): JDM 1's water more like water (CUP_FS): in the clear cup deeper and
  denser towards the bottom, the light bent along the walls and gathered on the bottom, a few bubbles; its surface the
  sky's reflection to the far side and the water through it to the near, a highlight, ripples while it sloshes, the
  meniscus at the glass; the paper cup's water shaded by depth under the same surface. Water Cup 1.1.9 (id7 apps) the same.
- Layouts 0.56.0, Centre 0.14.14 (Nov 24 2026): 90's lit by the car's light sensor, not the drive mode (with Colours
  on Auto: day white, every word in it too; night orange; data.js night from Vehicle.statusDayNightChangeOver, for an
  app that asks: opts.dayNight); 20's and ID6 M in Efficient colours with blue needles. Sport and Sport+ stay one look
  (themes.js lookNow: /SPORT/). tools/test_daynight.js.
- Layouts 0.55.4, Centre 0.14.13 (Nov 24 2026): Retro M's speedometer needle passes over its window and
  the unit above it (the needle again in a layer of its own there, RMDIAL_FS u_look.w); Centre's preview, drawn on the
  CPU, again 4 times a second (once a second under Settings) instead of every frame of the page (up to 60 a second on
  the GPU renderer: the head unit slowed down).
- Layouts 0.55.3, Centre 0.14.12 (Nov 24 2026): eroobeeroo's f9ca76c merged: the eDRIVE needle (change-notified)
  held 30 s (NEEDLE_HOLD_MS), so a PHEV's steady cruise stays on the fast needle, not the 2 s battery reading.
- Layouts 0.55.2, Centre 0.14.11, Info 1.10.14 (Nov 23 2026, a check of the files): the chevron gauge Sport alone
  drew (CHEVRON_FS, its engine kind and its clearance check) out of the shared files; the notices, comments and the
  Korean locale without Sport and ID8 M (two rows no setting uses); the READMEs' links to the apps' folders, the
  layout count (fifteen) and 90's map picture (docs/retro_map.png).
- Layouts 0.55.1, Centre 0.14.10, Info 1.10.13 (Nov 23 2026): the log screen's two lines in Korean in the Korean build
  (shared/logs.js, kit i18n's language; they are drawn as literal text, so the locales never reached them).
- Layouts 0.55.0, Centre 0.14.9, Info 1.10.12 (Nov 23 2026, the owner's review of Retro M): its grey plastic over the
  whole screen, as JDM 2's carbon (RM_PANEL without the panel's edge and rounded corners; one RMBG_FS layer, cut at the
  car's strip; round the map too); every gauge but the speed's and the revs' a place on the page - rmSpeedSub (the
  economy), rmRpmSub (the oil), rmLeft (the fuel), rmRight (the coolant) - any GAUGES reading or the economy (the
  Settings' Small gauge in the speedometer / tach no longer reach it: the owner found the speedometer's small gauge and
  its window set alike). Korean for the four places (kit locales: Centre and Info bumped with them).
- Layouts 0.54.0, Centre 0.14.8 (Nov 23 2026, the owner's choice: the iDrive 8 look is AK Cluster ID8's now): ID8 M
  (layout_sport.js, bimmer-lab's Sport view) removed, with its shader (SDASH_FS, out of the shared shaders Centre carries
  too) and pictures; fifteen layouts. A saved choice of it
  (Layout, Layout in Sport, Layout in ECO PRO) moves to ID7 M, as removed layouts before (main.js GONE).
- Layouts 0.53.1, Centre 0.14.7, Info 1.10.11 (Nov 23 2026, the owner's review of Retro M): Retro M in Barlow, as the
  other layouts (font_cond.wad and bake_font.py's 'cond' removed), and going as the other analog layouts: the tach's
  red zone lower while the oil is cold (shiftPoint) and Power % in a plug-in hybrid's electric modes; the oil and the
  coolant C - H or on a scale (Settings > Temperature gauges), red from Too hot; Settings > Small gauge in the
  speedometer / in the tach for its hanging gauges (layouts.js SLOTS). New icons (make_icon.js kr-cluster, kr-trip,
  kr-hud): Layouts an instrument cluster, Centre the trip (a speedometer over its odometer), Info a windscreen with a
  head-up display - drawn anew from the owner's ideas.
- Layouts 0.52.0, Centre 0.14.0 (Nov 22 2026, the owner's choice): the 'bold' and 'light' atlases baked from Barlow
  (SemiBold, Regular; google/fonts ofl/barlow) in place of IBM Plex Sans Condensed: every layout without its own face
  (all but ID7 M, ID8 M, JDM 1: Orbitron, Michroma) and Centre's two looks. Barlow's figures 0.52 of their height wide
  (Plex 0.50): check_fit and clearance clear as they were. The page's layout pictures made again. Info's panel keeps
  its own Plex atlas.
- Layouts 0.51.0 (Nov 22 2026): JDM 1 with the map in the new dash's look (layout_arc_tach.js mapDash), not the round
  tach and dial of before (removed): left the rev bar (RTACH_FS, MCURVE cx 390 R 320 top 150 a0 -74, four slats a
  thousand, no lines under / over it), figures 54 px out, an upright at its end, TACH and the gear inside; right the
  speed frame from y 168 (the panel's slanted corner: x up to 1830 there), LCD, main readout, gaugeBox at 0.8 (u_k).
  tools/clearance.js checks a rev bar by its ink (RTACH_FS geometry), not its box.
- Info 1.10.0 (Nov 21 2026): directions on the HUD (Settings > Directions on the HUD). The turn read as Redline's
  (nav.js, navlog.js from idrive7-apps; the event list asked only while they can show: overlay.navCan()); drawn in
  jaimeen77's Cluster Redline 1.3.9 design (nav_draw.js, lane_draw.js, nav_text.js, MIT; the owner relayed its author's
  agreement), stacked by nav_view.js into one 149x120 layer (text / arrow or junction diagram with the distance /
  lanes, blue): shown only while the panel is on the HUD; placed by overlay.navRect 4 px clear of the panel, the turn
  signal arrows and lane change signs (where they are, moved under a panel at the top too) and BMW's speed, on the
  G20's seen glass: usually just above the panel at its right edge (standard map: 472,152); with no clear place (the
  panel across the middle, the HUD map moved far: under 1 % of the cases tried) not shown. Hidden while another app
  holds the HUD.
  Korean text only when every syllable is in the Korean atlas. nav_canvas.js: Cluster Redline's crisp small text on a
  Canvas subclass (the panel's text unchanged).
  app.json declares the navigation interfaces (optional). Layouts 0.50.2: its Logs carry the directions' log (USB only).
- Info 1.10.1, Layouts 0.52.1, Centre 0.14.1 (Nov 22 2026): no speed camera / bump alerts. Asked on a drive with
  TMAP over CarPlay, the car's guidance event list took every type (SPEED_CAMERA, SCHOOL_ZONES, SPEED_LIMIT_ASSIST,
  DANGEROUS_CURVES, TRAFFIC_EVENTS, TUNNELS, POIS) and answered 65 times with no event at all; the owner chose to
  leave them out.

## Demo
`cluster_demo.bat` (Windows) or `node tools/cluster_demo.js`.
