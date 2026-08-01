const { pool } = require('../db');
const { emitToUser } = require('../socket');
const { getGameNews, stripFormatting } = require('../services/steamNews');

const PATCHBOT_USER_ID = '00000000-0000-0000-0000-0000000b0000';
const PATCHBOT_USERNAME = 'PatchBot';
const DEFAULT_POLL_MINUTES = 180;
const MAX_ITEMS_PER_POLL = 3; // cap in case a game had a burst of posts since last check
const SUMMARY_MAX_CHARS = 500;

async function getPollIntervalMs() {
  try {
    const { rows } = await pool.query('SELECT patch_poll_minutes FROM bot_settings WHERE id = 1');
    const minutes = rows[0]?.patch_poll_minutes;
    return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_POLL_MINUTES) * 60 * 1000;
  } catch {
    return DEFAULT_POLL_MINUTES * 60 * 1000;
  }
}

async function notifyChannel(io, channel, content) {
  const { rows: members } = channel.is_private
    ? await pool.query('SELECT user_id FROM channel_members WHERE channel_id = $1', [channel.id])
    : await pool.query(
        `SELECT sm.user_id FROM server_members sm
         JOIN channels c ON c.server_id = sm.server_id
         WHERE c.id = $1`,
        [channel.id]
      );
  members.forEach(({ user_id }) => {
    emitToUser(io, user_id, 'notify:message', {
      channelId: channel.id, channelName: channel.name, username: PATCHBOT_USERNAME, content,
    });
  });
}

async function pollGame(io, game) {
  try {
    const items = await getGameNews(game.steam_app_id);
    if (items.length === 0) return;

    // First time tracking this game — record the newest item as the
    // baseline instead of dumping its whole recent history into the channel.
    if (!game.last_posted_gid) {
      await pool.query('UPDATE tracked_games SET last_posted_gid = $1 WHERE id = $2', [items[0].gid, game.id]);
      return;
    }

    const lastIndex = items.findIndex((it) => it.gid === game.last_posted_gid);
    const newItems = (lastIndex === -1 ? items : items.slice(0, lastIndex))
      .slice(0, MAX_ITEMS_PER_POLL)
      .reverse(); // oldest first, so they post in chronological order

    for (const item of newItems) {
      const summary = stripFormatting(item.contents).slice(0, SUMMARY_MAX_CHARS);
      const truncated = summary.length === SUMMARY_MAX_CHARS ? `${summary}…` : summary;
      const content = `🎮 ${game.name} — ${item.title}\n\n${truncated}\n\n${item.url}`;

      const { rows } = await pool.query(
        `WITH inserted AS (
           INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3)
           RETURNING id, channel_id, content, created_at, user_id
         )
         SELECT inserted.*, u.username, u.avatar_color, u.avatar_url
         FROM inserted JOIN users u ON u.id = inserted.user_id`,
        [game.channel_id, PATCHBOT_USER_ID, content]
      );
      io.to(`channel:${game.channel_id}`).emit('message:new', rows[0]);
      await notifyChannel(io, { id: game.channel_id, name: game.channel_name, is_private: game.is_private }, content);
    }

    if (newItems.length > 0) {
      await pool.query('UPDATE tracked_games SET last_posted_gid = $1 WHERE id = $2', [items[0].gid, game.id]);
    }
  } catch (err) {
    console.error(`PatchBot: failed to poll ${game.name} (appid ${game.steam_app_id}):`, err.message);
  }
}

async function pollAll(io) {
  try {
    const { rows: games } = await pool.query(
      `SELECT tg.*, c.name AS channel_name, c.is_private
       FROM tracked_games tg
       JOIN channels c ON c.id = tg.channel_id`
    );
    for (const game of games) {
      await pollGame(io, game);
    }
  } catch (err) {
    console.error('PatchBot: poll cycle failed:', err.message);
  }
}

// Self-rescheduling rather than a fixed setInterval, so a frequency change
// made in the admin panel takes effect on the very next cycle instead of
// requiring a server restart.
async function scheduleNext(io) {
  await pollAll(io);
  const intervalMs = await getPollIntervalMs();
  setTimeout(() => scheduleNext(io), intervalMs);
}

function startPatchBot(io) {
  scheduleNext(io);
}

module.exports = { startPatchBot };
