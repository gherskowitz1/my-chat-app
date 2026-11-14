const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');
const { RECURRENCES, isValidTimeZone, wallClockIn } = require('../utils/recurrence');
const { extendSeries } = require('../services/eventSeries');

// Game Night events — anyone can schedule one and anyone can RSVP; only the
// creator or an admin can cancel. Every change broadcasts "events:changed"
// so open Events panels refresh live. A recurring event is a series of
// dated events, each with its own RSVPs (see schema.sql); reminders and
// week-before check-ins come from jobs/eventReminders.js.

const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
// Events stay listed this long after they start, so one in progress still
// shows (with its RSVPs) instead of vanishing the moment it begins.
const STILL_LISTED_AFTER_START = '3 hours';
const RSVP_STATUSES = new Set(['going', 'maybe', 'no']);

const EVENT_SELECT = `
  SELECT e.id, e.series_id, e.title, e.description, e.starts_at, e.created_by, e.voice_channel_id,
         s.recurrence, s.time_zone,
         c.name AS voice_channel_name, u.username AS created_by_username,
         COALESCE((
           SELECT json_agg(json_build_object(
             'userId', r.user_id, 'username', ru.username, 'avatarColor', ru.avatar_color,
             'avatarUrl', ru.avatar_url, 'status', r.status
           ) ORDER BY r.updated_at)
           FROM event_rsvps r JOIN users ru ON ru.id = r.user_id
           WHERE r.event_id = e.id
         ), '[]'::json) AS rsvps
  FROM events e
  LEFT JOIN event_series s ON s.id = e.series_id
  LEFT JOIN channels c ON c.id = e.voice_channel_id
  LEFT JOIN users u ON u.id = e.created_by`;

async function listEvents(req, res) {
  try {
    const { rows } = await pool.query(
      `${EVENT_SELECT}
       WHERE e.cancelled_at IS NULL
         AND e.starts_at > NOW() - INTERVAL '${STILL_LISTED_AFTER_START}'
       ORDER BY e.starts_at
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('listEvents error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// body: { title, description?, startsAt (ISO), voiceChannelId?,
//         recurrence?: 'none'|'weekly'|'biweekly'|'monthly', timeZone? }
async function createEvent(req, res) {
  const { id: userId, role, username } = req.user;
  const title = req.body.title?.trim();
  const description = req.body.description?.trim() || null;
  const startsAt = new Date(req.body.startsAt);
  const voiceChannelId = req.body.voiceChannelId || null;
  const recurrence = req.body.recurrence && req.body.recurrence !== 'none' ? req.body.recurrence : null;
  const timeZone = req.body.timeZone;

  if (!title || title.length > 120) return res.status(400).json({ error: 'Give the event a name (up to 120 characters).' });
  if (description && description.length > 1000) return res.status(400).json({ error: 'Description is too long (1000 characters max).' });
  if (Number.isNaN(startsAt.getTime())) return res.status(400).json({ error: 'Pick a date and time.' });
  if (startsAt.getTime() < Date.now() - 60 * 1000) return res.status(400).json({ error: 'That time has already passed.' });
  if (startsAt.getTime() > Date.now() + MAX_AHEAD_MS) return res.status(400).json({ error: 'Events can be scheduled up to a year ahead.' });
  if (recurrence && !RECURRENCES.has(recurrence)) return res.status(400).json({ error: 'Invalid repeat option.' });
  if (recurrence && !isValidTimeZone(timeZone)) return res.status(400).json({ error: 'Couldn’t tell your time zone — try again.' });

  try {
    if (voiceChannelId) {
      const channel = await getChannelById(voiceChannelId);
      if (!channel || channel.type !== 'voice' || !(await canAccessChannel(channel, userId, role))) {
        return res.status(400).json({ error: 'That voice channel isn’t available.' });
      }
    }

    let seriesId = null;
    let series = null;
    if (recurrence) {
      const { rows } = await pool.query(
        `INSERT INTO event_series (title, description, voice_channel_id, recurrence, time_zone, anchor_day, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [title, description, voiceChannelId, recurrence, timeZone, wallClockIn(startsAt, timeZone).day, userId]
      );
      series = rows[0];
      seriesId = series.id;
    }

    const { rows } = await pool.query(
      `INSERT INTO events (series_id, title, description, starts_at, voice_channel_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [seriesId, title, description, startsAt.toISOString(), voiceChannelId, userId]
    );
    const eventId = rows[0].id;
    // The person scheduling it is presumably going to the first one. Later
    // dates in a series start with a blank sign-in sheet.
    await pool.query(`INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, 'going')`, [eventId, userId]);
    if (series) await extendSeries(series);

    const io = req.app.get('io');
    io?.emit('events:changed');
    io?.emit('events:created', {
      eventId, title, startsAt: startsAt.toISOString(), recurrence, createdBy: username, createdById: userId,
    });

    const { rows: full } = await pool.query(`${EVENT_SELECT} WHERE e.id = $1`, [eventId]);
    res.status(201).json(full[0]);
  } catch (err) {
    console.error('createEvent error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ?scope=one (default) cancels just this date; ?scope=series ends a
// recurring event entirely, removing all its upcoming dates.
async function deleteEvent(req, res) {
  const { id: userId, role } = req.user;
  const scope = req.query.scope === 'series' ? 'series' : 'one';
  try {
    const { rows } = await pool.query('SELECT created_by, series_id FROM events WHERE id = $1', [req.params.eventId]);
    const ev = rows[0];
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    if (ev.created_by !== userId && role !== 'admin') {
      return res.status(403).json({ error: 'Only the person who scheduled it (or an admin) can cancel it.' });
    }

    if (scope === 'series' && ev.series_id) {
      await pool.query('UPDATE event_series SET ended_at = NOW() WHERE id = $1', [ev.series_id]);
      await pool.query('DELETE FROM events WHERE series_id = $1 AND starts_at > NOW()', [ev.series_id]);
    } else if (ev.series_id) {
      // Keep the row (marked cancelled) so the series doesn't regenerate it.
      await pool.query('UPDATE events SET cancelled_at = NOW() WHERE id = $1', [req.params.eventId]);
    } else {
      await pool.query('DELETE FROM events WHERE id = $1', [req.params.eventId]);
    }
    req.app.get('io')?.emit('events:changed');
    res.json({ success: true });
  } catch (err) {
    console.error('deleteEvent error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// status: 'going' | 'maybe' | 'no', or 'none' to clear your RSVP.
async function rsvpEvent(req, res) {
  const { id: userId } = req.user;
  const { status } = req.body;
  if (status !== 'none' && !RSVP_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid RSVP' });
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM events
       WHERE id = $1 AND cancelled_at IS NULL AND starts_at > NOW() - INTERVAL '${STILL_LISTED_AFTER_START}'`,
      [req.params.eventId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });

    if (status === 'none') {
      await pool.query('DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2', [req.params.eventId, userId]);
    } else {
      await pool.query(
        `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
        [req.params.eventId, userId, status]
      );
    }
    req.app.get('io')?.emit('events:changed');
    res.json({ success: true });
  } catch (err) {
    console.error('rsvpEvent error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { listEvents, createEvent, deleteEvent, rsvpEvent };
