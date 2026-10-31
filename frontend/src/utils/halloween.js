// Halloween week seasonal theme — on automatically from Oct 24 through
// Nov 1 (local time), off the rest of the year with no code change needed.
// Each person can opt out of the whole thing, or just the lightning flash,
// from User Settings > Appearance; both choices are per-device.

export const STORAGE_KEY_HALLOWEEN_OFF = 'crowsnest_halloween_off';
export const STORAGE_KEY_HALLOWEEN_FLASH_OFF = 'crowsnest_halloween_flash_off';
// Fired on window whenever either setting changes, so the overlay updates
// live without a reload.
export const HALLOWEEN_PREFS_EVENT = 'crowsnest:halloween-prefs';

export function isHalloweenWeek(now = new Date()) {
  const month = now.getMonth(); // 0-based: 9 = October, 10 = November
  const day = now.getDate();
  return (month === 9 && day >= 24) || (month === 10 && day === 1);
}

export function getHalloweenPrefs() {
  let off = false;
  let flashOff = false;
  try {
    off = localStorage.getItem(STORAGE_KEY_HALLOWEEN_OFF) === 'true';
    flashOff = localStorage.getItem(STORAGE_KEY_HALLOWEEN_FLASH_OFF) === 'true';
  } catch {}
  return { enabled: !off, flashEnabled: !flashOff };
}

export function setHalloweenPref(key, isOff) {
  try { localStorage.setItem(key, String(isOff)); } catch {}
  window.dispatchEvent(new Event(HALLOWEEN_PREFS_EVENT));
}
