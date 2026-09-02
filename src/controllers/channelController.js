const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');
const { mentionsUsername } = require('../utils/mentions');
const { sendPushToUser } = require('../utils/push');

const REACTIONS_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object('emoji', t.emoji, 'userIds', t.user_ids)), '[]'::json)
  FROM (
    SELECT emoji, array_agg(user_id) AS user_ids
    FROM message_reactions
    WHERE message_id = m.id
    GROUP BY emoji
  ) t
) AS reactions`;

// Metadata only — never the attachment's `data` column, so a normal message
// page load stays small regardless of how many/how large the attachments in
// it are. The actual bytes are fetched separately, per-attachment, on demand.
const ATTACHMENTS_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object(
    'id', a.id, 'filename', a.filename, 'mimeType', a.mime_type,
    'sizeBytes', a.size_bytes, 'width', a.width, 'height', a.height
  ) ORDER BY a.created_at), '[]'::json)
  FROM message_attachments a
  WHERE a.message_id = m.id
) AS attachments`;

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_TOTAL_ATTACHMENT_BASE64_LENGTH = 11_000_000; // ~8MB raw, combined, once base64 overhead is accounted for

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
      ? `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.channel_id = $1 AND m.created_at < $2
         ORDER BY m.created_at DESC LIMIT $3`
      : `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM messages m
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
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1 AND m.created_at <= $2
       ORDER BY m.created_at DESC LIMIT 26`,
      [channelId, targetTime]
    );
    const { rows: after } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM messages m
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

// A message with one or more attachments goes through REST instead of the
// message:send socket event — Socket.io's default frame size caps out well
// under an 8MB attachment, where express.json's limit is sized for exactly
// this. Uses the same clientId/ON CONFLICT idempotency scheme as the
// socket path (see socket/index.js) so a retried request from the offline
// outbox can't double-post either the message or its attachments.
async function sendMessageWithAttachments(req, res) {
  const { channelId } = req.params;
  const { id: userId, username, role } = req.user;
  const { content, replyToId, clientId, attachments } = req.body;
  const text = (content || '').trim();

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return res.status(400).json({ error: 'At least one attachment is required' });
  }
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return res.status(400).json({ error: `Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE})` });
  }
  let totalBase64Length = 0;
  for (const a of attachments) {
    if (!a?.filename || !a?.mimeType || !a?.data) return res.status(400).json({ error: 'Invalid attachment' });
    totalBase64Length += a.data.length;
  }
  if (totalBase64Length > MAX_TOTAL_ATTACHMENT_BASE64_LENGTH) {
    return res.status(400).json({ error: 'Attachments are too large — 8MB max per message, combined' });
  }

  try {
    const channel = await getChannelById(channelId);
    if (!(await canAccessChannel(channel, userId, role))) {
      return res.status(403).json({ error: 'Not authorized to post in this channel' });
    }

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO messages (channel_id, user_id, content, reply_to_id, client_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [channelId, userId, text, replyToId || null, clientId || null]
    );
    let messageId = insertedRows[0]?.id;
    let wasDuplicate = false;

    if (!messageId && clientId) {
      wasDuplicate = true;
      const { rows } = await pool.query(
        'SELECT id FROM messages WHERE channel_id = $1 AND client_id = $2',
        [channelId, clientId]
      );
      messageId = rows[0]?.id;
    }
    if (!messageId) return res.status(500).json({ error: 'Failed to create message' });

    if (!wasDuplicate) {
      for (const a of attachments) {
        const base64 = a.data.includes(',') ? a.data.slice(a.data.indexOf(',') + 1) : a.data;
        await pool.query(
          `INSERT INTO message_attachments (message_id, uploaded_by, filename, mime_type, size_bytes, width, height, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [messageId, userId, a.filename.slice(0, 255), a.mimeType, Buffer.byteLength(base64, 'base64'), a.width || null, a.height || null, base64]
        );
      }
    }

    const { rows: fullRows } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY}
       FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
      [messageId]
    );
    const newMessage = fullRows[0];
    res.status(201).json(newMessage);
    if (wasDuplicate) return; // already broadcast/notified the first time this clientId was seen

    const io = req.app.get('io');
    io?.to(`channel:${channelId}`).emit('message:new', newMessage);

    // Mirrors the notify:message / mention-push logic in socket/index.js's
    // message:send handler, which this REST path bypasses entirely.
    if (io) {
      const { emitToUser, isOnline } = require('../socket');
      const { rows: members } = channel.is_private
        ? await pool.query(
            `SELECT cm.user_id, u.username FROM channel_members cm
             JOIN users u ON u.id = cm.user_id
             WHERE cm.channel_id = $1 AND cm.user_id != $2`,
            [channelId, userId]
          )
        : await pool.query(
            `SELECT sm.user_id, u.username FROM server_members sm
             JOIN users u ON u.id = sm.user_id
             JOIN channels c ON c.server_id = sm.server_id
             WHERE c.id = $1 AND sm.user_id != $2`,
            [channelId, userId]
          );
      members.forEach(({ user_id, username: memberUsername }) => {
        emitToUser(io, user_id, 'notify:message', {
          channelId, channelName: channel.name, username, content: text || `📎 ${attachments.length > 1 ? `${attachments.length} attachments` : attachments[0].filename}`,
        });
        if (!isOnline(user_id) && mentionsUsername(text, memberUsername)) {
          sendPushToUser(pool, user_id, {
            title: `${username} mentioned you in #${channel.name}`,
            body: text.slice(0, 120),
          }).catch((err) => console.error('push send error', err));
        }
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getChannels, createChannel, deleteChannel, getMessages, getMessagesAround, getChannelMembers, updateChannelAccess,
  sendMessageWithAttachments,
};
