import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import styles from './DMSidebar.module.css';

export default function DMSidebar({ activeConversation, onConversationSelect, unreadDMs }) {
  const [conversations, setConversations] = useState([]);
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);

  useEffect(() => {
    api.get('/dm/conversations').then(setConversations).catch(() => {});
  }, []);

  // Removes it from just this device's/account's list — the other person's
  // copy and the message history are untouched, and it reappears the moment
  // either side sends a new message.
  const deleteConversation = async (e, conv) => {
    e.stopPropagation();
    if (!confirm(`Remove your conversation with ${conv.other_username} from this list? It'll come back if either of you sends a new message.`)) return;
    try {
      await api.delete(`/dm/conversations/${conv.id}`);
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (activeConversation?.id === conv.id) onConversationSelect(null);
    } catch {}
  };

  const openNewDM = async () => {
    const data = await api.get('/users');
    setUsers(data);
    setShowUsers(true);
  };

  const startDM = async (targetUserId) => {
    try {
      const conv = await api.post(`/dm/conversations/${targetUserId}`, {});
      const data = await api.get('/dm/conversations');
      setConversations(data);
      const created = data.find((c) => c.id === conv.id);
      if (created) onConversationSelect(created);
      setShowUsers(false);
    } catch {}
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h2>Direct Messages</h2>
        <button className={styles.addBtn} onClick={openNewDM} title="New DM">+</button>
      </div>

      <div className={styles.list}>
        {conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            conv={conv}
            active={activeConversation?.id === conv.id}
            unreadCount={unreadDMs?.get(conv.id)}
            onSelect={() => onConversationSelect(conv)}
            onDelete={(e) => deleteConversation(e, conv)}
          />
        ))}

        {conversations.length === 0 && (
          <p className={styles.empty}>No conversations yet.<br />Click + to start one.</p>
        )}
      </div>

      {showUsers && (
        <div className={styles.overlay} onClick={() => setShowUsers(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Start a Direct Message</h3>
            <div className={styles.userList}>
              {users.map((u) => (
                <div key={u.id} className={styles.userItem} onClick={() => startDM(u.id)}>
                  <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                  <div>
                    <span className={styles.name}>{u.username}</span>
                    {u.role === 'admin' && <span className={styles.adminBadge}>Admin</span>}
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className={styles.empty}>No other users yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Splits out from the main list so the delete button's hover-or-long-press
// visibility (no hover state at all on touch) is scoped to just this row —
// see the identical pattern in Message.jsx for why.
function ConversationItem({ conv, active, unreadCount, onSelect, onDelete }) {
  const [longPressed, setLongPressed] = useState(false);
  const pressTimerRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!longPressed) return;
    const onOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setLongPressed(false);
    };
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [longPressed]);

  const startPressTimer = () => {
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => setLongPressed(true), 450);
  };
  const cancelPressTimer = () => clearTimeout(pressTimerRef.current);

  return (
    <div
      ref={rootRef}
      className={`${styles.item} ${active ? styles.active : ''} ${longPressed ? styles.longPressed : ''}`}
      onClick={onSelect}
      onTouchStart={startPressTimer}
      onTouchEnd={cancelPressTimer}
      onTouchMove={cancelPressTimer}
    >
      <Avatar
        url={conv.other_avatar_url}
        color={conv.other_avatar_color}
        username={conv.other_username}
        className={styles.avatar}
      />
      <div className={styles.info}>
        <span className={styles.name}>{conv.other_username}</span>
        {conv.last_message && (
          <span className={styles.preview}>{conv.last_message}</span>
        )}
      </div>
      {!!unreadCount && (
        <span className={styles.unreadBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={(e) => { setLongPressed(false); onDelete(e); }}
        title={`Remove conversation with ${conv.other_username}`}
      >
        ✕
      </button>
    </div>
  );
}
