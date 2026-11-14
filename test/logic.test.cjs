// Pure logic with no database: date math, authenticator codes, and the
// frontend's spoiler / slash-command / holiday helpers (ES modules, loaded
// with dynamic import).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const SRC = path.join(__dirname, '..', 'src');
const FRONT = path.join(__dirname, '..', 'frontend', 'src', 'utils');
const front = (file) => import(pathToFileURL(path.join(FRONT, file)).href);

const { nextOccurrence, wallClockIn } = require(path.join(SRC, 'utils', 'recurrence.js'));
const totp = require(path.join(SRC, 'utils', 'totp.js'));

const inZone = (date, tz) => {
  const w = wallClockIn(date, tz);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')} ${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
};

test('weekly series keeps 10pm local across both DST changes', () => {
  const tz = 'America/New_York';
  let d = new Date('2026-10-24T02:00:00Z'); // Fri Oct 23, 10pm EDT
  const seen = [];
  for (let i = 0; i < 4; i++) { seen.push(inZone(d, tz)); d = nextOccurrence(d, 'weekly', tz); }
  assert.deepEqual(seen, ['2026-10-23 22:00', '2026-10-30 22:00', '2026-11-06 22:00', '2026-11-13 22:00']);
  d = new Date('2027-03-06T03:00:00Z'); // Fri Mar 5, 10pm EST
  d = nextOccurrence(nextOccurrence(d, 'weekly', tz), 'weekly', tz);
  assert.equal(inZone(d, tz), '2027-03-19 22:00');
});

test('monthly series on the 31st clamps, then returns to the 31st', () => {
  const tz = 'America/New_York';
  let d = new Date('2027-01-31T23:00:00Z');
  const anchor = wallClockIn(d, tz).day;
  const days = [];
  for (let i = 0; i < 4; i++) { days.push(wallClockIn(d, tz).day); d = nextOccurrence(d, 'monthly', tz, anchor); }
  assert.deepEqual(days, [31, 28, 31, 30]);
});

test('every-two-weeks crosses the new year', () => {
  const tz = 'UTC';
  const d = nextOccurrence(new Date('2026-12-25T22:00:00Z'), 'biweekly', tz);
  assert.equal(d.toISOString(), '2027-01-08T22:00:00.000Z');
});

test('authenticator codes match the RFC 6238 test vectors', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  for (const [t, code] of [[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [20000000000, '65353130']]) {
    assert.equal(totp.codeAtStep(secret, Math.floor(t / 30), 8), code);
  }
});

test('authenticator: drift window, formatting, encryption round trip', () => {
  const s = totp.generateSecret();
  const now = Date.now();
  const code = totp.codeAtStep(s, totp.currentStep(now));
  assert.notEqual(totp.verifyCode(s, code, now + 30000), null, 'one step late still ok');
  assert.equal(totp.verifyCode(s, code, now + 120000), null, 'too old');
  assert.notEqual(totp.verifyCode(s, `${code.slice(0, 3)} ${code.slice(3)}`, now), null);
  assert.equal(totp.decryptSecret(totp.encryptSecret(s)), s);
});

test('spoilers are masked and stripped', async () => {
  const { maskSpoilers, stripSpoilers, SPOILER_RE } = await front('spoilers.js');
  assert.equal(maskSpoilers('the ||twist|| was good'), 'the ▒▒▒▒▒ was good');
  assert.equal(maskSpoilers('a || b'), 'a || b', 'lone bars are left alone');
  assert.equal(stripSpoilers('watch ||https://x.com/a|| now'), 'watch   now');
  assert.deepEqual('x ||a|| y'.split(new RegExp(SPOILER_RE.source)), ['x ', 'a', ' y']);
});

test('slash commands', async () => {
  const { runSlashCommand } = await front('slashCommands.js');
  assert.deepEqual(runSlashCommand('/shrug ok', { isDM: false }), { send: 'ok ¯\\_(ツ)_/¯' });
  assert.deepEqual(runSlashCommand('/me waves', { isDM: false }), { send: '_waves_' });
  assert.ok(runSlashCommand('/me', { isDM: false }).error);
  assert.match(runSlashCommand('/roll 2d6', { isDM: false }).send, /^🎲 rolled 2d6: \d \+ \d = \*\*\d+\*\*$/);
  assert.ok(runSlashCommand('/roll 99d6', { isDM: false }).error);
  assert.deepEqual(runSlashCommand('/gif cats', { isDM: false }), { action: 'gif', query: 'cats' });
  assert.equal(runSlashCommand('/poll', { isDM: true }), null, 'no polls in DMs');
  assert.equal(runSlashCommand('/r/gaming', { isDM: false }), null, 'not a command — sent as typed');
});

test('holiday theme windows', async () => {
  const { getActiveHoliday } = await front('seasonal.js');
  const at = (y, m, d) => getActiveHoliday(new Date(y, m - 1, d, 12))?.id ?? null;
  assert.equal(at(2026, 10, 31), 'halloween');
  assert.equal(at(2026, 11, 26), 'thanksgiving');
  assert.equal(at(2026, 12, 26), 'christmas', 'nearer than New Year');
  assert.equal(at(2026, 12, 28), 'newyear');
  assert.equal(at(2027, 3, 28), 'easter');
  assert.equal(at(2026, 6, 1), null);
  // First candle the evening of Dec 4, 2026 — the menorah shows tonight's count.
  assert.equal(getActiveHoliday(new Date(2026, 11, 4, 12)).night, 1);
  assert.equal(getActiveHoliday(new Date(2026, 11, 8, 12)).night, 5);
});
