const { pool } = require('../db');

const NAME_RE = /^[a-zA-Z0-9_ -]{2,32}$/;
const AUDIO_DATA_URL_RE = /^data:audio\/(mpeg|mp3|wav|wave|x-wav|ogg|webm|mp4|x-m4a|aac);base64,/;
const MAX_AUDIO_LENGTH = 7_000_000; // ~5MB of raw audio once base64 overhead is accounted for
const MAX_SOUNDS_PER_SERVER = 500;

async function getSounds(req, res) {
  const { serverId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, server_id, name, audio_data, created_by, created_at FROM soundboard_sounds WHERE server_id = $1 ORDER BY name ASC',
      [serverId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function createSound(req, res) {
  const { serverId } = req.params;
  const { name, audioData } = req.body;

  if (!name || !NAME_RE.test(name.trim())) {
    return res.status(400).json({ error: 'Name must be 2-32 characters (letters, numbers, spaces, - or _)' });
  }
  if (!audioData || typeof audioData !== 'string' || !AUDIO_DATA_URL_RE.test(audioData)) {
    return res.status(400).json({ error: 'Invalid audio data' });
  }
  if (audioData.length > MAX_AUDIO_LENGTH) {
    return res.status(400).json({ error: 'Clip is too large — keep soundboard clips short' });
  }

  try {
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM soundboard_sounds WHERE server_id = $1',
      [serverId]
    );
    if (countRows[0].count >= MAX_SOUNDS_PER_SERVER) {
      return res.status(400).json({ error: `This server already has the maximum of ${MAX_SOUNDS_PER_SERVER} sounds` });
    }

    const { rows } = await pool.query(
      `INSERT INTO soundboard_sounds (server_id, name, audio_data, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, server_id, name, audio_data, created_by, created_at`,
      [serverId, name.trim(), audioData, req.user.id]
    );
    req.app.get('io')?.emit('soundboard:updated');
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A sound with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteSound(req, res) {
  const { serverId, soundId } = req.params;
  try {
    await pool.query('DELETE FROM soundboard_sounds WHERE id = $1 AND server_id = $2', [soundId, serverId]);
    req.app.get('io')?.emit('soundboard:updated');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getSounds, createSound, deleteSound };
