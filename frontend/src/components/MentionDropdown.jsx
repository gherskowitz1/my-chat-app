import React from 'react';
import Avatar from './Avatar';
import styles from './ChatArea.module.css';

export default function MentionDropdown({ suggestions, activeIndex, onSelect }) {
  return (
    <div className={styles.mentionDropdown}>
      {suggestions.map((u, i) => (
        <button
          key={u.id}
          type="button"
          className={`${styles.mentionItem} ${i === activeIndex ? styles.mentionItemActive : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(u.username);
          }}
        >
          <Avatar
            url={u.avatar_url}
            color={u.avatar_color}
            username={u.username}
            className={styles.mentionAvatar}
          />
          <span className={styles.mentionName}>{u.username}</span>
        </button>
      ))}
    </div>
  );
}
