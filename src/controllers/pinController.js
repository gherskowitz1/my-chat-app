const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

async function getPinnedMessages(req, res) {
  const { channelId } = req.params;
  const { id: userId, role } = req.user;
  try {
    const channel = await getChannelById(channelId);
    if (!(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { rows } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, p.created_at AS pinned_at
       FROM pinned_messages p
       JOIN messages m ON m.id = p.message_id
       JOIN users u ON u.id = m.user_id
       WHERE p.channel_id = $1
       ORDER BY p.created_at DESC`,
      [channelId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Admin-only, mirroring the existing "delete any message" moderation tier —
// there's no separate "manage messages" role in this app to gate it behind.
async function pinMessage(req, res) {
  const { channelId, messageId } = req.params;
  try {
    const { rows: msgCheck } = await pool.query(
      'SELECT id FROM messages WHERE id = $1 AND channel_id = $2',
      [messageId, channelId]
    );
    if (!msgCheck[0]) return res.status(404).json({ error: 'Message not found in this channel' });

    await pool.query(
      'INSERT INTO pinned_messages (channel_id, message_id, pinned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [channelId, messageId, req.user.id]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function unpinMessage(req, res) {
  const { channelId, messageId } = req.params;
  try {
    await pool.query('DELETE FROM pinned_messages WHERE channel_id = $1 AND message_id = $2', [channelId, messageId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getPinnedMessages, pinMessage, unpinMessage };
