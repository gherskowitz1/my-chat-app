const { pool } = require('../db');
const { wallClockIn, isValidTimeZone } = require('../utils/recurrence');
const { notifyChannel, PATCHBOT_USER_ID } = require('./patchBot');

// Posts "🎉 Happy birthday @sam!" in #general on someone's birthday, at 9am
// *their* time (users.time_zone, reported by their device), once a year.
// If the server is down at 9, it posts whenever it's next up that day.
// Feb 29 birthdays are celebrated on Feb 28 in non-leap years.
const CHECK_EVERY_MS = 10 * 60 * 1000;
const POST_HOUR = 9;
const GENERAL_CHANNEL_ID = '00000000-0000-0000-0000-000000000001';
const FALLBACK_TIME_ZONE = 'America/New_York';

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Is it this person's birthday, 9am or later, where they are? Returns the
// local year if so (to record that it's been announced), else null.
function birthdayYearNow(user, now = new Date()) {
  const tz = user.time_zone && isValidTimeZone(user.time_zone) ? user.time_zone : FALLBACK_TIME_ZONE;
  const local = wallClockIn(now, tz);
  let { birthday_month: month, birthday_day: day } = user;
  if (month === 2 && day === 29 && !isLeap(local.year)) day = 28;
  if (local.month !== month || local.day !== day || local.hour < POST_HOUR) return null;
  return local.year;
}

async function announceBirthdays(io, now = new Date()) {
  const { rows: users } = await pool.query(
    `SELECT id, username, time_zone, birthday_month, birthday_day, birthday_announced_year
     FROM users WHERE birthday_month IS NOT NULL AND birthday_day IS NOT NULL AND NOT invisible`
  );
  const { rows: [channel] } = await pool.query('SELECT id, name, is_private FROM channels WHERE id = $1', [GENERAL_CHANNEL_ID]);
  if (!channel) return 0;

  let posted = 0;
  for (const user of users) {
    const year = birthdayYearNow(user, now);
    if (year === null || user.birthday_announced_year === year) continue;
    // Claim it first, so it can't double-post even if two checks overlap.
    const { rowCount } = await pool.query(
      'UPDATE users SET birthday_announced_year = $1 WHERE id = $2 AND birthday_announced_year IS DISTINCT FROM $1',
      [year, user.id]
    );
    if (!rowCount) continue;

    const content = `🎉 Happy birthday @${user.username}! 🎂🥳`;
    const { rows } = await pool.query(
      `WITH inserted AS (
         INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3)
         RETURNING id, channel_id, content, created_at, user_id
       )
       SELECT inserted.*, u.username, u.avatar_color, u.avatar_url
       FROM inserted JOIN users u ON u.id = inserted.user_id`,
      [channel.id, PATCHBOT_USER_ID, content]
    );
    io.to(`channel:${channel.id}`).emit('message:new', rows[0]);
    await notifyChannel(io, channel, content);
    posted++;
  }
  return posted;
}

function startBirthdays(io) {
  const run = () => announceBirthdays(io).catch((err) => console.error('Birthdays: check failed:', err.message));
  run();
  setInterval(run, CHECK_EVERY_MS);
}

module.exports = { startBirthdays, announceBirthdays, birthdayYearNow };
