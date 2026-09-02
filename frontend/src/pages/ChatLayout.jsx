import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import SearchPanel from '../components/SearchPanel';
import FriendsPanel from '../components/FriendsPanel';
import { mentionsUser } from '../utils/mentions';
import { CURRENT_VERSION } from '../data/changelog';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import styles from './ChatLayout.module.css';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';
const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const WHATS_NEW_KEY = 'crowsnest_whatsnew_seen';

function truncate(text, max = 120) {
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
  const [unreadChannels, setUnreadChannels] = useState(new Map()); // channelId -> { count, mentioned }
  const [unreadDMs, setUnreadDMs] = useState(new Map()); // conversationId -> count
  const [toasts, setToasts] = useState([]);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [pendingJump, setPendingJump] = useState(null); // { type: 'channel'|'dm', targetId, messageId }
  const toastIdRef = useRef(0);

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

  // Unread badges, in-app toasts, and (inside the Electron app only) desktop
  // notifications — all driven by the same notify:message/notify:dm events
  // the server already broadcasts to every recipient of a message.
  useEffect(() => {
    if (!socket) return;

    const onMessageNotify = ({ channelId, channelName, username, content }) => {
      const isViewing = activeSection === 'server' && activeChannel?.id === channelId;
      if (isViewing) return;

      const mentioned = mentionsUser(content, user.username);

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
  }, [socket, activeSection, activeChannel, activeConversation, user.username, pushToast]);

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

  return (
    <div className={`${styles.layout} ${mobileChatOpen ? styles.chatOpen : ''}`}>
      <ServerSidebar
        serverName={serverName}
        serverIcon={serverIcon}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenFriends={() => setShowFriends(true)}
        hasUnreadDMs={unreadDMs.size > 0}
        hasUnreadChannels={unreadChannels.size > 0}
        pendingFriendRequests={pendingFriendRequests}
      />

      <div className={styles.navPane}>
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
          />
        ) : (
          <DMSidebar
            activeConversation={activeConversation}
            onConversationSelect={selectConversation}
            unreadDMs={unreadDMs}
          />
        )}
      </div>

      <div className={styles.main}>
        {activeSection === 'server' && activeChannel ? (
          <ChatArea
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

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {showWhatsNew && <WhatsNewModal onClose={dismissWhatsNew} />}

      {showSearch && (
        <SearchPanel
          onClose={() => setShowSearch(false)}
          onJumpToChannel={jumpToChannelResult}
          onJumpToDm={jumpToDmResult}
        />
      )}

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
