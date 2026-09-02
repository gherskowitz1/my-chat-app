import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import styles from './PinnedMessagesPanel.module.css';

export default function PinnedMessagesPanel({ channel, onClose, onJump }) {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/channels/${channel.id}/pins`)
      .then(setPins)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channel.id]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>📌 Pinned Messages — #{channel.name}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.list}>
          {loading && <p className={styles.muted}>Loading…</p>}
          {!loading && pins.length === 0 && <p className={styles.muted}>No pinned messages yet.</p>}
          {pins.map((m) => (
            <button key={m.id} type="button" className={styles.pinRow} onClick={() => { onJump(m.id); onClose(); }}>
              <Avatar url={m.avatar_url} color={m.avatar_color} username={m.username} className={styles.avatar} />
              <div className={styles.pinBody}>
                <div className={styles.pinMeta}>
                  <span className={styles.pinAuthor}>{m.username}</span>
                  <span className={styles.pinDate}>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.pinContent}>{m.content}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
