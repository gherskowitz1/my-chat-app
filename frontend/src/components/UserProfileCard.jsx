import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { api } from '../services/api';
import styles from './UserProfileCard.module.css';

// A small popover anchored under whatever was clicked (a mention span, an
// avatar). Positioned in fixed coordinates and clamped so it never renders
// past the right/bottom edge of the viewport.
export default function UserProfileCard({ user, anchorRect, isSelf, ownerId, onClose, onMessage }) {
  const ref = useRef(null);
  const [recentGames, setRecentGames] = useState([]);
  const [height, setHeight] = useState(180);

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

  // Last two weeks of Steam games — only for people who've linked Steam in
  // User Settings and whose Steam game details are public; otherwise the
  // section just doesn't appear. See profileController.js.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setRecentGames([]);
    api.get(`/users/${user.id}/recent-games`)
      .then((data) => { if (!cancelled) setRecentGames(data.games || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  // The card grows when recent games load, so clamp against its real height.
  useLayoutEffect(() => {
    if (ref.current) setHeight(ref.current.offsetHeight);
  }, [recentGames, user?.current_game]);

  if (!user || !anchorRect) return null;

  const cardWidth = 260;
  const top = Math.max(8, Math.min(anchorRect.bottom + 8, window.innerHeight - height - 8));
  const left = Math.min(Math.max(anchorRect.left, 8), window.innerWidth - cardWidth - 8);

  return (
    <div ref={ref} className={styles.card} style={{ top, left }}>
      <div className={styles.banner} style={{ background: user.avatar_color || '#5865f2' }} />
      <Avatar
        url={user.avatar_url}
        color={user.avatar_color}
        username={user.username}
        className={styles.avatar}
      />
      <div className={styles.body}>
        <div className={styles.nameRow}>
          <span className={styles.username}>{user.username}</span>
          {user.id === ownerId
            ? <span className={styles.badge} style={{ background: '#e6a53c', color: '#000' }}>👑 Owner</span>
            : user.role === 'admin' && <span className={styles.badge}>Admin</span>}
        </div>

        {user.current_game && (
          <div className={styles.playingNow}>
            <span className={styles.sectionLabel}>Playing now</span>
            <span className={styles.playingName}>🎮 {user.current_game}</span>
          </div>
        )}

        {recentGames.length > 0 && (
          <div className={styles.recentGames}>
            <span className={styles.sectionLabel}>Recently played</span>
            {recentGames.map((g) => (
              <div key={g.appId} className={styles.gameRow}>
                {g.iconUrl
                  ? <img src={g.iconUrl} alt="" className={styles.gameIcon} />
                  : <span className={styles.gameIcon}>🎮</span>}
                <div className={styles.gameInfo}>
                  <span className={styles.gameName} title={g.name}>{g.name}</span>
                  <span className={styles.gameHours}>{formatHours(g.minutesLastTwoWeeks)} past 2 weeks</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSelf && (
          <button
            className={styles.messageBtn}
            onClick={() => {
              onMessage(user.id);
              onClose();
            }}
          >
            Message
          </button>
        )}
      </div>
    </div>
  );
}

function formatHours(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hrs`;
}
