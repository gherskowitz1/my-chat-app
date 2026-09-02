import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import styles from './FriendsPanel.module.css';

export default function FriendsPanel({ onClose, onOpenDM }) {
  const [data, setData] = useState({ friends: [], incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/friends').then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/users').then(setAllUsers).catch(() => {});
  }, []);

  const sendRequest = async (userId) => {
    setError('');
    try {
      await api.post(`/friends/request/${userId}`, {});
      setQuery('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const accept = async (userId) => { await api.post(`/friends/accept/${userId}`, {}); load(); };
  const decline = async (userId) => { await api.post(`/friends/decline/${userId}`, {}); load(); };
  const remove = async (userId) => { await api.delete(`/friends/${userId}`); load(); };

  const friendIds = new Set(data.friends.map((f) => f.id));
  const pendingIds = new Set([...data.incoming, ...data.outgoing].map((u) => u.id));
  const q = query.trim().toLowerCase();
  const searchResults = q
    ? allUsers.filter((u) => u.username.toLowerCase().includes(q) && !friendIds.has(u.id) && !pendingIds.has(u.id)).slice(0, 5)
    : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Friends</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <input
          className={styles.input}
          placeholder="Add a friend by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <p className={styles.error}>{error}</p>}

        {searchResults.length > 0 && (
          <div className={styles.searchResults}>
            {searchResults.map((u) => (
              <div key={u.id} className={styles.row}>
                <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                <span className={styles.name}>{u.username}</span>
                <button className={styles.actionBtn} onClick={() => sendRequest(u.id)}>Add Friend</button>
              </div>
            ))}
          </div>
        )}

        {loading ? <p className={styles.muted}>Loading…</p> : (
          <div className={styles.sections}>
            {data.incoming.length > 0 && (
              <section>
                <div className={styles.sectionTitle}>Incoming Requests — {data.incoming.length}</div>
                {data.incoming.map((u) => (
                  <div key={u.id} className={styles.row}>
                    <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                    <span className={styles.name}>{u.username}</span>
                    <div className={styles.rowActions}>
                      <button className={styles.acceptBtn} onClick={() => accept(u.id)}>Accept</button>
                      <button className={styles.declineBtn} onClick={() => decline(u.id)}>Decline</button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {data.outgoing.length > 0 && (
              <section>
                <div className={styles.sectionTitle}>Sent Requests — {data.outgoing.length}</div>
                {data.outgoing.map((u) => (
                  <div key={u.id} className={styles.row}>
                    <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                    <span className={styles.name}>{u.username}</span>
                    <button className={styles.declineBtn} onClick={() => remove(u.id)}>Cancel</button>
                  </div>
                ))}
              </section>
            )}

            <section>
              <div className={styles.sectionTitle}>Friends — {data.friends.length}</div>
              {data.friends.length === 0 && <p className={styles.muted}>No friends yet — search above to add one.</p>}
              {data.friends.map((u) => (
                <div key={u.id} className={styles.row}>
                  <Avatar url={u.avatar_url} color={u.avatar_color} username={u.username} className={styles.avatar} />
                  <span className={styles.name}>{u.username}</span>
                  <div className={styles.rowActions}>
                    <button className={styles.actionBtn} onClick={() => { onOpenDM(u.id); onClose(); }}>Message</button>
                    <button className={styles.declineBtn} onClick={() => remove(u.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
