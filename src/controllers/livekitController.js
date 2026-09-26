const { AccessToken, RoomServiceClient, TrackSource } = require('livekit-server-sdk');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

function getRoomService() {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return null;
  // RoomServiceClient needs http(s) not wss
  const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
  return new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

async function getToken(req, res) {
  const { roomName } = req.params;
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  try {
    // roomName is always a channel id (see VoiceChannel.jsx) — verify this
    // user is actually allowed into that channel before minting a token that
    // would otherwise let anyone with a valid login join/publish anywhere.
    const channel = await getChannelById(roomName);
    if (!(await canAccessChannel(channel, req.user.id, req.user.role))) {
      return res.status(403).json({ error: 'Not authorized to join this channel' });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: req.user.id,
      name: req.user.username,
      ttl: '1h',
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const token = await at.toJwt();
    res.json({ token, url: process.env.LIVEKIT_URL });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate token' });
  }
}

// GET /livekit/rooms/:roomName/participants — open to any authenticated
// user (not just admins), since it's read-only. roomName is a channel id, so
// still gated by channel access — otherwise a non-member of a private voice
// channel could see who's in it without being able to join.
async function getParticipants(req, res) {
  const svc = getRoomService();
  if (!svc) return res.status(503).json({ error: 'LiveKit not configured' });
  try {
    const channel = await getChannelById(req.params.roomName);
    if (!(await canAccessChannel(channel, req.user.id, req.user.role))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const participants = await svc.listParticipants(req.params.roomName);
    res.json(participants.map(p => ({
      identity: p.identity,
      name: p.name,
      sid: p.sid,
      isMuted: !p.tracks?.some(t => t.source === TrackSource.MICROPHONE && !t.muted),
    })));
  } catch (err) {
    // A voice channel nobody has joined yet has no corresponding LiveKit
    // room at all (rooms are created on-demand on first join and torn down
    // once empty) — listParticipants() on a nonexistent room throws rather
    // than returning an empty list, so that's just "nobody's in here", not
    // a real failure. Everything else still 500s and logs.
    if (err.code === 'not_found') return res.json([]);
    console.error(err);
    res.status(500).json({ error: 'Failed to list participants' });
  }
}

// POST /livekit/rooms/:roomName/mute/:identity
async function muteParticipant(req, res) {
  const svc = getRoomService();
  if (!svc) return res.status(503).json({ error: 'LiveKit not configured' });
  const { roomName, identity } = req.params;
  const { muted } = req.body; // true = mute, false = unmute
  try {
    // Get the participant's mic track SID
    const participant = await svc.getParticipant(roomName, identity);
    const micTrack = participant.tracks?.find(t => t.source === TrackSource.MICROPHONE);
    if (!micTrack) return res.status(404).json({ error: 'No mic track found' });
    await svc.mutePublishedTrack(roomName, identity, micTrack.sid, muted);
    res.json({ success: true, muted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mute participant' });
  }
}

// DELETE /livekit/rooms/:roomName/participants/:identity
async function removeParticipant(req, res) {
  const svc = getRoomService();
  if (!svc) return res.status(503).json({ error: 'LiveKit not configured' });
  const { roomName, identity } = req.params;
  try {
    await svc.removeParticipant(roomName, identity);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
}

// POST /livekit/rooms/:roomName/effect/:identity — unlike mute/kick, this
// isn't a LiveKit server API call: voice effects are pure client-side audio
// processing (see VoiceEffects.jsx), so there's nothing for the SFU to do.
// Instead this just relays the request over the target's own socket, and
// their already-running client applies it to its own mic locally — the
// LiveKit `identity` a room's participants list gives us for every user IS
// their app user id (see getToken's AccessToken identity below), so this
// reaches them directly with no separate id lookup needed.
async function forceVoiceEffect(req, res) {
  const { identity } = req.params;
  const { effectId } = req.body;
  if (!effectId || typeof effectId !== 'string' || effectId.length > 40) {
    return res.status(400).json({ error: 'effectId required' });
  }
  try {
    const { emitToUser } = require('../socket');
    const io = req.app.get('io');
    emitToUser(io, identity, 'voice:effectForced', { effectId });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to apply effect' });
  }
}

module.exports = { getToken, getParticipants, muteParticipant, removeParticipant, forceVoiceEffect };
