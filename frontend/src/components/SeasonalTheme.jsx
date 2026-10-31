import React, { useEffect, useMemo, useState } from 'react';
import { getActiveHoliday, getSeasonalPrefs, SEASONAL_PREFS_EVENT } from '../utils/seasonal';
import styles from './SeasonalTheme.module.css';

const MOMENT_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const MOMENT_DURATION_MS = 8000;

// What each holiday looks like. The palette swap is CSS (global.css, keyed
// off data-seasonal); everything here is the decorative overlay on top:
//   particles — ambient stuff that keeps drifting/falling/rising
//   corner    — a little cluster glowing in the bottom-left corner
//   moment    — the big thing that happens every 20 minutes
//   Extras    — one-off pieces unique to that holiday
// Emoji are limited to ones Windows' emoji font actually draws (no flags,
// which render as plain letters there, and no very new emoji).
const THEMES = {
  halloween: {
    particles: { kind: 'drift', items: ['🦇'], count: 3 },
    corner: ['🎃', '🎃', '🕯️'],
    glow: '255, 140, 0',
    moment: { kind: 'fly', items: '🧙‍♀️🧹', flash: true },
    Extras: HalloweenExtras,
  },
  thanksgiving: {
    particles: { kind: 'fall', items: ['🍂', '🍁', '🍂'], count: 10 },
    corner: ['🦃', '🥧', '🌽'],
    glow: '230, 140, 50',
    moment: { kind: 'walk', items: '🦃' },
  },
  hanukkah: {
    particles: { kind: 'rise', items: ['✨', '✡️', '✨'], count: 8 },
    corner: [],
    glow: '242, 201, 76',
    moment: { kind: 'shower', items: ['💰', '✨', '🍩'] },
    Extras: HanukkahExtras,
  },
  christmas: {
    particles: { kind: 'snow', count: 30 },
    corner: ['🎄', '🎁', '⛄'],
    glow: '255, 80, 80',
    moment: { kind: 'fly', items: '🎅🛷🦌🦌' }, // reindeer in front — it flies left to right
    Extras: ChristmasExtras,
  },
  newyear: {
    particles: { kind: 'confetti', count: 24, colors: ['#e6b325', '#f0c850', '#c9a3ff', '#ffffff'] },
    corner: ['🥂', '🍾', '🎉'],
    glow: '230, 179, 37',
    moment: { kind: 'fireworks', colors: ['#e6b325', '#ff5fa2', '#7fd4ff', '#ffffff'] },
  },
  valentines: {
    particles: { kind: 'rise', items: ['💖', '💕', '❤️'], count: 10 },
    corner: ['💐', '💝', '🧸'],
    glow: '255, 79, 139',
    moment: { kind: 'fly', items: '🏹💘' },
  },
  stpatricks: {
    particles: { kind: 'fall', items: ['🍀', '☘️'], count: 10 },
    corner: ['🍀', '💰', '🍺'],
    glow: '60, 200, 100',
    moment: { kind: 'rainbow' },
  },
  easter: {
    particles: { kind: 'fall', items: ['🌸', '🌷', '🌸'], count: 10 },
    corner: ['🥚', '🐣', '🌷'],
    glow: '200, 160, 255',
    moment: { kind: 'hop', items: '🐰' },
  },
  july4: {
    particles: { kind: 'confetti', count: 20, colors: ['#e63946', '#ffffff', '#4d7cff'] },
    corner: ['🗽', '🌭', '🎆'],
    glow: '230, 57, 70',
    moment: { kind: 'fireworks', colors: ['#e63946', '#ffffff', '#4d7cff'] },
  },
};

