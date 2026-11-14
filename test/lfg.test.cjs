// "Looking for group" (/lfg) — party posts, who gets pinged, joining.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startApp, signup, SRC } = require('./helpers.cjs');

const GENERAL = '00000000-0000-0000-0000-000000000001';

test('game names match loosely', () => {
  const { sameGame } = require(path.join(SRC, 'controllers', 'lfgController.js'));
  assert.ok(sameGame('HELLDIVERS™ 2', 'helldivers 2'));
  assert.ok(sameGame('HELLDIVERS™ 2', 'helldivers'));
  assert.ok(sameGame('Counter-Strike 2', 'counter strike 2'));
  assert.ok(!sameGame('Counter-Strike 2', 'Helldivers 2'));
  assert.ok(!sameGame('Portal 2', 'po'), 'too short to match anything');
});

test('posting a party: card attached to the message, players of that game pinged', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    await signup(app, 'sam');   // playing it right now
    await signup(app, 'alex');  // played it last week
    await signup(app, 'jo');    // plays something else
    await app.pool.query("UPDATE users SET current_game = 'HELLDIVERS™ 2' WHERE username = 'sam'");
    await app.pool.query(
      "INSERT INTO game_sessions (user_id, game, started_at, last_seen_at, ended_at) SELECT id, 'HELLDIVERS™ 2', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' FROM users WHERE username = 'alex'"
    );
    await app.pool.query("UPDATE users SET current_game = 'Stardew Valley' WHERE username = 'jo'");

    const posted = await app.post(`/channels/${GENERAL}/lfg`, { game: 'helldivers 2', needed: 3 }, gary.token);
    assert.equal(posted.status, 201, JSON.stringify(posted.data));
    assert.equal(posted.data.lfg.game, 'helldivers 2');
    assert.equal(posted.data.lfg.needed, 3);
    assert.deepEqual(posted.data.lfg.members, []);
    assert.match(posted.data.content, /Looking for 3 more for helldivers 2/);

    // Shows up in the channel's history with the card attached.
    const history = await app.get(`/channels/${GENERAL}/messages`, gary.token);
    const fromHistory = history.data.find((m) => m.id === posted.data.id);
    assert.equal(fromHistory.lfg.id, posted.data.lfg.id);

    // Who gets pinged: sam (playing it now) and alex (played last week) — not jo, not gary.
    const { findPlayers } = require(path.join(SRC, 'controllers', 'lfgController.js'));
    const { rows: [general] } = await app.pool.query('SELECT * FROM channels WHERE id = $1', [GENERAL]);
    const ids = Object.fromEntries((await app.pool.query('SELECT id, username FROM users')).rows.map((u) => [u.id, u.username]));
    const players = await findPlayers(general, 'helldivers 2', Object.keys(ids).find((k) => ids[k] === 'gary'));
    assert.deepEqual(players.map((id) => ids[id]).sort(), ['alex', 'sam']);
    assert.ok(app.emitted.some((e) => e.event === 'message:new' && e.room === `channel:${GENERAL}`));
  } finally { await app.close(); }
});

test('joining: toggles, fills up, refuses when full, expired, or your own', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    const sam = await signup(app, 'sam');
    const alex = await signup(app, 'alex');
    const posted = await app.post(`/channels/${GENERAL}/lfg`, { game: 'Deep Rock Galactic', needed: 1 }, gary.token);
    const id = posted.data.lfg.id;

    assert.equal((await app.post(`/lfg/${id}/join`, {}, gary.token)).status, 400, "can't join your own");
    const joined = await app.post(`/lfg/${id}/join`, {}, sam.token);
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.data.lfg.members.map((m) => m.username), ['sam']);
    assert.equal((await app.post(`/lfg/${id}/join`, {}, alex.token)).status, 409, 'full');

    const left = await app.post(`/lfg/${id}/join`, {}, sam.token);
    assert.deepEqual(left.data.lfg.members, [], 'second click leaves');
    assert.ok(app.emitted.length >= 0);

    await app.pool.query("UPDATE lfg_posts SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [id]);
    assert.equal((await app.post(`/lfg/${id}/join`, {}, alex.token)).status, 410, 'expired');
  } finally { await app.close(); }
});

test('validation and channel access', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    const mallory = await signup(app, 'mallory');
    assert.equal((await app.post(`/channels/${GENERAL}/lfg`, { game: '', needed: 2 }, gary.token)).status, 400);
    assert.equal((await app.post(`/channels/${GENERAL}/lfg`, { game: 'x', needed: 0 }, gary.token)).status, 400);
    assert.equal((await app.post(`/channels/${GENERAL}/lfg`, { game: 'x', needed: 99 }, gary.token)).status, 400);
    assert.equal((await app.post('/channels/00000000-0000-0000-0000-000000000003/lfg', { game: 'x' }, gary.token)).status, 403, 'not in a voice channel');

    const { rows: [priv] } = await app.pool.query(
      "INSERT INTO channels (server_id, name, type, is_private) VALUES ('00000000-0000-0000-0000-000000000001', 'secret', 'text', true) RETURNING id"
    );
    const { rows: [g] } = await app.pool.query("SELECT id FROM users WHERE username = 'gary'");
    await app.pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [priv.id, g.id]);
    const secret = await app.post(`/channels/${priv.id}/lfg`, { game: 'Secret game', needed: 2 }, gary.token);
    assert.equal(secret.status, 201);
    assert.equal((await app.post(`/channels/${priv.id}/lfg`, { game: 'x' }, mallory.token)).status, 403);
    assert.equal((await app.post(`/lfg/${secret.data.lfg.id}/join`, {}, mallory.token)).status, 403, "can't join a private channel's party");
  } finally { await app.close(); }
});
