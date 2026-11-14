const crypto = require('crypto');

// Time-based one-time passwords (RFC 6238) — the 6-digit codes authenticator
// apps like Authy, Google Authenticator and 1Password show, rotating every
// 30 seconds. Written against Node's crypto directly rather than pulling in
// a library; the algorithm is short and fixed by the standard (HMAC-SHA1 of
// the 30-second time step, "dynamically truncated" to 6 digits).
//
// Secrets are stored encrypted (AES-256-GCM) with a key derived from
// JWT_SECRET, so a database dump alone doesn't hand out everyone's codes.
// Changing JWT_SECRET would therefore also invalidate every authenticator
// setup (people would use a backup code or ask an admin, then set up again).

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, the RFC's recommendation for SHA-1
}

function codeAtStep(secret, step, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

const currentStep = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / STEP_SECONDS);

// The time step a code matches, allowing one step either side for clock
// drift between the phone and the server — or null. Callers reject a step at
// or before the last one used, so a code can't be replayed.
function verifyCode(secret, code, nowMs = Date.now()) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length !== DIGITS) return null;
  const step = currentStep(nowMs);
  for (const s of [step, step - 1, step + 1]) {
    const expected = codeAtStep(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
  }
  return null;
}

// What the QR code encodes — authenticator apps read the issuer and label
// to show "The Crows Nest (gary)".
function otpauthUrl(secret, accountName, issuer = 'The Crows Nest') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ── Encryption at rest ─────────────────────────────────────

const key = () => crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:totp-secret-v1`).digest();

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

function decryptSecret(stored) {
  const [iv, tag, data] = stored.split(':').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  generateSecret, codeAtStep, verifyCode, currentStep, otpauthUrl, encryptSecret, decryptSecret,
  base32Encode, base32Decode,
};
