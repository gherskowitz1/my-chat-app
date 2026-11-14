import React from 'react';
import styles from './ChatArea.module.css';

// Same look as MentionDropdown, listing commands instead of people.
export default function SlashCommandDropdown({ suggestions, activeIndex, onSelect }) {
  return (
    <div className={styles.mentionDropdown}>
      {suggestions.map((c, i) => (
        <button
          key={c.name}
          type="button"
          className={`${styles.mentionItem} ${i === activeIndex ? styles.mentionItemActive : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(c.name);
          }}
        >
          <span className={styles.mentionName}>
            /{c.name}{c.args && <span className={styles.slashArgs}> {c.args}</span>}
          </span>
          <span className={styles.slashDesc}>{c.description}</span>
        </button>
      ))}
    </div>
  );
}
