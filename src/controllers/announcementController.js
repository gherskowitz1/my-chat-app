const { pool } = require('../db');

const MAX_MESSAGE_LENGTH = 2000;

// ── Admin: create & manage ──────────────────────────────────────
async function createAnnouncement(req, res) {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO announcements (message, created_by) VALUES ($1, $2) RETURNING id, message, created_at',
      [message.trim(), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function getAnnouncements(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.message, a.created_at, COALESCE(u.username, 'Deleted User') AS created_by_username
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.created_at DESC LIMIT 20`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function deleteAnnouncement(req, res) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Any signed-in user: fetch/dismiss ───────────────────────────
// Returns the newest announcement only if this user hasn't already
// dismissed it (or a newer one) — mirrors the What's New "show once" logic,
// but keyed off a real per-account column instead of localStorage.
async function getLatestAnnouncement(req, res) {
  try {
    const [{ rows: userRows }, { rows: annRows }] = await Promise.all([
      pool.query('SELECT last_seen_announcement_id FROM users WHERE id = $1', [req.user.id]),
      pool.query('SELECT id, message, created_at FROM announcements ORDER BY created_at DESC LIMIT 1'),
    ]);
    const latest = annRows[0];
    if (!latest || latest.id === userRows[0]?.last_seen_announcement_id) {
      return res.json({ announcement: null });
    }
    res.json({ announcement: latest });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

async function markAnnouncementSeen(req, res) {
  const { announcementId } = req.body;
  if (!announcementId) return res.status(400).json({ error: 'announcementId required' });
  try {
    await pool.query('UPDATE users SET last_seen_announcement_id = $1 WHERE id = $2', [announcementId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createAnnouncement, getAnnouncements, deleteAnnouncement,
  getLatestAnnouncement, markAnnouncementSeen,
};
