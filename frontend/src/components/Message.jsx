import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import LinkEmbed from './LinkEmbed';
import EmojiPicker from './EmojiPicker';
import { extractEmbeds } from '../utils/linkEmbeds';
import { EVERYONE_USER } from '../utils/mentions';
import { useAuth } from '../context/AuthContext';
import styles from './Message.module.css';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

// Inline markdown — code spans and blocks take precedence (their content is
// never itself reinterpreted as markdown, matching standard behavior), then
// bold, then strikethrough, then italic. Rendered as real React elements
// (never dangerouslySetInnerHTML), so this can't be used to inject markup.
// Underscore variants require a non-word boundary on both sides so ordinary
// snake_case_identifiers and file_names don't get parsed as italic/bold.
const MARKDOWN_RE = /(```[\s\S]*?```)|(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|((?<!\w)__[^_\n]+?__(?!\w))|(~~[^~\n]+?~~)|(\*[^*\n]+?\*)|((?<!\w)_[^_\n]+?_(?!\w))/g;

function parseMarkdown(text, keyPrefix, mdStyles) {
  if (!text) return text;
  let m;
  let lastIndex = 0;
  let key = 0;
  const parts = [];
  MARKDOWN_RE.lastIndex = 0;
  while ((m = MARKDOWN_RE.exec(text))) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    const matched = m[0];
    const k = `${keyPrefix}-md${key++}`;
    if (matched.startsWith('```')) {
      const code = matched.slice(3, -3).replace(/^\n/, '');
      parts.push(<pre key={k} className={mdStyles.codeBlock}><code>{code}</code></pre>);
    } else if (matched.startsWith('`')) {
      parts.push(<code key={k} className={mdStyles.inlineCode}>{matched.slice(1, -1)}</code>);
    } else if (matched.startsWith('**') || matched.startsWith('__')) {
      parts.push(<strong key={k}>{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith('~~')) {
      parts.push(<del key={k}>{matched.slice(2, -2)}</del>);
    } else {
      parts.push(<em key={k}>{matched.slice(1, -1)}</em>);
    }
    lastIndex = MARKDOWN_RE.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

// Wraps bare URLs in a plain-text segment with a clickable link, opened in a
// new tab (the desktop app's main-process window-open handler redirects that
// to the user's OS default browser instead of an in-app window). Trailing
// sentence punctuation is peeled off so "check this out: https://x.com." or
// "(https://x.com)" don't pull the period/paren into the URL itself. The
// plain (non-URL) text in between still gets markdown formatting applied.
function linkify(text, mdStyles) {
  const segments = text.split(URL_RE);
  if (segments.length === 1) return parseMarkdown(text, 'lf', mdStyles);
  return segments.map((seg, i) => {
    if (i % 2 === 0) return <React.Fragment key={i}>{parseMarkdown(seg, `lf${i}`, mdStyles)}</React.Fragment>;
    const trailingMatch = seg.match(/[.,!?;:'")\]]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    const url = trailing ? seg.slice(0, -trailing.length) : seg;
    return (
      <React.Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" className={mdStyles.link} onClick={(e) => e.stopPropagation()}>
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
  if (allUsers.length === 0) return linkify(text, mentionStyles);
  const names = [...new Set(allUsers.map((u) => u.username))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const re = new RegExp(`(@(?:${names.join('|')})\\b)`, 'gi');
  const parts = text.split(re);
  if (parts.length === 1) return linkify(text, mentionStyles);
  return parts.map((part, i) => {
    if (i % 2 === 0) return <React.Fragment key={i}>{linkify(part, mentionStyles)}</React.Fragment>;
    const uname = part.slice(1);
    const isEveryone = uname.toLowerCase() === EVERYONE_USER.username && allUsers.some((u) => u.id === EVERYONE_USER.id);
    const isSelfName = currentUser && uname.toLowerCase() === currentUser.username.toLowerCase();
    const matchedUser = isEveryone
      ? EVERYONE_USER
      : isSelfName
        ? currentUser
        : allUsers.find((u) => u.username.toLowerCase() === uname.toLowerCase());
    return (
      <span
        key={i}
        className={`${mentionStyles.mention} ${isEveryone || isSelfName ? mentionStyles.selfMention : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (matchedUser && !isEveryone) onMentionClick?.(matchedUser, e.currentTarget.getBoundingClientRect());
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

export default function Message({
  msg, grouped, canDelete, canEdit, onDelete, onEdit, users = [], onMentionClick,
  allMessages = [], isPinned, canPin, onPin, onUnpin, onReply, onReact, onJumpToMessage,
}) {
  const { user } = useAuth();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const textareaRef = useRef(null);

  const replyToMsg = msg.reply_to_id ? allMessages.find((m) => m.id === msg.reply_to_id) : null;

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
      id={`msg-${msg.id}`}
      className={`${styles.message} ${grouped ? styles.grouped : ''} ${isPinned ? styles.pinnedMessage : ''}`}
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
            {isPinned && <span className={styles.pinnedTag}>📌 Pinned</span>}
          </div>
        )}

        {!editing && msg.reply_to_id && (
          <button
            type="button"
            className={styles.replyPreview}
            onClick={() => onJumpToMessage?.(msg.reply_to_id)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
            {replyToMsg ? (
              <>
                <span className={styles.replyAuthor}>{replyToMsg.username}</span>
                <span className={styles.replySnippet}>{replyToMsg.content.slice(0, 80)}</span>
              </>
            ) : (
              <span className={styles.replySnippet}>Replying to a message</span>
            )}
          </button>
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
            {msg.reactions?.length > 0 && (
              <div className={styles.reactions}>
                {msg.reactions.map((r) => {
                  const mine = r.userIds.includes(user.id);
                  return (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`${styles.reactionPill} ${mine ? styles.reactionMine : ''}`}
                      onClick={() => onReact?.(msg.id, r.emoji)}
                      title={mine ? 'Remove your reaction' : 'React'}
                    >
                      <span>{r.emoji}</span>
                      <span className={styles.reactionCount}>{r.userIds.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {hovered && !editing && (
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={(e) => setPickerAnchor(e.currentTarget.getBoundingClientRect())}
            title="Add reaction"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
          </button>
          <button className={styles.actionBtn} onClick={() => onReply?.(msg)} title="Reply">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
          </button>
          {canPin && (
            isPinned
              ? <button className={styles.actionBtn} onClick={() => onUnpin?.(msg.id)} title="Unpin message">📌</button>
              : <button className={styles.actionBtn} onClick={() => onPin?.(msg.id)} title="Pin message">📌</button>
          )}
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

      {pickerAnchor && (
        <EmojiPicker
          anchorRect={pickerAnchor}
          onClose={() => setPickerAnchor(null)}
          onSelect={(emoji) => { onReact?.(msg.id, emoji); setPickerAnchor(null); }}
        />
      )}
    </div>
  );
}
