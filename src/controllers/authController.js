const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

// Public — read by the signup form before it knows whether to show the
// invite-code field at all. Only ever set once at startup, so it's safe to
// read process.env directly on every request rather than caching it.
function getAuthConfig(req, res) {
  res.json({ signupCodeRequired: !!process.env.SIGNUP_CODE });
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

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, tv: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '180d' }
    );
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '180d' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar_color: user.avatar_color, avatar_url: user.avatar_url },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMe(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, role, avatar_color, avatar_url, status_text FROM users WHERE id = $1',
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
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '180d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar_color: user.avatar_color, avatar_url: user.avatar_url } });
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

    const token = jwt.sign(
      { id: updated.id, username: updated.username, role: updated.role, tv: updated.token_version },
      process.env.JWT_SECRET,
      { expiresIn: '180d' }
    );
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

module.exports = { signup, login, getMe, updateAvatar, getAuthConfig, updateUsername, updatePassword, updateAvatarColor, updateStatusText, deleteAccount };
