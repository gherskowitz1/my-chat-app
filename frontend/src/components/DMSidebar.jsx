import React, { useEffect, useState } from 'react';
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
        {conversations.map((conv) => {
          const unreadCount = unreadDMs?.get(conv.id);
          return (
            <div
              key={conv.id}
              className={`${styles.item} ${activeConversation?.id === conv.id ? styles.active : ''}`}
              onClick={() => onConversationSelect(conv)}
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
                onClick={(e) => deleteConversation(e, conv)}
                title={`Remove conversation with ${conv.other_username}`}
              >
                ✕
              </button>
            </div>
          );
        })}

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
