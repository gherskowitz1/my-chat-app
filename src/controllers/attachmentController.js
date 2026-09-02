const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

// Serves the actual bytes for one attachment, gated by the same access
// rules as the message it belongs to (private-channel membership, or DM
// participancy) — deliberately not just "public by unguessable UUID",
// since a private channel's attachments should stay private too.
async function getAttachment(req, res) {
  const { attachmentId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT a.*, m.channel_id, dm.conversation_id
       FROM message_attachments a
       LEFT JOIN messages m ON m.id = a.message_id
       LEFT JOIN dm_messages dm ON dm.id = a.dm_message_id
       WHERE a.id = $1`,
      [attachmentId]
    );
    const attachment = rows[0];
    if (!attachment) return res.status(404).json({ error: 'Not found' });

    if (attachment.channel_id) {
      const channel = await getChannelById(attachment.channel_id);
      if (!(await canAccessChannel(channel, req.user.id, req.user.role))) {
        return res.status(403).json({ error: 'No access' });
      }
    } else if (attachment.conversation_id) {
      const { rows: participant } = await pool.query(
        'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
        [attachment.conversation_id, req.user.id]
      );
      if (!participant[0]) return res.status(403).json({ error: 'No access' });
    } else {
      return res.status(404).json({ error: 'Not found' });
    }

    const buffer = Buffer.from(attachment.data, 'base64');
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getAttachment };
