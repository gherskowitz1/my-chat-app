import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useGameTracking } from '../hooks/useGameTracking';
import styles from './TrackedGamesPanel.module.css';

export default function TrackedGamesPanel({ channel, onClose }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { games, loading, query, setQuery, results, searching, error, addGame, removeGame, alreadyTracked } =
    useGameTracking(channel.id, isAdmin);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>🎮 Tracked Games — #{channel.name}</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p className={styles.hint}>
          PatchBot checks each tracked game periodically and posts new Steam update/patch notes into this channel.
        </p>

        {isAdmin && (
          <div className={styles.searchWrap}>
            <input
              className={styles.input}
              placeholder="Search for a game on Steam…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {error && <div className={styles.error}>{error}</div>}
            {query.trim() && (
              <div className={styles.results}>
                {searching && <p className={styles.muted}>Searching…</p>}
                {!searching && results.length === 0 && <p className={styles.muted}>No matches.</p>}
                {!searching && results.map((r) => (
                  <div key={r.appId} className={styles.resultRow}>
                    {r.iconUrl && <img src={r.iconUrl} alt="" className={styles.icon} />}
                    <span className={styles.name}>{r.name}</span>
                    <button
                      className={styles.addBtn}
                      disabled={alreadyTracked(r.appId)}
                      onClick={() => addGame(r)}
                    >
                      {alreadyTracked(r.appId) ? 'Tracked' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.list}>
          {loading && <p className={styles.muted}>Loading…</p>}
          {!loading && games.length === 0 && (
            <p className={styles.muted}>
              {isAdmin ? 'No games tracked yet — search above to add one.' : 'No games tracked in this channel yet.'}
            </p>
          )}
          {games.map((g) => (
            <div key={g.id} className={styles.gameRow}>
              {g.icon_url && <img src={g.icon_url} alt="" className={styles.icon} />}
              <span className={styles.name}>{g.name}</span>
              {isAdmin && (
                <button className={styles.removeBtn} onClick={() => removeGame(g.id)} title="Stop tracking">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
