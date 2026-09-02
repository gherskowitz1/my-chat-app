import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { useDraft } from '../hooks/useDraft';
import { EVERYONE_USER } from '../utils/mentions';
import Message from './Message';
import MentionDropdown from './MentionDropdown';
import UserProfileCard from './UserProfileCard';
import TrackedGamesPanel from './TrackedGamesPanel';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import styles from './ChatArea.module.css';
import messageStyles from './Message.module.css';

const PAGE_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 150;

export default function ChatArea({ channel, onToggleMembers, showMembers, onOpenDM }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState([]);
  const [users, setUsers] = useState([]);
  const [profileTarget, setProfileTarget] = useState(null); // { user, rect }
  const [showGames, setShowGames] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [replyingTo, setReplyingTo] = useState(null); // { id, username, content }
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const mentionCandidates = useMemo(() => [EVERYONE_USER, ...users], [users]);
  const mention = useMentionAutocomplete(mentionCandidates);
  const { clearDraft } = useDraft(channel.id, input, setInput);

  const isAdmin = user?.role === 'admin';

  const scrollToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add(messageStyles.highlightFlash);
    setTimeout(() => el.classList.remove(messageStyles.highlightFlash), 1500);
  };

  const handleMentionClick = (mentionedUser, rect) => {
    setProfileTarget({ user: mentionedUser, rect });
  };

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => {});
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get(`/channels/${channel.id}/messages?limit=${PAGE_SIZE}`);
      setMessages(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
  }, [channel.id]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const container = messagesRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      const oldest = messages[0].created_at;
      const data = await api.get(`/channels/${channel.id}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest)}`);
      if (data.length > 0) {
        setMessages((prev) => [...data, ...prev]);
        // Keep the same messages in view instead of jumping to the top —
        // prepending content above the scroll position pushes everything
        // down, so compensate by the exact height that was just added.
        requestAnimationFrame(() => {
          if (container) container.scrollTop += container.scrollHeight - prevScrollHeight;
        });
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [channel.id, messages, hasMore, loadingMore]);

  const handleMessagesScroll = (e) => {
    const el = e.currentTarget;
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < LOAD_MORE_THRESHOLD_PX) loadOlderMessages();
  };

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setTyping([]);
    setReplyingTo(null);
    shouldStickToBottomRef.current = true;
    fetchMessages();
    socket?.emit('channel:join', channel.id);
  }, [channel.id, fetchMessages, socket]);

  useEffect(() => {
    api.get(`/channels/${channel.id}/pins`)
      .then((pins) => setPinnedIds(new Set(pins.map((p) => p.id))))
      .catch(() => {});
  }, [channel.id]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      if (msg.channel_id === channel.id) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    const onDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };
    const onEdited = (updated) => {
      if (updated.channel_id !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    };
    const onTyping = ({ userId, username, typing: isTyping }) => {
      if (userId === user.id) return;
      setTyping((prev) =>
        isTyping ? (prev.includes(username) ? prev : [...prev, username]) : prev.filter((u) => u !== username)
      );
    };

    const onReactions = ({ messageId, channelId, reactions }) => {
      if (channelId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };
    const onPinned = ({ channelId, messageId }) => {
      if (channelId !== channel.id) return;
      setPinnedIds((prev) => new Set(prev).add(messageId));
    };
    const onUnpinned = ({ channelId, messageId }) => {
      if (channelId !== channel.id) return;
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    };

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('message:edited', onEdited);
    socket.on('typing:update', onTyping);
    socket.on('message:reactions', onReactions);
    socket.on('message:pinned', onPinned);
    socket.on('message:unpinned', onUnpinned);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('message:edited', onEdited);
      socket.off('typing:update', onTyping);
      socket.off('message:reactions', onReactions);
      socket.off('message:pinned', onPinned);
      socket.off('message:unpinned', onUnpinned);
    };
  }, [socket, channel.id, user.id]);

  useEffect(() => {
    // Only auto-scroll when the user was already at the bottom — otherwise
    // this would yank their position every time older messages load in from
    // scrolling up, or a new message arrives while they're reading back.
    if (shouldStickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    socket?.emit('message:send', { channelId: channel.id, content: input.trim(), replyToId: replyingTo?.id });
    setInput('');
    clearDraft();
    setReplyingTo(null);
    shouldStickToBottomRef.current = true;
    stopTyping();
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    mention.updateFromCursor(e.target.value, e.target.selectionStart);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket?.emit('typing:start', { channelId: channel.id });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 2000);
  };

  const selectMention = (username) => {
    const result = mention.applySuggestion(input, username);
    if (!result) return;
    setInput(result.text);
    mention.close();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = result.cursor;
    });
  };

  const handleInputKeyDown = (e) => {
    if (mention.isOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mention.moveActiveIndex(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mention.moveActiveIndex(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mention.suggestions[mention.activeIndex].username);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); mention.close(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const stopTyping = () => {
    isTypingRef.current = false;
    socket?.emit('typing:stop', { channelId: channel.id });
    clearTimeout(typingTimerRef.current);
  };

  const deleteMessage = (messageId) => {
    socket?.emit('message:delete', { messageId, channelId: channel.id });
  };

  const editMessage = (messageId, content) => {
    socket?.emit('message:edit', { messageId, channelId: channel.id, content });
  };

  const reactToMessage = (messageId, emoji) => {
    socket?.emit('message:react', { messageId, channelId: channel.id, emoji });
  };

  const startReply = (msg) => {
    setReplyingTo({ id: msg.id, username: msg.username, content: msg.content });
    inputRef.current?.focus();
  };

  const pinMessage = async (messageId) => {
    try {
      await api.post(`/channels/${channel.id}/pins/${messageId}`, {});
      setPinnedIds((prev) => new Set(prev).add(messageId));
      socket?.emit('message:pinned', { channelId: channel.id, messageId });
    } catch {}
  };

  const unpinMessage = async (messageId) => {
    try {
      await api.delete(`/channels/${channel.id}/pins/${messageId}`);
      setPinnedIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      socket?.emit('message:unpinned', { channelId: channel.id, messageId });
    } catch {}
  };

  return (
    <div className={styles.area}>
      <div className={styles.header}>
        <span className={styles.hash}>#</span>
        <h3>{channel.name}</h3>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => setShowPins(true)}
            title="Pinned messages"
          >
            📌
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setShowGames(true)}
            title="Tracked games (PatchBot)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.5 6h-11C4.57 6 3 7.57 3 9.5v5C3 16.43 4.57 18 6.5 18c1.14 0 2.16-.55 2.8-1.4l1-1.33h3.4l1 1.33c.64.85 1.66 1.4 2.8 1.4 1.93 0 3.5-1.57 3.5-3.5v-5C21 7.57 19.43 6 17.5 6zM11 12H9.5v1.5H8V12H6.5v-1.5H8V9h1.5v1.5H11V12zm4.5 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${showMembers ? styles.active : ''}`}
            onClick={onToggleMembers}
            title="Toggle member list"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </button>
        </div>
      </div>

      {showGames && <TrackedGamesPanel channel={channel} onClose={() => setShowGames(false)} />}
      {showPins && (
        <PinnedMessagesPanel
          channel={channel}
          onClose={() => setShowPins(false)}
          onJump={scrollToMessage}
        />
      )}

      <div className={styles.messages} ref={messagesRef} onScroll={handleMessagesScroll}>
        {loadingMore && <div className={styles.loadingMore}>Loading earlier messages…</div>}
        {!hasMore && (
          <div className={styles.welcomeBanner}>
            <div className={styles.channelIcon}>#</div>
            <h2>Welcome to #{channel.name}!</h2>
            <p>This is the start of the #{channel.name} channel.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.user_id === msg.user_id &&
            new Date(msg.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
          return (
            <Message
              key={msg.id}
              msg={msg}
              grouped={grouped}
              canDelete={user.id === msg.user_id || user.role === 'admin'}
              canEdit={user.id === msg.user_id}
              onDelete={deleteMessage}
              onEdit={editMessage}
              users={mentionCandidates}
              onMentionClick={handleMentionClick}
              allMessages={messages}
              isPinned={pinnedIds.has(msg.id)}
              canPin={isAdmin}
              onPin={pinMessage}
              onUnpin={unpinMessage}
              onReply={startReply}
              onReact={reactToMessage}
              onJumpToMessage={scrollToMessage}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {profileTarget && (
        <UserProfileCard
          user={profileTarget.user}
          anchorRect={profileTarget.rect}
          isSelf={profileTarget.user.id === user.id}
          onClose={() => setProfileTarget(null)}
          onMessage={onOpenDM}
        />
      )}

      {typing.length > 0 && (
        <div className={styles.typing}>
          <span className={styles.typingDots}><span/><span/><span/></span>
          <span>
            {typing.length === 1
              ? `${typing[0]} is typing…`
              : `${typing.slice(0, -1).join(', ')} and ${typing[typing.length - 1]} are typing…`}
          </span>
        </div>
      )}

      <div className={styles.inputWrapper}>
        {replyingTo && (
          <div className={styles.replyBar}>
            <span>Replying to <strong>{replyingTo.username}</strong> — {replyingTo.content.slice(0, 60)}</span>
            <button type="button" onClick={() => setReplyingTo(null)} title="Cancel reply">✕</button>
          </div>
        )}
        {mention.isOpen && (
          <MentionDropdown
            suggestions={mention.suggestions}
            activeIndex={mention.activeIndex}
            onSelect={selectMention}
          />
        )}
        <form onSubmit={sendMessage} className={styles.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTyping}
            onKeyDown={handleInputKeyDown}
            onBlur={() => { stopTyping(); mention.close(); }}
            placeholder={`Message #${channel.name}`}
            className={styles.input}
            maxLength={2000}
            rows={1}
          />
          <button type="submit" className={styles.sendBtn} disabled={!input.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
