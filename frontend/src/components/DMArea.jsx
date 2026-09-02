import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { useDraft } from '../hooks/useDraft';
import { addPending, removePending, getPendingFor, newClientId, reconcileMessage } from '../utils/outbox';
import { prepareAttachment, totalStagedBytes, MAX_TOTAL_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, isImageMime } from '../utils/attachments';
import Message from './Message';
import Avatar from './Avatar';
import MentionDropdown from './MentionDropdown';
import UserProfileCard from './UserProfileCard';
import styles from './ChatArea.module.css';
import messageStyles from './Message.module.css';

const PAGE_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 150;

// See the identical helper in ChatArea.jsx — same reasoning, just keyed by
// conversation_id instead of channel_id.
function toOptimisticMessage(entry, user) {
  return {
    id: entry.clientId,
    client_id: entry.clientId,
    conversation_id: entry.targetId,
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

export default function DMArea({ conversation, onOpenDM, onBack, ownerId, jumpToMessageId, onJumpHandled }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState([]);
  const [profileTarget, setProfileTarget] = useState(null); // { user, rect }
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
  const mentionUsers = useMemo(
    () => [{ id: conversation.other_user_id, username: conversation.other_username, avatar_url: conversation.other_avatar_url, avatar_color: conversation.other_avatar_color }],
    [conversation]
  );
  const mention = useMentionAutocomplete(mentionUsers);
  const { clearDraft } = useDraft(conversation.id, input, setInput);

  const handleMentionClick = (mentionedUser, rect) => {
    setProfileTarget({ user: mentionedUser, rect });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get(`/dm/conversations/${conversation.id}/messages?limit=${PAGE_SIZE}`);
      const deliveredClientIds = new Set(data.filter((m) => m.client_id).map((m) => m.client_id));
      const pending = getPendingFor('dm', conversation.id)
        .filter((entry) => !deliveredClientIds.has(entry.clientId))
        .map((entry) => toOptimisticMessage(entry, user));
      setMessages([...data, ...pending]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
  }, [conversation.id, user]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const container = messagesRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      const oldest = messages[0].created_at;
      const data = await api.get(`/dm/conversations/${conversation.id}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest)}`);
      if (data.length > 0) {
        setMessages((prev) => [...data, ...prev]);
        requestAnimationFrame(() => {
          if (container) container.scrollTop += container.scrollHeight - prevScrollHeight;
        });
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [conversation.id, messages, hasMore, loadingMore]);

  const flashMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add(messageStyles.highlightFlash);
    setTimeout(() => el.classList.remove(messageStyles.highlightFlash), 1500);
    return true;
  };

  const scrollToMessage = async (messageId) => {
    if (flashMessage(messageId)) return;
    try {
      const data = await api.get(`/dm/conversations/${conversation.id}/messages/around/${messageId}`);
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
    socket?.emit('dm:join', conversation.id);

    if (jumpToMessageId) {
      scrollToMessage(jumpToMessageId);
      onJumpHandled?.();
    } else {
      fetchMessages();
    }
  }, [conversation.id, jumpToMessageId, fetchMessages, socket]);

  // Reconciles a pending bubble resolved by SocketContext's background
  // reconnect-flush — see the identical effect in ChatArea.jsx.
  useEffect(() => {
    const onResolved = (e) => {
      if (e.detail.type !== 'dm' || e.detail.targetId !== conversation.id) return;
      setMessages((prev) => reconcileMessage(prev, e.detail.message));
    };
    const onFailed = (e) => {
      if (e.detail.type !== 'dm' || e.detail.targetId !== conversation.id) return;
      setMessages((prev) => prev.map((m) => (m.client_id === e.detail.clientId ? { ...m, pending: false, failed: true } : m)));
    };
    window.addEventListener('outbox:resolved', onResolved);
    window.addEventListener('outbox:failed', onFailed);
    return () => {
      window.removeEventListener('outbox:resolved', onResolved);
      window.removeEventListener('outbox:failed', onFailed);
    };
  }, [conversation.id]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      if (msg.conversation_id === conversation.id && !viewingHistorical) setMessages((p) => reconcileMessage(p, msg));
    };
    const onEdited = (updated) => {
      if (updated.conversation_id !== conversation.id) return;
      setMessages((p) => p.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    };
    const onDeleted = ({ messageId, conversationId }) => {
      if (conversationId !== conversation.id) return;
      setMessages((p) => p.filter((m) => m.id !== messageId));
    };
    const onTyping = ({ userId, username, typing: t }) => {
      if (userId === user.id) return;
      setTyping((p) => t ? (p.includes(username) ? p : [...p, username]) : p.filter((u) => u !== username));
    };
    const onReactions = ({ messageId, conversationId, reactions }) => {
      if (conversationId !== conversation.id) return;
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };

    socket.on('dm:new', onNew);
    socket.on('dm:edited', onEdited);
    socket.on('dm:deleted', onDeleted);
    socket.on('dm:typing:update', onTyping);
    socket.on('dm:reactions', onReactions);
    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:edited', onEdited);
      socket.off('dm:deleted', onDeleted);
      socket.off('dm:typing:update', onTyping);
      socket.off('dm:reactions', onReactions);
    };
  }, [socket, conversation.id, user.id, viewingHistorical]);

  useEffect(() => {
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
      type: 'dm',
      targetId: conversation.id,
      content,
      replyToId: replyingTo?.id || null,
      createdAt: new Date().toISOString(),
    };
    addPending(entry);
    setMessages((prev) => [...prev, toOptimisticMessage(entry, user)]);

    socket?.emit('dm:send', {
      conversationId: conversation.id, content, replyToId: entry.replyToId, clientId: entry.clientId,
    }, (res) => {
      if (!res) return;
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

  // See the identical function in ChatArea.jsx for why this goes over REST
  // and doesn't use the offline outbox.
  const sendWithAttachments = async (content) => {
    if (sending) return;
    const attachmentsToSend = stagedAttachments;
    const replyToId = replyingTo?.id || null;
    const clientId = newClientId();

    const optimistic = {
      id: clientId,
      client_id: clientId,
      conversation_id: conversation.id,
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
      const saved = await api.post(`/dm/conversations/${conversation.id}/messages`, {
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
      clientId: msg.client_id, type: 'dm', targetId: conversation.id,
      content: msg.content, replyToId: msg.reply_to_id, createdAt: msg.created_at,
    };
    addPending(entry);
    setMessages((prev) => prev.map((m) => (m.client_id === msg.client_id ? { ...m, pending: true, failed: false } : m)));
    socket?.emit('dm:send', {
      conversationId: conversation.id, content: entry.content, replyToId: entry.replyToId, clientId: entry.clientId,
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
      socket?.emit('dm:typing:start', { conversationId: conversation.id });
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
    socket?.emit('dm:typing:stop', { conversationId: conversation.id });
  };

  const editMessage = (messageId, content) => {
    socket?.emit('dm:edit', { messageId, conversationId: conversation.id, content });
  };

  const deleteMessage = (messageId) => {
    socket?.emit('dm:delete', { messageId, conversationId: conversation.id });
  };

  const reactToMessage = (messageId, emoji) => {
    socket?.emit('dm:react', { messageId, conversationId: conversation.id, emoji });
  };

  const startReply = (msg) => {
    setReplyingTo({ id: msg.id, username: msg.username, content: msg.content });
    inputRef.current?.focus();
  };

  return (
    <div className={styles.area}>
      <div className={styles.header}>
        {onBack && (
          <button className={styles.backBtn} onClick={onBack} title="Back to conversations">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
        )}
        <Avatar
          url={conversation.other_avatar_url}
          color={conversation.other_avatar_color}
          username={conversation.other_username}
          style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}
        />
        <h3>{conversation.other_username}</h3>
      </div>

      {viewingHistorical && (
        <button type="button" className={styles.jumpToPresentBar} onClick={jumpToPresent}>
          Viewing an older point in the conversation — Jump to Present ↓
        </button>
      )}

      <div className={styles.messages} ref={messagesRef} onScroll={handleMessagesScroll}>
        {loadingMore && <div className={styles.loadingMore}>Loading earlier messages…</div>}
        {!hasMore && (
          <div className={styles.welcomeBanner}>
            <Avatar
              url={conversation.other_avatar_url}
              color={conversation.other_avatar_color}
              username={conversation.other_username}
              className={styles.channelIcon}
              style={{ color: 'white', fontSize: 32, fontWeight: 700 }}
            />
            <h2>{conversation.other_username}</h2>
            <p>This is the beginning of your direct message history with <strong>{conversation.other_username}</strong>.</p>
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
              canDelete={user.id === msg.user_id}
              canEdit={user.id === msg.user_id}
              onDelete={deleteMessage}
              onEdit={editMessage}
              users={mentionUsers}
              onMentionClick={handleMentionClick}
              allMessages={messages}
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
          <span>{typing[0]} is typing…</span>
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
            placeholder={`Message ${conversation.other_username}`}
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