// Small seeded PRNG so each particle gets a stable random position/speed
// across re-renders (Math.random in render would reshuffle them constantly).
function seeded(i) {
  const x = Math.sin(i * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// Holiday overlay — see utils/seasonal.js for the dates and the per-device
// opt-outs. Purely decorative: every element is pointer-events: none, so
// nothing here can ever block a click.
export default function SeasonalTheme({ momentIntervalMs = MOMENT_INTERVAL_MS, holidayOverride }) {
  const [holiday, setHoliday] = useState(() => holidayOverride || getActiveHoliday());
  const [prefs, setPrefs] = useState(getSeasonalPrefs);
  const [momentKey, setMomentKey] = useState(0); // >0 while a moment is playing

  const theme = holiday && THEMES[holiday.id];
  const active = !!theme && prefs.enabled;

  // Re-check the date occasionally so a window left open across midnight
  // rolls into (or out of) a holiday on its own.
  useEffect(() => {
    if (holidayOverride) { setHoliday(holidayOverride); return; }
    const id = setInterval(() => setHoliday(getActiveHoliday()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [holidayOverride]);

  useEffect(() => {
    const onChange = () => setPrefs(getSeasonalPrefs());
    window.addEventListener(SEASONAL_PREFS_EVENT, onChange);
    return () => window.removeEventListener(SEASONAL_PREFS_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (active) document.documentElement.setAttribute('data-seasonal', holiday.id);
    else document.documentElement.removeAttribute('data-seasonal');
    return () => document.documentElement.removeAttribute('data-seasonal');
  }, [active, holiday?.id]);

  // The big moment every 20 minutes. Skipped entirely for anyone whose OS
  // asks for reduced motion. Halloween's lightning is two quick flickers
  // under a second — under the 3-flashes-per-second photosensitivity line.
  useEffect(() => {
    if (!active || !prefs.effectsEnabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let endTimer;
    const id = setInterval(() => {
      setMomentKey((k) => k + 1);
      clearTimeout(endTimer);
      endTimer = setTimeout(() => setMomentKey(0), MOMENT_DURATION_MS);
    }, momentIntervalMs);
    return () => {
      clearInterval(id);
      clearTimeout(endTimer);
      setMomentKey(0);
    };
  }, [active, prefs.effectsEnabled, momentIntervalMs]);

  if (!active) return null;

  const { Extras } = theme;

  return (
    <div className={styles.layer} aria-hidden="true" style={{ '--glow': theme.glow }}>
      <Particles {...theme.particles} />
      {Extras && <Extras holiday={holiday} />}
      {theme.corner.length > 0 && (
        <div className={styles.corner}>
          {theme.corner.map((e, i) => <span key={i} className={i === 1 ? styles.cornerSmall : undefined}>{e}</span>)}
        </div>
      )}
      {momentKey > 0 && <Moment key={momentKey} {...theme.moment} />}
    </div>
  );
}

// ── Ambient particles ──────────────────────────────────────

function Particles({ kind, items = [], count, colors = [] }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r1 = seeded(i + 1), r2 = seeded(i + 101), r3 = seeded(i + 211);
    return {
      key: i,
      content: items.length ? items[i % items.length] : null,
      style: {
        '--x': `${Math.round(r1 * 100)}vw`,
        '--y': `${Math.round(5 + r1 * 20)}vh`,
        '--sway': `${Math.round((r2 - 0.5) * 120)}px`,
        '--spin': `${Math.round((r3 - 0.5) * 720)}deg`,
        '--size': kind === 'snow' ? `${3 + Math.round(r3 * 4)}px` : `${14 + Math.round(r3 * 12)}px`,
        '--color': colors.length ? colors[i % colors.length] : undefined,
        animationDuration: `${Math.round((kind === 'drift' ? 28 : 12) + r2 * (kind === 'drift' ? 18 : 14))}s`,
        animationDelay: `-${Math.round(r3 * 30)}s`,
      },
    };
  }), [kind, items, count, colors]);

  return particles.map((p) => (
    <span key={p.key} className={`${styles.particle} ${styles[kind]}`} style={p.style}>{p.content}</span>
  ));
}

// ── The 20-minute moment ───────────────────────────────────

function Moment({ kind, items, flash, colors }) {
  if (kind === 'fly') {
    return (
      <>
        {flash && <div className={styles.flash} />}
        <span className={styles.fly}>{items}</span>
      </>
    );
  }
  if (kind === 'walk') return <span className={styles.walk}>{items}</span>;
  if (kind === 'hop') return <span className={styles.hopTrack}><span className={styles.hop}>{items}</span></span>;
  if (kind === 'rainbow') {
    return (
      <div className={styles.rainbowWrap}>
        <div className={styles.rainbow} />
        <span className={styles.potOfGold}>💰</span>
      </div>
    );
  }
  if (kind === 'shower') {
    return Array.from({ length: 18 }, (_, i) => (
      <span
        key={i}
        className={styles.showerItem}
        style={{ left: `${Math.round(seeded(i + 7) * 96)}vw`, animationDelay: `${(seeded(i + 31) * 2.5).toFixed(2)}s` }}
      >
        {items[i % items.length]}
      </span>
    ));
  }
  if (kind === 'fireworks') {
    return Array.from({ length: 5 }, (_, b) => (
      <div
        key={b}
        className={styles.burst}
        style={{
          left: `${Math.round(15 + seeded(b + 3) * 70)}vw`,
          top: `${Math.round(10 + seeded(b + 13) * 35)}vh`,
          animationDelay: `${(b * 1.1).toFixed(1)}s`,
        }}
      >
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ '--angle': `${i * (360 / 18)}deg`, '--color': colors[(b + i) % colors.length], animationDelay: `${(b * 1.1).toFixed(1)}s` }} />
        ))}
      </div>
    ));
  }
  return null;
}

