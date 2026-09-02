import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { useDraft } from '../hooks/useDraft';
import { EVERYONE_USER } from '../utils/mentions';
import { addPending, removePending, getPendingFor, newClientId, reconcileMessage } from '../utils/outbox';
import { prepareAttachment, totalStagedBytes, MAX_TOTAL_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, isImageMime, formatBytes } from '../utils/attachments';
import Message from './Message';
import MentionDropdown from './MentionDropdown';
import UserProfileCard from './UserProfileCard';
import TrackedGamesPanel from './TrackedGamesPanel';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import styles from './ChatArea.module.css';
import messageStyles from './Message.module.css';

const PAGE_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 150;

// Renders an outbox entry as a message-shaped object so it can sit in the
// same list as real ones (dimmed via `pending`/`failed` in Message.jsx)
// until the server confirms it — the outbox entry itself only stores what's
// needed to resend, not a full author profile, so that comes from whoever's
// logged in now (always correct, since a pending entry is always your own).
function toOptimisticMessage(entry, user) {
  return {
    id: entry.clientId,
    client_id: entry.clientId,
    channel_id: entry.targetId,
    user_id: user.id,
    username: user.username,
    avatar_color: user.avatar_color,
    avatar_url: user.avatar_url,
    content: entry.content,
    reply_to_id: entry.replyToId || null,
    created_at: entry.createdAt,
    reactions: [],
    pending: true,
    failed: entry.failed || false,
  };
}

