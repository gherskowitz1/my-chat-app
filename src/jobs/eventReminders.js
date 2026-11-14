const { pool } = require('../db');
const { emitToUser, isOnline } = require('../socket');
const { sendPushToUser } = require('../utils/push');
const { extendAllSeries } = require('../services/eventSeries');

// Runs every minute and handles the timed parts of Game Night events:
//  1. stocks recurring series with their upcoming dates (services/eventSeries.js)
//  2. the week-before check-in — a week ahead of each date, everyone who
//     hasn't answered for *that* date is asked "are you in?" (a fresh
//     sign-in sheet per date, not one answer for the whole series)
//  3. the reminder ~15 minutes before, to everyone Going or Maybe
// In-app pop-up if they have the app open, push notification if not. Each
// step claims its events with UPDATE ... RETURNING so nothing is sent twice.
const CHECK_EVERY_MS = 60 * 1000;
const REMIND_BEFORE = '15 minutes';
// Don't fire reminders for events that already started a while ago (e.g.
// after the server was down over an event's start time).
const TOO_LATE = '5 minutes';
const CHECKIN_BEFORE = '7 days';

const formatWhen = (startsAt, timeZone) => new Date(startsAt).toLocaleString('en-US', {
  timeZone: timeZone || 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

async function sendCheckIns(io) {
  // Only events scheduled well ahead get a check-in — one created just a
  // few days out was already announced to everyone when it was made.
  const { rows: events } = await pool.query(
    `UPDATE events e SET checkin_sent_at = NOW()
     FROM (
       SELECT id FROM events
       WHERE checkin_sent_at IS NULL
         AND cancelled_at IS NULL
         AND starts_at <= NOW() + INTERVAL '${CHECKIN_BEFORE}'
         AND starts_at > NOW() + INTERVAL '1 hour'
         AND created_at <= starts_at - INTERVAL '6 days'
     ) due
     WHERE e.id = due.id
     RETURNING e.id, e.title, e.starts_at,
       (SELECT name FROM channels WHERE id = e.voice_channel_id) AS voice_channel_name,
       (SELECT time_zone FROM event_series WHERE id = e.series_id) AS time_zone`
  );

  for (const ev of events) {
    const { rows: unanswered } = await pool.query(
      `SELECT u.id, u.time_zone FROM users u
       WHERE NOT EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = $1 AND r.user_id = u.id)`,
      [ev.id]
    );
    for (const { id: userId, time_zone: userTimeZone } of unanswered) {
      emitToUser(io, userId, 'notify:eventCheckin', {
        eventId: ev.id, title: ev.title, startsAt: ev.starts_at, voiceChannelName: ev.voice_channel_name,
      });
      if (!isOnline(userId)) {
        sendPushToUser(pool, userId, {
          title: `📅 Are you in for ${ev.title}?`,
          // In their own time zone — "Sat 12:00 PM" in Tokyo for a NY
          // Friday-night event. Falls back to the scheduler's zone if their
          // device hasn't reported one yet.
          body: `${formatWhen(ev.starts_at, userTimeZone || ev.time_zone)} — open Game Night to sign in`,
        }).catch((err) => console.error('event check-in push error', err));
      }
    }
  }
}

async function sendReminders(io) {
  const { rows: events } = await pool.query(
    `UPDATE events e SET reminded_at = NOW()
     FROM (
       SELECT id FROM events
       WHERE reminded_at IS NULL
         AND cancelled_at IS NULL
         AND starts_at <= NOW() + INTERVAL '${REMIND_BEFORE}'
         AND starts_at > NOW() - INTERVAL '${TOO_LATE}'
     ) due
     WHERE e.id = due.id
     RETURNING e.id, e.title, e.starts_at,
       (SELECT name FROM channels WHERE id = e.voice_channel_id) AS voice_channel_name`
  );

  for (const ev of events) {
    const { rows: rsvps } = await pool.query(
      `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND status IN ('going', 'maybe')`,
      [ev.id]
    );
    const minutes = Math.max(0, Math.round((new Date(ev.starts_at) - Date.now()) / 60000));
    const when = minutes === 0 ? 'is starting now' : `starts in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    const where = ev.voice_channel_name ? ` — join ${ev.voice_channel_name}` : '';

    for (const { user_id } of rsvps) {
      emitToUser(io, user_id, 'notify:event', {
        eventId: ev.id, title: ev.title, startsAt: ev.starts_at, voiceChannelName: ev.voice_channel_name,
      });
      if (!isOnline(user_id)) {
        sendPushToUser(pool, user_id, { title: `📅 ${ev.title} ${when}`, body: `Game Night${where}` })
          .catch((err) => console.error('event reminder push error', err));
      }
    }
  }
}

async function tick(io) {
  // Each step separately, so one failing doesn't stop the others.
  try {
    if (await extendAllSeries()) io.emit('events:changed');
  } catch (err) {
    console.error('Event series: extend failed:', err.message);
  }
  try {
    await sendCheckIns(io);
  } catch (err) {
    console.error('Event check-ins: failed:', err.message);
  }
  try {
    await sendReminders(io);
  } catch (err) {
    console.error('Event reminders: failed:', err.message);
  }
}

function startEventReminders(io) {
  tick(io);
  setInterval(() => tick(io), CHECK_EVERY_MS);
}

// runOnce: one pass of the job, for the automated tests.
module.exports = { startEventReminders, runOnce: tick };
