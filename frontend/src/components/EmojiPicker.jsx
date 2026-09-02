import React, { useEffect, useRef } from 'react';
import styles from './EmojiPicker.module.css';

// A small curated set rather than a full emoji library/search — keeps this
// self-contained and covers the common reactions people actually reach for.
const EMOJI = ['👍', '👎', '😂', '❤️', '😮', '😢', '🎉', '🔥', '👏', '🙏', '😡', '🤔', '💯', '✅', '❌', '😍', '😭', '🚀', '👀', '💀'];

export default function EmojiPicker({ anchorRect, onSelect, onClose }) {
  const ref = useRef(null);

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
  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - 160);
  const left = Math.min(Math.max(anchorRect.right - width, 8), window.innerWidth - width - 8);

  return (
    <div ref={ref} className={styles.picker} style={{ top, left, width }}>
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
    </div>
  );
}
