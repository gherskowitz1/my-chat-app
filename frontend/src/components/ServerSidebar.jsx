import React from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './ServerSidebar.module.css';

export default function ServerSidebar({ activeSection, onSectionChange, onOpenAdmin, onOpenSettings }) {
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

      {/* Admin settings gear — only visible to admins */}
      {user?.role === 'admin' && (
        <button className={styles.iconBtn} onClick={onOpenAdmin} title="Admin Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      )}

      {/* User area — click avatar for settings, separate logout button */}
      <div className={styles.userArea}>
        <button
          className={styles.avatar}
          style={{ background: user?.avatar_color }}
          title="User Settings"
          onClick={onOpenSettings}
        >
          {user?.username?.[0]?.toUpperCase()}
        </button>
        <button className={styles.logoutBtn} onClick={logout} title="Log out">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.4 1.4 2.6 2.6H9v2h9.2l-2.6 2.6L17 17l5-5-5-5zm-6 10H5V7h6V5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6v-2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
