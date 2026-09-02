import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import styles from './GifPicker.module.css';

const WIDTH = 320;
const HEIGHT = 380;

export default function GifPicker({ anchorRect, onSelect, onClose }) {
  const ref = useRef(null);
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

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

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const results = await api.get(`/giphy?q=${encodeURIComponent(query.trim())}`);
        setGifs(results);
      } catch (err) {
        setError(err.message);
        setGifs([]);
      } finally {
        setLoading(false);
      }
    }, query ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (!anchorRect) return null;

  const top = Math.min(anchorRect.bottom + 6, window.innerHeight - HEIGHT - 8);
  const left = Math.min(Math.max(anchorRect.right - WIDTH, 8), window.innerWidth - WIDTH - 8);

  return (
    <div ref={ref} className={styles.picker} style={{ top, left, width: WIDTH, height: HEIGHT }}>
      <input
        autoFocus
        className={styles.search}
        placeholder="Search GIPHY…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className={styles.scroll}>
        {error && <p className={styles.empty}>{error}</p>}
        {!error && loading && <p className={styles.empty}>Loading…</p>}
        {!error && !loading && gifs.length === 0 && <p className={styles.empty}>No GIFs found.</p>}
        {!error && !loading && gifs.length > 0 && (
          <div className={styles.grid}>
            {gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                className={styles.gifBtn}
                title={g.title}
                onClick={(ev) => { ev.stopPropagation(); onSelect(g.url); }}
              >
                <img src={g.previewUrl} alt={g.title} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <a className={styles.attribution} href="https://giphy.com" target="_blank" rel="noopener noreferrer">
        Powered by GIPHY
      </a>
    </div>
  );
}
