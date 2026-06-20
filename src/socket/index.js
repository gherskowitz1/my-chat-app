const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const onlineUsers = new Map(); // userId -> Set of socketIds

module.exports = function setupSocket(io) {
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

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    io.emit('user:online', { userId, username });

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
          `INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3)
           RETURNING id, channel_id, content, created_at`,
          [channelId, userId, content.trim()]
        );
        const msg = {
          ...rows[0],
          username,
          avatar_color: socket.user.avatar_color,
          user_id: userId,
        };
        io.to(`channel:${channelId}`).emit('message:new', msg);
      } catch (err) {
        console.error('message:send error', err);
        socket.emit('error', { message: 'Failed to send message' });
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
          `INSERT INTO dm_messages (conversation_id, user_id, content) VALUES ($1, $2, $3)
           RETURNING id, conversation_id, content, created_at`,
          [conversationId, userId, content.trim()]
        );
        const msg = { ...rows[0], username, avatar_color: socket.user.avatar_color, user_id: userId };
        io.to(`dm:${conversationId}`).emit('dm:new', msg);
      } catch (err) {
        console.error('dm:send error', err);
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

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:offline', { userId });
        }
      }
    });
  });
};
