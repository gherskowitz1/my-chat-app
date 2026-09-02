import React, { useEffect, useMemo, useRef, useState } from 'react';
import emojiGroups from 'unicode-emoji-json/data-by-group.json';
import { useCustomEmoji } from '../context/CustomEmojiContext';
import styles from './EmojiPicker.module.css';

// Ordered 0-8 by the package itself (Smileys, People, Animals, Food,
// Travel, Activities, Objects, Symbols, Flags) — every standard emoji a
// phone/desktop keyboard would offer, not a hand-picked subset.
const GROUPS = Object.keys(emojiGroups)
  .sort((a, b) => Number(a) - Number(b))
  .map((key) => emojiGroups[key]);

const WIDTH = 320;
const HEIGHT = 380;

export default function EmojiPicker({ anchorRect, onSelect, onClose }) {
  const ref = useRef(null);
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});
  const [search, setSearch] = useState('');
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

  const query = search.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!query) return GROUPS;
    return GROUPS
      .map((g) => ({ ...g, emojis: g.emojis.filter((e) => e.name.includes(query) || e.slug.includes(query)) }))
      .filter((g) => g.emojis.length > 0);
  }, [query]);

  const filteredCustom = useMemo(() => {
    if (!query) return customEmoji;
    return customEmoji.filter((e) => e.name.toLowerCase().includes(query));
  }, [customEmoji, query]);

  const jumpTo = (slug) => {
    sectionRefs.current[slug]?.scrollIntoView({ block: 'start' });
  };

  if (!anchorRect) return null;

  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - HEIGHT - 8);
  const left = Math.min(Math.max(anchorRect.right - WIDTH, 8), window.innerWidth - WIDTH - 8);

  return (
    <div ref={ref} className={styles.picker} style={{ top, left, width: WIDTH, height: HEIGHT }}>
      <input
        autoFocus
        className={styles.search}
        placeholder="Search emoji…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!query && (
        <div className={styles.tabs}>
          {customEmoji.length > 0 && (
            <button type="button" className={styles.tab} onClick={() => jumpTo('custom')} title="Custom">✨</button>
          )}
          {GROUPS.map((g) => (
            <button key={g.slug} type="button" className={styles.tab} onClick={() => jumpTo(g.slug)} title={g.name}>
              {g.emojis[0]?.emoji}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className={styles.scroll}>
        {filteredCustom.length > 0 && (
          <div ref={(el) => { sectionRefs.current.custom = el; }}>
            <div className={styles.sectionTitle}>Custom</div>
            <div className={styles.grid}>
              {filteredCustom.map((e) => (
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
            </div>
          </div>
        )}

        {filteredGroups.map((g) => (
          <div key={g.slug} ref={(el) => { sectionRefs.current[g.slug] = el; }}>
            <div className={styles.sectionTitle}>{g.name}</div>
            <div className={styles.grid}>
              {g.emojis.map((e) => (
                <button
                  key={e.slug}
                  type="button"
                  className={styles.emojiBtn}
                  title={e.name}
                  onClick={(ev) => { ev.stopPropagation(); onSelect(e.emoji); }}
                >
                  {e.emoji}
                </button>
              ))}
            </div>
          </div>
        ))}

        {query && filteredCustom.length === 0 && filteredGroups.length === 0 && (
          <p className={styles.empty}>No emoji found.</p>
        )}
      </div>
    </div>
  );
}
