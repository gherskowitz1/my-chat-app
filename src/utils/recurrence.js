// Date math for recurring Game Night events. A series repeats on the same
// *local* wall-clock time in the time zone of whoever scheduled it — "every
// Friday at 10pm Eastern" stays 10pm across daylight-saving changes, rather
// than drifting an hour because the UTC time was held fixed. Plain Intl, no
// date library.

const RECURRENCES = new Set(['weekly', 'biweekly', 'monthly']);

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The wall-clock date/time an instant shows in a time zone.
function wallClockIn(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

// How far ahead of UTC a time zone is at a given instant, in ms.
function offsetAt(date, timeZone) {
  const w = wallClockIn(date, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(date.getTime() / 1000) * 1000;
}

// The instant at which a time zone's clock reads the given wall time.
// month is 1-12. Two passes settle the offset across a DST boundary.
function wallClockToDate({ year, month, day, hour, minute }, timeZone) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(asUtc - offsetAt(new Date(asUtc), timeZone));
  guess = new Date(asUtc - offsetAt(guess, timeZone));
  return guess;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// The occurrence after `date` for a series. Monthly keeps the day of the
// month, clamped for short months (a series on the 31st lands on Feb 28/29),
// always measured from the series' first date so it returns to the 31st
// afterwards instead of sticking at 28.
function nextOccurrence(date, recurrence, timeZone, anchorDay) {
  const w = wallClockIn(date, timeZone);
  if (recurrence === 'weekly' || recurrence === 'biweekly') {
    const step = recurrence === 'weekly' ? 7 : 14;
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + step));
    return wallClockToDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: w.hour, minute: w.minute }, timeZone);
  }
  if (recurrence === 'monthly') {
    const month = w.month === 12 ? 1 : w.month + 1;
    const year = w.month === 12 ? w.year + 1 : w.year;
    const day = Math.min(anchorDay || w.day, daysInMonth(year, month));
    return wallClockToDate({ year, month, day, hour: w.hour, minute: w.minute }, timeZone);
  }
  throw new Error(`Unknown recurrence: ${recurrence}`);
}

module.exports = { RECURRENCES, isValidTimeZone, wallClockIn, nextOccurrence };
