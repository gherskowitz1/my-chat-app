// Birthdays: setting one, and the 9am-local "happy birthday" post.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startApp, signup, SRC } = require('./helpers.cjs');

const fakeIo = () => {
  const sent = [];
  return { sent, to: () => ({ emit: (e, p) => sent.push({ e, p }) }), emit: () => {} };
};

test('setting and clearing a birthday, with validation', async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    assert.equal((await app.patch('/auth/birthday', { month: 2, day: 30 }, alice.token)).status, 400);
    assert.equal((await app.patch('/auth/birthday', { month: 13, day: 1 }, alice.token)).status, 400);
    assert.equal((await app.patch('/auth/birthday', { month: 2, day: 29 }, alice.token)).status, 200, 'leap-day birthdays are fine');
    assert.equal((await app.patch('/auth/birthday', { month: 3, day: 14 }, alice.token)).status, 200);
    const me = await app.get('/auth/me', alice.token);
    assert.equal(me.data.birthday_month, 3);
    assert.equal(me.data.birthday_day, 14);
    const bob = await signup(app, 'bob');
    const users = await app.get('/users', bob.token);
    assert.equal(users.data.find((u) => u.username === 'alice').birthday_day, 14, 'others can see it');
    assert.equal((await app.patch('/auth/birthday', { month: null, day: null }, alice.token)).status, 200);
    assert.equal((await app.get('/auth/me', alice.token)).data.birthday_month, null);
  } finally { await app.close(); }
});

test('posts at 9am in the person’s own time zone, once a year', async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    await app.patch('/auth/birthday', { month: 3, day: 14 }, alice.token);
    await app.pool.query("UPDATE users SET time_zone = 'Asia/Tokyo' WHERE username = 'alice'");
    const { announceBirthdays } = require(path.join(SRC, 'jobs', 'birthdays.js'));
    const io = fakeIo();

    // 8:30am Mar 14 in Tokyo — too early.
    assert.equal(await announceBirthdays(io, new Date('2027-03-13T23:30:00Z')), 0);
    // 9:30am Mar 14 in Tokyo (still Mar 13 in New York) — posts.
    assert.equal(await announceBirthdays(io, new Date('2027-03-14T00:30:00Z')), 1);
    // Later the same day — not again.
    assert.equal(await announceBirthdays(io, new Date('2027-03-14T05:00:00Z')), 0);

    const { rows } = await app.pool.query("SELECT content FROM messages WHERE content LIKE '%Happy birthday%'");
    assert.equal(rows.length, 1);
    assert.match(rows[0].content, /@alice/);
    assert.equal(io.sent[0].e, 'message:new');

    // Next year it posts again.
    assert.equal(await announceBirthdays(io, new Date('2028-03-14T01:00:00Z')), 1);
  } finally { await app.close(); }
});

test('Feb 29 birthdays are celebrated on Feb 28 in non-leap years', () => {
  const { birthdayYearNow } = require(path.join(SRC, 'jobs', 'birthdays.js'));
  const leapling = { birthday_month: 2, birthday_day: 29, time_zone: 'UTC' };
  assert.equal(birthdayYearNow(leapling, new Date('2027-02-28T10:00:00Z')), 2027);
  assert.equal(birthdayYearNow(leapling, new Date('2028-02-28T10:00:00Z')), null, '2028 is a leap year');
  assert.equal(birthdayYearNow(leapling, new Date('2028-02-29T10:00:00Z')), 2028);
});

test('hidden accounts and people without a birthday are skipped', async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    await signup(app, 'ghost');
    await app.pool.query("UPDATE users SET birthday_month = 3, birthday_day = 14, invisible = true WHERE username = 'ghost'");
    const { announceBirthdays } = require(path.join(SRC, 'jobs', 'birthdays.js'));
    assert.equal(await announceBirthdays(fakeIo(), new Date('2027-03-14T15:00:00Z')), 0);
  } finally { await app.close(); }
});
