import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
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

export default function Message({ msg, grouped, canDelete, canEdit, onDelete, onEdit }) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.selectionStart = el.selectionEnd = el.value.length;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  const startEdit = () => {
    setDraft(msg.content);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed !== msg.content) onEdit(msg.id, trimmed);
    setEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const autoGrow = (e) => {
    setDraft(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div
      className={`${styles.message} ${grouped ? styles.grouped : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!grouped ? (
        <Avatar
          url={msg.avatar_url}
          color={msg.avatar_color}
          username={msg.username}
          className={styles.avatar}
        />
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

        {editing ? (
          <div className={styles.editWrap}>
            <textarea
              ref={textareaRef}
              className={styles.editInput}
              value={draft}
              onChange={autoGrow}
              onKeyDown={handleEditKeyDown}
              maxLength={2000}
              rows={1}
            />
            <div className={styles.editHint}>
              Enter to save · Shift+Enter for a new line · Escape to cancel
            </div>
          </div>
        ) : (
          <p className={styles.text}>
            {msg.content}
            {msg.updated_at && <span className={styles.edited}> (edited)</span>}
          </p>
        )}
      </div>

      {hovered && !editing && (canEdit || canDelete) && (
        <div className={styles.actions}>
          {canEdit && (
            <button className={styles.actionBtn} onClick={startEdit} title="Edit message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          )}
          {canDelete && (
            <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => onDelete(msg.id)} title="Delete message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
