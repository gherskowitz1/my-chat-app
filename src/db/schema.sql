-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#5865F2',
  avatar_url TEXT,
  role VARCHAR(16) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Bumped on password change/reset so old JWTs (which carry the version they
-- were issued with) fail auth on every device except the one that made the
-- change, which is immediately reissued a token with the new version.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Set the moment a user's last socket disconnects, so the member list can
-- show "last seen" for anyone currently offline.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Admin-only flag to hide an account (bots, service/test accounts) from the
-- passive online/offline member list — they stay fully usable everywhere
-- else (mentions, DMs, friends, private-channel pickers).
ALTER TABLE users ADD COLUMN IF NOT EXISTS invisible BOOLEAN NOT NULL DEFAULT false;

-- A short, user-set status message (e.g. "brb", "at the gym") — separate
-- from the automatic online/away/offline detection, purely opt-in text.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text VARCHAR(100);

-- Linked Steam account (SteamID64) and the game it was last seen playing —
-- current_game is cache, refreshed by the game-presence poll job, not
-- something a user sets directly. NULL means "not linked" / "not playing".
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_game VARCHAR(200);
-- The IANA time zone of the user's device (e.g. "Asia/Tokyo"), reported by
-- the client each time it connects. Only used where the *server* has to
-- write a date into text — push notifications — since everything shown
-- in the app itself is already formatted on the user's own device.
ALTER TABLE users ADD COLUMN IF NOT EXISTS time_zone VARCHAR(64);

-- Servers (like Discord servers/guilds)
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  icon_url TEXT,
  text_category_label VARCHAR(100) NOT NULL DEFAULT 'TEXT CHANNELS',
  voice_category_label VARCHAR(100) NOT NULL DEFAULT 'VOICE CHANNELS',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE servers ADD COLUMN IF NOT EXISTS text_category_label VARCHAR(100) NOT NULL DEFAULT 'TEXT CHANNELS';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS voice_category_label VARCHAR(100) NOT NULL DEFAULT 'VOICE CHANNELS';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Server members
CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(16) DEFAULT 'text' CHECK (type IN ('text', 'voice')),
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;

-- Allow-list of users who can see/use a private channel (ignored for public ones)
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Client-generated id for the offline outbox: a resend after a dropped
-- connection carries the same client_id, so ON CONFLICT DO NOTHING makes
-- retrying idempotent instead of creating a duplicate message.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_channel_client ON messages (channel_id, client_id) WHERE client_id IS NOT NULL;

-- Full-text search — a generated column keeps the tsvector in sync with
-- content automatically (no trigger needed), and the GIN index makes
-- @@ lookups fast even as message history grows.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_messages_content_tsv ON messages USING GIN (content_tsv);

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

-- Per-channel pinned messages
CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, message_id)
);

-- Direct message conversations
CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DM participants
CREATE TABLE IF NOT EXISTS dm_participants (
  conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

-- Set when a user "deletes" a DM from their own list — hides it from their
-- conversation list only (the other participant's copy, and the message
-- history itself, are untouched) until a new message in it clears this back
-- to NULL for everyone.
ALTER TABLE dm_participants ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- DM messages
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES dm_messages(id) ON DELETE SET NULL;

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS client_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_messages_conversation_client ON dm_messages (conversation_id, client_id) WHERE client_id IS NOT NULL;

ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_dm_messages_content_tsv ON dm_messages USING GIN (content_tsv);

CREATE TABLE IF NOT EXISTS dm_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES dm_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

-- Admin-authored announcements shown to every user once, the next time they
-- sign in — same "show once" idea as the What's New modal above, but
-- admin-triggered on demand instead of tied to an app-version bump, and
-- tracked server-side (users.last_seen_announcement_id) so it follows the
-- account across devices instead of one browser's localStorage.
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_announcement_id UUID REFERENCES announcements(id) ON DELETE SET NULL;

-- Polls — a poll IS a message (message_id references it 1:1), the same way
-- an attachment attaches to a message, rather than a separately-ordered
-- entity: this lets a poll ride the existing message list/pagination/
-- reply/pin machinery for free instead of needing its own merge-by-timestamp
-- logic. The question is also stored as the message's own `content` so it's
-- full-text searchable and shows up in notification previews like any other
-- message; poll_options/poll_votes carry only the interactive part.
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE UNIQUE,
  question VARCHAR(300) NOT NULL,
  allow_multiple BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  label VARCHAR(120) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (option_id, user_id)
);

-- Per-user channel notification mute — suppresses the unread badge/dot and
-- desktop notifications for a muted channel's non-mention messages; an
-- @mention still gets through even while muted (same default Discord uses),
-- since push/toast notifications are already mention-gated separately.
CREATE TABLE IF NOT EXISTS channel_mutes (
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

-- Cache for generic (non-platform-specific) link previews — a row with a
-- NULL title means "fetched, nothing useful found" (still cached, so a dead
-- or unhelpful link doesn't get re-fetched on every message render).
CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PatchBot: games tracked per channel. last_posted_gid dedupes which Steam
-- news items have already been posted so the poller never repeats itself.
CREATE TABLE IF NOT EXISTS tracked_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  steam_app_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  icon_url TEXT,
  last_posted_gid VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (channel_id, steam_app_id)
);

-- A system account so patch-note posts can be a normal message row (joins
-- against users for username/avatar like any other message). The bogus
-- password_hash makes it impossible to log into.
INSERT INTO users (id, username, email, password_hash, avatar_color, role)
VALUES ('00000000-0000-0000-0000-0000000b0000', 'PatchBot', 'patchbot@system.local', '!disabled!', '#171a21', 'member')
ON CONFLICT DO NOTHING;

-- PatchBot config — single row, how often (in minutes) it checks for new
-- Steam news across all tracked games. Read fresh by the poll loop each
-- cycle, so a change here takes effect on the next run, no restart needed.
CREATE TABLE IF NOT EXISTS bot_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  patch_poll_minutes INTEGER NOT NULL DEFAULT 180
);
INSERT INTO bot_settings (id, patch_poll_minutes) VALUES (1, 180) ON CONFLICT (id) DO NOTHING;

