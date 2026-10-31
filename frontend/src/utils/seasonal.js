// Holiday themes — each one switches on automatically for the week of its
// holiday (6 days before through the day after; Hanukkah covers all 8 days)
// and off again afterwards, every year, with no code change needed. Visuals
// for each live in components/SeasonalTheme.jsx, palettes in global.css.
//
// Each person can opt out of holiday themes entirely, or just the big
// animated moment every 20 minutes (lightning, sleigh, fireworks...), from
// User Settings > Appearance; both choices are per-device.

export const STORAGE_KEY_SEASONAL_OFF = 'crowsnest_seasonal_off';
export const STORAGE_KEY_SEASONAL_EFFECTS_OFF = 'crowsnest_seasonal_effects_off';
// Fired on window whenever either setting changes, so the overlay updates
// live without a reload.
export const SEASONAL_PREFS_EVENT = 'crowsnest:seasonal-prefs';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY_MS);

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// First full day of Hanukkah (25 Kislev) — the first candle is lit the
// evening before. Worked out from the browser's built-in Hebrew calendar,
// with a precomputed table as a fallback in case that's ever unavailable.
const HANUKKAH_FALLBACK = {
  2026: [11, 5], 2027: [11, 25], 2028: [11, 13], 2029: [11, 2], 2030: [11, 21],
  2031: [11, 10], 2032: [10, 28], 2033: [11, 17], 2034: [11, 7], 2035: [11, 26],
};
function hanukkahFirstDay(year) {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { month: 'long', day: 'numeric' });
    for (let d = new Date(year, 10, 20); d.getMonth() < 12 && d.getFullYear() === year; d = addDays(d, 1)) {
      const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
      if (parts.month === 'Kislev' && parts.day === '25') return d;
    }
  } catch {}
  const fallback = HANUKKAH_FALLBACK[year];
  return fallback ? new Date(year, fallback[0], fallback[1]) : null;
}

// `date` is the holiday itself; the theme window is built around it.
// Listed in tie-break order for the rare day two holidays are equally close.
const HOLIDAYS = [
  { id: 'newyear', name: "New Year's", emoji: '🎆', date: (y) => new Date(y, 0, 1) },
  { id: 'valentines', name: "Valentine's Day", emoji: '💘', date: (y) => new Date(y, 1, 14) },
  { id: 'stpatricks', name: "St. Patrick's Day", emoji: '🍀', date: (y) => new Date(y, 2, 17) },
  { id: 'easter', name: 'Easter', emoji: '🐰', date: easterSunday },
  { id: 'july4', name: 'Fourth of July', emoji: '🎇', date: (y) => new Date(y, 6, 4) },
  { id: 'halloween', name: 'Halloween', emoji: '🎃', date: (y) => new Date(y, 9, 31) },
  { id: 'thanksgiving', name: 'Thanksgiving', emoji: '🦃', date: (y) => nthWeekdayOfMonth(y, 10, 4, 4) },
  { id: 'christmas', name: 'Christmas', emoji: '🎄', date: (y) => new Date(y, 11, 25) },
  { id: 'hanukkah', name: 'Hanukkah', emoji: '🕎', date: hanukkahFirstDay, lengthDays: 8 },
];

// Which holiday theme (if any) is on today. When two windows overlap — e.g.
// Dec 26 sits in both Christmas's and New Year's — the one whose holiday is
// nearer (counting from a multi-day holiday's first day) wins. Returns
// { id, name, emoji, night } or null — night is the Hanukkah candle count
// for the menorah (0-8; 0 = just the shamash, the day before).
export function getActiveHoliday(now = new Date()) {
  const today = startOfDay(now);
  let best = null;
  for (const year of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
    for (const h of HOLIDAYS) {
      const day = h.date(year);
      if (!day) continue;
      const length = h.lengthDays || 1;
      const windowStart = addDays(day, length > 1 ? -2 : -6);
      const windowEnd = addDays(day, length > 1 ? length - 1 : 1);
      if (today < windowStart || today > windowEnd) continue;

      const distance = Math.abs(daysBetween(today, day));
      if (!best || distance < best.distance) {
        // Night N's candles are lit the evening before day N.
        const night = h.id === 'hanukkah' ? Math.min(8, Math.max(0, daysBetween(today, day) + 2)) : null;
        best = { id: h.id, name: h.name, emoji: h.emoji, night, distance };
      }
    }
  }
  if (!best) return null;
  const { distance, ...holiday } = best;
  return holiday;
}

export function getSeasonalPrefs() {
  let off = false;
  let effectsOff = false;
  try {
    off = localStorage.getItem(STORAGE_KEY_SEASONAL_OFF) === 'true'
      // Honor the opt-outs from the original Halloween-only version.
      || localStorage.getItem('crowsnest_halloween_off') === 'true';
    effectsOff = localStorage.getItem(STORAGE_KEY_SEASONAL_EFFECTS_OFF) === 'true'
      || localStorage.getItem('crowsnest_halloween_flash_off') === 'true';
  } catch {}
  return { enabled: !off, effectsEnabled: !effectsOff };
}

export function setSeasonalPref(key, isOff) {
  try {
    localStorage.setItem(key, String(isOff));
    // The legacy Halloween keys are only ever read, so clear them once the
    // person makes a choice with the new settings.
    if (key === STORAGE_KEY_SEASONAL_OFF) localStorage.removeItem('crowsnest_halloween_off');
    if (key === STORAGE_KEY_SEASONAL_EFFECTS_OFF) localStorage.removeItem('crowsnest_halloween_flash_off');
  } catch {}
  window.dispatchEvent(new Event(SEASONAL_PREFS_EVENT));
}