// ── Holiday-specific extras ────────────────────────────────

function HalloweenExtras() {
  return (
    <>
      <Cobweb className={styles.webLeft} />
      <Cobweb className={styles.webRight} />
      <div className={styles.spiderThread}><span className={styles.spider}>🕷️</span></div>
      <span className={styles.ghost}>👻</span>
      <div className={styles.mummy}><Mummy /></div>
    </>
  );
}

function ChristmasExtras() {
  const bulbs = ['#ff4d4d', '#ffd84d', '#4dff88', '#4db8ff', '#ff4dd2'];
  return (
    <div className={styles.lights}>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} style={{ '--color': bulbs[i % bulbs.length], animationDelay: `${(i % 5) * 0.4}s` }} />
      ))}
    </div>
  );
}

// A menorah lit for tonight's night of Hanukkah (holiday.night: 0-8). The
// shamash (center, raised) is always lit; candles fill right-to-left.
function HanukkahExtras({ holiday }) {
  const lit = holiday?.night ?? 0;
  const xs = [8, 18, 28, 38, 62, 72, 82, 92]; // left → right, gap for the shamash
  return (
    <div className={styles.menorah} title={`Night ${lit} of Hanukkah`}>
      <svg width="120" height="84" viewBox="0 0 100 70">
        <g fill="#f2c94c">
          <rect x="47" y="58" width="6" height="8" />
          <rect x="35" y="65" width="30" height="4" rx="2" />
          <rect x="4" y="40" width="92" height="3" rx="1.5" />
          <path d="M50 58 V 43" stroke="#f2c94c" strokeWidth="3" />
        </g>
        {xs.map((x, i) => {
          const isLit = 8 - i <= lit; // rightmost candle is night 1
          return (
            <g key={x}>
              <rect x={x - 2} y="28" width="4" height="12" fill={isLit ? '#9fc4ff' : '#4a5a80'} />
              {isLit && <ellipse className={styles.flame} cx={x} cy="24" rx="2.2" ry="4" fill="#ffb84d" />}
            </g>
          );
        })}
        <rect x="48" y="16" width="4" height="24" fill="#9fc4ff" />
        <ellipse className={styles.flame} cx="50" cy="12" rx="2.4" ry="4.4" fill="#ffb84d" />
      </svg>
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
