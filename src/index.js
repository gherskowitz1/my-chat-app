require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDb } = require('./db');
const routes = require('./routes');
const { setupSocket } = require('./socket');
const { startPatchBot } = require('./jobs/patchBot');
const push = require('./utils/push');

push.configure();

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.CLIENT_URL
  ? [
      process.env.CLIENT_URL,
      process.env.CLIENT_URL.replace('https://www.', 'https://admin.'),
      'https://admin.thecrowsnesttalk.com',
    ]
  : ['http://localhost:5173', 'http://localhost:3000'];

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});
// Lets REST controllers (e.g. friend requests) push a live socket event to a
// specific user without needing their own reference threaded through.
app.set('io', io);

app.use(cors({ origin: allowedOrigins, credentials: true }));
// Raised from the 100kb default to fit base64-encoded uploads — message
// attachments are the largest (up to 8MB combined per message, ~11MB once
// base64-encoded, plus room for the rest of the JSON payload).
app.use(express.json({ limit: '14mb' }));

app.use('/api', routes);
app.get('/health', (_, res) => res.json({ ok: true }));

setupSocket(io);

const PORT = process.env.PORT || 3001;

// Start listening immediately so Railway's healthcheck passes,
// then initialize the DB (Railway networking can take a few seconds on cold start).
server.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  initDb()
    .then(() => startPatchBot(io))
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
});
