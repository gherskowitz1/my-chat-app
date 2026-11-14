// Two-step sign-in: emailed codes, trusted devices, the authenticator app,
// backup codes, and the admin rescue — end to end through the real routes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { startApp, signup, SRC } = require('./helpers.cjs');
const totp = require(path.join(SRC, 'utils', 'totp.js'));

const login = (app, username, deviceToken) =>
  app.post('/auth/login', { email: `${username}@example.com`, password: 'password123', deviceToken, deviceLabel: 'Other device' });

test('signup trusts the signup device; that device signs in without a code', async () => {
  const app = await startApp();
  try {
    const s = await signup(app, 'alice');
    assert.match(s.deviceToken, /^[0-9a-f]{64}$/);
    const res = await login(app, 'alice', s.deviceToken);
    assert.equal(res.status, 200);
    assert.ok(res.data.token, 'got a session straight away');
    assert.equal(res.data.mfaRequired, undefined);
  } finally { await app.close(); }
});

test('wrong password never reaches the code step', async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    const res = await app.post('/auth/login', { email: 'alice@example.com', password: 'wrong-password' });
    assert.equal(res.status, 401);
    assert.equal(app.lastCode('alice'), null, 'no code was sent');
  } finally { await app.close(); }
});

test('new device: emailed code required, wrong code rejected, right code trusts the device', async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    const step1 = await login(app, 'alice', undefined);
    assert.equal(step1.status, 200);
    assert.equal(step1.data.mfaRequired, true);
    assert.equal(step1.data.method, 'email');
    assert.equal(step1.data.emailHint, 'a•••e@example.com');
    assert.equal(step1.data.token, undefined, 'no session before the code');

    const code = app.lastCode('alice');
    assert.match(code, /^\d{6}$/);
    const wrong = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: code === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 400);

    const right = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code, deviceLabel: 'Laptop' });
    assert.equal(right.status, 200);
    assert.ok(right.data.token);
    assert.match(right.data.deviceToken, /^[0-9a-f]{64}$/);

    // The code can't be used twice.
    const again = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code });
    assert.equal(again.status, 410);

    // And the new device now skips the code.
    const next = await login(app, 'alice', right.data.deviceToken);
    assert.ok(next.data.token);
  } finally { await app.close(); }
});

test('a code dies after 5 wrong guesses, even if the 6th is right', async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    const step1 = await login(app, 'alice', undefined);
    const code = app.lastCode('alice');
    const bad = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: bad });
      assert.equal(r.status, 400);
    }
    const sixth = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code });
    assert.equal(sixth.status, 429);
  } finally { await app.close(); }
});

test('removing a device signs it out immediately', async () => {
  const app = await startApp();
  try {
    const first = await signup(app, 'alice');
    const step1 = await login(app, 'alice', undefined);
    const second = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: app.lastCode('alice'), deviceLabel: 'Phone' });

    assert.equal((await app.get('/auth/me', second.data.token)).status, 200);
    const devices = await app.get('/auth/devices', first.token);
    assert.equal(devices.data.length, 2);
    assert.equal(devices.data.filter((d) => d.current).length, 1);
    const phone = devices.data.find((d) => d.label === 'Phone');

    assert.equal((await app.del(`/auth/devices/${phone.id}`, first.token)).status, 200);
    assert.equal((await app.get('/auth/me', second.data.token)).status, 401, 'removed device is signed out');
    assert.equal((await app.get('/auth/me', first.token)).status, 200, 'this device is fine');
  } finally { await app.close(); }
});

test("one user can't remove another user's device", async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    const bob = await signup(app, 'bob');
    const aliceDevices = await app.get('/auth/devices', alice.token);
    await app.del(`/auth/devices/${aliceDevices.data[0].id}`, bob.token);
    assert.equal((await app.get('/auth/me', alice.token)).status, 200);
  } finally { await app.close(); }
});

test('changing the password keeps this device and un-trusts the others', async () => {
  const app = await startApp();
  try {
    const first = await signup(app, 'alice');
    const step1 = await login(app, 'alice', undefined);
    const other = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: app.lastCode('alice') });

    const changed = await app.patch('/auth/password', { currentPassword: 'password123', newPassword: 'newpassword456' }, first.token);
    assert.equal(changed.status, 200);
    assert.equal((await app.get('/auth/me', changed.data.token)).status, 200, 'this device stays signed in');
    assert.equal((await app.get('/auth/me', other.data.token)).status, 401, 'other device signed out');
    const devices = await app.get('/auth/devices', changed.data.token);
    assert.equal(devices.data.length, 1);
  } finally { await app.close(); }
});

