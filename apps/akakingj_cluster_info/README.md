# Cluster Info

A small panel of live values over the Waze map in the instrument cluster or on the HUD (with
[Waze on cluster](https://github.com/robertnisipeanu/idrive-apps)), and turn signal arrows on the HUD. For any car.

- **Its own values from the car:** engine oil and coolant temperature, boost (the car's sport display signal),
  engine speed and torque, the turn signals, day / night (the HUD
  panel and arrows are dimmer at night), the driver profile (each driver keeps their own settings).
- **Values from other apps:** eDrive Live provides the battery's power (the kW meter and its bar) and the
  battery temperature. Any app can add values the same way. Optionally (Settings > Thin kW bar along the
  bottom) a slim centre-zero kW bar runs just under the panel, clear of its values, the width of all three
  slots (whether or not one of them is the kW meter): use to the right, recuperation to the left in green.
- **Where:** where the Waze map is (cluster or HUD), or always on the HUD; at the bottom or top of the map.
  It follows Robert's Waze on cluster (robertnisipeanu/idrive-apps), with the map on the cluster, the HUD or
  both (then on the cluster), and the HUD map's size and position as set there. With no Waze map on the HUD,
  the panel there is sized to the glass instead (up to 58 of the HUD's 480 high, at the bottom right of what a
  G20 shows) and the directions above it are bigger (173 x 132, 149 x 114 over a Waze map on the HUD).
  Shown only while the map is (or, on the HUD, while there is something to show), so it never holds the
  cluster or HUD on its own.
- **Turn signals on the HUD:** a small green arrow each side, near the top of what a G20 shows (x 240 and 530, y 114
  of the HUD's 800x480), the place Redline (idrive7-apps) gives its own when its rev counter is off; while Redline
  holds the HUD, Cluster Info's step aside and Redline's show. (The lane change warning beside them, 1.6.12 to 1.6.23,
  read the driving assistant's lane change service, which a G20's and a G21's head unit doesn't have.)
- Lane change warning on the HUD (1.6.25, Settings > Lane change warning on the HUD, on by default): outside each
  arrow the sign of 1.6.12-1.6.23 (this car in yellow, the other's bonnet in red behind it, outward), steady while the
  door mirror's lamp on that side is lit or flashing (a car in the blind spot, the turn signal or not), gone with it
  (1.6.26) While another app holds the HUD (Redline 2.0.64 draws the same sign) the BDC isn't read
  here, so only one app polls it (1.6.27). The lamps are read from the body controller (BDC,
  0x40), identifier D347, every 300 ms while the panel is on and the car not locked and left, over the kit's read-only
  diagnostic link (only 22 D3 47 is ever sent: the same identifier written switches the lamps). Gone 3 s after the
  last answer. After mlurker's HUD signals (mlurker/bmw-idrive7-apps, found on a G05), written anew; whether a G20's
  BDC answers D347 shows on the app's page (Lane change warning: mirror lamps, or the BDC has no D347).
- **Road signs on the HUD** (1.12.0, Settings > Road signs on the HUD: on, sample signs, off; on by default): the signs
  the front camera reads, other than the speed limit and no passing (the HUD shows those itself), right of BMW's
  speed, all of it on the glass a G20 shows, the lowest ending where this app's panel does, y 352 (1.13.0: a
  triangle in the speed's row, to y 419, had its bottom cut off on the HUD); a sign that would reach the panel or the directions goes above the first, at x 380, as high as just under
  the turn signal arrows (with the panel to the glass: two signs one above the other left of it), as South Korea's own signs (the government's designs, cut out
  along their red or blue edge: `sign_art.js`, `tools/make_sign_art.py`; 39 of them - slippery road, traffic
  queues, wild animals, steep hills, bends, road works, crossings, bumps, ..., give way, stop, no entry, the turn
  and parking bans, one way; a warning with none of its own gets 위험, "!"). The car's own list of the camera's sign
  types (read from the app's interface config for the camera, made at install from the car's catalog) is logged
  once, whole, and counted on the app's page (types, drawn, as "!"): which pictures this car can ever show. As high as BMW's own limit sign (a round sign as big, a triangle as tall). Shown when the camera reads it, for 10 s; a
  sign read after it takes its place (1.12.3: the owner's; one event's several together, in a row), at most three (1.13.0, the owner's), as many as fit on the glass. Once, at the start, every name in the definitions of the sign services this install has (TrafficSignRecognition, the camera's, TrafficSignDisplayControl, and of the head-up display's data the names about signs, passing and lanes: `sign definitions:` lines; and the car's whole catalog's services and members named for no passing or the map's look ahead: `catalog no passing` lines, 1.12.4; all of them in the Test log, sign definitions, parked - what tells no passing's end, 1.12.3); signs that would reach
  the panel (a wide Waze map puts it low) are left off. From the camera's sign event
  (de.bmw.environmentalmodel.SignRecognitionFrontCamera, TrafficSignRecognitionFrontCamera: once a sign, found by the
  signal survey), declared only where the car's catalog has it, read only; the survey reads it through the same
  subscription. *Sample signs* shows three, to see where they sit; the app's page has the types read so far.
- **Directions on the HUD** (Settings > Directions on the HUD: while a route runs, near turns only, or off): while
  the panel is on the HUD, the next turn, usually just above it at its right edge, never over the panel, the turn
  signal arrows, the lane change signs or BMW's speed (elsewhere on the glass when there is no room there, and not
  shown when there is none at all), in jaimeen77's Cluster Redline design (`nav_draw.js`, `lane_draw.js`, `nav_text.js`, from its 1.3.9,
  MIT; `nav_view.js` stacks them): the instruction or street on top (Korean in the Korean build), the blue turn
  arrow, or a junction diagram for forks, highway exits and entries, roundabouts and lane changes, with the
  distance, and the lane board under it. A toll gate ahead (the car's toll gate event, or straight on to a place
  named ...톨게이트 / ...요금소, or lanes the car marks as toll lanes) shows a toll gate of this app's own with
  "Toll gate" over its distance; hi-pass (ETC) lanes on the board are tinted blue. The turn is read as Redline's (idrive7-apps, `nav.js`, `navlog.js`, MIT):
  BMW's guidance service, read only, the same way for CarPlay, Android Auto and BMW's navigation, for apps that hand
  the car their turns (Apple Maps, TMAP; Waze over CarPlay doesn't). With the panel off the HUD BMW's own turn card shows them; while Redline
  holds the HUD, its own. A turn older than 3 s isn't shown. `cluster-info-nav.log` in the app's data folder (at most
  2 x 256 KiB, written only while directions show) records what the car sends, street names as their length only.
- **Test log** (1.13.0, the owner's: two logs - **Logs** for how the app works, **Test log** for development and
  checks; till 1.12.x Settings > Driving assistant check, with Signals, Catalog and Signal survey, and Start survey).
  **Test log** starts the checks, read only, and goes on with the page closed; pressed again (or after 30 minutes,
  when they end by themselves) they end and its codes show, a page a press:
  - the driving assistant check (`adas_probe.js`): whether the head unit gets what the cluster's assisted driving
    view is drawn from - the four services that view is built from on a G05 (`de.bmw.dass.*`: the cruise control, the
    steering assist, the lane warnings, the cars around) and the HUD's own data (DisplayDataServer.functionalLibraryData)
    with its speed limit members (`xSpeedLimitAssist`, `pia.piaSliNpi`), each change with the car's speed; the head
    unit's catalog's driving assistant, HUD, brakes' and sign services (`cluster-info-adas.log` in the data folder);
  - the signal survey (`survey.js`): what is declared when the app is built or installed on the car (app.json
    `"survey"`, `kit/runtime/survey_fit.js`) - TrafficSignDisplayControl, the front camera's sign events,
    TrafficSignRecognition, FASuS's next speed limit, the driving assistant's speed limit settings (read once), anything
    else named for a speed limit or a traffic sign, the car ahead, the camera's objects and the lanes - only as far as
    THIS car's catalog has them, at most 60, never a method; each member's state, how many and how often, its first
    value; the sign candidates' changes (the last 150) with the speed and Speed Limit Assist's figures; whole in
    `exports/survey-<time>.txt`;
  - the sign services' every field as it changed (`research.js`: a time's or a counter's change is no change) and the
    HUD data's field names and its fields about passing, tunnels, lane changes and restrictions as they changed (BMW's
    own no passing sign shows there with its distance from the car's map) - to find what ends a no passing zone;
    1.13.2: South Korea has no end of no passing sign (the car's map ends it), so the fields the car's catalog has
    for it are kept on their own, every change (the last 80): TrafficSignDisplayControl's
    displayNoPassingRestriction and its remaining distance, TrafficSignRecognition's recognitionNoPassing,
    displayTextMessageNpi and displaySpeedNPIDistance, and DisplayDataServer2's npiData and vnpiDistance (the
    head-up display's own NPI; read for this alone); each sign service's changes kept apart (the last 30 each);
  - the sign definitions read once at the start (`signs.js`): the camera's sign types, the sign services' definitions
    and the catalog's services and members named for no passing or the map's look ahead.
  The page shows the checks under way: the time, what came, the HUD data's speed limit.
- **Its page** shows the panel as it is now, larger, and whether each source works (turn signals, day / night,
  driver profile, the apps providing, the cluster renderer, the Waze map, the directions).
- **Logs** on its page shows this app's logs as QR codes, three to a page (press Logs for the next): how the app
  works - its settings, its page's rows, the overlay's state, the raw turn signals, the directions' log and the app's
  own log (1.13.0: the checks are the Test log's). `python3 tools/decode_logs.py photo*.jpg -o logs.txt` puts the text
  back together; the full logs (with the renderer's) go to `cluster-logs/cluster-logs-info-<time>.txt` on a USB
  stick plugged into the car and to the app's data folder.

## Providing values from your app

Write `/dev/shm/cluster-info/<your app id>.json` a few times a second while you have fresh values, replacing
it whole (write a temporary file, then rename it over it):

```json
{ "v": 1, "t": 1793560000000, "app": "My app",
  "power": { "kw": -1.2, "outMax": 100, "inMax": 60, "old": false },
  "values": { "battery": { "c": 24.5 }, "oil": { "c": 81 } } }
```

`t` is `Date.now()` when written; a file older than 3 s counts as gone. `power` is optional (the kW meter);
`values` are temperatures in °C under the names the settings offer (`battery`, `oil`, `coolant`), or
`{ "text": "...", "label": "..." }`. The car's own oil and coolant temperatures win over a provider's.

While its panel is up, Cluster Info writes `wanted.json` in the same folder: `{ "t": ..., "power": true,
"values": ["battery", "oil"] }` - only while the car is switched on (`kit/runtime/awake.js`: told it is off, the panel asks
nothing). Read it to know when to read fast and write (and let the car sleep otherwise); eDrive Live does (`apps/edrive2/provider.js` in
[eroobeeroo/idrive7-apps](https://github.com/eroobeeroo/idrive7-apps)).
