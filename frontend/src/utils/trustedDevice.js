// This device's trusted-device token (see the server's services/mfa.js).
// Signing in with it skips the emailed / authenticator code. Kept on
// sign-out on purpose — "trusted" is about the device, not the session — so
// it's only replaced if the server stops recognising it.
const KEY = 'crowsnest_device_token';

export function getDeviceToken() {
  try { return localStorage.getItem(KEY) || undefined; } catch { return undefined; }
}

export function setDeviceToken(token) {
  if (!token) return;
  try { localStorage.setItem(KEY, token); } catch {}
}

// A friendly name for the trusted device list: "Chrome on Windows",
// "Desktop app on Windows", "Safari on iPhone".
export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  const app = window.electron ? 'Desktop app'
    : /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const standalone = !window.electron && window.matchMedia?.('(display-mode: standalone)').matches;
  return `${standalone ? 'Installed app' : app} on ${os}`;
}

// Whether a session token is tied to a trusted device (its `did` claim).
// Tokens from before two-step sign-in existed aren't.
export function sessionHasDevice(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !!payload.did;
  } catch {
    return false;
  }
}
