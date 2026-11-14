const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

// Watch together: a YouTube video everyone in a voice channel watches in
// sync (frontend: WatchTogether.jsx). The server holds the one true state
// per voice channel — which video, playing or paused, and where — and
// broadcasts it whenever anyone plays, pauses, seeks, or changes the video.
// Each client then nudges its own player to match. Kept in memory: a
// restart just ends any watch parties in progress.
//
// Position is stored as "position at updatedAt" so every client can work
// out the current spot itself without the server ticking.

const parties = new Map(); // voice channelId -> { videoId, playing, position, updatedAt, startedBy, startedByName }
const IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;

const YOUTUBE_ID_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function parseVideoId(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(YOUTUBE_ID_RE);
  return m ? m[1] : null;
}

// Where the video is right now, given the stored state.
function currentPosition(party, now = Date.now()) {
  return party.playing ? party.position + (now - party.updatedAt) / 1000 : party.position;
}

const room = (channelId) => `watch:${channelId}`;

function registerWatchParty(io, socket) {
  const { id: userId, username, role } = socket.user;
  const joined = new Set(); // voice channels this socket is watching

  const broadcast = (channelId) => {
    io.to(room(channelId)).emit('watch:state', { channelId, party: parties.get(channelId) || null, serverNow: Date.now() });
  };

  // Every action needs the channel to be a voice channel this user can see,
  // and the socket to have joined it with watch:join first.
  const allowed = async (channelId) => {
    if (typeof channelId !== 'string' || !joined.has(channelId)) return false;
    return true;
  };

  socket.on('watch:join', async ({ channelId } = {}) => {
    try {
      const channel = await getChannelById(channelId);
      if (!channel || channel.type !== 'voice' || !(await canAccessChannel(channel, userId, role))) return;
      joined.add(channelId);
      socket.join(room(channelId));
      const party = parties.get(channelId);
      if (party && Date.now() - party.updatedAt > IDLE_LIMIT_MS) parties.delete(channelId);
      socket.emit('watch:state', { channelId, party: parties.get(channelId) || null, serverNow: Date.now() });
    } catch (err) {
      console.error('watch:join error', err);
    }
  });

  socket.on('watch:leave', ({ channelId } = {}) => {
    joined.delete(channelId);
    socket.leave(room(channelId));
  });

  socket.on('watch:start', async ({ channelId, url } = {}) => {
    if (!(await allowed(channelId))) return;
    const videoId = parseVideoId(url);
    if (!videoId) {
      socket.emit('watch:error', { channelId, error: 'That doesn’t look like a YouTube link.' });
      return;
    }
    parties.set(channelId, {
      videoId, playing: true, position: 0, updatedAt: Date.now(), startedBy: userId, startedByName: username,
    });
    broadcast(channelId);
  });

  // action: 'play' | 'pause' | 'seek' (position in seconds)
  socket.on('watch:control', async ({ channelId, action, position } = {}) => {
    if (!(await allowed(channelId))) return;
    const party = parties.get(channelId);
    if (!party) return;
    const now = Date.now();
    const at = Number.isFinite(position) && position >= 0 ? position : currentPosition(party, now);
    if (action === 'play') Object.assign(party, { playing: true, position: at, updatedAt: now });
    else if (action === 'pause') Object.assign(party, { playing: false, position: at, updatedAt: now });
    else if (action === 'seek') Object.assign(party, { position: at, updatedAt: now });
    else return;
    party.lastActionBy = username;
    broadcast(channelId);
  });

  socket.on('watch:stop', async ({ channelId } = {}) => {
    if (!(await allowed(channelId))) return;
    parties.delete(channelId);
    broadcast(channelId);
  });
}

module.exports = { registerWatchParty, parseVideoId, currentPosition, _parties: parties };
