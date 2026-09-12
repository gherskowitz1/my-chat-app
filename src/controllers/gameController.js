const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');
const { searchSteamGames } = require('../services/steamNews');

async function searchGames(req, res) {
  const q = req.query.q?.trim();
  if (!q) return res.json([]);
  try {
    const results = await searchSteamGames(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Steam search failed' });
  }
}

async function getTrackedGames(req, res) {
  const { channelId } = req.params;
  const { id: userId, role } = req.user;
  try {
    const channel = await getChannelById(channelId);
    if (!(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { rows } = await pool.query(
      'SELECT id, steam_app_id, name, icon_url, created_at FROM tracked_games WHERE channel_id = $1 ORDER BY name',
      [channelId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function trackGame(req, res) {
  const { channelId } = req.params;
  const { steamAppId, name, iconUrl } = req.body;
  if (!steamAppId || !name?.trim()) return res.status(400).json({ error: 'steamAppId and name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO tracked_games (channel_id, steam_app_id, name, icon_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (channel_id, steam_app_id) DO NOTHING
       RETURNING *`,
      [channelId, steamAppId, name.trim(), iconUrl || null]
    );
    if (!rows[0]) return res.status(409).json({ error: 'Already tracked in this channel' });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function untrackGame(req, res) {
  const { gameId } = req.params;
  try {
    await pool.query('DELETE FROM tracked_games WHERE id = $1', [gameId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

const MIN_POLL_MINUTES = 1;
const MAX_POLL_MINUTES = 24 * 60;

async function getPatchBotSettings(req, res) {
  try {
    const { rows } = await pool.query('SELECT patch_poll_minutes, game_poll_minutes FROM bot_settings WHERE id = 1');
    res.json({
      pollIntervalMinutes: rows[0]?.patch_poll_minutes ?? 180,
      gamePollIntervalMinutes: rows[0]?.game_poll_minutes ?? 2,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Accepts either field independently (the admin UI has two separate
// dropdowns — patch notes and "currently playing" — that save on their own).
async function updatePatchBotSettings(req, res) {
  const { pollIntervalMinutes, gamePollIntervalMinutes } = req.body;
  const sets = [];
  const params = [];

  if (pollIntervalMinutes !== undefined) {
    const minutes = parseInt(pollIntervalMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < MIN_POLL_MINUTES || minutes > MAX_POLL_MINUTES) {
      return res.status(400).json({ error: `pollIntervalMinutes must be between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}` });
    }
    params.push(minutes);
    sets.push(`patch_poll_minutes = $${params.length}`);
  }
  if (gamePollIntervalMinutes !== undefined) {
    const minutes = parseInt(gamePollIntervalMinutes, 10);
    if (!Number.isFinite(minutes) || minutes < MIN_POLL_MINUTES || minutes > MAX_POLL_MINUTES) {
      return res.status(400).json({ error: `gamePollIntervalMinutes must be between ${MIN_POLL_MINUTES} and ${MAX_POLL_MINUTES}` });
    }
    params.push(minutes);
    sets.push(`game_poll_minutes = $${params.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  try {
    await pool.query(`UPDATE bot_settings SET ${sets.join(', ')} WHERE id = 1`, params);
    const { rows } = await pool.query('SELECT patch_poll_minutes, game_poll_minutes FROM bot_settings WHERE id = 1');
    res.json({ pollIntervalMinutes: rows[0].patch_poll_minutes, gamePollIntervalMinutes: rows[0].game_poll_minutes });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  searchGames, getTrackedGames, trackGame, untrackGame,
  getPatchBotSettings, updatePatchBotSettings,
};
