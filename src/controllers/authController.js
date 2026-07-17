const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

async function signup(req, res) {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (username.length < 2 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 2-32 characters' });
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
      { id: user.id, username: user.username, role: user.role },
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
      { id: user.id, username: user.username, role: user.role },
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
      'SELECT id, username, email, role, avatar_color, avatar_url FROM users WHERE id = $1',
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

module.exports = { signup, login, getMe, updateAvatar };
