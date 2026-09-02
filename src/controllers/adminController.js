const { pool } = require('../db');

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';
const ICON_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
const MAX_ICON_LENGTH = 1_500_000; // matches the avatar upload cap

// ── Server ──────────────────────────────────────────────────
async function updateServer(req, res) {
  const { serverId } = req.params;
  const { name, description, textCategoryLabel, voiceCategoryLabel, iconUrl } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  if (iconUrl) {
    if (typeof iconUrl !== 'string' || !ICON_DATA_URL_RE.test(iconUrl)) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    if (iconUrl.length > MAX_ICON_LENGTH) {
      return res.status(400).json({ error: 'Image is too large' });
    }
  }

  try {
    const { rows } = await pool.query(
      `UPDATE servers
       SET name = $1, description = $2,
           text_category_label = COALESCE(NULLIF($3, ''), text_category_label),
           voice_category_label = COALESCE(NULLIF($4, ''), voice_category_label),
           icon_url = $5
       WHERE id = $6 RETURNING *`,
      [name.trim(), description?.trim() ?? null, textCategoryLabel?.trim(), voiceCategoryLabel?.trim(), iconUrl || null, serverId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Assigns the server's owner if it has none yet, or transfers it if the
// requester is the current owner. The owner is protected from demotion/
// removal by other admins (see updateUserRole/deleteUser below) and is
// promoted to admin here so ownership always implies admin powers.
async function setServerOwner(req, res) {
  const { serverId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const { rows: serverRows } = await pool.query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (!serverRows[0]) return res.status(404).json({ error: 'Server not found' });

    const currentOwnerId = serverRows[0].owner_id;
    if (currentOwnerId && currentOwnerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the current owner can transfer ownership' });
    }

    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!userRows[0]) return res.status(404).json({ error: 'User not found' });

    await pool.query('UPDATE servers SET owner_id = $1 WHERE id = $2', [userId, serverId]);
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
    res.json({ success: true, ownerId: userId });
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
      'SELECT id, username, email, role, avatar_color, avatar_url, created_at FROM users ORDER BY created_at ASC'
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
    const { rows: serverRows } = await pool.query('SELECT owner_id FROM servers WHERE id = $1', [DEFAULT_SERVER]);
    if (serverRows[0]?.owner_id === userId) {
      return res.status(400).json({ error: "Cannot change the server owner's role — transfer ownership first" });
    }
    const { rows } = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role, avatar_color, avatar_url',
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
    const { rows: serverRows } = await pool.query('SELECT owner_id FROM servers WHERE id = $1', [DEFAULT_SERVER]);
    if (serverRows[0]?.owner_id === userId) {
      return res.status(400).json({ error: 'Cannot remove the server owner — transfer ownership first' });
    }
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
      pool.query('SELECT id, username, email, role, avatar_color, avatar_url, created_at FROM users ORDER BY created_at DESC LIMIT 5'),
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
      `SELECT m.id, m.content, m.created_at, u.username, u.avatar_color, u.avatar_url, c.name AS channel_name
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
    await pool.query('UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2', [hash, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  updateServer, getServer, renameChannel, setServerOwner,
  getAllUsers, updateUserRole, deleteUser,
  getStats, getRecentMessages, forcePasswordReset, setUserPassword,
};
