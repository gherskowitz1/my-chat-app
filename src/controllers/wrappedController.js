const { pool } = require('../db');
const { isValidTimeZone } = require('../utils/recurrence');

// Crows Nest Wrapped — a Spotify-Wrapped-style recap of one person's year
// (frontend: WrappedModal.jsx). Everything is computed on request from data
// the app already keeps, with the year's boundaries and the "busiest hour"
// taken in the viewer's own time zone (users.time_zone). Voice and game time
// only exist from when tracking started (voice_sessions/game_sessions), so
// those come back with a trackedSince date for the UI to be honest about.
//
// Cached per user+year for a while, since it's a couple dozen aggregate
// queries.
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map(); // `${userId}:${year}` -> { at, data }

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;

// SQL for "col falls within the year", in a time zone. Most queries pass
// ($1 user, $2 year, $3 zone); server-wide ones pass ($1 year, $2 zone) —
// pg rejects parameters a query doesn't reference, hence the two shapes.
function inYear(col, yearP = '$2', tzP = '$3') {
  return `${col} >= make_timestamptz(${yearP}::int, 1, 1, 0, 0, 0, ${tzP}::text)
      AND ${col} < make_timestamptz(${yearP}::int + 1, 1, 1, 0, 0, 0, ${tzP}::text)`;
}

const YEAR_START = 'make_timestamptz($2::int, 1, 1, 0, 0, 0, $3::text)';
const YEAR_END = 'make_timestamptz($2::int + 1, 1, 1, 0, 0, 0, $3::text)';
// Seconds of a voice/game stretch that fall inside the year.
const clipped = (t) => `GREATEST(0, EXTRACT(EPOCH FROM (
  LEAST(COALESCE(${t}.ended_at, NOW()), ${YEAR_END}) - GREATEST(${t}.started_at, ${YEAR_START}))))`;
const overlapsYear = (t) => `${t}.started_at < ${YEAR_END} AND COALESCE(${t}.ended_at, NOW()) > ${YEAR_START}`;

