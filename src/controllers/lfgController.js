const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');
const { emitToUser, isOnline } = require('../socket');
const { sendPushToUser } = require('../utils/push');
const { LFG_SUBQUERY, REACTIONS_SUBQUERY, ATTACHMENTS_SUBQUERY, POLL_SUBQUERY } = require('./channelController');

// "Looking for group" — /lfg 3 Helldivers 2 posts a party card in the
// channel ("gary is looking for 3 more for Helldivers 2" + an I'm in
// button) and pings everyone who plays that game: whoever Steam says is
// playing it right now, or played it in the last 30 days (game_sessions).
// Like a poll, it's an ordinary message with an lfg_posts row attached.

const EXPIRES_AFTER = '2 hours';
const MAX_NEEDED = 20;

// "HELLDIVERS™ 2" and "helldivers 2" should match; so should "helldivers"
// against "HELLDIVERS™ 2".
const normalize = (name) => (name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const sameGame = (a, b) => {
  const x = normalize(a);
  const y = normalize(b);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
};

// People who can see the channel and play the game, other than the poster.
async function findPlayers(channel, game, posterId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.current_game, gs.game AS past_game
     FROM users u
     LEFT JOIN game_sessions gs ON gs.user_id = u.id AND gs.started_at > NOW() - INTERVAL '30 days'
     WHERE u.id <> $1 AND NOT u.invisible
       AND (u.current_game IS NOT NULL OR gs.game IS NOT NULL)
       AND ${channel.is_private
         ? 'EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = $2 AND cm.user_id = u.id)'
         : 'EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = $2 AND sm.user_id = u.id)'}`,
    [posterId, channel.is_private ? channel.id : channel.server_id]
  );
  return [...new Set(rows.filter((r) => sameGame(r.current_game, game) || sameGame(r.past_game, game)).map((r) => r.id))];
}

async function loadMessage(messageId) {
  const { rows } = await pool.query(
    `SELECT m.*, COALESCE(u.username, 'Deleted User') AS username, COALESCE(u.avatar_color, '#5c5c5c') AS avatar_color, u.avatar_url,
            ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY}, ${POLL_SUBQUERY}, ${LFG_SUBQUERY}
     FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [messageId]
  );
  return rows[0];
}

async function createLfg(req, res) {
  const { channelId } = req.params;
  const { id: userId, username, role } = req.user;
  const game = (req.body.game || '').trim();
  const needed = req.body.needed == null ? 1 : Number(req.body.needed);
  if (!game || game.length > 100) return res.status(400).json({ error: 'Which game? (up to 100 characters)' });
  if (!Number.isInteger(needed) || needed < 1 || needed > MAX_NEEDED) {
    return res.status(400).json({ error: `Looking for 1-${MAX_NEEDED} more players.` });
  }

  try {
    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'text' || !(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'You can’t post in that channel.' });
    }

    const content = `🎮 Looking for ${needed} more for ${game}`;
    const { rows: [msg] } = await pool.query(
      'INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
      [channelId, userId, content]
    );
    await pool.query(
      `INSERT INTO lfg_posts (message_id, game, needed, created_by, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${EXPIRES_AFTER}')`,
      [msg.id, game, needed, userId]
    );
    const message = await loadMessage(msg.id);
    res.status(201).json(message);

    const io = req.app.get('io');
    io?.to(`channel:${channelId}`).emit('message:new', message);

    // Ping the people who actually play it.
    const players = await findPlayers(channel, game, userId);
    for (const playerId of players) {
      emitToUser(io, playerId, 'notify:lfg', {
        lfgId: message.lfg.id, messageId: msg.id, channelId, channelName: channel.name, username, game, needed,
      });
      if (!isOnline(playerId)) {
        sendPushToUser(pool, playerId, {
          title: `🎮 ${username} needs ${needed} more for ${game}`,
          body: `Jump in from #${channel.name}`,
        }).catch((err) => console.error('lfg push error', err));
      }
    }
  } catch (err) {
    console.error('createLfg error', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
}

// Toggles your spot in the party. The channel comes from the post itself
// (never the client), and you can't join a full or expired party, or your
// own.
async function toggleJoin(req, res) {
  const { id: userId, username, role } = req.user;
  try {
    const { rows: [lfg] } = await pool.query(
      `SELECT l.*, m.channel_id, (l.expires_at < NOW()) AS expired,
              (SELECT COUNT(*)::int FROM lfg_joins j WHERE j.lfg_id = l.id) AS joined,
              EXISTS (SELECT 1 FROM lfg_joins j WHERE j.lfg_id = l.id AND j.user_id = $2) AS mine
       FROM lfg_posts l JOIN messages m ON m.id = l.message_id WHERE l.id = $1`,
      [req.params.lfgId, userId]
    );
    if (!lfg) return res.status(404).json({ error: 'That party is gone.' });
    const channel = await getChannelById(lfg.channel_id);
    if (!(await canAccessChannel(channel, userId, role))) return res.status(403).json({ error: 'Not allowed.' });
    if (lfg.created_by === userId) return res.status(400).json({ error: 'It’s your party — you’re already in.' });

    let nowFull = false;
    if (lfg.mine) {
      await pool.query('DELETE FROM lfg_joins WHERE lfg_id = $1 AND user_id = $2', [lfg.id, userId]);
    } else {
      if (lfg.expired) return res.status(410).json({ error: 'That party has expired.' });
      if (lfg.joined >= lfg.needed) return res.status(409).json({ error: 'That party is already full.' });
      await pool.query('INSERT INTO lfg_joins (lfg_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [lfg.id, userId]);
      nowFull = lfg.joined + 1 >= lfg.needed;
    }

    const message = await loadMessage(lfg.message_id);
    const io = req.app.get('io');
    io?.to(`channel:${lfg.channel_id}`).emit('lfg:update', { messageId: lfg.message_id, channelId: lfg.channel_id, lfg: message.lfg });
    res.json({ lfg: message.lfg });

    // Tell the poster the moment their party fills up.
    if (nowFull && lfg.created_by) {
      const names = message.lfg.members.map((m) => m.username).join(', ');
      emitToUser(io, lfg.created_by, 'notify:lfgFull', { game: lfg.game, names, channelId: lfg.channel_id });
      if (!isOnline(lfg.created_by)) {
        sendPushToUser(pool, lfg.created_by, { title: `🎮 Your ${lfg.game} party is full!`, body: names })
          .catch((err) => console.error('lfg push error', err));
      }
    }
  } catch (err) {
    console.error('toggleJoin error', err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { createLfg, toggleJoin, sameGame, findPlayers };
