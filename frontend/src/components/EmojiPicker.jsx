import React, { useEffect, useRef } from 'react';
import { useCustomEmoji } from '../context/CustomEmojiContext';
import styles from './EmojiPicker.module.css';

// A small curated set rather than a full emoji library/search — keeps this
// self-contained and covers the common reactions people actually reach for.
const EMOJI = ['👍', '👎', '😂', '❤️', '😮', '😢', '🎉', '🔥', '👏', '🙏', '😡', '🤔', '💯', '✅', '❌', '😍', '😭', '🚀', '👀', '💀'];

export default function EmojiPicker({ anchorRect, onSelect, onClose }) {
  const ref = useRef(null);
  const { emoji: customEmoji } = useCustomEmoji();

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const width = 240;
  const maxHeight = 320;
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - maxHeight - 8);
  const left = Math.min(Math.max(anchorRect.right - width, 8), window.innerWidth - width - 8);

  return (
    <div ref={ref} className={styles.picker} style={{ top, left, width, maxHeight, overflowY: 'auto' }}>
      {EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          className={styles.emojiBtn}
          onClick={(ev) => { ev.stopPropagation(); onSelect(e); }}
        >
          {e}
        </button>
      ))}
      {customEmoji.length > 0 && (
        <>
          <div className={styles.divider} />
          {customEmoji.map((e) => (
            <button
              key={e.id}
              type="button"
              className={styles.emojiBtn}
              title={`:${e.name}:`}
              onClick={(ev) => { ev.stopPropagation(); onSelect(`:${e.name}:`); }}
            >
              <img src={e.image_data} alt={`:${e.name}:`} className={styles.customEmojiImg} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}
