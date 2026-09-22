const { pool } = require('../db');

async function getMutedChannels(req, res) {
  try {
    const { rows } = await pool.query('SELECT channel_id FROM channel_mutes WHERE user_id = $1', [req.user.id]);
    res.json(rows.map((r) => r.channel_id));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function muteChannel(req, res) {
  const { channelId } = req.params;
  try {
    await pool.query(
      'INSERT INTO channel_mutes (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [channelId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function unmuteChannel(req, res) {
  const { channelId } = req.params;
  try {
    await pool.query('DELETE FROM channel_mutes WHERE channel_id = $1 AND user_id = $2', [channelId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getMutedChannels, muteChannel, unmuteChannel };
