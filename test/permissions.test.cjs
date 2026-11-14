// Access control through the live socket connection — e.g. the reaction
// trust gap fixed in f61ddc2: a reaction's channel/conversation must come
// from the message itself, not from what the client claims.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const { startApp, signup, SRC } = require('./helpers.cjs');
const { Server } = require('socket.io');
const { io: connect } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'socket.io-client'));

async function withSockets(app, fn) {
  const server = http.createServer();
  const io = new Server(server);
  require(path.join(SRC, 'socket')).setupSocket(io);
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  const open = (token) => new Promise((resolve, reject) => {
    const c = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    clients.push(c);
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
  try {
    await fn(open);
  } finally {
    clients.forEach((c) => c.close());
    io.close();
    await new Promise((r) => server.close(r));
  }
}

const settle = () => new Promise((r) => setTimeout(r, 300));

test("can't react to a private channel's message by naming a public channel", async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    const mallory = await signup(app, 'mallory');
    const { rows: [priv] } = await app.pool.query(
      `INSERT INTO channels (server_id, name, type, is_private)
       VALUES ('00000000-0000-0000-0000-000000000001', 'secret', 'text', true) RETURNING id`
    );
    const { rows: [aliceRow] } = await app.pool.query("SELECT id FROM users WHERE username = 'alice'");
    await app.pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [priv.id, aliceRow.id]);
    const { rows: [msg] } = await app.pool.query(
      "INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, 'top secret') RETURNING id", [priv.id, aliceRow.id]
    );

    await withSockets(app, async (open) => {
      const m = await open(mallory.token);
      // Claims the message is in #general, which mallory can see.
      m.emit('message:react', { messageId: msg.id, channelId: '00000000-0000-0000-0000-000000000001', emoji: '😈' });
      await settle();
      const { rows } = await app.pool.query('SELECT COUNT(*)::int AS n FROM message_reactions WHERE message_id = $1', [msg.id]);
      assert.equal(rows[0].n, 0, 'reaction refused');

      // Alice, who's a member, can react.
      const a = await open(alice.token);
      a.emit('message:react', { messageId: msg.id, emoji: '👍' });
      await settle();
      const { rows: ok } = await app.pool.query('SELECT COUNT(*)::int AS n FROM message_reactions WHERE message_id = $1', [msg.id]);
      assert.equal(ok[0].n, 1);
    });
  } finally { await app.close(); }
});

test("can't react to someone else's DM by naming your own conversation", async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    await signup(app, 'bob');
    const mallory = await signup(app, 'mallory');
    const ids = Object.fromEntries((await app.pool.query('SELECT id, username FROM users')).rows.map((u) => [u.username, u.id]));
    const mkConv = async (x, y) => {
      const { rows: [c] } = await app.pool.query('INSERT INTO dm_conversations DEFAULT VALUES RETURNING id');
      await app.pool.query('INSERT INTO dm_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [c.id, x, y]);
      return c.id;
    };
    const aliceBob = await mkConv(ids.alice, ids.bob);
    const malloryBob = await mkConv(ids.mallory, ids.bob);
    const { rows: [dm] } = await app.pool.query(
      "INSERT INTO dm_messages (conversation_id, user_id, content) VALUES ($1, $2, 'private') RETURNING id", [aliceBob, ids.alice]
    );

    await withSockets(app, async (open) => {
      const m = await open(mallory.token);
      m.emit('dm:react', { messageId: dm.id, conversationId: malloryBob, emoji: '😈' });
      await settle();
      const { rows } = await app.pool.query('SELECT COUNT(*)::int AS n FROM dm_message_reactions WHERE message_id = $1', [dm.id]);
      assert.equal(rows[0].n, 0);
    });
  } finally { await app.close(); }
});

test("can't edit or delete someone else's message", async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    const mallory = await signup(app, 'mallory');
    const { rows: [a] } = await app.pool.query("SELECT id FROM users WHERE username = 'alice'");
    const { rows: [msg] } = await app.pool.query(
      "INSERT INTO messages (channel_id, user_id, content) VALUES ('00000000-0000-0000-0000-000000000001', $1, 'original') RETURNING id", [a.id]
    );
    await withSockets(app, async (open) => {
      const m = await open(mallory.token);
      m.emit('message:edit', { messageId: msg.id, content: 'hacked' });
      m.emit('message:delete', { messageId: msg.id });
      await settle();
      const { rows } = await app.pool.query('SELECT content FROM messages WHERE id = $1', [msg.id]);
      assert.equal(rows[0]?.content, 'original');
    });
  } finally { await app.close(); }
});

test('a removed device can no longer open a live connection', async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    await app.pool.query('DELETE FROM trusted_devices');
    await withSockets(app, async (open) => {
      await assert.rejects(open(alice.token), /Session expired/);
    });
  } finally { await app.close(); }
});
