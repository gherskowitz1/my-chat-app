const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { signup, login, getMe } = require('../controllers/authController');
const { getChannels, createChannel, deleteChannel, getMessages } = require('../controllers/channelController');
const { getOrCreateConversation, getMyConversations, getDmMessages, getUsers } = require('../controllers/dmController');
const { getToken } = require('../controllers/livekitController');

// Auth
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, getMe);

// Users
router.get('/users', authMiddleware, getUsers);

// Channels
router.get('/servers/:serverId/channels', authMiddleware, getChannels);
router.post('/servers/:serverId/channels', authMiddleware, adminMiddleware, createChannel);
router.delete('/channels/:channelId', authMiddleware, adminMiddleware, deleteChannel);
router.get('/channels/:channelId/messages', authMiddleware, getMessages);

// DMs
router.get('/dm/conversations', authMiddleware, getMyConversations);
router.post('/dm/conversations/:targetUserId', authMiddleware, getOrCreateConversation);
router.get('/dm/conversations/:conversationId/messages', authMiddleware, getDmMessages);

// LiveKit
router.get('/livekit/token/:roomName', authMiddleware, getToken);

module.exports = router;
