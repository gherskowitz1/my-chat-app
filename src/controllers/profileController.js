const { pool } = require('../db');
const { getRecentlyPlayedGames } = require('../services/steamPlayers');

// "Recently played" on profile cards — the last two weeks of Steam games
// for anyone who's linked their Steam account (User Settings). Cached per
// user for a few minutes so opening the same card repeatedly doesn't hit
// Steam's API every time.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // userId -> { at, games }

async function getRecentGames(req, res) {
  const { userId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT steam_id, current_game, current_game_appid, current_game_join FROM users WHERE id = $1',
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const { steam_id: steamId, current_game: game, current_game_appid: appId, current_game_join: joinUrl } = rows[0];
    // Live (from the presence poll, not cached here) — powers "Jump in".
    const nowPlaying = steamId && game ? { game, appId, joinUrl, steamId } : null;
    if (!steamId || !process.env.STEAM_API_KEY) return res.json({ linked: !!steamId, nowPlaying, games: [] });

    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ linked: true, nowPlaying, games: hit.games });

    const games = await getRecentlyPlayedGames(steamId, 3);
    cache.set(userId, { at: Date.now(), games });
    res.json({ linked: true, nowPlaying, games });
  } catch (err) {
    console.error('recent games lookup failed:', err.message);
    res.json({ linked: true, games: [] }); // a Steam hiccup just hides the section
  }
}

module.exports = { getRecentGames };
