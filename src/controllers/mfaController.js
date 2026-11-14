const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { pool } = require('../db');
const totp = require('../utils/totp');
const mfa = require('../services/mfa');

// User Settings > Account > Authenticator App. Optional: with it on, signing
// in on a new device asks for the app's code instead of an emailed one (see
// login in authController.js). Setup is two-step so a typo'd scan can't
// lock anyone out: /setup makes a pending secret and QR code, and only a
// correct code from the app (/enable) switches it on.

async function getStatus(req, res) {
  try {
    const { rows } = await pool.query('SELECT totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
    res.json({
      totpEnabledAt: rows[0]?.totp_enabled_at || null,
      backupCodesLeft: rows[0]?.totp_enabled_at ? await mfa.backupCodesLeft(req.user.id) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function setupTotp(req, res) {
  try {
    const { rows } = await pool.query('SELECT username, totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
    if (rows[0].totp_enabled_at) return res.status(400).json({ error: 'Your authenticator app is already set up.' });

    const secret = totp.generateSecret();
    await pool.query('UPDATE users SET totp_pending_secret = $1 WHERE id = $2', [totp.encryptSecret(secret), req.user.id]);
    const url = totp.otpauthUrl(secret, rows[0].username);
    res.json({
      qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
      // For typing in by hand instead of scanning — grouped for readability.
      secret: secret.match(/.{1,4}/g).join(' '),
    });
  } catch (err) {
    console.error('setupTotp error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function enableTotp(req, res) {
  try {
    const { rows } = await pool.query('SELECT totp_pending_secret, totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (user.totp_enabled_at) return res.status(400).json({ error: 'Your authenticator app is already set up.' });
    if (!user.totp_pending_secret) return res.status(400).json({ error: 'Start the setup again.' });

    const step = totp.verifyCode(totp.decryptSecret(user.totp_pending_secret), req.body.code);
    if (step === null) return res.status(400).json({ error: 'That code didn’t match — check the app and try the current code.' });

    await pool.query(
      `UPDATE users SET totp_secret = totp_pending_secret, totp_pending_secret = NULL,
         totp_enabled_at = NOW(), totp_last_step = $1
       WHERE id = $2`,
      [step, req.user.id]
    );
    const backupCodes = await mfa.generateBackupCodes(req.user.id);
    res.json({ success: true, backupCodes });
  } catch (err) {
    console.error('enableTotp error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function checkPassword(userId, password) {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return !!rows[0] && !!password && bcrypt.compare(password, rows[0].password_hash);
}

// Back to emailed codes. Password required, so a session left open on
// someone else's computer can't quietly switch it off.
async function disableTotp(req, res) {
  try {
    // 403 not 401 — the frontend treats a 401 as a dead session.
    if (!(await checkPassword(req.user.id, req.body.password))) return res.status(403).json({ error: 'Password is incorrect' });
    await pool.query(
      `UPDATE users SET totp_secret = NULL, totp_pending_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL
       WHERE id = $1`,
      [req.user.id]
    );
    await pool.query('DELETE FROM mfa_backup_codes WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('disableTotp error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function regenerateBackupCodes(req, res) {
  try {
    if (!(await checkPassword(req.user.id, req.body.password))) return res.status(403).json({ error: 'Password is incorrect' });
    const { rows } = await pool.query('SELECT totp_enabled_at FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]?.totp_enabled_at) return res.status(400).json({ error: 'Set up an authenticator app first.' });
    res.json({ backupCodes: await mfa.generateBackupCodes(req.user.id) });
  } catch (err) {
    console.error('regenerateBackupCodes error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getStatus, setupTotp, enableTotp, disableTotp, regenerateBackupCodes };
