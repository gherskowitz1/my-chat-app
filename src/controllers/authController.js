const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { resolveSteamId } = require('../services/steamPlayers');
const mfa = require('../services/mfa');

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

// Public — read by the signup form before it knows whether to show the
// invite-code field at all. Only ever set once at startup, so it's safe to
// read process.env directly on every request rather than caching it.
function getAuthConfig(req, res) {
  res.json({ signupCodeRequired: !!process.env.SIGNUP_CODE, steamEnabled: !!process.env.STEAM_API_KEY });
}

async function signup(req, res) {
  const { username, email, password, inviteCode } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (username.length < 2 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 2-32 characters' });
  }
  if (process.env.SIGNUP_CODE && inviteCode?.trim() !== process.env.SIGNUP_CODE) {
    return res.status(403).json({ error: 'Invalid invite code' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const { rows } = await pool.query(
      'INSERT INTO users (username, email, password_hash, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, avatar_color, avatar_url',
      [username.trim(), email.toLowerCase().trim(), hash, color]
    );
    const user = rows[0];

    // Auto-join the default server
    await pool.query(
      'INSERT INTO server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['00000000-0000-0000-0000-000000000001', user.id]
    );

    // The device you sign up on is your first trusted device.
    const { deviceId, deviceToken } = await mfa.createTrustedDevice(user.id, req.body.deviceLabel);
    const token = mfa.signSession({ ...user, token_version: 0 }, deviceId);
    res.json({ token, user, deviceToken });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, role: u.role, avatar_color: u.avatar_color, avatar_url: u.avatar_url });

// Sign-in, step 1: email + password. From a trusted device (the client
// sends its device token) that's the whole thing. From anywhere else the
// response is { mfaRequired, challengeId, method } instead of a session,
// and step 2 (verifyLogin) needs the code. See services/mfa.js.
async function login(req, res) {
  const { email, password, deviceToken, deviceLabel } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const device = await mfa.findTrustedDevice(user.id, deviceToken);
    if (device) {
      return res.json({ token: mfa.signSession(user, device.id), user: publicUser(user) });
    }

    // An admin let this person skip the code once (locked out, e.g. a
    // mistyped email at signup). Uses it up and trusts this device.
    if (user.mfa_bypass_once) {
      await pool.query('UPDATE users SET mfa_bypass_once = false WHERE id = $1', [user.id]);
      const created = await mfa.createTrustedDevice(user.id, deviceLabel);
      return res.json({ token: mfa.signSession(user, created.deviceId), user: publicUser(user), deviceToken: created.deviceToken });
    }

    // People who set up an authenticator app use it instead of email.
    const method = user.totp_enabled_at ? 'totp' : 'email';
    const challengeId = await mfa.createChallenge(user, method);
    res.json({ mfaRequired: true, challengeId, method, ...(method === 'email' ? { emailHint: mfa.maskEmail(user.email) } : {}) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Sign-in, step 2: the code. On success this device becomes trusted for
// good, and the response includes the device token for the client to keep.
async function verifyLogin(req, res) {
  const { challengeId, code, deviceLabel } = req.body;
  try {
    const challenge = await mfa.getChallenge(challengeId);
    if (!challenge) return res.status(410).json({ error: 'That code has expired. Sign in again to get a new one.' });

    const result = challenge.method === 'totp'
      ? await mfa.checkAppCode(challenge, code)
      : await mfa.checkEmailCode(challenge, code);
    if (result === 'locked') {
      await mfa.consumeChallenge(challenge.id);
      return res.status(429).json({ error: 'Too many wrong codes. Sign in again to get a new one.' });
    }
    if (result !== 'ok' && result !== 'ok-backup') return res.status(400).json({ error: 'That code isn’t right. Check it and try again.' });

    await mfa.consumeChallenge(challenge.id);
    const user = { ...challenge, id: challenge.user_id };
    const { deviceId, deviceToken } = await mfa.createTrustedDevice(user.id, deviceLabel);
    // Used a backup code — tell them how many are left so they can make more.
    const extra = result === 'ok-backup' ? { backupCodesLeft: await mfa.backupCodesLeft(user.id) } : {};
    res.json({ token: mfa.signSession(user, deviceId), user: publicUser(user), deviceToken, ...extra });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function resendLoginCode(req, res) {
  try {
    const challenge = await mfa.getChallenge(req.body.challengeId);
    if (!challenge) return res.status(410).json({ error: 'That sign-in has expired. Start again.' });
    if (challenge.method !== 'email') return res.status(400).json({ error: 'Nothing to resend.' });
    if (challenge.last_sent_at && Date.now() - new Date(challenge.last_sent_at).getTime() < mfa.RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Give it a minute before asking for another code.' });
    }
    await mfa.issueEmailCode(challenge.id, { ...challenge, id: challenge.user_id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Trusted devices (User Settings > Account) ───────────────

async function listDevices(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, label, created_at, last_used_at FROM trusted_devices WHERE user_id = $1 ORDER BY last_used_at DESC',
      [req.user.id]
    );
    res.json(rows.map((d) => ({ ...d, current: d.id === req.user.did })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Removing a device signs it out too (its session carries the device id).
async function removeDevice(req, res) {
  try {
    await pool.query('DELETE FROM trusted_devices WHERE id = $1 AND user_id = $2', [req.params.deviceId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function removeOtherDevices(req, res) {
  try {
    await pool.query(
      'DELETE FROM trusted_devices WHERE user_id = $1 AND id IS DISTINCT FROM $2',
      [req.user.id, req.user.did || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// For devices that were already signed in before two-step sign-in existed:
// they've proven who they are already, so they become trusted without a
// code (otherwise everyone would be asked for one the day this ships).
// Only for sessions with no device attached.
async function adoptDevice(req, res) {
  if (req.user.did) return res.status(400).json({ error: 'This device is already trusted.' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const { deviceId, deviceToken } = await mfa.createTrustedDevice(req.user.id, req.body.deviceLabel);
    res.json({ token: mfa.signSession(rows[0], deviceId), deviceToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMe(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, role, avatar_color, avatar_url, status_text, steam_id, current_game FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
const MAX_AVATAR_LENGTH = 1_500_000; // ~1.1MB of raw image data once base64 overhead is accounted for

async function updateAvatar(req, res) {
  const { avatarUrl } = req.body;

  // Falsy clears it back to the color+initial fallback.
  if (avatarUrl) {
    if (typeof avatarUrl !== 'string' || !AVATAR_DATA_URL_RE.test(avatarUrl)) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    if (avatarUrl.length > MAX_AVATAR_LENGTH) {
      return res.status(400).json({ error: 'Image is too large' });
    }
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING id, username, email, role, avatar_color, avatar_url',
      [avatarUrl || null, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateUsername(req, res) {
  const { username } = req.body;
  if (!username || username.trim().length < 2 || username.trim().length > 32) {
    return res.status(400).json({ error: 'Username must be 2-32 characters' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username, email, role, avatar_color, avatar_url, token_version',
      [username.trim(), req.user.id]
    );
    const user = rows[0];

    // Not a security-sensitive change, so it doesn't bump token_version or
    // touch other devices — just refreshes this one's token so the new
    // username shows up immediately anywhere it's read from the JWT itself
    // (e.g. the display name a LiveKit voice token is minted with).
    const token = mfa.signSession(user, req.user.did);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      // 403, not 401 — the frontend treats any 401 on an authenticated
      // request as a dead token and force-reloads to the login screen,
      // which a mistyped current password should never trigger.
      return res.status(403).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    // Bumping token_version invalidates every other device's existing
    // token on their next request — this device gets a freshly-signed one
    // below so it keeps working without needing to log back in.
    const { rows: updatedRows } = await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2 RETURNING id, username, role, token_version',
      [hash, user.id]
    );
    const updated = updatedRows[0];

    // A new password also un-trusts every other device — if someone else
    // had it, they now need a code again on top of the new password.
    await pool.query(
      'DELETE FROM trusted_devices WHERE user_id = $1 AND id IS DISTINCT FROM $2',
      [user.id, req.user.did || null]
    );
    const token = mfa.signSession(updated, req.user.did);
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateAvatarColor(req, res) {
  const { avatarColor } = req.body;
  if (typeof avatarColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
    return res.status(400).json({ error: 'Invalid color' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET avatar_color = $1 WHERE id = $2 RETURNING id, username, email, role, avatar_color, avatar_url',
      [avatarColor, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// A short opt-in status message ("brb", "at the gym") — separate from
// automatic online/away/offline detection. Broadcast live so anyone already
// viewing the member list sees it update without needing to refresh.
async function updateStatusText(req, res) {
  let { statusText } = req.body;
  if (typeof statusText !== 'string') return res.status(400).json({ error: 'statusText must be a string' });
  statusText = statusText.trim().slice(0, 100) || null;

  try {
    await pool.query('UPDATE users SET status_text = $1 WHERE id = $2', [statusText, req.user.id]);
    req.app.get('io')?.emit('presence:statusText', { userId: req.user.id, statusText });
    res.json({ statusText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Links (or unlinks) a Steam account for the "currently playing" indicator.
// current_game is reset on every link/unlink — it's a cache the game
// presence poll job refreshes, not something meaningful to carry over.
async function updateSteamId(req, res) {
  const { steamId } = req.body;

  if (!steamId) {
    await pool.query('UPDATE users SET steam_id = NULL, current_game = NULL WHERE id = $1', [req.user.id]);
    req.app.get('io')?.emit('presence:playing', { userId: req.user.id, game: null });
    return res.json({ steamId: null });
  }

  if (typeof steamId !== 'string') return res.status(400).json({ error: 'steamId must be a string' });
  if (!process.env.STEAM_API_KEY) return res.status(503).json({ error: 'Steam integration is not configured' });

  try {
    const resolved = await resolveSteamId(steamId);
    await pool.query('UPDATE users SET steam_id = $1, current_game = NULL WHERE id = $2', [resolved, req.user.id]);
    res.json({ steamId: resolved });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not link that Steam account' });
  }
}

// Self-service account deletion — the account is gone, but messages stay
// (see the LEFT JOIN + COALESCE(..., 'Deleted User') in every message-fetch
// query, so history doesn't just vanish for everyone else in the channel).
async function deleteAccount(req, res) {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      // 403, not 401 — see the identical comment in updatePassword above.
      return res.status(403).json({ error: 'Incorrect password' });
    }

    const { rows: serverRows } = await pool.query('SELECT owner_id FROM servers WHERE id = $1', [DEFAULT_SERVER]);
    if (serverRows[0]?.owner_id === user.id) {
      return res.status(400).json({ error: 'Transfer server ownership to someone else before deleting your account.' });
    }

    if (user.role === 'admin') {
      const { rows: countRows } = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
      if (Number(countRows[0].count) <= 1) {
        return res.status(400).json({ error: 'You’re the only admin — promote someone else before deleting your account.' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  signup, login, verifyLogin, resendLoginCode, getMe, updateAvatar, getAuthConfig, updateUsername, updatePassword,
  updateAvatarColor, updateStatusText, updateSteamId, deleteAccount,
  listDevices, removeDevice, removeOtherDevices, adoptDevice,
};
