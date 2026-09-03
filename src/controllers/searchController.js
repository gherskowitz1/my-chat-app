const { pool } = require('../db');

const RESULT_LIMIT = 50;

// websearch_to_tsquery (not the stricter to_tsquery) accepts arbitrary user
// input — quoted phrases, "OR", "-exclude" — without throwing a syntax error
// on stray punctuation, which is what actually gets typed into a search box.
async function searchMessages(req, res) {
  const { id: userId, role } = req.user;
  const q = req.query.q?.trim();
  const scope = req.query.scope || 'all'; // 'channel' | 'server' | 'dms' | 'all'
  const channelId = req.query.channelId;
  if (!q) return res.json({ channelResults: [], dmResults: [] });

  try {
    let channelResults = [];
    if (scope === 'channel' && channelId) {
      const { rows } = await pool.query(
        `SELECT m.id, m.channel_id, m.content, m.created_at, COALESCE(u.username, 'Deleted User') AS username, COALESCE(u.avatar_color, '#5c5c5c') AS avatar_color, u.avatar_url, c.name AS channel_name
         FROM messages m
         LEFT JOIN users u ON u.id = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE m.channel_id = $1
           AND (c.is_private = false OR $2 = 'admin' OR EXISTS (
             SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $3
           ))
           AND m.content_tsv @@ websearch_to_tsquery('english', $4)
         ORDER BY m.created_at DESC LIMIT $5`,
        [channelId, role, userId, q, RESULT_LIMIT]
      );
      channelResults = rows;
    } else if (scope !== 'dms') {
      const { rows } = await pool.query(
        `SELECT m.id, m.channel_id, m.content, m.created_at, COALESCE(u.username, 'Deleted User') AS username, COALESCE(u.avatar_color, '#5c5c5c') AS avatar_color, u.avatar_url, c.name AS channel_name
         FROM messages m
         LEFT JOIN users u ON u.id = m.user_id
         JOIN channels c ON c.id = m.channel_id
         WHERE (c.is_private = false OR $1 = 'admin' OR EXISTS (
             SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2
           ))
           AND m.content_tsv @@ websearch_to_tsquery('english', $3)
         ORDER BY m.created_at DESC LIMIT $4`,
        [role, userId, q, RESULT_LIMIT]
      );
      channelResults = rows;
    }

    let dmResults = [];
    if (scope === 'dms' || scope === 'all') {
      const { rows } = await pool.query(
        `SELECT m.id, m.conversation_id, m.content, m.created_at, COALESCE(u.username, 'Deleted User') AS username, COALESCE(u.avatar_color, '#5c5c5c') AS avatar_color, u.avatar_url
         FROM dm_messages m
         LEFT JOIN users u ON u.id = m.user_id
         JOIN dm_participants p ON p.conversation_id = m.conversation_id
         WHERE p.user_id = $1 AND m.content_tsv @@ websearch_to_tsquery('english', $2)
         ORDER BY m.created_at DESC LIMIT $3`,
        [userId, q, RESULT_LIMIT]
      );
      dmResults = rows;
    }

    res.json({ channelResults, dmResults });
  } catch (err) {
    console.error('searchMessages error', err);
    res.status(500).json({ error: 'Search failed' });
  }
}

module.exports = { searchMessages };
