const { pool } = require('../db');

async function getChannels(req, res) {
  const { serverId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY type, created_at',
      [serverId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createChannel(req, res) {
  const { serverId } = req.params;
  const { name, type = 'text' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  try {
    const safeName = type === 'voice'
      ? name.trim()
      : name.trim().toLowerCase().replace(/\s+/g, '-');
    const { rows } = await pool.query(
      'INSERT INTO channels (server_id, name, type) VALUES ($1, $2, $3) RETURNING *',
      [serverId, safeName, type]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteChannel(req, res) {
  const { channelId } = req.params;
  try {
    await pool.query('DELETE FROM channels WHERE id = $1', [channelId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMessages(req, res) {
  const { channelId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before;

  try {
    const query = before
      ? `SELECT m.*, u.username, u.avatar_color, u.avatar_url FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1 AND m.created_at < $2
         ORDER BY m.created_at DESC LIMIT $3`
      : `SELECT m.*, u.username, u.avatar_color, u.avatar_url FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1
         ORDER BY m.created_at DESC LIMIT $2`;

    const params = before ? [channelId, before, limit] : [channelId, limit];
    const { rows } = await pool.query(query, params);
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getChannels, createChannel, deleteChannel, getMessages };
