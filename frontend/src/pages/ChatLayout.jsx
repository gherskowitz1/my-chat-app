import React, { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import ServerSidebar from '../components/ServerSidebar';
import ChannelSidebar from '../components/ChannelSidebar';
import ChatArea from '../components/ChatArea';
import DMSidebar from '../components/DMSidebar';
import DMArea from '../components/DMArea';
import MemberList from '../components/MemberList';
import AdminPanel from '../components/AdminPanel';
import UserSettings, { STORAGE_KEY_DM_SOUND_MUTED } from '../components/UserSettings';
import ToastStack from '../components/ToastStack';
import WhatsNewModal from '../components/WhatsNewModal';
import AnnouncementModal from '../components/AnnouncementModal';
import SearchPanel from '../components/SearchPanel';
import FriendsPanel from '../components/FriendsPanel';
import EventsPanel from '../components/EventsPanel';
import BirthdayCelebration from '../components/BirthdayCelebration';
import { isBirthdayToday, isBirthdayTomorrow } from '../utils/birthdays';
import WrappedModal, { wrappedYear, isWrappedSeason } from '../components/WrappedModal';
import { OPEN_WRAPPED_EVENT } from '../utils/slashCommands';
import SeasonalTheme from '../components/SeasonalTheme';
import { mentionsUser } from '../utils/mentions';
import { maskSpoilers } from '../utils/spoilers';
import { describeRecurrence } from '../utils/eventFormat';
import { useGlobalShortcuts } from '../hooks/useKeyboardShortcuts';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { CURRENT_VERSION } from '../data/changelog';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import styles from './ChatLayout.module.css';
// Lazy so LiveKit's bundle only loads once someone actually opens a voice channel.
const VoiceChannel = lazy(() => import('../components/VoiceChannel'));

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';
const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const WHATS_NEW_KEY = 'crowsnest_whatsnew_seen';
// The voice channel you're connected to, kept for the life of the window so
// View > Reload (or any page reload) drops you straight back into the call.
// sessionStorage, not localStorage, so quitting the app and reopening it
// later doesn't auto-join you anywhere.
const ACTIVE_VOICE_KEY = 'crowsnest_active_voice';

function readSavedVoiceChannel() {
  try { return JSON.parse(sessionStorage.getItem(ACTIVE_VOICE_KEY)); } catch { return null; }
}

// Message previews for toasts and desktop notifications — spoilers masked so
// a ||hidden|| part never shows up in a pop-up (see utils/spoilers.js).
function truncate(rawText, max = 120) {
  const text = maskSpoilers(rawText);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function ChatLayout() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [activeSection, setActiveSection] = useState('server');
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  // Defaults open on desktop (there's room for it) but closed on a phone —
  // otherwise it'd immediately overlay the chat (and the very button that
  // closes it) the first time you open any channel.
  const [showMembers, setShowMembers] = useState(() => window.innerWidth > 768);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState(null);
  const [serverOwnerId, setServerOwnerId] = useState(null);
  const [categoryLabels, setCategoryLabels] = useState({ text: 'TEXT CHANNELS', voice: 'VOICE CHANNELS' });
  const [channelRefreshKey, setChannelRefreshKey] = useState(0);
  const [dmRefreshKey, setDmRefreshKey] = useState(0);
  const [unreadChannels, setUnreadChannels] = useState(new Map()); // channelId -> { count, mentioned }
  const [mutedChannelIds, setMutedChannelIds] = useState(new Set());
  const [unreadDMs, setUnreadDMs] = useState(new Map()); // conversationId -> count
  const [toasts, setToasts] = useState([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showWrapped, setShowWrapped] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [events, setEvents] = useState([]); // upcoming Game Night events, soonest first
  const [eventClock, setEventClock] = useState(() => Date.now());
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [pendingJump, setPendingJump] = useState(null); // { type: 'channel'|'dm', targetId, messageId }
  // Voice lives up here, not in ChannelSidebar, so switching to DMs (which
  // unmounts the sidebar) doesn't hang up the call. See VoiceChannel.jsx.
  const [activeVoiceChannel, setActiveVoiceChannel] = useState(readSavedVoiceChannel);
  const [autoJoinVoiceId, setAutoJoinVoiceId] = useState(() => readSavedVoiceChannel()?.id || null);
  const voiceJoinedRef = useRef(false); // actually connected, not just showing a Join button
  const [afkChannel, setAfkChannel] = useState(null);
  const [sidebarVoiceSlot, setSidebarVoiceSlot] = useState(null);
  const [dmVoiceSlot, setDmVoiceSlot] = useState(null);
  const toastIdRef = useRef(0);
  // Whichever of ChatArea/DMArea is currently mounted — they're mutually
  // exclusive in .main, so one ref safely covers both (see useGlobalShortcuts below).
  const composerRef = useRef(null);
  const navPaneRef = useRef(null); // the two phone-layout panes, for swipe-back
  const mainPaneRef = useRef(null);

  // Show the changelog once to a returning user whose last-seen version is
  // behind — never to a brand-new sign-up, who has nothing to catch up on.
  useEffect(() => {
    const seen = localStorage.getItem(WHATS_NEW_KEY);
    if (seen === null) {
      localStorage.setItem(WHATS_NEW_KEY, CURRENT_VERSION);
      return;
    }
    if (seen !== CURRENT_VERSION) setShowWhatsNew(true);
  }, []);

  const dismissWhatsNew = () => {
    localStorage.setItem(WHATS_NEW_KEY, CURRENT_VERSION);
    setShowWhatsNew(false);
  };

  // Admin-pushed announcement, shown once per account (tracked server-side,
  // not localStorage, so it follows the user across devices). Fetched after
  // the What's New check so the two never stack on top of each other.
  useEffect(() => {
    api.get('/announcements/latest')
      .then(({ announcement: a }) => { if (a) setAnnouncement(a); })
      .catch(() => {});
  }, []);

  const dismissAnnouncement = () => {
    const id = announcement?.id;
    setAnnouncement(null);
    if (id) api.post('/announcements/seen', { announcementId: id }).catch(() => {});
  };

  useEffect(() => {
    api.get('/channel-mutes').then((ids) => setMutedChannelIds(new Set(ids))).catch(() => {});
  }, []);

  // Optimistic toggle — reverted if the request fails, same pattern used
  // elsewhere in this file for anything that hits the API from a click.
  const toggleChannelMute = useCallback((channelId) => {
    setMutedChannelIds((prev) => {
      const wasMuted = prev.has(channelId);
      const next = new Set(prev);
      if (wasMuted) next.delete(channelId); else next.add(channelId);

      const request = wasMuted
        ? api.delete(`/channels/${channelId}/mute`)
        : api.post(`/channels/${channelId}/mute`, {});
      request.catch(() => {
        setMutedChannelIds((cur) => {
          const reverted = new Set(cur);
          if (wasMuted) reverted.add(channelId); else reverted.delete(channelId);
          return reverted;
        });
      });

      return next;
    });
  }, []);

  const pushToast = useCallback((toast) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, ...toast }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load real server name/category labels from DB on mount
  useEffect(() => {
    api.get(`/servers/${DEFAULT_SERVER}`)
      .then(s => {
        setServerName(s.name);
        setServerIcon(s.icon_url);
        setServerOwnerId(s.owner_id);
        setCategoryLabels({ text: s.text_category_label, voice: s.voice_category_label });
      })
      .catch(() => setServerName('General Server'));
  }, []);

  useEffect(() => {
    api.get('/friends').then((d) => setPendingFriendRequests(d.incoming.length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onFriendRequest = ({ username }) => {
      setPendingFriendRequests((n) => n + 1);
      pushToast({ title: 'Friend Request', body: `${username} wants to be friends`, onClick: () => setShowFriends(true) });
    };
    const onFriendAccepted = ({ username }) => {
      pushToast({ title: 'Friend Request Accepted', body: `${username} accepted your friend request`, onClick: () => setShowFriends(true) });
    };
    socket.on('friend:request', onFriendRequest);
    socket.on('friend:accepted', onFriendAccepted);
    return () => {
      socket.off('friend:request', onFriendRequest);
      socket.off('friend:accepted', onFriendAccepted);
    };
  }, [socket, pushToast]);

  // Crows Nest Wrapped: /wrapped opens it any time; during Wrapped season
  // (Dec–Jan) there's also a rail button and a one-time "it's here" toast.
  useEffect(() => {
    const open = () => setShowWrapped(true);
    window.addEventListener(OPEN_WRAPPED_EVENT, open);
    return () => window.removeEventListener(OPEN_WRAPPED_EVENT, open);
  }, []);

  useEffect(() => {
    if (!isWrappedSeason()) return;
    const key = `crowsnest_wrapped_seen_${wrappedYear()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch { return; }
    pushToast({
      title: `🎁 Your ${wrappedYear()} Crows Nest Wrapped is here`,
      body: 'See your year in messages, emoji, voice, and games.',
      sticky: true,
      onClick: () => setShowWrapped(true),
      actions: [{ label: 'Open it', onClick: () => setShowWrapped(true) }],
    });
  }, [pushToast]);

  // Birthdays (utils/birthdays.js): confetti if it's yours, and a heads-up
  // the day before anyone else's — each at most once a day per device.
  useEffect(() => {
    const today = new Date().toDateString();
    const once = (key) => {
      try {
        if (localStorage.getItem(key) === today) return false;
        localStorage.setItem(key, today);
        return true;
      } catch { return false; }
    };
    if (isBirthdayToday(user) && once('crowsnest_bday_celebrated')) setCelebrating(true);
    api.get('/users').then((users) => {
      users
        .filter((u) => !u.invisible && isBirthdayTomorrow(u))
        .forEach((u) => {
          if (once(`crowsnest_bday_heads_up_${u.id}`)) {
            pushToast({ title: `🎂 Tomorrow is ${u.username}'s birthday`, body: 'Don’t forget to say happy birthday!' });
          }
        });
    }).catch(() => {});
    // Once per app load is plenty; the date only matters at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Game Night events — the upcoming list drives the sidebar banner and the
  // rail button's dot; the toasts announce new events and the 15-minute
  // reminder (see jobs/eventReminders.js). The full panel is EventsPanel.
  const loadEvents = useCallback(() => {
    api.get('/events').then(setEvents).catch(() => {});
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Re-evaluate "within the next day" as time passes, not just on changes.
  useEffect(() => {
    const id = setInterval(() => setEventClock(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onCreated = ({ title, startsAt, recurrence, createdBy, createdById }) => {
      if (createdById === user.id) return;
      const when = describeRecurrence(recurrence, startsAt)
        || new Date(startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      pushToast({ title: `📅 ${createdBy} scheduled ${title}`, body: when, onClick: () => setShowEvents(true) });
    };
    // /lfg: someone needs players for a game you play (lfgController.js).
    const onLfg = ({ lfgId, channelId, channelName, username, game, needed }) => {
      const heading = `🎮 ${username} needs ${needed} more for ${game}`;
      const open = () => { setActiveSection('server'); selectChannel({ id: channelId, name: channelName }); };
      pushToast({
        title: heading,
        body: `In #${channelName}`,
        sticky: true,
        onClick: open,
        actions: [
          { label: '✋ I’m in', onClick: () => { api.post(`/lfg/${lfgId}/join`, {}).catch(() => {}); open(); } },
          { label: 'Not now', onClick: () => {} },
        ],
      });
      window.electron?.notify?.(heading, `In #${channelName}`);
    };
    const onLfgFull = ({ game, names }) => {
      pushToast({ title: `🎉 Your ${game} party is full!`, body: names });
      window.electron?.notify?.(`🎉 Your ${game} party is full!`, names);
    };
    // A week before each date: "are you in?" — answered right from the
    // pop-up, which stays up until answered or dismissed.
    const onCheckin = ({ eventId, title, startsAt, voiceChannelName }) => {
      const when = new Date(startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const answer = (status) => api.post(`/events/${eventId}/rsvp`, { status }).catch(() => {});
      const heading = `📅 Are you in for ${title}?`;
      const body = voiceChannelName ? `${when} · ${voiceChannelName}` : when;
      pushToast({
        title: heading,
        body,
        sticky: true,
        onClick: () => setShowEvents(true),
        actions: [
          { label: '✓ I’m in', onClick: () => answer('going') },
          { label: 'Maybe', onClick: () => answer('maybe') },
          { label: 'Can’t make it', onClick: () => answer('no') },
        ],
      });
      window.electron?.notify?.(heading, body);
    };
    const onReminder = ({ title, startsAt, voiceChannelName }) => {
      const mins = Math.max(0, Math.round((new Date(startsAt) - Date.now()) / 60000));
      const heading = `📅 ${title} ${mins === 0 ? 'is starting now' : `starts in ${mins} min`}`;
      const body = voiceChannelName ? `Join ${voiceChannelName}` : 'Game Night';
      pushToast({ title: heading, body, onClick: () => setShowEvents(true) });
      window.electron?.notify?.(heading, body);
    };
    socket.on('events:changed', loadEvents);
    socket.on('events:created', onCreated);
    socket.on('notify:event', onReminder);
    socket.on('notify:eventCheckin', onCheckin);
    socket.on('notify:lfg', onLfg);
    socket.on('notify:lfgFull', onLfgFull);
    return () => {
      socket.off('notify:eventCheckin', onCheckin);
      socket.off('notify:lfg', onLfg);
      socket.off('notify:lfgFull', onLfgFull);
      socket.off('events:changed', loadEvents);
      socket.off('events:created', onCreated);
      socket.off('notify:event', onReminder);
    };
  }, [socket, pushToast, loadEvents, user.id]);

  // The soonest event that's in progress or starts within the next 24 hours.
  const nextEvent = useMemo(() => {
    const soon = eventClock + 24 * 60 * 60 * 1000;
    return events.find((ev) => new Date(ev.starts_at).getTime() <= soon) || null;
  }, [events, eventClock]);

  // Unread badges, in-app toasts, and (inside the Electron app only) desktop
  // notifications — all driven by the same notify:message/notify:dm events
  // the server already broadcasts to every recipient of a message.
  useEffect(() => {
    if (!socket) return;

    const onMessageNotify = ({ channelId, channelName, username, content }) => {
      const isViewing = activeSection === 'server' && activeChannel?.id === channelId;
      if (isViewing) return;

      const mentioned = mentionsUser(content, user.username);
      // A muted channel still notifies for an @mention — muting quiets the
      // ambient noise of a chatty channel, it's not a blanket silence.
      const isMuted = mutedChannelIds.has(channelId) && !mentioned;
      if (isMuted) return;

      setUnreadChannels((prev) => {
        const next = new Map(prev);
        const existing = next.get(channelId) || { count: 0, mentioned: false };
        next.set(channelId, { count: existing.count + 1, mentioned: existing.mentioned || mentioned });
        return next;
      });

      if (window.electron?.notify) {
        window.electron.notify(
          mentioned ? `${username} mentioned you in #${channelName}` : `#${channelName}`,
          `${username}: ${truncate(content)}`
        );
      }

      if (mentioned) {
        pushToast({
          title: `${username} mentioned you in #${channelName}`,
          body: truncate(content),
          onClick: () => selectChannel({ id: channelId, name: channelName }),
        });
      }
    };

    const onDmNotify = ({ conversationId, username, content }) => {
      const isViewing = activeSection === 'dm' && activeConversation?.id === conversationId;
      if (isViewing) return;

      if (localStorage.getItem(STORAGE_KEY_DM_SOUND_MUTED) !== 'true') {
        new Audio('/sounds/youve-got-mail.mp3').play().catch(() => {});
      }

      setUnreadDMs((prev) => {
        const next = new Map(prev);
        next.set(conversationId, (next.get(conversationId) || 0) + 1);
        return next;
      });

      if (window.electron?.notify) {
        window.electron.notify(username, truncate(content));
      }

      pushToast({
        title: username,
        body: truncate(content),
        onClick: () => openDMByConversationId(conversationId),
      });
    };

    socket.on('notify:message', onMessageNotify);
    socket.on('notify:dm', onDmNotify);
    return () => {
      socket.off('notify:message', onMessageNotify);
      socket.off('notify:dm', onDmNotify);
    };
  }, [socket, activeSection, activeChannel, activeConversation, user.username, pushToast, mutedChannelIds]);

  // Away status — report idle/active to the server after 30 minutes with no
  // mouse/keyboard activity anywhere in the app.
  useEffect(() => {
    if (!socket) return;
    let idleTimer;
    let isIdle = false;

    const markActive = () => {
      if (isIdle) {
        isIdle = false;
        socket.emit('presence:active');
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isIdle = true;
        socket.emit('presence:idle');
      }, IDLE_THRESHOLD_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, markActive));
    markActive();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActive));
      clearTimeout(idleTimer);
    };
  }, [socket]);

  // Picking a different voice channel (or leaving) forgets the saved one —
  // it's only written back once the new channel is actually joined.
  const changeVoiceChannel = useCallback((channel) => {
    try { sessionStorage.removeItem(ACTIVE_VOICE_KEY); } catch {}
    setAutoJoinVoiceId(null);
    voiceJoinedRef.current = false;
    setActiveVoiceChannel(channel);
  }, []);

  const leaveVoiceChannel = useCallback(() => changeVoiceChannel(null), [changeVoiceChannel]);

  // A click on a voice channel in the sidebar, or the 4-hour AFK move.
  // While connected: clicking the channel you're already in does nothing
  // (leaving is only ever the Leave button, so a stray click can't hang up
  // the call), and moving to another channel joins it straight away instead
  // of stopping at its Join button. Not yet connected: clicking a channel
  // opens its Join button, and clicking it again closes that.
  const switchVoiceChannel = useCallback((channel) => {
    if (!channel) return;
    const wasJoined = voiceJoinedRef.current;
    if (channel.id === activeVoiceChannel?.id) {
      if (!wasJoined) changeVoiceChannel(null);
      return;
    }
    changeVoiceChannel(channel);
    if (wasJoined) setAutoJoinVoiceId(channel.id);
  }, [activeVoiceChannel?.id, changeVoiceChannel]);

  const handleVoiceJoined = useCallback(() => {
    voiceJoinedRef.current = true;
    if (!activeVoiceChannel) return;
    try {
      sessionStorage.setItem(ACTIVE_VOICE_KEY, JSON.stringify({ id: activeVoiceChannel.id, name: activeVoiceChannel.name }));
    } catch {}
  }, [activeVoiceChannel]);

  const handleServerRenamed = useCallback((updatedServer) => {
    setServerName(updatedServer.name);
    setServerIcon(updatedServer.icon_url);
    setCategoryLabels({ text: updatedServer.text_category_label, voice: updatedServer.voice_category_label });
  }, []);

  const handleChannelRenamed = useCallback((updatedChannel) => {
    setActiveChannel(prev =>
      prev?.id === updatedChannel.id ? { ...prev, name: updatedChannel.name } : prev
    );
    // Increment key to tell ChannelSidebar to re-fetch channels,
    // but pass the current serverName so it doesn't reset
    setChannelRefreshKey(k => k + 1);
  }, []);

  // Opens (or starts) a DM with a user — used by the profile card's Message
  // button, reachable from a clicked @mention anywhere in the app.
  const openDM = useCallback(async (userId) => {
    try {
      const conv = await api.post(`/dm/conversations/${userId}`, {});
      const list = await api.get('/dm/conversations');
      const full = list.find((c) => c.id === conv.id) || conv;
      setActiveConversation(full);
      setActiveSection('dm');
      // Opening a conversation can un-hide it server-side (see
      // getOrCreateConversation) — remount DMSidebar so its own list
      // reflects that instead of waiting for some other refresh trigger.
      setDmRefreshKey((k) => k + 1);
    } catch {}
  }, []);

  // Jumps to an existing conversation by id — used when clicking a DM toast,
  // which only carries the conversationId, not the full joined-user record
  // DMArea needs to render (avatar, other_username, etc).
  const openDMByConversationId = useCallback(async (conversationId) => {
    try {
      const list = await api.get('/dm/conversations');
      const conv = list.find((c) => c.id === conversationId);
      if (conv) {
        setActiveConversation(conv);
        setActiveSection('dm');
        setDmRefreshKey((k) => k + 1);
      }
    } catch {}
  }, []);

  // Wraps channel/conversation selection to also clear that item's unread
  // state — the single place "I've read this" gets recorded.
  const selectChannel = useCallback((channel) => {
    setActiveChannel(channel);
    if (channel) {
      setUnreadChannels((prev) => {
        if (!prev.has(channel.id)) return prev;
        const next = new Map(prev);
        next.delete(channel.id);
        return next;
      });
    }
  }, []);

  const selectConversation = useCallback((conv) => {
    setActiveConversation(conv);
    if (conv) {
      setUnreadDMs((prev) => {
        if (!prev.has(conv.id)) return prev;
        const next = new Map(prev);
        next.delete(conv.id);
        return next;
      });
    }
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadChannels(new Map());
    setUnreadDMs(new Map());
  }, []);

  // App-wide keyboard shortcuts (rebindable in User Settings > Shortcuts) —
  // separate from the voice-call ones, which only listen while in a channel.
  useGlobalShortcuts({
    toggleMembers: () => setShowMembers((v) => !v),
    toggleSearch: () => setShowSearch((v) => !v),
    toggleFriends: () => setShowFriends((v) => !v),
    openSettings: () => setShowSettings((v) => !v),
    markAllRead,
    // Reach into whichever of ChatArea/DMArea is currently mounted — see
    // composerRef above. DMArea has no togglePollComposer (polls are
    // channels-only), so that one no-ops via optional chaining in DMs.
    focusComposer: () => composerRef.current?.focusComposer(),
    toggleEmojiPicker: () => composerRef.current?.toggleEmojiPicker(),
    toggleGifPicker: () => composerRef.current?.toggleGifPicker(),
    togglePollComposer: () => composerRef.current?.togglePollComposer?.(),
  });

  // Search result click — switch to the right channel/DM, then hand it a
  // pending jump target; ChatArea/DMArea resolve it (scrolling directly if
  // already loaded, or fetching a window of history centered on it).
  const jumpToChannelResult = (result) => {
    selectChannel({ id: result.channel_id, name: result.channel_name });
    setActiveSection('server');
    setPendingJump({ type: 'channel', targetId: result.channel_id, messageId: result.id });
    setShowSearch(false);
  };

  const jumpToDmResult = async (result) => {
    await openDMByConversationId(result.conversation_id);
    setPendingJump({ type: 'dm', targetId: result.conversation_id, messageId: result.id });
    setShowSearch(false);
  };

  const clearPendingJump = useCallback(() => setPendingJump(null), []);

  // Below the mobile breakpoint (see ChatLayout.module.css), the nav pane
  // and the chat pane can't both fit on screen — this decides which one to
  // show. Above the breakpoint it's a no-op; both are always visible.
  const mobileChatOpen = (activeSection === 'server' && !!activeChannel) || (activeSection === 'dm' && !!activeConversation);
  const backToNav = () => {
    if (activeSection === 'server') selectChannel(null);
    else selectConversation(null);
  };
  // ...or swipe right on the open chat to do the same (phone layout only).
  useSwipeBack({ enabled: mobileChatOpen, onBack: backToNav, paneRef: mainPaneRef, navRef: navPaneRef });

  return (
    <div className={`${styles.layout} ${mobileChatOpen ? styles.chatOpen : ''}`}>
      <div className={styles.serverRail}>
        <ServerSidebar
          serverName={serverName}
          serverIcon={serverIcon}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onOpenAdmin={() => setShowAdmin(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenSearch={() => setShowSearch(true)}
          onOpenFriends={() => setShowFriends(true)}
          onOpenEvents={() => setShowEvents(true)}
          hasUpcomingEvent={!!nextEvent}
          showWrapped={isWrappedSeason()}
          onOpenWrapped={() => setShowWrapped(true)}
          onMarkAllRead={markAllRead}
          hasUnreadDMs={unreadDMs.size > 0}
          hasUnreadChannels={unreadChannels.size > 0}
          pendingFriendRequests={pendingFriendRequests}
        />
      </div>

      <div className={styles.mobileStack}>
      <div ref={navPaneRef} className={styles.navPane}>
        {activeSection === 'server' ? (
          <ChannelSidebar
            key={channelRefreshKey}
            serverId={DEFAULT_SERVER}
            serverName={serverName}
            textCategoryLabel={categoryLabels.text}
            voiceCategoryLabel={categoryLabels.voice}
            activeChannel={activeChannel}
            onChannelSelect={selectChannel}
            unreadChannels={unreadChannels}
            mutedChannelIds={mutedChannelIds}
            onToggleMute={toggleChannelMute}
            nextEvent={nextEvent}
            onOpenEvents={() => setShowEvents(true)}
            activeVoiceChannel={activeVoiceChannel}
            onVoiceChannelChange={switchVoiceChannel}
            onVoiceSlot={setSidebarVoiceSlot}
            onAfkChannelChange={setAfkChannel}
          />
        ) : (
          <div className={styles.dmNav}>
            <DMSidebar
              key={dmRefreshKey}
              activeConversation={activeConversation}
              onConversationSelect={selectConversation}
              unreadDMs={unreadDMs}
            />
            {/* Still in a call while browsing DMs — its controls dock here. */}
            {activeVoiceChannel && (
              <div className={styles.voiceDock}>
                <div className={styles.voiceDockLabel}>Voice — {activeVoiceChannel.name}</div>
                <div ref={setDmVoiceSlot} />
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={mainPaneRef} className={styles.main}>
        {activeSection === 'server' && activeChannel ? (
          <ChatArea
            ref={composerRef}
            channel={activeChannel}
            onToggleMembers={() => setShowMembers((v) => !v)}
            showMembers={showMembers}
            onOpenDM={openDM}
            onBack={backToNav}
            ownerId={serverOwnerId}
            jumpToMessageId={pendingJump?.type === 'channel' && pendingJump.targetId === activeChannel.id ? pendingJump.messageId : null}
            onJumpHandled={clearPendingJump}
          />
        ) : activeSection === 'dm' && activeConversation ? (
          <DMArea
            ref={composerRef}
            conversation={activeConversation}
            onOpenDM={openDM}
            onBack={backToNav}
            ownerId={serverOwnerId}
            jumpToMessageId={pendingJump?.type === 'dm' && pendingJump.targetId === activeConversation.id ? pendingJump.messageId : null}
            onJumpHandled={clearPendingJump}
          />
        ) : (
          <EmptyState section={activeSection} />
        )}
      </div>
      </div>

      {/* Pinned member list — visible across text channels, voice channels, and DMs alike.
          On mobile it's an overlay (see MemberList.module.css), so it needs its own
          backdrop and close control rather than relying on the header toggle button,
          which the overlay would otherwise cover. */}
      {showMembers && (
        <>
          <div className={styles.membersBackdrop} onClick={() => setShowMembers(false)} />
          <MemberList serverId={DEFAULT_SERVER} ownerId={serverOwnerId} onClose={() => setShowMembers(false)} />
        </>
      )}

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onServerRenamed={handleServerRenamed}
          onChannelRenamed={handleChannelRenamed}
          onOwnerChanged={setServerOwnerId}
        />
      )}

      {showSettings && (
        <UserSettings onClose={() => setShowSettings(false)} />
      )}

      {activeVoiceChannel && (
        <div className={styles.voiceRoot}>
          <Suspense fallback={null}>
            <VoiceChannel
              key={activeVoiceChannel.id}
              channel={activeVoiceChannel}
              slot={sidebarVoiceSlot || dmVoiceSlot}
              autoJoin={activeVoiceChannel.id === autoJoinVoiceId}
              onJoined={handleVoiceJoined}
              onLeave={leaveVoiceChannel}
              afkChannel={afkChannel}
              onSwitchChannel={switchVoiceChannel}
            />
          </Suspense>
        </div>
      )}

      <SeasonalTheme />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {showWhatsNew && <WhatsNewModal onClose={dismissWhatsNew} />}
      {!showWhatsNew && announcement && <AnnouncementModal announcement={announcement} onClose={dismissAnnouncement} />}

      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onJumpToChannel={jumpToChannelResult}
          onJumpToDm={jumpToDmResult}
        />
      )}

      {showEvents && <EventsPanel serverId={DEFAULT_SERVER} onClose={() => setShowEvents(false)} />}
      {showWrapped && <WrappedModal year={wrappedYear()} onClose={() => setShowWrapped(false)} />}
      {celebrating && <BirthdayCelebration username={user.username} onDone={() => setCelebrating(false)} />}

      {showFriends && (
        <FriendsPanel
          onClose={() => {
            setShowFriends(false);
            // Accept/decline happens inside the panel — resync the badge
            // count now that it's closing rather than threading a callback
            // through every action.
            api.get('/friends').then((d) => setPendingFriendRequests(d.incoming.length)).catch(() => {});
          }}
          onOpenDM={openDM}
        />
      )}
    </div>
  );
}

function EmptyState({ section }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        {section === 'server' ? (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d="M5.5 3A2.5 2.5 0 0 0 3 5.5v13A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-13A2.5 2.5 0 0 0 18.5 3h-13zm7 4.5h1v9h-1v-9zm-4 2h1v7H8.5v-7zm8 2h1v5h-1v-5z"/>
          </svg>
        ) : (
          <svg width="72" height="72" viewBox="0 0 24 24" fill="var(--text-muted)">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
          </svg>
        )}
      </div>
      <p>{section === 'server' ? 'Select a channel to start chatting' : 'Select a conversation or start a new one'}</p>
    </div>
  );
}
