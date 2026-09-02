const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

const REACTIONS_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object('emoji', t.emoji, 'userIds', t.user_ids)), '[]'::json)
  FROM (
    SELECT emoji, array_agg(user_id) AS user_ids
    FROM message_reactions
    WHERE message_id = m.id
    GROUP BY emoji
  ) t
) AS reactions`;

async function getChannels(req, res) {
  const { serverId } = req.params;
  const { id: userId, role } = req.user;
  try {
    const { rows } = await pool.query(
      `SELECT c.* FROM channels c
       WHERE c.server_id = $1
         AND (c.is_private = false OR $2 = 'admin' OR EXISTS (
           SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $3
         ))
       ORDER BY c.type, c.created_at`,
      [serverId, role, userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function createChannel(req, res) {
  const { serverId } = req.params;
  const { name, type = 'text', isPrivate = false, memberIds = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });

  try {
    const safeName = type === 'voice'
      ? name.trim()
      : name.trim().toLowerCase().replace(/\s+/g, '-');
    const { rows } = await pool.query(
      'INSERT INTO channels (server_id, name, type, is_private) VALUES ($1, $2, $3, $4) RETURNING *',
      [serverId, safeName, type, !!isPrivate]
    );
    const channel = rows[0];

    if (isPrivate && Array.isArray(memberIds) && memberIds.length > 0) {
      const values = memberIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [channel.id, ...memberIds]
      );
    }

    res.status(201).json({ ...channel, member_ids: isPrivate ? memberIds : [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteChannel(req, res) {
  const { channelId } = req.params;
  try {
    await pool.query('DELETE FROM channels WHERE id = $1', [channelId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// GET /channels/:channelId/members — admin only, returns the private
// allow-list so the "manage access" UI can pre-populate its checklist.
async function getChannelMembers(req, res) {
  const { channelId } = req.params;
  try {
    const { rows } = await pool.query('SELECT user_id FROM channel_members WHERE channel_id = $1', [channelId]);
    res.json(rows.map((r) => r.user_id));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// PATCH /channels/:channelId/access — admin only, replaces the private flag
// and the full allow-list in one call (simpler and safer than diffing).
async function updateChannelAccess(req, res) {
  const { channelId } = req.params;
  const { isPrivate, memberIds = [] } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT id FROM channels WHERE id = $1', [channelId]);
    if (!existing[0]) return res.status(404).json({ error: 'Channel not found' });

    await pool.query('UPDATE channels SET is_private = $1 WHERE id = $2', [!!isPrivate, channelId]);
    await pool.query('DELETE FROM channel_members WHERE channel_id = $1', [channelId]);

    if (isPrivate && Array.isArray(memberIds) && memberIds.length > 0) {
      const values = memberIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(`INSERT INTO channel_members (channel_id, user_id) VALUES ${values}`, [channelId, ...memberIds]);
    }

    const { rows } = await pool.query('SELECT * FROM channels WHERE id = $1', [channelId]);
    res.json({ ...rows[0], member_ids: isPrivate ? memberIds : [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMessages(req, res) {
  const { channelId } = req.params;
  const { id: userId, role } = req.user;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before;

  try {
    const channel = await getChannelById(channelId);
    if (!(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'Not authorized to view this channel' });
    }

    const query = before
      ? `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY} FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1 AND m.created_at < $2
         ORDER BY m.created_at DESC LIMIT $3`
      : `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY} FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1
         ORDER BY m.created_at DESC LIMIT $2`;

    const params = before ? [channelId, before, limit] : [channelId, limit];
    const { rows } = await pool.query(query, params);
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Loads a window of messages centered on a specific one — used when jumping
// to a search result (or an old reply/pin) that isn't in the currently
// loaded page. hasMoreAfter tells the client whether it's now viewing a
// "historical" window with newer messages beyond it it hasn't loaded.
async function getMessagesAround(req, res) {
  const { channelId, messageId } = req.params;
  const { id: userId, role } = req.user;
  try {
    const channel = await getChannelById(channelId);
    if (!(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'Not authorized to view this channel' });
    }

    const { rows: targetRows } = await pool.query(
      'SELECT created_at FROM messages WHERE id = $1 AND channel_id = $2',
      [messageId, channelId]
    );
    if (!targetRows[0]) return res.status(404).json({ error: 'Message not found' });
    const targetTime = targetRows[0].created_at;

    const { rows: before } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY} FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1 AND m.created_at <= $2
       ORDER BY m.created_at DESC LIMIT 26`,
      [channelId, targetTime]
    );
    const { rows: after } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY} FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1 AND m.created_at > $2
       ORDER BY m.created_at ASC LIMIT 25`,
      [channelId, targetTime]
    );

    res.json({
      messages: [...before.reverse(), ...after],
      hasMoreBefore: before.length === 26,
      hasMoreAfter: after.length === 25,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getChannels, createChannel, deleteChannel, getMessages, getMessagesAround, getChannelMembers, updateChannelAccess };