async function getWrapped(req, res) {
  const userId = req.user.id;
  const thisYear = new Date().getUTCFullYear();
  const year = req.query.year ? parseInt(req.query.year, 10) : thisYear;
  if (!Number.isInteger(year) || year < 2020 || year > thisYear) return res.status(400).json({ error: 'Invalid year' });

  const key = `${userId}:${year}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.data);

  try {
    const { rows: me } = await pool.query('SELECT username, time_zone FROM users WHERE id = $1', [userId]);
    if (!me[0]) return res.status(404).json({ error: 'User not found' });
    const tz = me[0].time_zone && isValidTimeZone(me[0].time_zone) ? me[0].time_zone : 'UTC';

    const mine = [userId, year, tz];
    const server = [year, tz];
    const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);

    const [
      [{ count: messagesSent }],
      [{ count: dmsSent }],
      topChannels,
      leaderboard,
      [{ count: serverMessages }],
      topDmPartner,
      replyBuddy,
      [{ count: reactionsGiven }],
      topReactionGiven,
      [{ count: reactionsReceived }],
      topReactionReceived,
      busiestHour,
      busiestWeekday,
      busiestDay,
      [{ count: pollVotes }],
      [{ count: eventsAttended }],
      contents,
      [voice],
      topVoiceChannel,
      topGames,
      [tracking],
    ] = await Promise.all([
      q(`SELECT COUNT(*)::int AS count FROM messages WHERE user_id = $1 AND ${inYear('created_at')}`, mine),
      q(`SELECT COUNT(*)::int AS count FROM dm_messages WHERE user_id = $1 AND ${inYear('created_at')}`, mine),
      q(`SELECT c.name, COUNT(*)::int AS count
         FROM messages m JOIN channels c ON c.id = m.channel_id
         WHERE m.user_id = $1 AND ${inYear('m.created_at')}
         GROUP BY c.name ORDER BY count DESC LIMIT 3`, mine),
      q(`SELECT m.user_id, u.username, u.avatar_color, u.avatar_url, COUNT(*)::int AS count
         FROM messages m JOIN users u ON u.id = m.user_id
         WHERE ${inYear('m.created_at', '$1', '$2')} AND u.username <> 'PatchBot'
         GROUP BY m.user_id, u.username, u.avatar_color, u.avatar_url
         ORDER BY count DESC`, server),
      q(`SELECT COUNT(*)::int AS count FROM messages WHERE ${inYear('created_at', '$1', '$2')}`, server),
      q(`SELECT u.username, u.avatar_color, u.avatar_url, COUNT(*)::int AS count
         FROM dm_messages dm
         JOIN dm_participants mine ON mine.conversation_id = dm.conversation_id AND mine.user_id = $1
         JOIN dm_participants other ON other.conversation_id = dm.conversation_id AND other.user_id <> $1
         JOIN users u ON u.id = other.user_id
         WHERE ${inYear('dm.created_at')}
         GROUP BY u.username, u.avatar_color, u.avatar_url ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT u.username, u.avatar_color, u.avatar_url, COUNT(*)::int AS count
         FROM messages m JOIN messages p ON p.id = m.reply_to_id JOIN users u ON u.id = p.user_id
         WHERE m.user_id = $1 AND p.user_id <> $1 AND ${inYear('m.created_at')}
         GROUP BY u.username, u.avatar_color, u.avatar_url ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT COUNT(*)::int AS count FROM message_reactions WHERE user_id = $1 AND ${inYear('created_at')}`, mine),
      q(`SELECT emoji, COUNT(*)::int AS count FROM message_reactions
         WHERE user_id = $1 AND ${inYear('created_at')}
         GROUP BY emoji ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT COUNT(*)::int AS count FROM message_reactions r JOIN messages m ON m.id = r.message_id
         WHERE m.user_id = $1 AND r.user_id <> $1 AND ${inYear('r.created_at')}`, mine),
      q(`SELECT r.emoji, COUNT(*)::int AS count FROM message_reactions r JOIN messages m ON m.id = r.message_id
         WHERE m.user_id = $1 AND r.user_id <> $1 AND ${inYear('r.created_at')}
         GROUP BY r.emoji ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE $3::text)::int AS hour, COUNT(*)::int AS count
         FROM messages WHERE user_id = $1 AND ${inYear('created_at')}
         GROUP BY hour ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT EXTRACT(DOW FROM created_at AT TIME ZONE $3::text)::int AS dow, COUNT(*)::int AS count
         FROM messages WHERE user_id = $1 AND ${inYear('created_at')}
         GROUP BY dow ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT to_char(created_at AT TIME ZONE $3::text, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM messages WHERE user_id = $1 AND ${inYear('created_at')}
         GROUP BY day ORDER BY count DESC LIMIT 1`, mine),
      q(`SELECT COUNT(*)::int AS count FROM poll_votes WHERE user_id = $1 AND ${inYear('created_at')}`, mine),
      q(`SELECT COUNT(*)::int AS count FROM event_rsvps r JOIN events e ON e.id = r.event_id
         WHERE r.user_id = $1 AND r.status = 'going' AND e.cancelled_at IS NULL
           AND e.starts_at < NOW() AND ${inYear('e.starts_at')}`, mine),
      q(`SELECT content FROM messages WHERE user_id = $1 AND ${inYear('created_at')}
         ORDER BY created_at DESC LIMIT 20000`, mine),
      q(`SELECT COALESCE(SUM(${clipped('vs')}), 0)::float AS seconds
         FROM voice_sessions vs WHERE vs.user_id = $1 AND ${overlapsYear('vs')}`, mine),
      q(`SELECT c.name, SUM(${clipped('vs')})::float AS seconds
         FROM voice_sessions vs JOIN channels c ON c.id = vs.channel_id
         WHERE vs.user_id = $1 AND ${overlapsYear('vs')}
         GROUP BY c.name ORDER BY seconds DESC LIMIT 1`, mine),
      q(`SELECT gs.game, SUM(${clipped('gs')})::float AS seconds
         FROM game_sessions gs WHERE gs.user_id = $1 AND ${overlapsYear('gs')}
         GROUP BY gs.game ORDER BY seconds DESC LIMIT 3`, mine),
      q(`SELECT LEAST((SELECT MIN(started_at) FROM voice_sessions), (SELECT MIN(started_at) FROM game_sessions)) AS since`, []),
    ]);

    // Favourite emoji typed into messages (reactions are counted separately).
    const emojiCounts = new Map();
    for (const { content } of contents) {
      for (const e of content.match(EMOJI_RE) || []) emojiCounts.set(e, (emojiCounts.get(e) || 0) + 1);
    }
    const topEmoji = [...emojiCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emoji, count]) => ({ emoji, count }));

    const rankIndex = leaderboard.findIndex((r) => r.user_id === userId);
    const toHours = (seconds) => Math.round((seconds / 3600) * 10) / 10;

    const data = {
      year,
      timeZone: tz,
      username: me[0].username,
      messagesSent,
      dmsSent,
      topChannels,
      serverMessages,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      memberCount: leaderboard.length,
      topMembers: leaderboard.slice(0, 5).map(({ user_id, ...rest }) => rest),
      topDmPartner: topDmPartner[0] || null,
      replyBuddy: replyBuddy[0] || null,
      reactionsGiven,
      topReactionGiven: topReactionGiven[0] || null,
      reactionsReceived,
      topReactionReceived: topReactionReceived[0] || null,
      topEmoji,
      busiestHour: busiestHour[0]?.hour ?? null,
      busiestWeekday: busiestWeekday[0]?.dow ?? null,
      busiestDay: busiestDay[0] || null,
      pollVotes,
      eventsAttended,
      voiceHours: toHours(voice.seconds),
      topVoiceChannel: topVoiceChannel[0]?.name || null,
      topGames: topGames.map((g) => ({ game: g.game, hours: toHours(g.seconds) })),
      trackedSince: tracking?.since || null,
    };
    cache.set(key, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('getWrapped error', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { getWrapped };
