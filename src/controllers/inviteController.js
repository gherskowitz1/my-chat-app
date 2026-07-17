const { Resend } = require('resend');

const FROM_EMAIL = 'The Crows Nest <noreply@thecrowsnesttalk.com>';
const APP_URL = process.env.CLIENT_URL || 'https://www.thecrowsnesttalk.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// Basic per-user rate limit so any signed-in user being able to trigger an
// email send can't be turned into an open spam relay.
const MAX_INVITES_PER_WINDOW = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const sendLog = new Map(); // userId -> timestamps[]

function isRateLimited(userId) {
  const now = Date.now();
  const recent = (sendLog.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  sendLog.set(userId, recent);
  return recent.length >= MAX_INVITES_PER_WINDOW;
}

function recordSend(userId) {
  const recent = sendLog.get(userId) || [];
  recent.push(Date.now());
  sendLog.set(userId, recent);
}

async function sendInvite(req, res) {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (isRateLimited(req.user.id)) {
    return res.status(429).json({ error: 'Too many invites sent recently. Try again later.' });
  }

  const trimmedEmail = email.trim();
  const inviteUrl = `${APP_URL}/auth?mode=signup&email=${encodeURIComponent(trimmedEmail)}`;

  try {
    const emailResult = await getResend().emails.send({
      from: FROM_EMAIL,
      to: trimmedEmail,
      subject: `${req.user.username} invited you to The Crows Nest`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #313338; color: #f2f3f5; padding: 32px; border-radius: 12px;">
          <img src="https://www.thecrowsnesttalk.com/crowsnest.png" width="48" height="48" style="border-radius: 8px; margin-bottom: 16px;" alt="The Crows Nest" />
          <h1 style="font-size: 22px; margin: 0 0 8px;">You're invited!</h1>
          <p style="color: #b5bac1; margin: 0 0 24px;"><strong>${req.user.username}</strong> invited you to join The Crows Nest.</p>
          <a href="${inviteUrl}" style="display: inline-block; background: #5865f2; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Join The Crows Nest</a>
          <p style="color: #80848e; font-size: 13px; margin: 24px 0 0;">Or copy this link: <span style="color: #5865f2;">${inviteUrl}</span></p>
        </div>
      `,
    });

    if (emailResult.error) {
      console.error('Resend invite error:', emailResult.error);
      return res.status(500).json({ error: `Email failed: ${emailResult.error.message}` });
    }

    recordSend(req.user.id);
    res.json({ message: 'Invite sent!' });
  } catch (err) {
    console.error('sendInvite error:', err);
    res.status(500).json({ error: 'Failed to send invite' });
  }
}

module.exports = { sendInvite };