export default function ChatArea({ channel, onToggleMembers, showMembers, onOpenDM, onBack, ownerId, jumpToMessageId, onJumpHandled }) {
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
  const [stagedAttachments, setStagedAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingHistorical, setViewingHistorical] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const mentionCandidates = useMemo(() => [EVERYONE_USER, ...users], [users]);
  const mention = useMentionAutocomplete(mentionCandidates);
  const { clearDraft } = useDraft(channel.id, input, setInput);

  const isAdmin = user?.role === 'admin';

  const handleMentionClick = (mentionedUser, rect) => {
    setProfileTarget({ user: mentionedUser, rect });
  };

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => {});
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get(`/channels/${channel.id}/messages?limit=${PAGE_SIZE}`);
      // Anything still in the outbox for this channel either hasn't been
      // delivered yet (show it as pending) or was delivered but a reload
      // beat the delivery confirmation back here (already in `data` by
      // clientId, so skip re-adding it as a duplicate pending bubble).
      const deliveredClientIds = new Set(data.filter((m) => m.client_id).map((m) => m.client_id));
      const pending = getPendingFor('channel', channel.id)
        .filter((entry) => !deliveredClientIds.has(entry.clientId))
        .map((entry) => toOptimisticMessage(entry, user));
      setMessages([...data, ...pending]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
  }, [channel.id, user]);

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

  const flashMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add(messageStyles.highlightFlash);
    setTimeout(() => el.classList.remove(messageStyles.highlightFlash), 1500);
    return true;
  };

  // Jumps to a message — scrolls to it directly if it's already loaded,
  // otherwise fetches a window of history centered on it (e.g. an old
  // search result or reply-quote target far outside the current page).
  const scrollToMessage = async (messageId) => {
    if (flashMessage(messageId)) return;
    try {
      const data = await api.get(`/channels/${channel.id}/messages/around/${messageId}`);
      setMessages(data.messages);
      setHasMore(data.hasMoreBefore);
      setViewingHistorical(data.hasMoreAfter);
      shouldStickToBottomRef.current = false;
      requestAnimationFrame(() => setTimeout(() => flashMessage(messageId), 60));
    } catch {}
  };

  const jumpToPresent = async () => {
    setViewingHistorical(false);
    shouldStickToBottomRef.current = true;
    await fetchMessages();
    bottomRef.current?.scrollIntoView();
  };

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
    setViewingHistorical(false);
    shouldStickToBottomRef.current = true;
    socket?.emit('channel:join', channel.id);

    // A search/reply/pin jump can target either a channel switch or a new
    // target within the channel already open — both funnel through here
    // (keyed on jumpToMessageId too) so there's only ever one thing loading
    // messages for a given trigger, instead of this effect's normal fetch
    // racing a separate jump-effect's historical fetch over who sets state last.
    if (jumpToMessageId) {
      scrollToMessage(jumpToMessageId);
      onJumpHandled?.();
    } else {
      fetchMessages();
    }
  }, [channel.id, jumpToMessageId, fetchMessages, socket]);

  // Reconciles a pending bubble resolved by SocketContext's background
  // reconnect-flush, which runs independently of whichever channel happens
  // to be open right now.
  useEffect(() => {
    const onResolved = (e) => {
      if (e.detail.type !== 'channel' || e.detail.targetId !== channel.id) return;
      setMessages((prev) => reconcileMessage(prev, e.detail.message));
    };
    const onFailed = (e) => {
      if (e.detail.type !== 'channel' || e.detail.targetId !== channel.id) return;
      setMessages((prev) => prev.map((m) => (m.client_id === e.detail.clientId ? { ...m, pending: false, failed: true } : m)));
    };
    window.addEventListener('outbox:resolved', onResolved);
    window.addEventListener('outbox:failed', onFailed);
    return () => {
      window.removeEventListener('outbox:resolved', onResolved);
      window.removeEventListener('outbox:failed', onFailed);
    };
  }, [channel.id]);

  useEffect(() => {
    api.get(`/channels/${channel.id}/pins`)
      .then((pins) => setPinnedIds(new Set(pins.map((p) => p.id))))
      .catch(() => {});
  }, [channel.id]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      // Viewing an old window jumped to from search/reply/pin — appending a
      // live message here would tack it onto the end with a time gap in
      // between; let "Jump to Present" bring the user back to it instead.
      // Reconciling (rather than a plain append) means this also correctly
      // resolves our own pending outbox bubble if this broadcast is the
      // echo of a message we just sent.
      if (msg.channel_id === channel.id && !viewingHistorical) {
        setMessages((prev) => reconcileMessage(prev, msg));
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
  }, [socket, channel.id, user.id, viewingHistorical]);

  useEffect(() => {
    // Only auto-scroll when the user was already at the bottom — otherwise
    // this would yank their position every time older messages load in from
    // scrolling up, or a new message arrives while they're reading back.
    if (shouldStickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stageFiles = async (files) => {
    setAttachmentError('');
    const incoming = Array.from(files);
    if (stagedAttachments.length + incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setAttachmentError(`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
      return;
    }
    try {
      const prepared = await Promise.all(incoming.map(prepareAttachment));
      const next = [...stagedAttachments, ...prepared];
      if (totalStagedBytes(next) > MAX_TOTAL_ATTACHMENT_BYTES) {
        setAttachmentError('Attachments are too large — 8MB max per message, combined.');
        return;
      }
      setStagedAttachments(next);
    } catch (err) {
      setAttachmentError(err.message || 'Could not attach that file.');
    }
  };

  const removeStagedAttachment = (index) => {
    setStagedAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileInputChange = (e) => {
    if (e.target.files?.length) stageFiles(e.target.files);
    e.target.value = '';
  };

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length > 0) {
      e.preventDefault();
      stageFiles(files);
    }
  };

  const sendMessage = (e) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content && stagedAttachments.length === 0) return;
    if (stagedAttachments.length > 0) return sendWithAttachments(content);

    const entry = {
      clientId: newClientId(),
      type: 'channel',
      targetId: channel.id,
      content,
      replyToId: replyingTo?.id || null,
      createdAt: new Date().toISOString(),
    };
    addPending(entry);
    setMessages((prev) => [...prev, toOptimisticMessage(entry, user)]);

    socket?.emit('message:send', {
      channelId: channel.id, content, replyToId: entry.replyToId, clientId: entry.clientId,
    }, (res) => {
      if (!res) return; // no ack (offline) — SocketContext's reconnect flush will retry it
      removePending(entry.clientId);
      if (res.success) setMessages((prev) => reconcileMessage(prev, res.message));
      else setMessages((prev) => prev.map((m) => (m.client_id === entry.clientId ? { ...m, pending: false, failed: true } : m)));
    });

    setInput('');
    clearDraft();
    setReplyingTo(null);
    shouldStickToBottomRef.current = true;
    stopTyping();
  };

  // Attachment sends go over REST (see channelController.js's
  // sendMessageWithAttachments) rather than the message:send socket event
  // and its offline outbox — an 8MB upload isn't something to silently
  // retry forever in the background the way a text message is. A failure
  // here just restores the composer so the user can see what happened and
  // try again themselves.
  const sendWithAttachments = async (content) => {
    if (sending) return;
    const attachmentsToSend = stagedAttachments;
    const replyToId = replyingTo?.id || null;
    const clientId = newClientId();

    const optimistic = {
      id: clientId,
      client_id: clientId,
      channel_id: channel.id,
      user_id: user.id,
      username: user.username,
      avatar_color: user.avatar_color,
      avatar_url: user.avatar_url,
      content,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      reactions: [],
      pending: true,
      attachments: attachmentsToSend.map((a, i) => ({
        id: `pending-${clientId}-${i}`,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: Math.ceil((a.data.length * 3) / 4),
        width: a.width,
        height: a.height,
        localPreviewUrl: a.data,
      })),
    };

    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setStagedAttachments([]);
    clearDraft();
    setReplyingTo(null);
    shouldStickToBottomRef.current = true;
    stopTyping();
    setSending(true);

    try {
      const saved = await api.post(`/channels/${channel.id}/messages`, {
        content, replyToId, clientId, attachments: attachmentsToSend,
      });
      setMessages((prev) => reconcileMessage(prev, saved));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.client_id !== clientId));
      setInput(content);
      setStagedAttachments(attachmentsToSend);
      setAttachmentError(err.message || 'Failed to send attachment.');
    } finally {
      setSending(false);
    }
  };

  const retryMessage = (msg) => {
    if (!msg.failed) return;
    const entry = {
      clientId: msg.client_id, type: 'channel', targetId: channel.id,
      content: msg.content, replyToId: msg.reply_to_id, createdAt: msg.created_at,
    };
    addPending(entry);
    setMessages((prev) => prev.map((m) => (m.client_id === msg.client_id ? { ...m, pending: true, failed: false } : m)));
    socket?.emit('message:send', {
      channelId: channel.id, content: entry.content, replyToId: entry.replyToId, clientId: entry.clientId,
    }, (res) => {
      if (!res) return;
      removePending(entry.clientId);
      if (res.success) setMessages((prev) => reconcileMessage(prev, res.message));
      else setMessages((prev) => prev.map((m) => (m.client_id === entry.clientId ? { ...m, pending: false, failed: true } : m)));
    });
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
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} title="Back to channels">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
        )}
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

      {viewingHistorical && (
        <button type="button" className={styles.jumpToPresentBar} onClick={jumpToPresent}>
          Viewing an older point in the conversation — Jump to Present ↓
        </button>
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
              onRetry={retryMessage}
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
          ownerId={ownerId}
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
        {attachmentError && <div className={styles.attachmentError}>{attachmentError}</div>}
        {stagedAttachments.length > 0 && (
          <div className={styles.stagedAttachments}>
            {stagedAttachments.map((a, i) => (
              <div key={i} className={styles.stagedAttachment}>
                {isImageMime(a.mimeType)
                  ? <img src={a.data} alt={a.filename} className={styles.stagedThumb} />
                  : <span className={styles.stagedFileIcon}>📄</span>}
                <span className={styles.stagedName} title={a.filename}>{a.filename}</span>
                <button type="button" onClick={() => removeStagedAttachment(i)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={sendMessage} className={styles.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTyping}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            onBlur={() => { stopTyping(); mention.close(); }}
            placeholder={`Message #${channel.name}`}
            className={styles.input}
            maxLength={2000}
            rows={1}
          />
          <button type="button" className={styles.attachBtn} onClick={() => fileInputRef.current?.click()} title="Attach a file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/>
            </svg>
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileInputChange} />
          <button type="submit" className={styles.sendBtn} disabled={!input.trim() && stagedAttachments.length === 0}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
