const { pool } = require('../db');
const { nextOccurrence } = require('../utils/recurrence');

// Keeps each active recurring series stocked with dates far enough ahead
// that next week's date exists in time for its week-before check-in (see
// jobs/eventReminders.js). Run on series creation and every minute by the
// reminder job; it only ever inserts what's missing.
const STOCK_AHEAD_MS = 8 * 24 * 60 * 60 * 1000;

async function extendSeries(series) {
  // Latest date this series has, cancelled ones included — so a skipped
  // week isn't recreated.
  const { rows } = await pool.query('SELECT MAX(starts_at) AS last FROM events WHERE series_id = $1', [series.id]);
  if (!rows[0].last) return;
  let last = new Date(rows[0].last);
  const horizon = Date.now() + STOCK_AHEAD_MS;

  while (last.getTime() < horizon) {
    last = nextOccurrence(last, series.recurrence, series.time_zone, series.anchor_day);
    // If the server was down long enough that dates went by unscheduled,
    // skip ahead rather than creating events in the past.
    if (last.getTime() < Date.now()) continue;
    await pool.query(
      `INSERT INTO events (series_id, title, description, starts_at, voice_channel_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [series.id, series.title, series.description, last.toISOString(), series.voice_channel_id, series.created_by]
    );
  }
}

// Returns true if any series got a new date (so callers can tell clients
// to refresh).
async function extendAllSeries() {
  const { rows: before } = await pool.query('SELECT COUNT(*)::int AS n FROM events WHERE series_id IS NOT NULL');
  const { rows: series } = await pool.query('SELECT * FROM event_series WHERE ended_at IS NULL');
  for (const s of series) {
    try {
      await extendSeries(s);
    } catch (err) {
      console.error(`Event series ${s.id}: extend failed:`, err.message);
    }
  }
  const { rows: after } = await pool.query('SELECT COUNT(*)::int AS n FROM events WHERE series_id IS NOT NULL');
  return after[0].n !== before[0].n;
}

module.exports = { extendSeries, extendAllSeries };
