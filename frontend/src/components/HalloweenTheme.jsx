import React, { useEffect, useState } from 'react';
import { isHalloweenWeek, getHalloweenPrefs, HALLOWEEN_PREFS_EVENT } from '../utils/halloween';
import styles from './HalloweenTheme.module.css';

const FLASH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const FLASH_DURATION_MS = 900;
const WITCH_DURATION_MS = 7000;

// Seasonal overlay for Halloween week (see utils/halloween.js for the date
// window and the per-device opt-outs). Purely decorative: every element is
// pointer-events: none so nothing here can block a click, and it all sits
// in one fixed layer above the app. The palette swap itself is CSS, keyed
// off the data-seasonal attribute this sets (see global.css).
export default function HalloweenTheme({ flashIntervalMs = FLASH_INTERVAL_MS }) {
  const [inSeason, setInSeason] = useState(() => isHalloweenWeek());
  const [prefs, setPrefs] = useState(getHalloweenPrefs);
  const [flashing, setFlashing] = useState(false);
  const [witchFlying, setWitchFlying] = useState(false);

  const active = inSeason && prefs.enabled;

  // Re-check the date occasionally so a window left open across Nov 1→2
  // turns the theme off on its own.
  useEffect(() => {
    const id = setInterval(() => setInSeason(isHalloweenWeek()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onChange = () => setPrefs(getHalloweenPrefs());
    window.addEventListener(HALLOWEEN_PREFS_EVENT, onChange);
    return () => window.removeEventListener(HALLOWEEN_PREFS_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (active) document.documentElement.setAttribute('data-seasonal', 'halloween');
    else document.documentElement.removeAttribute('data-seasonal');
    return () => document.documentElement.removeAttribute('data-seasonal');
  }, [active]);

  // Lightning every 20 minutes, with the witch flying across right after.
  // Two quick flickers under a second — kept under the 3-flashes-per-second
  // photosensitivity threshold — and skipped entirely for anyone whose OS
  // asks for reduced motion.
  useEffect(() => {
    if (!active || !prefs.flashEnabled) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let flashTimer;
    let witchTimer;
    const id = setInterval(() => {
      setFlashing(true);
      setWitchFlying(true);
      flashTimer = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
      witchTimer = setTimeout(() => setWitchFlying(false), WITCH_DURATION_MS);
    }, flashIntervalMs);

    return () => {
      clearInterval(id);
      clearTimeout(flashTimer);
      clearTimeout(witchTimer);
    };
  }, [active, prefs.flashEnabled, flashIntervalMs]);

  if (!active) return null;

  return (
    <div className={styles.layer} aria-hidden="true">
      <Cobweb className={styles.webLeft} />
      <Cobweb className={styles.webRight} />

      <div className={styles.spiderThread}>
        <span className={styles.spider}>🕷️</span>
      </div>

      <span className={`${styles.bat} ${styles.bat1}`}>🦇</span>
      <span className={`${styles.bat} ${styles.bat2}`}>🦇</span>
      <span className={`${styles.bat} ${styles.bat3}`}>🦇</span>

      <span className={styles.ghost}>👻</span>

      <div className={styles.mummy}><Mummy /></div>

      <div className={styles.pumpkins}>
        <span>🎃</span>
        <span className={styles.pumpkinSmall}>🎃</span>
        <span>🕯️</span>
      </div>

      {witchFlying && <span className={styles.witch}>🧙‍♀️🧹</span>}
      {flashing && <div className={styles.flash} />}
    </div>
  );
}

const Cobweb = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.8">
    <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20" />
    <path d="M0 18 Q9 9 18 0 M0 36 Q18 18 36 0 M0 56 Q28 28 56 0 M0 78 Q39 39 78 0" />
  </svg>
);

// No mummy emoji exists, so a small hand-drawn one peeks in from the edge.
const Mummy = () => (
  <svg width="64" height="80" viewBox="0 0 64 80">
    <rect x="8" y="6" width="48" height="74" rx="22" fill="#e8e0c8" />
    <g stroke="#b9ad8c" strokeWidth="3" strokeLinecap="round">
      <path d="M8 20 L56 14" />
      <path d="M8 40 L56 46" />
      <path d="M8 54 L56 50" />
      <path d="M8 66 L56 70" />
    </g>
    <rect x="12" y="24" width="40" height="12" rx="4" fill="#2a2333" />
    <circle cx="24" cy="30" r="3.5" fill="#9cff57" />
    <circle cx="40" cy="30" r="3.5" fill="#9cff57" />
  </svg>
);
