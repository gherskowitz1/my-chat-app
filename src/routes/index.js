const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { signup, login, getMe } = require('../controllers/authController');
const { getChannels, createChannel, deleteChannel, getMessages } = require('../controllers/channelController');
const { getOrCreateConversation, getMyConversations, getDmMessages, getUsers } = require('../controllers/dmController');
const { getToken, getParticipants, muteParticipant, removeParticipant } = require('../controllers/livekitController');
const {
  updateServer, getServer, renameChannel,
  getAllUsers, updateUserRole, deleteUser,
  getStats, getRecentMessages, forcePasswordReset, setUserPassword,
} = require('../controllers/adminController');
const { forgotPassword, resetPassword } = require('../controllers/passwordResetController');

// Auth
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, getMe);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

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

// Admin
router.get('/servers/:serverId', authMiddleware, getServer);
router.patch('/servers/:serverId', authMiddleware, adminMiddleware, updateServer);
router.patch('/channels/:channelId', authMiddleware, adminMiddleware, renameChannel);
router.get('/admin/stats', authMiddleware, adminMiddleware, getStats);
router.get('/admin/users', authMiddleware, adminMiddleware, getAllUsers);
router.patch('/admin/users/:userId/role', authMiddleware, adminMiddleware, updateUserRole);
router.delete('/admin/users/:userId', authMiddleware, adminMiddleware, deleteUser);
router.post('/admin/users/:userId/force-reset', authMiddleware, adminMiddleware, forcePasswordReset);
router.patch('/admin/users/:userId/password', authMiddleware, adminMiddleware, setUserPassword);
router.get('/admin/messages/recent', authMiddleware, adminMiddleware, getRecentMessages);

// LiveKit
router.get('/livekit/token/:roomName', authMiddleware, getToken);
router.get('/livekit/rooms/:roomName/participants', authMiddleware, adminMiddleware, getParticipants);
router.post('/livekit/rooms/:roomName/mute/:identity', authMiddleware, adminMiddleware, muteParticipant);
router.delete('/livekit/rooms/:roomName/participants/:identity', authMiddleware, adminMiddleware, removeParticipant);

module.exports = router;
