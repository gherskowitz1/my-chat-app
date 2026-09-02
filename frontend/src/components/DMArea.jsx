import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { useDraft } from '../hooks/useDraft';
import Message from './Message';
import Avatar from './Avatar';
import MentionDropdown from './MentionDropdown';
import UserProfileCard from './UserProfileCard';
import styles from './ChatArea.module.css';
import messageStyles from './Message.module.css';

const PAGE_SIZE = 50;
const LOAD_MORE_THRESHOLD_PX = 150;

export default function DMArea({ conversation, onOpenDM }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState([]);
  const [profileTarget, setProfileTarget] = useState(null); // { user, rect }
  const [replyingTo, setReplyingTo] = useState(null); // { id, username, content }
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
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

  const scrollToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add(messageStyles.highlightFlash);
    setTimeout(() => el.classList.remove(messageStyles.highlightFlash), 1500);
  };

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get(`/dm/conversations/${conversation.id}/messages?limit=${PAGE_SIZE}`);
      setMessages(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {}
  }, [conversation.id]);

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
    socket?.emit('dm:join', conversation.id);
  }, [conversation.id, fetchMessages, socket]);

  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      if (msg.conversation_id === conversation.id) setMessages((p) => [...p, msg]);
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
  }, [socket, conversation.id, user.id]);

  useEffect(() => {
    if (shouldStickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    socket?.emit('dm:send', { conversationId: conversation.id, content: input.trim(), replyToId: replyingTo?.id });
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
        <Avatar
          url={conversation.other_avatar_url}
          color={conversation.other_avatar_color}
          username={conversation.other_username}
          style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}
        />
        <h3>{conversation.other_username}</h3>
      </div>

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
        <form onSubmit={sendMessage} className={styles.inputArea}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTyping}
            onKeyDown={handleInputKeyDown}
            onBlur={() => { stopTyping(); mention.close(); }}
            placeholder={`Message ${conversation.other_username}`}
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
