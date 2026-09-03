const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware, authFromHeaderOrQuery } = require('../middleware/auth');
const { signup, login, getMe, updateAvatar, getAuthConfig, updateUsername, updatePassword, updateAvatarColor, updateStatusText, deleteAccount } = require('../controllers/authController');
const { loginLimiter, signupLimiter, forgotPasswordLimiter } = require('../middleware/rateLimit');
const { getChannels, createChannel, deleteChannel, getMessages, getMessagesAround, getChannelMembers, updateChannelAccess, sendMessageWithAttachments } = require('../controllers/channelController');
const { getOrCreateConversation, getMyConversations, getDmMessages, getDmMessagesAround, getUsers, sendDmMessageWithAttachments, hideConversation } = require('../controllers/dmController');
const { getAttachment } = require('../controllers/attachmentController');
const { searchMessages } = require('../controllers/searchController');
const { getToken, getParticipants, muteParticipant, removeParticipant } = require('../controllers/livekitController');
const {
  updateServer, getServer, renameChannel, setServerOwner,
  getAllUsers, updateUserRole, deleteUser, setUserInvisible,
  getStats, getRecentMessages, forcePasswordReset, setUserPassword,
} = require('../controllers/adminController');
const { forgotPassword, resetPassword } = require('../controllers/passwordResetController');
const { sendInvite } = require('../controllers/inviteController');
const {
  searchGames, getTrackedGames, trackGame, untrackGame,
  getPatchBotSettings, updatePatchBotSettings,
} = require('../controllers/gameController');
const { getPinnedMessages, pinMessage, unpinMessage } = require('../controllers/pinController');
const { getFriends, sendRequest, acceptRequest, declineRequest, removeFriend } = require('../controllers/friendController');
const { getEmoji, createEmoji, deleteEmoji } = require('../controllers/emojiController');
const { getSounds, createSound, deleteSound } = require('../controllers/soundController');
const { getPublicKey, subscribe, unsubscribe } = require('../controllers/pushController');
const { getGifs } = require('../controllers/giphyController');

// Auth
router.get('/auth/config', getAuthConfig);
router.post('/auth/signup', signupLimiter, signup);
router.post('/auth/login', loginLimiter, login);
router.get('/auth/me', authMiddleware, getMe);
router.post('/auth/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/auth/reset-password', resetPassword);
router.patch('/auth/avatar', authMiddleware, updateAvatar);
router.patch('/auth/username', authMiddleware, updateUsername);
router.patch('/auth/password', authMiddleware, updatePassword);
router.patch('/auth/avatar-color', authMiddleware, updateAvatarColor);
router.patch('/auth/status-text', authMiddleware, updateStatusText);
router.delete('/auth/me', authMiddleware, deleteAccount);

// Users
router.get('/users', authMiddleware, getUsers);

// GIFs
router.get('/giphy', authMiddleware, getGifs);

// Channels
router.get('/servers/:serverId/channels', authMiddleware, getChannels);
router.post('/servers/:serverId/channels', authMiddleware, adminMiddleware, createChannel);
router.delete('/channels/:channelId', authMiddleware, adminMiddleware, deleteChannel);
router.get('/channels/:channelId/messages', authMiddleware, getMessages);
router.post('/channels/:channelId/messages', authMiddleware, sendMessageWithAttachments);
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
router.post('/dm/conversations/:conversationId/messages', authMiddleware, sendDmMessageWithAttachments);
router.get('/dm/conversations/:conversationId/messages/around/:messageId', authMiddleware, getDmMessagesAround);
router.delete('/dm/conversations/:conversationId', authMiddleware, hideConversation);

// Attachments — served by a plain <img>/<a> URL, which can't carry an
// Authorization header, so this route accepts the token as a query param too.
router.get('/attachments/:attachmentId', authFromHeaderOrQuery, getAttachment);

// Search
router.get('/search', authMiddleware, searchMessages);

// Custom server emoji — anyone can view/use, only admins can manage
router.get('/servers/:serverId/emoji', authMiddleware, getEmoji);
router.post('/servers/:serverId/emoji', authMiddleware, adminMiddleware, createEmoji);
router.delete('/servers/:serverId/emoji/:emojiId', authMiddleware, adminMiddleware, deleteEmoji);

// Soundboard — anyone can view/play, only admins can manage the library
router.get('/servers/:serverId/sounds', authMiddleware, getSounds);
router.post('/servers/:serverId/sounds', authMiddleware, adminMiddleware, createSound);
router.delete('/servers/:serverId/sounds/:soundId', authMiddleware, adminMiddleware, deleteSound);

// Push notifications
router.get('/push/vapid-public-key', authMiddleware, getPublicKey);
router.post('/push/subscribe', authMiddleware, subscribe);
router.post('/push/unsubscribe', authMiddleware, unsubscribe);

// Friends — additive only, does not gate DMs
router.get('/friends', authMiddleware, getFriends);
router.post('/friends/request/:userId', authMiddleware, sendRequest);
router.post('/friends/accept/:userId', authMiddleware, acceptRequest);
router.post('/friends/decline/:userId', authMiddleware, declineRequest);
router.delete('/friends/:userId', authMiddleware, removeFriend);

// Admin
router.get('/servers/:serverId', authMiddleware, getServer);
router.patch('/servers/:serverId', authMiddleware, adminMiddleware, updateServer);
router.patch('/servers/:serverId/owner', authMiddleware, adminMiddleware, setServerOwner);
router.patch('/channels/:channelId', authMiddleware, adminMiddleware, renameChannel);
router.get('/admin/stats', authMiddleware, adminMiddleware, getStats);
router.get('/admin/users', authMiddleware, adminMiddleware, getAllUsers);
router.patch('/admin/users/:userId/role', authMiddleware, adminMiddleware, updateUserRole);
router.patch('/admin/users/:userId/invisible', authMiddleware, adminMiddleware, setUserInvisible);
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
