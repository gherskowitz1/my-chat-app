const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const onlineUsers = new Map(); // userId -> Set of socketIds
const userStatus = new Map(); // userId -> 'online' | 'away', only set while onlineUsers has them

module.exports = function setupSocket(io) {
  const emitToUser = (userId, event, payload) => {
    const sockets = onlineUsers.get(userId);
    if (!sockets) return;
    sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
  };

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
    const { id: userId, username } = socket.user;

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
    socket.on('channel:join', (channelId) => {
      socket.rooms.forEach((room) => {
        if (room.startsWith('channel:')) socket.leave(room);
      });
      socket.join(`channel:${channelId}`);
    });

    // Send message to a channel
    socket.on('message:send', async ({ channelId, content }) => {
      if (!content?.trim()) return;
      try {
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

        // Notify other server members directly (their socket may not have
        // this channel's room joined if they're viewing a different one).
        const { rows: members } = await pool.query(
          `SELECT sm.user_id FROM server_members sm
           JOIN channels c ON c.server_id = sm.server_id
           WHERE c.id = $1 AND sm.user_id != $2`,
          [channelId, userId]
        );
        const { rows: chRows } = await pool.query('SELECT name FROM channels WHERE id = $1', [channelId]);
        const channelName = chRows[0]?.name || '';
        members.forEach(({ user_id }) => {
          emitToUser(user_id, 'notify:message', {
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
          emitToUser(user_id, 'notify:dm', { conversationId, username, content: content.trim() });
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

    // Channel events broadcast (for admin actions)
    socket.on('channel:created', (channel) => {
      socket.broadcast.emit('channel:created', channel);
    });
    socket.on('channel:deleted', (channelId) => {
      socket.broadcast.emit('channel:deleted', channelId);
    });
    socket.on('channel:renamed', (channel) => {
      socket.broadcast.emit('channel:renamed', channel);
    });

    // Idle/away — client reports after ~30min with no mouse/keyboard activity
    socket.on('presence:idle', () => {
      if (!onlineUsers.has(userId)) return;
      userStatus.set(userId, 'away');
      io.emit('presence:update', { userId, username, status: 'away' });
    });
    socket.on('presence:active', () => {
      if (!onlineUsers.has(userId)) return;
      userStatus.set(userId, 'online');
      io.emit('presence:update', { userId, username, status: 'online' });
    });

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          userStatus.delete(userId);
          io.emit('presence:update', { userId, username, status: 'offline' });
        }
      }
    });
  });
};