test('sessions from before two-step sign-in can adopt a trusted device', async () => {
  const app = await startApp();
  try {
    await signup(app, 'alice');
    const { rows } = await app.pool.query("SELECT * FROM users WHERE username = 'alice'");
    const mfa = require(path.join(SRC, 'services', 'mfa.js'));
    const legacyToken = mfa.signSession(rows[0], undefined); // no device id, like an old token
    assert.equal((await app.get('/auth/me', legacyToken)).status, 200, 'old tokens keep working');

    const adopted = await app.post('/auth/devices/adopt', { deviceLabel: 'Old laptop' }, legacyToken);
    assert.equal(adopted.status, 200);
    assert.match(adopted.data.deviceToken, /^[0-9a-f]{64}$/);
    // Can't adopt twice with a device-bound token.
    assert.equal((await app.post('/auth/devices/adopt', {}, adopted.data.token)).status, 400);
  } finally { await app.close(); }
});

test('admin rescue lets the next sign-in skip the code exactly once', async () => {
  const app = await startApp();
  try {
    await signup(app, 'admin');
    await app.pool.query("UPDATE users SET role = 'admin' WHERE username = 'admin'");
    const adminLogin = await app.post('/auth/login', { email: 'admin@example.com', password: 'password123', deviceToken: undefined });
    const adminToken = (await app.post('/auth/login/verify', { challengeId: adminLogin.data.challengeId, code: app.lastCode('admin') })).data.token;

    await signup(app, 'bob');
    const { rows } = await app.pool.query("SELECT id FROM users WHERE username = 'bob'");
    assert.equal((await app.post(`/admin/users/${rows[0].id}/mfa-bypass`, {}, adminToken)).status, 200);

    const skipped = await login(app, 'bob', undefined);
    assert.ok(skipped.data.token, 'skipped the code');
    assert.ok(skipped.data.deviceToken);
    const nextTime = await login(app, 'bob', undefined);
    assert.equal(nextTime.data.mfaRequired, true, 'only once');
  } finally { await app.close(); }
});

test('authenticator app: setup, sign-in with app code, no replay, backup codes single-use', async () => {
  const app = await startApp();
  try {
    const alice = await signup(app, 'alice');
    const setup = await app.post('/auth/mfa/totp/setup', {}, alice.token);
    assert.equal(setup.status, 200);
    assert.match(setup.data.qrDataUrl, /^data:image\/png;base64,/);
    const secret = setup.data.secret.replace(/ /g, '');

    // Not on until a code proves the app has the secret.
    assert.equal((await app.get('/auth/mfa', alice.token)).data.totpEnabledAt, null);
    assert.equal((await app.post('/auth/mfa/totp/enable', { code: '000000' }, alice.token)).status, 400);
    const enable = await app.post('/auth/mfa/totp/enable', { code: totp.codeAtStep(secret, totp.currentStep()) }, alice.token);
    assert.equal(enable.status, 200);
    assert.equal(enable.data.backupCodes.length, 10);

    // New device now gets a 'totp' challenge and no email.
    const step1 = await login(app, 'alice', undefined);
    assert.equal(step1.data.method, 'totp');
    assert.equal(app.lastCode('alice'), null, 'no email code sent');

    // The code used to enable can't be replayed; the next step's code works.
    const reused = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: totp.codeAtStep(secret, totp.currentStep()) });
    assert.equal(reused.status, 400, 'same 30-second code rejected after use');
    const fresh = await app.post('/auth/login/verify', { challengeId: step1.data.challengeId, code: totp.codeAtStep(secret, totp.currentStep() + 1) });
    assert.equal(fresh.status, 200);

    // Backup code: works once, case/format-insensitive, reports how many are left.
    const step2 = await login(app, 'alice', undefined);
    const backup = enable.data.backupCodes[0];
    const viaBackup = await app.post('/auth/login/verify', { challengeId: step2.data.challengeId, code: backup.toUpperCase().replace('-', ' ') });
    assert.equal(viaBackup.status, 200);
    assert.equal(viaBackup.data.backupCodesLeft, 9);
    const step3 = await login(app, 'alice', undefined);
    assert.equal((await app.post('/auth/login/verify', { challengeId: step3.data.challengeId, code: backup })).status, 400);

    // Turning it off needs the password, then email codes come back.
    assert.equal((await app.post('/auth/mfa/totp/disable', { password: 'nope' }, alice.token)).status, 403);
    assert.equal((await app.post('/auth/mfa/totp/disable', { password: 'password123' }, alice.token)).status, 200);
    assert.equal((await login(app, 'alice', undefined)).data.method, 'email');
  } finally { await app.close(); }
});
