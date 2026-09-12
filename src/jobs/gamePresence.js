const { pool } = require('../db');
const { getPlayerSummaries } = require('../services/steamPlayers');

const DEFAULT_POLL_MINUTES = 2;
const STEAM_BATCH_SIZE = 100; // GetPlayerSummaries' per-request cap

async function getPollIntervalMs() {
  try {
    const { rows } = await pool.query('SELECT game_poll_minutes FROM bot_settings WHERE id = 1');
    const minutes = rows[0]?.game_poll_minutes;
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_POLL_MINUTES) * 60 * 1000;
  } catch {
    return DEFAULT_POLL_MINUTES * 60 * 1000;
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function pollAll(io) {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, steam_id, current_game FROM users WHERE steam_id IS NOT NULL'
    );
    if (users.length === 0) return;

    const byId = new Map(users.map((u) => [u.steam_id, u]));
    for (const batch of chunk(users.map((u) => u.steam_id), STEAM_BATCH_SIZE)) {
      const players = await getPlayerSummaries(batch);
      for (const player of players) {
        const user = byId.get(player.steamid);
        if (!user) continue;
        const newGame = player.gameextrainfo || null;
        if (newGame === user.current_game) continue;
        await pool.query('UPDATE users SET current_game = $1 WHERE id = $2', [newGame, user.id]);
        io.emit('presence:playing', { userId: user.id, game: newGame });
      }
    }
  } catch (err) {
    console.error('Steam presence: poll cycle failed:', err.message);
  }
}

// Self-rescheduling rather than a fixed setInterval — same reasoning as
// PatchBot's loop — so an admin frequency change applies next cycle.
async function scheduleNext(io) {
  await pollAll(io);
  const intervalMs = await getPollIntervalMs();
  setTimeout(() => scheduleNext(io), intervalMs);
}

function startGamePresence(io) {
  scheduleNext(io);
}

module.exports = { startGamePresence };
