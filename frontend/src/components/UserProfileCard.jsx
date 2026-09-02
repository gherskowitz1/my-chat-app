import React, { useEffect, useRef } from 'react';
import Avatar from './Avatar';
import styles from './UserProfileCard.module.css';

// A small popover anchored under whatever was clicked (a mention span, an
// avatar). Positioned in fixed coordinates and clamped so it never renders
// past the right/bottom edge of the viewport.
export default function UserProfileCard({ user, anchorRect, isSelf, ownerId, onClose, onMessage }) {
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

  if (!user || !anchorRect) return null;

  const cardWidth = 260;
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 180);
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
