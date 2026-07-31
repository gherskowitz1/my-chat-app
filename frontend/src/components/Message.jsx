import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import LinkEmbed from './LinkEmbed';
import { extractEmbeds } from '../utils/linkEmbeds';
import { useAuth } from '../context/AuthContext';
import styles from './Message.module.css';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

// Wraps bare URLs in a plain-text segment with a clickable link, opened in a
// new tab (the desktop app's main-process window-open handler redirects that
// to the user's OS default browser instead of an in-app window). Trailing
// sentence punctuation is peeled off so "check this out: https://x.com." or
// "(https://x.com)" don't pull the period/paren into the URL itself.
function linkify(text, linkClass) {
  const segments = text.split(URL_RE);
  if (segments.length === 1) return text;
  return segments.map((seg, i) => {
    if (i % 2 === 0) return seg;
    const trailingMatch = seg.match(/[.,!?;:'")\]]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const url = trailing ? seg.slice(0, -trailing.length) : seg;
    return (
      <React.Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass} onClick={(e) => e.stopPropagation()}>
          {url}
        </a>
        {trailing}
      </React.Fragment>
    );
  });
}

// Splits text on any @mention of a known user, wrapping each in a clickable
// span — highlighted more strongly if it's a mention of the current viewer —
// and linkifies bare URLs in the plain-text segments in between.
// String.split with a capturing group interleaves the matched delimiters
// into the result, so odd indices are always the mention itself.
function renderMentions(text, users, currentUser, mentionStyles, onMentionClick) {
  const allUsers = currentUser ? [...users, currentUser] : users;
  if (allUsers.length === 0) return linkify(text, mentionStyles.link);
  const names = [...new Set(allUsers.map((u) => u.username))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const re = new RegExp(`(@(?:${names.join('|')})\\b)`, 'gi');
  const parts = text.split(re);
  if (parts.length === 1) return linkify(text, mentionStyles.link);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <React.Fragment key={i}>{linkify(part, mentionStyles.link)}</React.Fragment>;
    const uname = part.slice(1);
    const isSelf = currentUser && uname.toLowerCase() === currentUser.username.toLowerCase();
    const matchedUser = isSelf
      ? currentUser
      : allUsers.find((u) => u.username.toLowerCase() === uname.toLowerCase());
    return (
      <span
        key={i}
        className={`${mentionStyles.mention} ${isSelf ? mentionStyles.selfMention : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (matchedUser) onMentionClick?.(matchedUser, e.currentTarget.getBoundingClientRect());
        }}
      >
        {part}
      </span>
    );
  });
}

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

export default function Message({ msg, grouped, canDelete, canEdit, onDelete, onEdit, users = [], onMentionClick }) {
  const { user } = useAuth();
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
          <>
            <p className={styles.text}>
              {renderMentions(msg.content, users, user, styles, onMentionClick)}
              {msg.updated_at && <span className={styles.edited}> (edited)</span>}
            </p>
            {extractEmbeds(msg.content).map((embed) => (
              <LinkEmbed key={embed.key} embed={embed} />
            ))}
          </>
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
