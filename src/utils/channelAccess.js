const { pool } = require('../db');

async function getChannelById(channelId) {
  const { rows } = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId]);
  return rows[0] || null;
}

// Public channels are open to any server member. Private ones require the
// admin role or an explicit channel_members row — checked fresh on every
// call rather than trusted from client state, since this gates real access
// (REST, sockets, and LiveKit tokens), not just what the sidebar shows.
async function canAccessChannel(channel, userId, userRole) {
  if (!channel) return false;
  if (!channel.is_private) return true;
  if (userRole === 'admin') return true;
  const { rows } = await pool.query(
    'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
    [channel.id, userId]
  );
  return rows.length > 0;
}

module.exports = { getChannelById, canAccessChannel };