-- How often (in minutes) the Steam "currently playing" poller checks linked
-- accounts. Same single-row config table/pattern as patch_poll_minutes
-- above, just a separate column since the two jobs run independently.
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS game_poll_minutes INTEGER NOT NULL DEFAULT 2;

-- Friendships — one row per pair, direction preserved via requester/addressee
-- so a pending request can be told apart from an accepted friendship.
-- Purely additive: DMs remain open to anyone regardless of friend status.
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id)
);

-- Custom server emoji, usable inline as :name: and as message reactions
CREATE TABLE IF NOT EXISTS custom_emoji (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  image_data TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (server_id, name)
);

-- Soundboard clips — short audio clips any member can play into a voice
-- channel; admins manage the library (upload/delete), same tier as emoji.
CREATE TABLE IF NOT EXISTS soundboard_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  audio_data TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (server_id, name)
);

-- Web push subscriptions — lets DMs/mentions notify a user even with the
-- app fully closed (not just backgrounded), via the browser's own push
-- service rather than a persistent connection.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message attachments — kept in their own table (not a column on
-- messages/dm_messages) specifically so the ordinary message-list queries
-- never pull attachment bytes: they join in lightweight metadata only, and
-- the actual file is fetched separately, on demand, via GET /attachments/:id.
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  dm_message_id UUID REFERENCES dm_messages(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_dm_message ON message_attachments (dm_message_id);

-- Game Night events — scheduled get-togethers anyone can create and RSVP
-- to (see eventController.js and jobs/eventReminders.js).
--
-- A recurring event is an event_series plus one events row per date, each
-- with its own RSVPs — a fresh sign-in sheet every week rather than one
-- yes/no for the whole series. The reminder job keeps each active series
-- stocked with dates ~8 days ahead, in the scheduler's own time zone so
-- "every Friday 10pm" survives daylight-saving changes.
CREATE TABLE IF NOT EXISTS event_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000),
  voice_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  recurrence VARCHAR(10) NOT NULL CHECK (recurrence IN ('weekly', 'biweekly', 'monthly')),
  time_zone VARCHAR(64) NOT NULL,
  anchor_day SMALLINT NOT NULL, -- day of month of the first date, for monthly series
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- voice_channel_id is optional ("meet in General Voice"). checkin_sent_at /
-- reminded_at record that the week-before check-in and the 15-minutes-before
-- reminder have gone out, so neither is ever sent twice. A cancelled date in
-- a series is kept (cancelled_at) rather than deleted, so the series doesn't
-- regenerate it.
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES event_series(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000),
  starts_at TIMESTAMPTZ NOT NULL,
  voice_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checkin_sent_at TIMESTAMPTZ,
  reminded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_series ON events (series_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events (starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('going', 'maybe', 'no')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Time spent in voice and in games, for the yearly Wrapped recap (see
-- wrappedController.js). One row per stretch: opened on join / game start,
-- closed (ended_at) on leave / game change. last_seen_at is a heartbeat
-- (jobs/activityTracking.js, gamePresence.js) so a stretch that was still
-- open when the server restarted gets closed at the last time it was known
-- to be going, rather than counting the downtime.
CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions (user_id, started_at);

CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  game VARCHAR(200) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON game_sessions (user_id, started_at);

-- Two-step sign-in on new devices (services/mfa.js). A trusted device keeps
-- a random token forever and skips the code; only its SHA-256 is stored.
-- Session JWTs carry the device id, so deleting a row here signs that
-- device out (middleware/auth.js).
CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  label VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices (user_id);

-- One sign-in attempt from an untrusted device: the hashed emailed code (or
-- nothing, for an authenticator app), how many guesses it's had, and when it
-- expires. Consumed on success.
CREATE TABLE IF NOT EXISTS login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(10) NOT NULL,
  code_hash VARCHAR(64),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Set by an admin ("let them in without a code once") for someone locked
-- out — e.g. signed up with a mistyped email. Cleared on their next sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_bypass_once BOOLEAN NOT NULL DEFAULT false;

-- Optional authenticator app (Authy, Google Authenticator...) for two-step
-- sign-in instead of emailed codes — see utils/totp.js. Secrets are stored
-- encrypted; totp_pending_secret holds one mid-setup until the first code
-- confirms the app has it. totp_last_step blocks reusing a code.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

-- One-time backup codes for when the phone with the authenticator is lost.
-- Hashed like device tokens; used_at marks one as spent.
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user ON mfa_backup_codes (user_id);

-- Birthdays — month and day only (no year, so nobody's age is shown).
-- jobs/birthdays.js posts a "happy birthday" in #general at 9am in the
-- person's own time zone; birthday_announced_year stops it repeating.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_month SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_day SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_announced_year SMALLINT;

-- Seed a default server
INSERT INTO servers (id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'General', 'The main server')
ON CONFLICT DO NOTHING;

INSERT INTO channels (id, server_id, name, type)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'general', 'text'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'announcements', 'text'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'General Voice', 'voice')
ON CONFLICT DO NOTHING;
