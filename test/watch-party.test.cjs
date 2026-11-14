// Watch together — the synced state the server keeps per voice channel,
// exercised over real socket connections.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const { startApp, signup, SRC } = require('./helpers.cjs');
const { Server } = require('socket.io');
const { io: connect } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'socket.io-client'));

const VOICE = '00000000-0000-0000-0000-000000000003';
const TEXT = '00000000-0000-0000-0000-000000000001';

async function withSockets(fn) {
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
  try { await fn(open); } finally {
    clients.forEach((c) => c.close());
    io.close();
    await new Promise((r) => server.close(r));
  }
}

// Waits for the next watch:state (or error) on a client.
const next = (client, event = 'watch:state') => new Promise((resolve) => client.once(event, resolve));
// Each socket gets broadcasts on its own schedule, so wait for the state
// we expect rather than just the next one.
const until = (client, pred) => new Promise((resolve) => {
  const h = (st) => { if (pred(st)) { client.off('watch:state', h); resolve(st); } };
  client.on('watch:state', h);
});

test('parsing YouTube links', () => {
  const { parseVideoId } = require(path.join(SRC, 'socket', 'watchParty.js'));
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://vimeo.com/123'), null);
  assert.equal(parseVideoId('<script>'), null);
});

test('start, pause, seek, play and stop are shared with everyone watching', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    const sam = await signup(app, 'sam');
    await withSockets(async (open) => {
      const g = await open(gary.token);
      const s = await open(sam.token);
      g.emit('watch:join', { channelId: VOICE });
      assert.equal((await next(g)).party, null, 'nothing playing yet');
      s.emit('watch:join', { channelId: VOICE });
      await next(s);

      const started = next(s);
      g.emit('watch:start', { channelId: VOICE, url: 'https://youtu.be/dQw4w9WgXcQ' });
      const st1 = await started;
      assert.equal(st1.party.videoId, 'dQw4w9WgXcQ');
      assert.equal(st1.party.playing, true);
      assert.equal(st1.party.startedByName, 'gary');

      const paused = until(g, (st) => st.party?.playing === false);
      s.emit('watch:control', { channelId: VOICE, action: 'pause', position: 42 });
      const st2 = await paused;
      assert.equal(st2.party.playing, false);
      assert.equal(st2.party.position, 42);
      assert.equal(st2.party.lastActionBy, 'sam');

      const sought = until(g, (st) => st.party?.position === 90);
      s.emit('watch:control', { channelId: VOICE, action: 'seek', position: 90 });
      assert.equal((await sought).party.position, 90);

      const resumed = until(s, (st) => st.party?.playing === true && st.party.position === 90);
      g.emit('watch:control', { channelId: VOICE, action: 'play' });
      const st4 = await resumed;
      assert.equal(st4.party.playing, true);
      assert.equal(st4.party.position, 90, 'resumes from where it was paused');

      // Someone joining late gets the current state straight away.
      const late = await open(gary.token);
      late.emit('watch:join', { channelId: VOICE });
      assert.equal((await next(late)).party.videoId, 'dQw4w9WgXcQ');

      const stopped = until(s, (st) => st.party === null);
      g.emit('watch:stop', { channelId: VOICE });
      assert.equal((await stopped).party, null);
    });
  } finally {
    require(path.join(SRC, 'socket', 'watchParty.js'))._parties.clear();
    await app.close();
  }
});

test('bad links are rejected; you must join first; only voice channels you can see', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    const mallory = await signup(app, 'mallory');
    const { rows: [priv] } = await app.pool.query(
      "INSERT INTO channels (server_id, name, type, is_private) VALUES ('00000000-0000-0000-0000-000000000001', 'secret voice', 'voice', true) RETURNING id"
    );
    await withSockets(async (open) => {
      const g = await open(gary.token);
      g.emit('watch:join', { channelId: VOICE });
      await next(g);
      const err = next(g, 'watch:error');
      g.emit('watch:start', { channelId: VOICE, url: 'https://vimeo.com/123' });
      assert.match((await err).error, /YouTube/);

      const m = await open(mallory.token);
      // Never joined: controls are ignored.
      m.emit('watch:start', { channelId: VOICE, url: 'https://youtu.be/dQw4w9WgXcQ' });
      // Text channels and private voice channels can't be joined.
      let heard = false;
      m.on('watch:state', () => { heard = true; });
      m.emit('watch:join', { channelId: TEXT });
      m.emit('watch:join', { channelId: priv.id });
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(heard, false);
      const { _parties } = require(path.join(SRC, 'socket', 'watchParty.js'));
      assert.equal(_parties.size, 0, "mallory's start was ignored");
    });
  } finally { await app.close(); }
});
