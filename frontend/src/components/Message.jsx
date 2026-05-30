import React, { useState } from 'react';
import styles from './Message.module.css';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000 && d.getDate() === now.getDate()) return `Today at ${formatTime(ts)}`;
  if (diff < 172800000) return `Yesterday at ${formatTime(ts)}`;
  return d.toLocaleDateString();
}

export default function Message({ msg, grouped, canDelete, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`${styles.message} ${grouped ? styles.grouped : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!grouped ? (
        <div
          className={styles.avatar}
          style={{ background: msg.avatar_color || '#5865f2' }}
        >
          {msg.username?.[0]?.toUpperCase()}
        </div>
      ) : (
        <div className={styles.timeStub}>
          {hovered && <span>{formatTime(msg.created_at)}</span>}
        </div>
      )}

      <div className={styles.content}>
        {!grouped && (
          <div className={styles.meta}>
            <span className={styles.username}>{msg.username}</span>
            <span className={styles.timestamp}>{formatDate(msg.created_at)}</span>
          </div>
        )}
        <p className={styles.text}>{msg.content}</p>
      </div>

      {hovered && canDelete && (
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(msg.id)}
          title="Delete message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
          </svg>
        </button>
      )}
    </div>
  );
}
