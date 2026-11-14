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
    const { rows } = await pool.query('SELECT steam_id FROM users WHERE id = $1', [userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const steamId = rows[0].steam_id;
    if (!steamId || !process.env.STEAM_API_KEY) return res.json({ linked: !!steamId, games: [] });

    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return res.json({ linked: true, games: hit.games });

    const games = await getRecentlyPlayedGames(steamId, 3);
    cache.set(userId, { at: Date.now(), games });
    res.json({ linked: true, games });
  } catch (err) {
    console.error('recent games lookup failed:', err.message);
    res.json({ linked: true, games: [] }); // a Steam hiccup just hides the section
  }
}

module.exports = { getRecentGames };
