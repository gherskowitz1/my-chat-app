const { pool } = require('../db');
const { sendPushToUser } = require('../utils/push');

const REACTIONS_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object('emoji', t.emoji, 'userIds', t.user_ids)), '[]'::json)
  FROM (
    SELECT emoji, array_agg(user_id) AS user_ids
    FROM dm_message_reactions
    WHERE message_id = m.id
    GROUP BY emoji
  ) t
) AS reactions`;

// See the identical constant in channelController.js — metadata only, never
// the attachment bytes, so a DM history page load stays small.
const ATTACHMENTS_SUBQUERY = `(
  SELECT COALESCE(json_agg(json_build_object(
    'id', a.id, 'filename', a.filename, 'mimeType', a.mime_type,
    'sizeBytes', a.size_bytes, 'width', a.width, 'height', a.height
  ) ORDER BY a.created_at), '[]'::json)
  FROM message_attachments a
  WHERE a.dm_message_id = m.id
) AS attachments`;

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_TOTAL_ATTACHMENT_BASE64_LENGTH = 11_000_000; // ~8MB raw, combined, once base64 overhead is accounted for

async function getOrCreateConversation(req, res) {
  const { targetUserId } = req.params;
  const myId = req.user.id;

  if (myId === targetUserId) {
    return res.status(400).json({ error: 'Cannot DM yourself' });
  }

  try {
    // Find existing conversation between exactly these two users
    const { rows: existing } = await pool.query(
      `SELECT dc.id FROM dm_conversations dc
       WHERE (SELECT COUNT(*) FROM dm_participants dp WHERE dp.conversation_id = dc.id) = 2
         AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $1)
         AND EXISTS (SELECT 1 FROM dm_participants WHERE conversation_id = dc.id AND user_id = $2)`,
      [myId, targetUserId]
    );

    if (existing[0]) {
      return res.json({ id: existing[0].id });
    }

    const { rows: conv } = await pool.query(
      'INSERT INTO dm_conversations DEFAULT VALUES RETURNING id'
    );
    const convId = conv[0].id;
    await pool.query(
      'INSERT INTO dm_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [convId, myId, targetUserId]
    );
    res.status(201).json({ id: convId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function getMyConversations(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT dc.id,
        (SELECT u.id FROM dm_participants dp2 JOIN users u ON u.id = dp2.user_id
         WHERE dp2.conversation_id = dc.id AND dp2.user_id != $1 LIMIT 1) AS other_user_id,
        (SELECT u.username FROM dm_participants dp2 JOIN users u ON u.id = dp2.user_id
         WHERE dp2.conversation_id = dc.id AND dp2.user_id != $1 LIMIT 1) AS other_username,
        (SELECT u.avatar_color FROM dm_participants dp2 JOIN users u ON u.id = dp2.user_id
         WHERE dp2.conversation_id = dc.id AND dp2.user_id != $1 LIMIT 1) AS other_avatar_color,
        (SELECT u.avatar_url FROM dm_participants dp2 JOIN users u ON u.id = dp2.user_id
         WHERE dp2.conversation_id = dc.id AND dp2.user_id != $1 LIMIT 1) AS other_avatar_url,
        (SELECT content FROM dm_messages WHERE conversation_id = dc.id ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM dm_conversations dc
       JOIN dm_participants dp ON dp.conversation_id = dc.id
       WHERE dp.user_id = $1
       ORDER BY dc.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getDmMessages(req, res) {
  const { conversationId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const before = req.query.before;

  try {
    // Verify user is participant
    const { rows: check } = await pool.query(
      'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    if (!check[0]) return res.status(403).json({ error: 'Forbidden' });

    const query = before
      ? `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM dm_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.conversation_id = $1 AND m.created_at < $2
         ORDER BY m.created_at DESC LIMIT $3`
      : `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM dm_messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC LIMIT $2`;
    const params = before ? [conversationId, before, limit] : [conversationId, limit];

    const { rows } = await pool.query(query, params);
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Loads a window of DM messages centered on a specific one — used when
// jumping to a search result that isn't in the currently loaded page.
async function getDmMessagesAround(req, res) {
  const { conversationId, messageId } = req.params;
  try {
    const { rows: check } = await pool.query(
      'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    if (!check[0]) return res.status(403).json({ error: 'Forbidden' });

    const { rows: targetRows } = await pool.query(
      'SELECT created_at FROM dm_messages WHERE id = $1 AND conversation_id = $2',
      [messageId, conversationId]
    );
    if (!targetRows[0]) return res.status(404).json({ error: 'Message not found' });
    const targetTime = targetRows[0].created_at;

    const { rows: before } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM dm_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = $1 AND m.created_at <= $2
       ORDER BY m.created_at DESC LIMIT 26`,
      [conversationId, targetTime]
    );
    const { rows: after } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY} FROM dm_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = $1 AND m.created_at > $2
       ORDER BY m.created_at ASC LIMIT 25`,
      [conversationId, targetTime]
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

async function getUsers(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, avatar_color, avatar_url, role FROM users WHERE id != $1 ORDER BY username',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// DM counterpart to channelController.js's sendMessageWithAttachments — see
// that function's comment for why this bypasses the dm:send socket event.
async function sendDmMessageWithAttachments(req, res) {
  const { conversationId } = req.params;
  const { id: userId, username } = req.user;
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
    const { rows: check } = await pool.query(
      'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (!check[0]) return res.status(403).json({ error: 'Forbidden' });

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO dm_messages (conversation_id, user_id, content, reply_to_id, client_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (conversation_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [conversationId, userId, text, replyToId || null, clientId || null]
    );
    let messageId = insertedRows[0]?.id;
    let wasDuplicate = false;

    if (!messageId && clientId) {
      wasDuplicate = true;
      const { rows } = await pool.query(
        'SELECT id FROM dm_messages WHERE conversation_id = $1 AND client_id = $2',
        [conversationId, clientId]
      );
      messageId = rows[0]?.id;
    }
    if (!messageId) return res.status(500).json({ error: 'Failed to create message' });

    if (!wasDuplicate) {
      for (const a of attachments) {
        const base64 = a.data.includes(',') ? a.data.slice(a.data.indexOf(',') + 1) : a.data;
        await pool.query(
          `INSERT INTO message_attachments (dm_message_id, uploaded_by, filename, mime_type, size_bytes, width, height, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [messageId, userId, a.filename.slice(0, 255), a.mimeType, Buffer.byteLength(base64, 'base64'), a.width || null, a.height || null, base64]
        );
      }
    }

    const { rows: fullRows } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url, ${REACTIONS_SUBQUERY}, ${ATTACHMENTS_SUBQUERY}
       FROM dm_messages m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
      [messageId]
    );
    const newMessage = fullRows[0];
    res.status(201).json(newMessage);
    if (wasDuplicate) return;

    const io = req.app.get('io');
    io?.to(`dm:${conversationId}`).emit('dm:new', newMessage);

    if (io) {
      const { emitToUser, isOnline } = require('../socket');
      const { rows: others } = await pool.query(
        'SELECT user_id FROM dm_participants WHERE conversation_id = $1 AND user_id != $2',
        [conversationId, userId]
      );
      others.forEach(({ user_id }) => {
        emitToUser(io, user_id, 'notify:dm', {
          conversationId, username, content: text || `📎 ${attachments.length > 1 ? `${attachments.length} attachments` : attachments[0].filename}`,
        });
        if (!isOnline(user_id)) {
          sendPushToUser(pool, user_id, {
            title: username,
            body: text.slice(0, 120) || `Sent ${attachments.length > 1 ? `${attachments.length} attachments` : 'an attachment'}`,
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
  getOrCreateConversation, getMyConversations, getDmMessages, getDmMessagesAround, getUsers,
  sendDmMessageWithAttachments,
};
