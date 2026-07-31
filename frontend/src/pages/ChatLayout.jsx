import React, { useState, useCallback, useEffect } from 'react';
import ServerSidebar from '../components/ServerSidebar';
import ChannelSidebar from '../components/ChannelSidebar';
import ChatArea from '../components/ChatArea';
import DMSidebar from '../components/DMSidebar';
import DMArea from '../components/DMArea';
import MemberList from '../components/MemberList';
import AdminPanel from '../components/AdminPanel';
import UserSettings from '../components/UserSettings';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import styles from './ChatLayout.module.css';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';
const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function truncate(text, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function ChatLayout() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [activeSection, setActiveSection] = useState('server');
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [showMembers, setShowMembers] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [serverName, setServerName] = useState('');
  const [channelRefreshKey, setChannelRefreshKey] = useState(0);

  // Load real server name from DB on mount
  useEffect(() => {
    api.get(`/servers/${DEFAULT_SERVER}`)
      .then(s => setServerName(s.name))
      .catch(() => setServerName('General Server'));
  }, []);

  // Desktop notifications — no-op in a plain browser tab (window.electron is
  // only present inside the Electron app). Skip whatever's already on screen.
  useEffect(() => {
    if (!socket || !window.electron?.notify) return;

    const onMessageNotify = ({ channelId, channelName, username, content }) => {
      if (activeSection === 'server' && activeChannel?.id === channelId) return;
      const mentioned = new RegExp(`@${user.username}\\b`, 'i').test(content);
      window.electron.notify(
        mentioned ? `${username} mentioned you in #${channelName}` : `#${channelName}`,
        `${username}: ${truncate(content)}`
      );
    };

    const onDmNotify = ({ conversationId, username, content }) => {
      if (activeSection === 'dm' && activeConversation?.id === conversationId) return;
      window.electron.notify(username, truncate(content));
    };

    socket.on('notify:message', onMessageNotify);
    socket.on('notify:dm', onDmNotify);
    return () => {
      socket.off('notify:message', onMessageNotify);
      socket.off('notify:dm', onDmNotify);
    };
  }, [socket, activeSection, activeChannel, activeConversation, user.username]);

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

  const handleServerRenamed = useCallback((name) => {
    setServerName(name);
  }, []);

  const handleChannelRenamed = useCallback((updatedChannel) => {
    setActiveChannel(prev =>
      prev?.id === updatedChannel.id ? { ...prev, name: updatedChannel.name } : prev
    );
    // Increment key to tell ChannelSidebar to re-fetch channels,
    // but pass the current serverName so it doesn't reset
    setChannelRefreshKey(k => k + 1);
  }, []);

  return (
    <div className={styles.layout}>
      <ServerSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {activeSection === 'server' ? (
        <ChannelSidebar
          key={channelRefreshKey}
          serverId={DEFAULT_SERVER}
          serverName={serverName}
          activeChannel={activeChannel}
          onChannelSelect={setActiveChannel}
        />
      ) : (
        <DMSidebar
          activeConversation={activeConversation}
          onConversationSelect={setActiveConversation}
        />
      )}

      <div className={styles.main}>
        {activeSection === 'server' && activeChannel ? (
          <ChatArea
            channel={activeChannel}
            onToggleMembers={() => setShowMembers((v) => !v)}
            showMembers={showMembers}
          />
        ) : activeSection === 'dm' && activeConversation ? (
          <DMArea conversation={activeConversation} />
        ) : (
          <EmptyState section={activeSection} />
        )}
      </div>

      {/* Pinned member list — visible across text channels, voice channels, and DMs alike */}
      {showMembers && <MemberList serverId={DEFAULT_SERVER} />}

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onServerRenamed={handleServerRenamed}
          onChannelRenamed={handleChannelRenamed}
        />
      )}

      {showSettings && (
        <UserSettings onClose={() => setShowSettings(false)} />
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
