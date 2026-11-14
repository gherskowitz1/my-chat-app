const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const { pool } = require('../db');

// Two-step sign-in on new devices (see authController.js login /
// verifyLogin). A device that passes the second step gets a long random
// "device token" it keeps forever; signing in from it later skips the code.
// Only a SHA-256 of the token is stored, so a database leak can't be used to
// impersonate a trusted device. Every session JWT carries its device's id
// (`did`), and middleware/auth.js rejects it once that device is removed —
// so removing a device from the list signs it out, not just un-trusts it.

const FROM_EMAIL = 'The Crows Nest <noreply@thecrowsnesttalk.com>';
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Bound to the challenge (and the server secret) so the same 6 digits never
// hash the same way twice and a leaked hash can't be brute-forced offline
// without the secret.
const hashCode = (challengeId, code) => sha256(`${challengeId}:${code}:${process.env.JWT_SECRET}`);

function sameHash(a, b) {
  const x = Buffer.from(a || '', 'hex');
  const y = Buffer.from(b || '', 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function signSession(user, deviceId) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0, ...(deviceId ? { did: deviceId } : {}) },
    process.env.JWT_SECRET,
    { expiresIn: '180d' }
  );
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}${'•'.repeat(Math.min(6, local.length - 2))}${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

function cleanLabel(label) {
  return typeof label === 'string' && label.trim() ? label.trim().slice(0, 100) : 'Unknown device';
}

async function createTrustedDevice(userId, label) {
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    'INSERT INTO trusted_devices (user_id, token_hash, label) VALUES ($1, $2, $3) RETURNING id',
    [userId, sha256(token), cleanLabel(label)]
  );
  return { deviceId: rows[0].id, deviceToken: token };
}

// The trusted device a raw device token belongs to, for this user — or null.
async function findTrustedDevice(userId, deviceToken) {
  if (typeof deviceToken !== 'string' || !/^[0-9a-f]{64}$/.test(deviceToken)) return null;
  const { rows } = await pool.query(
    'UPDATE trusted_devices SET last_used_at = NOW() WHERE user_id = $1 AND token_hash = $2 RETURNING id',
    [userId, sha256(deviceToken)]
  );
  return rows[0] || null;
}

async function sendLoginCodeEmail(user, code) {
  const log = (why) => console.log(`[login-code] ${why} — ${user.username}'s sign-in code: ${code}`);
  // Same fallback as password resets: with no working email the code goes
  // to the server log, so an admin can still read it off to someone stuck.
  if (!process.env.RESEND_API_KEY) return log('No email configured');
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject: `${code} is your Crows Nest sign-in code`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #313338; color: #f2f3f5; padding: 32px; border-radius: 12px;">
          <img src="https://www.thecrowsnesttalk.com/crowsnest.png" width="48" height="48" style="border-radius: 8px; margin-bottom: 16px;" alt="The Crows Nest" />
          <h1 style="font-size: 22px; margin: 0 0 8px;">Your sign-in code</h1>
          <p style="color: #b5bac1; margin: 0 0 20px;">Hi ${user.username}, someone (hopefully you) is signing in to The Crows Nest from a new device. Enter this code to finish:</p>
          <div style="font-size: 34px; font-weight: 700; letter-spacing: 8px; background: #1e1f22; padding: 16px; border-radius: 8px; text-align: center;">${code}</div>
          <p style="color: #80848e; font-size: 13px; margin: 20px 0 0;">It expires in ${CODE_TTL_MINUTES} minutes. That device will be remembered, so you won't need a code there again.</p>
          <p style="color: #80848e; font-size: 13px; margin: 8px 0 0;">Didn't try to sign in? Someone has your password — change it in User Settings, which also signs out every other device.</p>
        </div>`,
    });
    if (result.error) throw new Error(result.error.message);
  } catch (err) {
    console.error('Resend send failed, falling back to log:', err.message);
    log('Email failed');
  }
}

// Starts a sign-in challenge. method 'email' sends a code now; 'totp' (an
// authenticator app) has nothing to send — the app already has the code.
async function createChallenge(user, method = 'email') {
  const { rows } = await pool.query(
    `INSERT INTO login_challenges (user_id, method, expires_at, last_sent_at)
     VALUES ($1, $2, NOW() + INTERVAL '${CODE_TTL_MINUTES} minutes', NOW()) RETURNING id`,
    [user.id, method]
  );
  const challengeId = rows[0].id;
  if (method === 'email') await issueEmailCode(challengeId, user);
  return challengeId;
}

async function issueEmailCode(challengeId, user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await pool.query(
    `UPDATE login_challenges SET code_hash = $1, last_sent_at = NOW(),
       expires_at = NOW() + INTERVAL '${CODE_TTL_MINUTES} minutes'
     WHERE id = $2`,
    [hashCode(challengeId, code), challengeId]
  );
  await sendLoginCodeEmail(user, code);
}

// A live (unexpired, unused) challenge with its user, or null.
async function getChallenge(challengeId) {
  if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeId)) return null;
  const { rows } = await pool.query(
    `SELECT c.*, u.username, u.email, u.role, u.token_version, u.avatar_color, u.avatar_url
     FROM login_challenges c JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND c.consumed_at IS NULL AND c.expires_at > NOW()`,
    [challengeId]
  );
  return rows[0] || null;
}

// Counts the attempt first, so guesses are capped even if checking throws.
// Returns 'ok' | 'wrong' | 'locked'.
async function checkEmailCode(challenge, code) {
  const { rows } = await pool.query(
    'UPDATE login_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
    [challenge.id]
  );
  if (rows[0].attempts > MAX_ATTEMPTS) return 'locked';
  const clean = String(code || '').replace(/\D/g, '');
  return clean.length === 6 && sameHash(hashCode(challenge.id, clean), challenge.code_hash) ? 'ok' : 'wrong';
}

async function consumeChallenge(challengeId) {
  await pool.query('UPDATE login_challenges SET consumed_at = NOW() WHERE id = $1', [challengeId]);
}

module.exports = {
  sha256, sameHash, signSession, maskEmail, createTrustedDevice, findTrustedDevice,
  createChallenge, issueEmailCode, getChallenge, checkEmailCode, consumeChallenge,
  MAX_ATTEMPTS, RESEND_COOLDOWN_MS,
};
