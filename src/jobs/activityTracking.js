const { pool } = require('../db');
const { getVoiceUserIds } = require('../socket');

// Upkeep for the voice/game time tracked for Wrapped (voice_sessions,
// game_sessions — see schema.sql):
//  - on startup, closes any stretch left open by a restart at the last
//    moment it was known to still be going (last_seen_at), so server
//    downtime never counts as time in voice or in a game
//  - every minute, bumps last_seen_at for everyone currently in voice
// (gamePresence.js does the game-side heartbeat on its own poll, since it's
// the thing that actually knows who's still playing.)
const HEARTBEAT_MS = 60 * 1000;

async function closeStaleSessions() {
  await pool.query('UPDATE voice_sessions SET ended_at = last_seen_at WHERE ended_at IS NULL');
  await pool.query('UPDATE game_sessions SET ended_at = last_seen_at WHERE ended_at IS NULL');
}

async function heartbeat() {
  const ids = getVoiceUserIds();
  if (ids.length === 0) return;
  await pool.query(
    'UPDATE voice_sessions SET last_seen_at = NOW() WHERE ended_at IS NULL AND user_id = ANY($1::uuid[])',
    [ids]
  );
}

async function startActivityTracking() {
  try {
    await closeStaleSessions();
  } catch (err) {
    console.error('Activity tracking: startup cleanup failed:', err.message);
  }
  setInterval(() => {
    heartbeat().catch((err) => console.error('Activity tracking: heartbeat failed:', err.message));
  }, HEARTBEAT_MS);
}

module.exports = { startActivityTracking };
