// Test harness: the real server code (routes, controllers, jobs) running
// against PGlite — a full PostgreSQL compiled to run inside Node, in memory —
// instead of the production database. Nothing here touches Railway.
//
// Usage in a test file:
//   const { startApp } = require('./helpers.cjs');
//   const app = await startApp();   // fresh empty database + server
//   const res = await app.post('/auth/signup', {...});
//   await app.close();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
delete process.env.RESEND_API_KEY; // sign-in codes go to the log, which tests read
delete process.env.STEAM_API_KEY;
delete process.env.LIVEKIT_API_KEY;

const path = require('path');
const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');

const SRC = path.join(__dirname, '..', 'src');

// pg-compatible facade over PGlite: just the { rows, rowCount } surface the
// app's code actually uses.
function makePool(db) {
  return {
    async query(text, params = []) {
      const r = await db.query(text, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

let current = null; // the database the app modules are bound to

// The app's modules require('../db') once and keep the pool, so the module
// cache gets a stand-in whose `pool` forwards to whichever test database is
// current. Must run before any app module is loaded.
function installDb() {
  const dbModulePath = require.resolve(path.join(SRC, 'db', 'index.js'));
  const pool = { query: (...args) => current.pool.query(...args) };
  require.cache[dbModulePath] = {
    id: dbModulePath, filename: dbModulePath, loaded: true,
    exports: { pool, initDb: async () => {} },
  };
}
installDb();

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(SRC, 'db', 'schema.sql'), 'utf8'));
  current = { db, pool: makePool(db) };
  return current;
}

// Captures console.log lines (sign-in codes are logged when email isn't
// configured) without spamming test output.
function captureLogs() {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return { lines, restore: () => { console.log = original; } };
}

async function startApp() {
  const { db, pool } = await freshDatabase();
  const express = require('express');
  const routes = require(path.join(SRC, 'routes'));
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  const emitted = [];
  app.set('io', {
    emit: (event, payload) => emitted.push({ event, payload }),
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  });
  app.use('/api', routes);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const logs = captureLogs();

  const call = async (method, url, body, token, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };

  return {
    db, pool, emitted, logs,
    get: (url, token) => call('GET', url, undefined, token),
    post: (url, body, token) => call('POST', url, body ?? {}, token),
    patch: (url, body, token) => call('PATCH', url, body ?? {}, token),
    del: (url, token, body) => call('DELETE', url, body, token),
    // The most recent sign-in code printed for a username.
    lastCode(username) {
      const line = [...logs.lines].reverse().find((l) => l.includes('[login-code]') && l.includes(`${username}'s`));
      return line ? line.match(/(\d{6})\s*$/)[1] : null;
    },
    async close() {
      logs.restore();
      await new Promise((r) => server.close(r));
      await db.close();
    },
  };
}

// Signs up a user and returns { token, deviceToken, user }.
async function signup(app, username, extra = {}) {
  const res = await app.post('/auth/signup', {
    username, email: `${username}@example.com`, password: 'password123', deviceLabel: 'Test device', ...extra,
  });
  if (res.status !== 200) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

module.exports = { startApp, signup, freshDatabase, SRC };
