// Invite emails carry the signup invite code (SIGNUP_CODE), and signup
// enforces it. The email service (Resend) is swapped for a stand-in that
// just records what would have been sent.
const sent = [];
require.cache[require.resolve('resend')] = {
  id: 'resend', filename: require.resolve('resend'), loaded: true,
  exports: { Resend: class { constructor() { this.emails = { send: async (msg) => { sent.push(msg); return {}; } }; } } },
};

const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, signup } = require('./helpers.cjs');

test('invite email includes the code in the link and the text; signup requires it', async () => {
  process.env.SIGNUP_CODE = 'test-code-123';
  const app = await startApp();
  try {
    // Signup needs the code now (the helper doesn't pass one).
    const noCode = await app.post('/auth/signup', { username: 'nocode', email: 'x@example.com', password: 'password123' });
    assert.equal(noCode.status, 403);
    assert.equal((await app.get('/auth/config')).data.signupCodeRequired, true);

    const gary = await signup(app, 'gary', { inviteCode: 'test-code-123' });
    // A username with HTML in it must not turn into markup in the email.
    await app.pool.query("UPDATE users SET username = '<b>gary</b>' WHERE username = 'gary'");
    const { rows: [row] } = await app.pool.query("SELECT * FROM users WHERE username = '<b>gary</b>'");
    const token = require('path').join(__dirname, '..', 'src', 'services', 'mfa.js');
    const session = require(token).signSession(row);

    const res = await app.post('/invite', { email: 'friend@example.com' }, session);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const mail = sent.at(-1);
    assert.equal(mail.to, 'friend@example.com');
    assert.match(mail.html, /mode=signup&amp;email=friend%40example\.com&amp;code=test-code-123/, 'code in the link');
    assert.match(mail.html, /Your invite code: <strong[^>]*>test-code-123<\/strong>/, 'code shown as text');
    assert.ok(mail.html.includes('&lt;b&gt;gary&lt;/b&gt;'), 'username escaped');
    assert.ok(!mail.html.includes('<b>gary</b>'));

    const ok = await app.post('/auth/signup', { username: 'friend', email: 'friend@example.com', password: 'password123', inviteCode: 'test-code-123' });
    assert.equal(ok.status, 200);
    assert.ok(gary.token);
  } finally {
    delete process.env.SIGNUP_CODE;
    await app.close();
  }
});

test('without an invite code, invites carry no code', async () => {
  delete process.env.SIGNUP_CODE;
  const app = await startApp();
  try {
    const gary = await signup(app, 'gary');
    await app.post('/invite', { email: 'friend@example.com' }, gary.token);
    const mail = sent.at(-1);
    assert.ok(!mail.html.includes('code='));
    assert.ok(!mail.html.includes('Your invite code'));
  } finally { await app.close(); }
});
