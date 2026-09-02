const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { signup, login, getMe, updateAvatar } = require('../controllers/authController');
const { getChannels, createChannel, deleteChannel, getMessages, getMessagesAround, getChannelMembers, updateChannelAccess } = require('../controllers/channelController');
const { getOrCreateConversation, getMyConversations, getDmMessages, getDmMessagesAround, getUsers } = require('../controllers/dmController');
const { searchMessages } = require('../controllers/searchController');
const { getToken, getParticipants, muteParticipant, removeParticipant } = require('../controllers/livekitController');
const {
  updateServer, getServer, renameChannel,
  getAllUsers, updateUserRole, deleteUser,
  getStats, getRecentMessages, forcePasswordReset, setUserPassword,
} = require('../controllers/adminController');
const { forgotPassword, resetPassword } = require('../controllers/passwordResetController');
const { sendInvite } = require('../controllers/inviteController');
const {
  searchGames, getTrackedGames, trackGame, untrackGame,
  getPatchBotSettings, updatePatchBotSettings,
} = require('../controllers/gameController');
const { getPinnedMessages, pinMessage, unpinMessage } = require('../controllers/pinController');

// Auth
router.post('/auth/signup', signup);
router.post('/auth/login', login);
router.get('/auth/me', authMiddleware, getMe);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);
router.patch('/auth/avatar', authMiddleware, updateAvatar);

// Users
router.get('/users', authMiddleware, getUsers);

// Channels
router.get('/servers/:serverId/channels', authMiddleware, getChannels);
router.post('/servers/:serverId/channels', authMiddleware, adminMiddleware, createChannel);
router.delete('/channels/:channelId', authMiddleware, adminMiddleware, deleteChannel);
router.get('/channels/:channelId/messages', authMiddleware, getMessages);
router.get('/channels/:channelId/messages/around/:messageId', authMiddleware, getMessagesAround);
router.get('/channels/:channelId/members', authMiddleware, adminMiddleware, getChannelMembers);
router.patch('/channels/:channelId/access', authMiddleware, adminMiddleware, updateChannelAccess);
router.get('/channels/:channelId/pins', authMiddleware, getPinnedMessages);
router.post('/channels/:channelId/pins/:messageId', authMiddleware, adminMiddleware, pinMessage);
router.delete('/channels/:channelId/pins/:messageId', authMiddleware, adminMiddleware, unpinMessage);

// DMs
router.get('/dm/conversations', authMiddleware, getMyConversations);
router.post('/dm/conversations/:targetUserId', authMiddleware, getOrCreateConversation);
router.get('/dm/conversations/:conversationId/messages', authMiddleware, getDmMessages);
router.get('/dm/conversations/:conversationId/messages/around/:messageId', authMiddleware, getDmMessagesAround);

// Search
router.get('/search', authMiddleware, searchMessages);

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
router.get('/livekit/rooms/:roomName/participants', authMiddleware, getParticipants);
router.post('/livekit/rooms/:roomName/mute/:identity', authMiddleware, adminMiddleware, muteParticipant);
router.delete('/livekit/rooms/:roomName/participants/:identity', authMiddleware, adminMiddleware, removeParticipant);

// Invites
router.post('/invite', authMiddleware, sendInvite);

// PatchBot — per-channel tracked games
router.get('/games/search', authMiddleware, adminMiddleware, searchGames);
router.get('/channels/:channelId/games', authMiddleware, getTrackedGames);
router.post('/channels/:channelId/games', authMiddleware, adminMiddleware, trackGame);
router.delete('/games/:gameId', authMiddleware, adminMiddleware, untrackGame);
router.get('/admin/patchbot/settings', authMiddleware, adminMiddleware, getPatchBotSettings);
router.patch('/admin/patchbot/settings', authMiddleware, adminMiddleware, updatePatchBotSettings);

module.exports = router;
