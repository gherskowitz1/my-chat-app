const { pool } = require('../db');
const { emitToUser } = require('../socket');

// Returns any existing row between these two users, in either direction.
async function findRelationship(userA, userB) {
  const { rows } = await pool.query(
    `SELECT * FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
    [userA, userB]
  );
  return rows[0] || null;
}

async function getFriends(req, res) {
  const myId = req.user.id;
  try {
    const { rows: friends } = await pool.query(
      `SELECT u.id, u.username, u.avatar_color, u.avatar_url, u.role
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.status = 'accepted' AND (f.requester_id = $1 OR f.addressee_id = $1)
       ORDER BY u.username`,
      [myId]
    );
    const { rows: incoming } = await pool.query(
      `SELECT u.id, u.username, u.avatar_color, u.avatar_url, f.created_at
       FROM friendships f JOIN users u ON u.id = f.requester_id
       WHERE f.status = 'pending' AND f.addressee_id = $1
       ORDER BY f.created_at DESC`,
      [myId]
    );
    const { rows: outgoing } = await pool.query(
      `SELECT u.id, u.username, u.avatar_color, u.avatar_url, f.created_at
       FROM friendships f JOIN users u ON u.id = f.addressee_id
       WHERE f.status = 'pending' AND f.requester_id = $1
       ORDER BY f.created_at DESC`,
      [myId]
    );
    res.json({ friends, incoming, outgoing });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Sending a request when the other person already sent one to you is
// treated as accepting theirs instead of creating a redundant second row.
async function sendRequest(req, res) {
  const myId = req.user.id;
  const { userId } = req.params;
  if (myId === userId) return res.status(400).json({ error: 'Cannot friend yourself' });

  try {
    const existing = await findRelationship(myId, userId);
    if (existing?.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
    if (existing?.status === 'pending' && existing.requester_id === myId) {
      return res.status(409).json({ error: 'Request already sent' });
    }

    if (existing?.status === 'pending' && existing.requester_id === userId) {
      await pool.query("UPDATE friendships SET status = 'accepted' WHERE id = $1", [existing.id]);
      emitToUser(req.app.get('io'), userId, 'friend:accepted', { userId: myId, username: req.user.username });
      return res.json({ status: 'accepted' });
    }

    await pool.query(
      "INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')",
      [myId, userId]
    );
    emitToUser(req.app.get('io'), userId, 'friend:request', { userId: myId, username: req.user.username });
    res.status(201).json({ status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function acceptRequest(req, res) {
  const myId = req.user.id;
  const { userId } = req.params;
  try {
    const { rows } = await pool.query(
      "UPDATE friendships SET status = 'accepted' WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING id",
      [userId, myId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No pending request from this user' });
    emitToUser(req.app.get('io'), userId, 'friend:accepted', { userId: myId, username: req.user.username });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function declineRequest(req, res) {
  const myId = req.user.id;
  const { userId } = req.params;
  try {
    await pool.query(
      "DELETE FROM friendships WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'",
      [userId, myId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Also cancels a pending request you sent, in addition to removing an
// established friendship — same "tear down whatever's there" action either way.
async function removeFriend(req, res) {
  const myId = req.user.id;
  const { userId } = req.params;
  try {
    await pool.query(
      `DELETE FROM friendships
       WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
      [myId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getFriends, sendRequest, acceptRequest, declineRequest, removeFriend };
