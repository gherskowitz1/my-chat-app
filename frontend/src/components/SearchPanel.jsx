import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import styles from './SearchPanel.module.css';

const SCOPES = [
  { value: 'all', label: 'Everywhere' },
  { value: 'server', label: 'Channels' },
  { value: 'dms', label: 'Direct Messages' },
];

function snippet(content) {
  return content.length > 140 ? `${content.slice(0, 140)}…` : content;
}

export default function SearchPanel({ onClose, onJumpToChannel, onJumpToDm }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [fromUserId, setFromUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [results, setResults] = useState({ channelResults: [], dmResults: [] });
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults({ channelResults: [], dmResults: [] });
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const fromParam = fromUserId ? `&fromUserId=${fromUserId}` : '';
        const data = await api.get(`/search?q=${encodeURIComponent(query.trim())}&scope=${scope}${fromParam}`);
        setResults(data);
      } catch {
        setResults({ channelResults: [], dmResults: [] });
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, scope, fromUserId]);

  const noResults = !searching && query.trim() && results.channelResults.length === 0 && results.dmResults.length === 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <input
            autoFocus
            className={styles.input}
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.scopes}>
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`${styles.scopeBtn} ${scope === s.value ? styles.scopeActive : ''}`}
              onClick={() => setScope(s.value)}
            >
              {s.label}
            </button>
          ))}
          <select
            className={styles.fromSelect}
            value={fromUserId}
            onChange={(e) => setFromUserId(e.target.value)}
          >
            <option value="">From: Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>From: {u.username}</option>
            ))}
          </select>
        </div>

        <div className={styles.results}>
          {searching && <p className={styles.muted}>Searching…</p>}
          {noResults && <p className={styles.muted}>No results.</p>}

          {results.channelResults.map((r) => (
            <button key={`c-${r.id}`} type="button" className={styles.resultRow} onClick={() => onJumpToChannel(r)}>
              <Avatar url={r.avatar_url} color={r.avatar_color} username={r.username} className={styles.avatar} />
              <div className={styles.resultBody}>
                <div className={styles.resultMeta}>
                  <span className={styles.resultAuthor}>{r.username}</span>
                  <span className={styles.resultTag}>#{r.channel_name}</span>
                  <span className={styles.resultDate}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.resultContent}>{snippet(r.content)}</div>
              </div>
            </button>
          ))}

          {results.dmResults.map((r) => (
            <button key={`d-${r.id}`} type="button" className={styles.resultRow} onClick={() => onJumpToDm(r)}>
              <Avatar url={r.avatar_url} color={r.avatar_color} username={r.username} className={styles.avatar} />
              <div className={styles.resultBody}>
                <div className={styles.resultMeta}>
                  <span className={styles.resultAuthor}>{r.username}</span>
                  <span className={styles.resultTag}>Direct Message</span>
                  <span className={styles.resultDate}>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div className={styles.resultContent}>{snippet(r.content)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
