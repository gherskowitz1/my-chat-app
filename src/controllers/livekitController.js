const { AccessToken } = require('livekit-server-sdk');

async function getToken(req, res) {
  const { roomName } = req.params;
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  try {
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

module.exports = { getToken };
