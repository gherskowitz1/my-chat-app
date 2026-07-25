import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Message from './Message';
import styles from './ChatArea.module.css';

export default function ChatArea({ channel, onToggleMembers, showMembers }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState([]);
  const bottomRef = useRef(null);
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get(`/channels/${channel.id}/messages?limit=50`);
      setMessages(data);
    } catch {}
  }, [channel.id]);

  useEffect(() => {
    setMessages([]);
    setTyping([]);
    fetchMessages();
    socket?.emit('channel:join', channel.id);
  }, [channel.id, fetchMessages, socket]);

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

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('message:edited', onEdited);
    socket.on('typing:update', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('message:edited', onEdited);
      socket.off('typing:update', onTyping);
    };
  }, [socket, channel.id, user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    socket?.emit('message:send', { channelId: channel.id, content: input.trim() });
    setInput('');
    stopTyping();
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket?.emit('typing:start', { channelId: channel.id });
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 2000);
  };

  const handleInputKeyDown = (e) => {
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

  return (
    <div className={styles.area}>
      <div className={styles.header}>
        <span className={styles.hash}>#</span>
        <h3>{channel.name}</h3>
        <div className={styles.headerActions}>
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

      <div className={styles.messages}>
        <div className={styles.welcomeBanner}>
          <div className={styles.channelIcon}>#</div>
          <h2>Welcome to #{channel.name}!</h2>
          <p>This is the start of the #{channel.name} channel.</p>
        </div>
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
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

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

      <form onSubmit={sendMessage} className={styles.inputArea}>
        <textarea
          value={input}
          onChange={handleTyping}
          onKeyDown={handleInputKeyDown}
          onBlur={stopTyping}
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
  );
}
