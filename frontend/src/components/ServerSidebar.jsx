import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import styles from './ServerSidebar.module.css';

const STATUS_COLOR = { online: 'var(--green)', away: 'var(--yellow)', offline: 'var(--text-muted)' };

export default function ServerSidebar({ activeSection, onSectionChange, onOpenAdmin, onOpenSettings, hasUnreadDMs, hasUnreadChannels }) {
  const { user, logout } = useAuth();
  const { statusMap } = useSocket();
  const myStatus = statusMap.get(user?.id) || 'offline';

  // Opens the standalone admin dashboard (admin.<domain>) in a new tab. Inside
  // the Electron app, window.open is already redirected to the OS browser by
  // main.js's setWindowOpenHandler, so this works the same in both contexts.
  const openAdminPortal = () => {
    const url = window.location.origin.replace('://www.', '://admin.');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={styles.sidebar}>
      {/* DM button */}
      <button
        className={`${styles.icon} ${activeSection === 'dm' ? styles.active : ''}`}
        onClick={() => onSectionChange('dm')}
        title="Direct Messages"
        style={{ position: 'relative' }}
      >
        <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor">
          <path d="M4 2h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm10 7L4.5 4H23.5L14 9zm0 2.5l-10-6.3V16h20V5.2l-10 6.3z"/>
        </svg>
        {hasUnreadDMs && <span className={styles.navDot} />}
      </button>

      <div className={styles.divider} />

      {/* Server button */}
      <button
        className={`${styles.serverBtn} ${activeSection === 'server' ? styles.active : ''}`}
        onClick={() => onSectionChange('server')}
        title="General Server"
        style={{ position: 'relative' }}
      >
        G
        {hasUnreadChannels && <span className={styles.navDot} />}
      </button>

      <div className={styles.spacer} />

      {/* User guide — visible to everyone */}
      <a
        className={styles.iconBtn}
        href="/CrowsNest-User-Guide.docx"
        download
        title="User Guide"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
      </a>

      {/* Full admin portal (admin.<domain>) — only visible to admins */}
      {user?.role === 'admin' && (
        <button className={styles.iconBtn} onClick={openAdminPortal} title="Admin Portal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2 4 5v6c0 5.25 3.4 10.16 8 11 4.6-.84 8-5.75 8-11V5l-8-3zm0 9.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-2.65v8.34z"/>
          </svg>
        </button>
      )}

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
        <div className={styles.avatarWrap}>
          <Avatar
            url={user?.avatar_url}
            color={user?.avatar_color}
            username={user?.username}
            className={styles.avatar}
            title="User Settings"
            onClick={onOpenSettings}
          />
          <span className={styles.statusDot} style={{ background: STATUS_COLOR[myStatus] }} />
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
