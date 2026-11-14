import React, { useEffect, useMemo, useRef } from 'react';
import styles from './BirthdayCelebration.module.css';

// A one-off confetti burst + banner when someone opens the app on their own
// birthday (ChatLayout shows it once per day). Click anywhere — or wait a
// few seconds — to dismiss. Reduced-motion users just get the banner.
const COLORS = ['#ff4f8b', '#ffd84d', '#4dff88', '#4db8ff', '#c9a3ff', '#ff7518'];

export default function BirthdayCelebration({ username, onDone }) {
  // Through a ref, so the parent re-rendering (a new message arriving)
  // doesn't restart the timer.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 7000);
    return () => clearTimeout(t);
  }, []);

  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: `${(i * 37) % 100}vw`,
    delay: `${((i * 13) % 20) / 10}s`,
    duration: `${3 + ((i * 7) % 20) / 10}s`,
    color: COLORS[i % COLORS.length],
    spin: `${(i % 2 ? 1 : -1) * (360 + ((i * 53) % 360))}deg`,
    size: 6 + ((i * 11) % 6),
  })), []);

  return (
    <div className={styles.layer} onClick={onDone} role="status">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={styles.piece}
          style={{
            left: p.left, background: p.color, width: p.size, height: p.size * 1.6,
            animationDelay: p.delay, animationDuration: p.duration, '--spin': p.spin,
          }}
        />
      ))}
      <div className={styles.banner}>
        <div className={styles.cake}>🎂</div>
        <div className={styles.title}>Happy birthday, {username}!</div>
        <div className={styles.sub}>From everyone at the Crows Nest 🥳</div>
      </div>
    </div>
  );
}
