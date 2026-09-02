const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');
const { pool } = require('../db');

const FROM_EMAIL = 'The Crows Nest <noreply@thecrowsnesttalk.com>';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
const APP_URL = process.env.CLIENT_URL || 'https://www.thecrowsnesttalk.com';
const TOKEN_EXPIRY_MINUTES = 60;

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const { rows } = await pool.query(
      'SELECT id, username FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // Always return success to prevent email enumeration
    if (!rows[0]) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    // Delete any existing tokens for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    // Store new token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;

    const emailResult = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Reset your Crows Nest password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #313338; color: #f2f3f5; padding: 32px; border-radius: 12px;">
          <img src="https://www.thecrowsnesttalk.com/crowsnest.png" width="48" height="48" style="border-radius: 8px; margin-bottom: 16px;" alt="The Crows Nest" />
          <h1 style="font-size: 22px; margin: 0 0 8px;">Reset your password</h1>
          <p style="color: #b5bac1; margin: 0 0 24px;">Hi ${user.username}, we received a request to reset your Crows Nest password.</p>
          <a href="${resetUrl}" style="display: inline-block; background: #5865f2; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Reset Password</a>
          <p style="color: #80848e; font-size: 13px; margin: 24px 0 0;">This link expires in ${TOKEN_EXPIRY_MINUTES} minutes. If you didn't request this, you can safely ignore this email.</p>
          <p style="color: #80848e; font-size: 12px; margin: 8px 0 0;">Or copy this link: <span style="color: #5865f2;">${resetUrl}</span></p>
        </div>
      `,
    });

    if (emailResult.error) {
      console.error('Resend error:', emailResult.error);
      return res.status(500).json({ error: `Email failed: ${emailResult.error.message}` });
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ error: `Failed to send reset email: ${err.message}` });
  }
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const { rows } = await pool.query(
      `SELECT prt.user_id, prt.expires_at FROM password_reset_tokens prt
       WHERE prt.token = $1`,
      [token]
    );

    if (!rows[0]) return res.status(400).json({ error: 'Invalid or expired reset link' });

    if (new Date() > new Date(rows[0].expires_at)) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const hash = await bcrypt.hash(password, 10);
    // Bumps token_version too — a reset means any existing session (including
    // one an attacker may have started) should stop working immediately.
    await pool.query('UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [hash, rows[0].user_id]);
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

module.exports = { forgotPassword, resetPassword };
