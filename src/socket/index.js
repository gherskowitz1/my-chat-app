const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { getChannelById, canAccessChannel } = require('../utils/channelAccess');

const onlineUsers = new Map(); // userId -> Set of socketIds
const userStatus = new Map(); // userId -> 'online' | 'away' | 'offline' (manual), only set while onlineUsers has them
const manualStatus = new Map(); // userId -> status the user explicitly chose, pins userStatus against automatic idle/active updates until they fully disconnect

// Module-level (not just inside setupSocket) so background jobs like
// PatchBot can push a notify: event to a user's open sockets too.
function emitToUser(io, userId, event, payload) {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
}

function setupSocket(io) {

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, username, role } = socket.user;

    // Track online status. Always (re-)broadcast on connect, even for a 2nd
    // tab from an already-online user — cheap, and correctly clears an
    // existing "away" status back to "online" if a new session starts.
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    userStatus.set(userId, 'online');
    io.emit('presence:update', { userId, username, status: 'online' });

    // Tell just this socket who's already online/away, since it missed
    // whatever presence:update events fired before it connected.
    socket.emit('presence:snapshot', Array.from(userStatus.entries()).map(([id, status]) => ({ userId: id, status })));

    // Join a channel room
    socket.on('channel:join', async (channelId) => {
      try {
        const channel = await getChannelById(channelId);
        if (!(await canAccessChannel(channel, userId, role))) return;
      } catch {
        return;
      }
      socket.rooms.forEach((room) => {
        if (room.startsWith('channel:')) socket.leave(room);
      });
      socket.join(`channel:${channelId}`);
    });

    // Send message to a channel
    socket.on('message:send', async ({ channelId, content }) => {
      if (!content?.trim()) return;
      try {
        const channel = await getChannelById(channelId);
        if (!(await canAccessChannel(channel, userId, role))) return;

        const { rows } = await pool.query(
          `WITH inserted AS (
             INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3)
             RETURNING id, channel_id, content, created_at, user_id
           )
           SELECT inserted.*, u.username, u.avatar_color, u.avatar_url
           FROM inserted JOIN users u ON u.id = inserted.user_id`,
          [channelId, userId, content.trim()]
        );
        io.to(`channel:${channelId}`).emit('message:new', rows[0]);

        // Notify the people who can actually see this channel directly
        // (their socket may not have this channel's room joined if they're
        // viewing something else) — everyone on the server for a public
        // channel, or just its explicit allow-list for a private one.
        const { rows: members } = channel.is_private
          ? await pool.query(
              'SELECT user_id FROM channel_members WHERE channel_id = $1 AND user_id != $2',
              [channelId, userId]
            )
          : await pool.query(
              `SELECT sm.user_id FROM server_members sm
               JOIN channels c ON c.server_id = sm.server_id
               WHERE c.id = $1 AND sm.user_id != $2`,
              [channelId, userId]
            );
        const channelName = channel.name;
        members.forEach(({ user_id }) => {
          emitToUser(io, user_id, 'notify:message', {
            channelId, channelName, username, content: content.trim(),
          });
        });
      } catch (err) {
        console.error('message:send error', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Edit a message — owner only, not admins (admins can delete, not rewrite others' words)
    socket.on('message:edit', async ({ messageId, channelId, content }) => {
      if (!content?.trim()) return;
      try {
        const { rows: check } = await pool.query('SELECT user_id FROM messages WHERE id = $1', [messageId]);
        if (!check[0] || check[0].user_id !== userId) return;
        const { rows } = await pool.query(
          `UPDATE messages SET content = $1, updated_at = NOW() WHERE id = $2
           RETURNING id, channel_id, content, created_at, updated_at, user_id`,
          [content.trim(), messageId]
        );
        io.to(`channel:${channelId}`).emit('message:edited', { ...rows[0], username });
      } catch (err) {
        console.error('message:edit error', err);
      }
    });

    // Delete a message
    socket.on('message:delete', async ({ messageId, channelId }) => {
      try {
        const { rows } = await pool.query('SELECT user_id FROM messages WHERE id = $1', [messageId]);
        if (!rows[0]) return;
        if (rows[0].user_id !== userId && socket.user.role !== 'admin') return;
        await pool.query('DELETE FROM messages WHERE id = $1', [messageId]);
        io.to(`channel:${channelId}`).emit('message:deleted', { messageId, channelId });
      } catch (err) {
        console.error('message:delete error', err);
      }
    });

    // Join DM room
    socket.on('dm:join', (conversationId) => {
      socket.join(`dm:${conversationId}`);
    });

    // Send DM
    socket.on('dm:send', async ({ conversationId, content }) => {
      if (!content?.trim()) return;
      try {
        // Verify participant
        const { rows: check } = await pool.query(
          'SELECT 1 FROM dm_participants WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId]
        );
        if (!check[0]) return;

        const { rows } = await pool.query(
          `WITH inserted AS (
             INSERT INTO dm_messages (conversation_id, user_id, content) VALUES ($1, $2, $3)
             RETURNING id, conversation_id, content, created_at, user_id
           )
           SELECT inserted.*, u.username, u.avatar_color, u.avatar_url
           FROM inserted JOIN users u ON u.id = inserted.user_id`,
          [conversationId, userId, content.trim()]
        );
        io.to(`dm:${conversationId}`).emit('dm:new', rows[0]);

        const { rows: others } = await pool.query(
          'SELECT user_id FROM dm_participants WHERE conversation_id = $1 AND user_id != $2',
          [conversationId, userId]
        );
        others.forEach(({ user_id }) => {
          emitToUser(io, user_id, 'notify:dm', { conversationId, username, content: content.trim() });
        });
      } catch (err) {
        console.error('dm:send error', err);
      }
    });

    // Edit a DM — owner only
    socket.on('dm:edit', async ({ messageId, conversationId, content }) => {
      if (!content?.trim()) return;
      try {
        const { rows: check } = await pool.query('SELECT user_id FROM dm_messages WHERE id = $1', [messageId]);
        if (!check[0] || check[0].user_id !== userId) return;
        const { rows } = await pool.query(
          `UPDATE dm_messages SET content = $1, updated_at = NOW() WHERE id = $2
           RETURNING id, conversation_id, content, created_at, updated_at, user_id`,
          [content.trim(), messageId]
        );
        io.to(`dm:${conversationId}`).emit('dm:edited', { ...rows[0], username });
      } catch (err) {
        console.error('dm:edit error', err);
      }
    });

    // Delete a DM — owner only (unlike channel messages, admins have no
    // special delete rights over a private conversation between two users)
    socket.on('dm:delete', async ({ messageId, conversationId }) => {
      try {
        const { rows } = await pool.query('SELECT user_id FROM dm_messages WHERE id = $1', [messageId]);
        if (!rows[0] || rows[0].user_id !== userId) return;
        await pool.query('DELETE FROM dm_messages WHERE id = $1', [messageId]);
        io.to(`dm:${conversationId}`).emit('dm:deleted', { messageId, conversationId });
      } catch (err) {
        console.error('dm:delete error', err);
      }
    });

    // Typing indicators
    socket.on('typing:start', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:update', { userId, username, typing: true });
    });
    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:update', { userId, username, typing: false });
    });
    socket.on('dm:typing:start', ({ conversationId }) => {
      socket.to(`dm:${conversationId}`).emit('dm:typing:update', { userId, username, typing: true });
    });
    socket.on('dm:typing:stop', ({ conversationId }) => {
      socket.to(`dm:${conversationId}`).emit('dm:typing:update', { userId, username, typing: false });
    });

    // Channel events broadcast (for admin actions). Public channels go to
    // everyone as before; a private channel only reaches its allow-list plus
    // admins, so it doesn't flash into a non-member's sidebar in realtime
    // even though the REST channel list would already exclude it for them.
    const broadcastChannelEvent = async (event, channel) => {
      if (!channel?.is_private) {
        socket.broadcast.emit(event, channel);
        return;
      }
      try {
        const [{ rows: members }, { rows: admins }] = await Promise.all([
          pool.query('SELECT user_id FROM channel_members WHERE channel_id = $1', [channel.id]),
          pool.query("SELECT id FROM users WHERE role = 'admin'", []),
        ]);
        const targets = new Set([...members.map((m) => m.user_id), ...admins.map((a) => a.id)]);
        targets.delete(userId);
        targets.forEach((uid) => emitToUser(io, uid, event, channel));
      } catch (err) {
        console.error(`${event} broadcast error`, err);
      }
    };

    socket.on('channel:created', (channel) => broadcastChannelEvent('channel:created', channel));
    socket.on('channel:renamed', (channel) => broadcastChannelEvent('channel:renamed', channel));
    socket.on('channel:deleted', (channelId) => {
      // The row is already gone by the time this fires, so we can't look up
      // whether it was private — broadcasting a bare id is a negligible leak
      // (no name/content, and non-members never had it in their state anyway).
      socket.broadcast.emit('channel:deleted', channelId);
    });

    // Fired after an admin changes a private channel's allow-list — rather
    // than diff and target individual add/remove events (easy to get subtly
    // wrong), just tell everyone to silently re-fetch the channel list, which
    // is already correctly filtered per-user server-side.
    socket.on('channel:members-updated', () => {
      socket.broadcast.emit('channels:refresh');
    });

    // Idle/away — client reports after ~30min with no mouse/keyboard activity.
    // Skipped entirely once the user has set a manual status override, so
    // automatic detection can't stomp on a status they explicitly chose.
    socket.on('presence:idle', () => {
      if (!onlineUsers.has(userId) || manualStatus.has(userId)) return;
      userStatus.set(userId, 'away');
      io.emit('presence:update', { userId, username, status: 'away' });
    });
    socket.on('presence:active', () => {
      if (!onlineUsers.has(userId) || manualStatus.has(userId)) return;
      userStatus.set(userId, 'online');
      io.emit('presence:update', { userId, username, status: 'online' });
    });

    // Manual status override — e.g. appearing offline while still fully
    // connected. Pinned until this user's last socket disconnects, at which
    // point automatic detection resumes on their next login.
    socket.on('presence:setStatus', (status) => {
      if (!['online', 'away', 'offline'].includes(status)) return;
      manualStatus.set(userId, status);
      userStatus.set(userId, status);
      io.emit('presence:update', { userId, username, status });
    });

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          userStatus.delete(userId);
          manualStatus.delete(userId);
          io.emit('presence:update', { userId, username, status: 'offline' });
        }
      }
    });
  });
}

module.exports = { setupSocket, emitToUser };
