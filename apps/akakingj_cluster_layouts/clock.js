'use strict';
/**
 * clock.js - the local time, as the car's own cluster shows it. The unit's apps run on UTC, so the time of day comes
 * from the instrument cluster's display time (KombiIF statusShowTimeDate, data.js): the zone, the summer time and any
 * minutes the owner has set it fast are the car's own, as AK Cluster ID8 takes them. What is kept is how far the car's
 * clock runs ahead of the unit's, so the minute turns over when the car's does and nothing depends on the unit's clock
 * being right - only on it running. Until the car has said, there is no time (--:--).
 */
const DAY = 86400000;
let offset = null;          // ms the car's time of day runs ahead of Date.now(), modulo a day; null: not known

/**
 * The car's display time (a value of statusShowTimeDate: displayHour, displayMinute, displaySecond, and
 * statusDisplayClockTimeDate - odd while the car shows its clock, even for --:--, 15 not filled) at ms (default now).
 * Returns the offset now kept (null: no time), or undefined where the value says nothing (the last one stands).
 */
function fromCar(show, ms) {
    const t = ms === undefined ? Date.now() : ms, st = show && show.statusDisplayClockTimeDate;
    if (typeof st !== 'number' || st === 15) return undefined;
    const h = show.displayHour, m = show.displayMinute;
    if (st % 2 !== 1 || !(h >= 0 && h < 24) || !(m >= 0 && m < 60)) { offset = null; return null; }
    const sec = show.displaySecond >= 0 && show.displaySecond < 60 ? show.displaySecond : 0;
    offset = ((((h * 60 + m) * 60 + sec) * 1000 - t) % DAY + DAY) % DAY;
    return offset;
}
/** The local time as { h, m } (ms: a time by the unit's clock, default now); null until the car has said. */
function local(ms) {
    if (offset === null) return null;
    const d = new Date((ms === undefined ? Date.now() : ms) + offset);
    return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}
let twelve = true;
/** 12-hour (true, the default) or 24-hour clock. */
function setTwelve(on) { twelve = on !== false; }
/** '7:05' (12-hour; ampm: '7:05 PM') or '19:05' (24-hour); '--:--' until the car has said. */
function hm(ms, ampm) {
    const t = local(ms);
    if (!t) return '--:--';
    const mm = ('0' + t.m).slice(-2);
    return (twelve ? (t.h % 12) || 12 : t.h) + ':' + mm + (twelve && ampm ? (t.h < 12 ? ' AM' : ' PM') : '');
}

module.exports = { fromCar, setTwelve, local, hm };
