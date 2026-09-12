import React from 'react';
import styles from './AnnouncementModal.module.css';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function AnnouncementModal({ announcement, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.badge}>📣 Announcement</div>
        <p className={styles.date}>{formatDate(announcement.created_at)}</p>
        <p className={styles.message}>{announcement.message}</p>
        <button className={styles.closeBtn} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
