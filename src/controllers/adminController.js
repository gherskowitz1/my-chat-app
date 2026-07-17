const { pool } = require('../db');

// ── Server ──────────────────────────────────────────────────
async function updateServer(req, res) {
  const { serverId } = req.params;
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows } = await pool.query(
      'UPDATE servers SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name.trim(), description?.trim() ?? null, serverId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getServer(req, res) {
  const { serverId } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM servers WHERE id = $1', [serverId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Channels ─────────────────────────────────────────────────
async function renameChannel(req, res) {
  const { channelId } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    // Look up the channel's actual type rather than trusting the client to
    // send it — a caller that omits it would otherwise silently fall through
    // to slugifying voice channel names too.
    const { rows: existing } = await pool.query('SELECT type FROM channels WHERE id = $1', [channelId]);
    if (!existing[0]) return res.status(404).json({ error: 'Channel not found' });

    const safeName = existing[0].type === 'voice'
      ? name.trim()
      : name.trim().toLowerCase().replace(/\s+/g, '-');
    const { rows } = await pool.query(
      'UPDATE channels SET name = $1 WHERE id = $2 RETURNING *',
      [safeName, channelId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Users ────────────────────────────────────────────────────
async function getAllUsers(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, role, avatar_color, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function updateUserRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or member' });
  }
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  try {
    const { rows } = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role, avatar_color',
      [role, userId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteUser(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Stats ─────────────────────────────────────────────────────
async function getStats(req, res) {
  try {
    const [users, messages, channels, dms, recentUsers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM messages'),
      pool.query('SELECT COUNT(*) FROM channels'),
      pool.query('SELECT COUNT(*) FROM dm_messages'),
      pool.query('SELECT id, username, email, role, avatar_color, created_at FROM users ORDER BY created_at DESC LIMIT 5'),
    ]);
    res.json({
      totalUsers: parseInt(users.rows[0].count),
      totalMessages: parseInt(messages.rows[0].count),
      totalChannels: parseInt(channels.rows[0].count),
      totalDMs: parseInt(dms.rows[0].count),
      recentUsers: recentUsers.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Recent messages ───────────────────────────────────────────
async function getRecentMessages(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.content, m.created_at, u.username, u.avatar_color, c.name AS channel_name
       FROM messages m
       JOIN users u ON u.id = m.user_id
       JOIN channels c ON c.id = m.channel_id
       ORDER BY m.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Force password reset email ─────────────────────────────────
async function forcePasswordReset(req, res) {
  const { userId } = req.params;
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    // Reuse the forgot password flow
    const { forgotPassword } = require('./passwordResetController');
    req.body = { email: rows[0].email };
    return forgotPassword(req, res);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Update user password directly ────────────────────────────
async function setUserPassword(req, res) {
  const { userId } = req.params;
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  updateServer, getServer, renameChannel,
  getAllUsers, updateUserRole, deleteUser,
  getStats, getRecentMessages, forcePasswordReset, setUserPassword,
};
