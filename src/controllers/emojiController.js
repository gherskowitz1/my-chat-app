const { pool } = require('../db');

// Capped at 30 (not 32) so the wrapped :name: form used for reactions still
// fits the message_reactions.emoji VARCHAR(32) column.
const NAME_RE = /^[a-zA-Z0-9_]{2,30}$/;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
const MAX_IMAGE_LENGTH = 700_000; // ~512KB of raw image data once base64 overhead is accounted for
const MAX_EMOJI_PER_SERVER = 200;

async function getEmoji(req, res) {
  const { serverId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, server_id, name, image_data, created_by, created_at FROM custom_emoji WHERE server_id = $1 ORDER BY name ASC',
      [serverId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createEmoji(req, res) {
  const { serverId } = req.params;
  const { name, imageData } = req.body;

  if (!name || !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Name must be 2-30 characters, letters/numbers/underscore only' });
  }
  if (!imageData || typeof imageData !== 'string' || !IMAGE_DATA_URL_RE.test(imageData)) {
    return res.status(400).json({ error: 'Invalid image data' });
  }
  if (imageData.length > MAX_IMAGE_LENGTH) {
    return res.status(400).json({ error: 'Image is too large' });
  }

  try {
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM custom_emoji WHERE server_id = $1',
      [serverId]
    );
    if (countRows[0].count >= MAX_EMOJI_PER_SERVER) {
      return res.status(400).json({ error: `This server already has the maximum of ${MAX_EMOJI_PER_SERVER} custom emoji` });
    }

    const { rows } = await pool.query(
      `INSERT INTO custom_emoji (server_id, name, image_data, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, server_id, name, image_data, created_by, created_at`,
      [serverId, name.toLowerCase(), imageData, req.user.id]
    );
    req.app.get('io')?.emit('emoji:updated');
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'An emoji with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteEmoji(req, res) {
  const { serverId, emojiId } = req.params;
  try {
    await pool.query('DELETE FROM custom_emoji WHERE id = $1 AND server_id = $2', [emojiId, serverId]);
    req.app.get('io')?.emit('emoji:updated');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getEmoji, createEmoji, deleteEmoji };
