import React from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './ServerSidebar.module.css';

export default function ServerSidebar({ activeSection, onSectionChange }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.sidebar}>
      {/* DM button */}
      <button
        className={`${styles.icon} ${activeSection === 'dm' ? styles.active : ''}`}
        onClick={() => onSectionChange('dm')}
        title="Direct Messages"
      >
        <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor">
          <path d="M4 2h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm10 7L4.5 4H23.5L14 9zm0 2.5l-10-6.3V16h20V5.2l-10 6.3z"/>
        </svg>
      </button>

      <div className={styles.divider} />

      {/* Server button */}
      <button
        className={`${styles.serverBtn} ${activeSection === 'server' ? styles.active : ''}`}
        onClick={() => onSectionChange('server')}
        title="General Server"
      >
        G
      </button>

      <div className={styles.spacer} />

      {/* User avatar at bottom */}
      <div className={styles.userArea}>
        <div
          className={styles.avatar}
          style={{ background: user?.avatar_color }}
          title={`${user?.username} (${user?.role})`}
        >
          {user?.username?.[0]?.toUpperCase()}
        </div>
        <button className={styles.logoutBtn} onClick={logout} title="Log out">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.4 1.4 2.6 2.6H9v2h9.2l-2.6 2.6L17 17l5-5-5-5zm-6 10H5V7h6V5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6v-2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
