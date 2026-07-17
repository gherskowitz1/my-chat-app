const { pool } = require('../db');

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

  try {
    // Verify user is participant
    const { rows: check } = await pool.query(
      'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, req.user.id]
    );
    if (!check[0]) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `SELECT m.*, u.username, u.avatar_color, u.avatar_url FROM dm_messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC LIMIT $2`,
      [conversationId, limit]
    );
    res.json(rows.reverse());
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

module.exports = { getOrCreateConversation, getMyConversations, getDmMessages, getUsers };
