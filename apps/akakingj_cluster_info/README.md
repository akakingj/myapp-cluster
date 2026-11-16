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
  both (then on the cluster), and the HUD map's size and position as set there.
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
- **Its page** shows the panel as it is now, larger, and whether each source works (turn signals, day / night,
  driver profile, the apps providing, the cluster renderer, the Waze map).

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
"values": ["battery", "oil"] }` - only while the car is switched on (`kit/awake.js`: told it is off, the panel asks
nothing). Read it to know when to read fast and write (and let the car sleep otherwise); eDrive Live does (`apps/edrive2/provider.js` in
[eroobeeroo/idrive7-apps](https://github.com/eroobeeroo/idrive7-apps)).
