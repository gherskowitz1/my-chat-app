import React from 'react';
import { CHANGELOG } from '../data/changelog';
import styles from './WhatsNewModal.module.css';

export default function WhatsNewModal({ onClose }) {
  const latest = CHANGELOG[0];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.badge}>✨ New</div>
        <h3>What's New in {latest.version}</h3>
        <p className={styles.date}>{latest.date}</p>
        <ul className={styles.list}>
          {latest.highlights.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
        <button className={styles.closeBtn} onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
