// "Jump in": steam:// links built from Steam's player data, and the
// profile endpoint that hands them to the card.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startApp, signup, SRC } = require('./helpers.cjs');

test('join links: lobby, server, or nothing — and nothing that isn’t strictly valid', () => {
  const { joinUrlFor } = require(path.join(SRC, 'services', 'steamPlayers.js'));
  const base = { steamid: '76561198000000001', gameid: '553850' };
  assert.equal(joinUrlFor({ ...base, lobbysteamid: '109775241000000001' }),
    'steam://joinlobby/553850/109775241000000001/76561198000000001');
  assert.equal(joinUrlFor({ ...base, gameserverip: '203.0.113.7:27015' }), 'steam://connect/203.0.113.7:27015');
  assert.equal(joinUrlFor(base), null, 'playing, but nothing joinable');
  assert.equal(joinUrlFor({ ...base, gameserverip: '0.0.0.0:0' }), null);
  assert.equal(joinUrlFor({ steamid: base.steamid, lobbysteamid: '109775241000000001' }), null, 'no app id');
  // Anything odd is dropped rather than passed through into a clickable link.
  assert.equal(joinUrlFor({ ...base, lobbysteamid: '1097752410/../../evil' }), null);
  assert.equal(joinUrlFor({ ...base, gameserverip: 'evil.com:80"onclick=' }), null);
  assert.equal(joinUrlFor({ ...base, gameid: '553850; rm -rf' , lobbysteamid: '109775241000000001' }), null);
});

test('profile endpoint returns what they are playing, with the join link', async () => {
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    await signup(app, 'sam');
    await app.pool.query(
      `UPDATE users SET steam_id = '76561198000000001', current_game = 'HELLDIVERS™ 2', current_game_appid = 553850,
         current_game_join = 'steam://joinlobby/553850/109775241000000001/76561198000000001'
       WHERE username = 'sam'`
    );
    const { rows: [sam] } = await app.pool.query("SELECT id FROM users WHERE username = 'sam'");
    const res = await app.get(`/users/${sam.id}/recent-games`, gary.token);
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.nowPlaying, {
      game: 'HELLDIVERS™ 2', appId: 553850, steamId: '76561198000000001',
      joinUrl: 'steam://joinlobby/553850/109775241000000001/76561198000000001',
    });

    // Unlinking Steam clears it all.
    const { rows: [samRow] } = await app.pool.query("SELECT * FROM users WHERE username = 'sam'");
    const mfa = require(path.join(SRC, 'services', 'mfa.js'));
    const samToken = mfa.signSession(samRow);
    assert.equal((await app.patch('/auth/steam-id', { steamId: null }, samToken)).status, 200);
    const after = await app.get(`/users/${sam.id}/recent-games`, gary.token);
    assert.equal(after.data.nowPlaying, null);
  } finally { await app.close(); }
});
