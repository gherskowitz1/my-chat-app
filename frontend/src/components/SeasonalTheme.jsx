import React, { useEffect, useMemo, useState } from 'react';
import { getActiveHoliday, getSeasonalPrefs, SEASONAL_PREFS_EVENT } from '../utils/seasonal';
import {
  ShapeSvg, Spark, Coin,
  HalloweenCorner, ThanksgivingCorner, HanukkahCorner, ChristmasCorner, NewYearCorner,
  ValentinesCorner, StPatricksCorner, EasterCorner, July4Corner,
  GarlandSegment, BuntingFan, Cobweb, Spider, Mummy, Ghost,
  Moon, WitchSilhouette, SleighSilhouette, Turkey, Bunny, CupidArrow, Rainbow,
} from './seasonal/art';
import styles from './SeasonalTheme.module.css';

const MOMENT_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const MOMENT_DURATION_MS = 8000;

// What each holiday looks like. The palette swap is CSS (global.css, keyed
// off data-seasonal); everything here is the decorative overlay on top, all
// hand-drawn SVG from ./seasonal/art.jsx:
//   particles — ambient shapes that keep drifting/falling/rising
//   Corner    — a little scene glowing in the bottom-left corner
//   moment    — the big thing that happens every 20 minutes
//   Extras    — edge pieces unique to that holiday
const THEMES = {
  halloween: {
    particles: { kind: 'drift', shape: 'bat', colors: ['#0b0710'], count: 3 },
    Corner: HalloweenCorner,
    glow: '255, 140, 0',
    moment: { kind: 'moonRider', Rider: WitchSilhouette, flash: true },
    Extras: HalloweenExtras,
  },
  thanksgiving: {
    particles: { kind: 'fall', shape: 'leaf', colors: ['#d9822b', '#b8401e', '#e6b325', '#9a3412'], count: 10 },
    Corner: ThanksgivingCorner,
    glow: '230, 140, 50',
    moment: { kind: 'walk', Art: Turkey },
  },
  hanukkah: {
    particles: { kind: 'rise', shape: 'starOfDavid', colors: ['#8ab4ff', '#f2c94c'], count: 7 },
    Corner: HanukkahCorner,
    glow: '242, 201, 76',
    moment: { kind: 'shower' },
  },
  christmas: {
    particles: { kind: 'fall', shape: 'snowflake', colors: ['#ffffff'], count: 16 },
    Corner: ChristmasCorner,
    glow: '255, 80, 80',
    moment: { kind: 'moonRider', Rider: SleighSilhouette },
    Extras: ChristmasExtras,
  },
  newyear: {
    particles: { kind: 'confetti', count: 24, colors: ['#e6b325', '#f0c850', '#c9a3ff', '#ffffff'] },
    Corner: NewYearCorner,
    glow: '230, 179, 37',
    moment: { kind: 'fireworks', colors: ['#e6b325', '#ff5fa2', '#7fd4ff', '#c9a3ff'] },
  },
  valentines: {
    particles: { kind: 'rise', shape: 'heart', colors: ['#ff4f8b', '#ff86ad', '#e03872', '#ffc2d6'], count: 10 },
    Corner: ValentinesCorner,
    glow: '255, 79, 139',
    moment: { kind: 'fly', Art: CupidArrow },
  },
  stpatricks: {
    particles: { kind: 'fall', shape: 'shamrock', colors: ['#2fbf5b', '#5fe08a', '#239a48'], count: 10 },
    Corner: StPatricksCorner,
    glow: '60, 200, 100',
    moment: { kind: 'rainbow' },
  },
  easter: {
    particles: { kind: 'fall', shape: 'petal', colors: ['#f7a8d0', '#ffffff', '#ffd1e6'], count: 12 },
    Corner: EasterCorner,
    glow: '200, 160, 255',
    moment: { kind: 'hop', Art: Bunny },
  },
  july4: {
    particles: { kind: 'confetti', count: 20, colors: ['#e63946', '#ffffff', '#4d7cff'] },
    Corner: July4Corner,
    glow: '230, 57, 70',
    moment: { kind: 'fireworks', colors: ['#e63946', '#f4f6ff', '#4d7cff'] },
    Extras: July4Extras,
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

  const { Corner, Extras } = theme;

  return (
    <div className={styles.layer} aria-hidden="true" style={{ '--glow': theme.glow }}>
      <Particles {...theme.particles} />
      {Extras && <Extras />}
      <div className={styles.corner}><Corner night={holiday.night} /></div>
      {momentKey > 0 && <Moment key={momentKey} {...theme.moment} />}
    </div>
  );
}

// ── Ambient particles ──────────────────────────────────────

function Particles({ kind, shape, count, colors = [] }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r1 = seeded(i + 1), r2 = seeded(i + 101), r3 = seeded(i + 211);
    const size = kind === 'drift' ? 30 + Math.round(r3 * 18) : 14 + Math.round(r3 * 14);
    return {
      key: i,
      size,
      color: colors[i % colors.length],
      style: {
        '--x': `${Math.round(r1 * 100)}vw`,
        '--y': `${Math.round(5 + r1 * 20)}vh`,
        '--sway': `${Math.round((r2 - 0.5) * 120)}px`,
        '--spin': `${Math.round((r3 - 0.5) * 720)}deg`,
        '--size': `${size}px`,
        '--color': colors[i % colors.length],
        animationDuration: `${Math.round((kind === 'drift' ? 28 : 12) + r2 * (kind === 'drift' ? 18 : 14))}s`,
        animationDelay: `-${Math.round(r3 * 30)}s`,
      },
    };
  }), [kind, count, colors]);

  return particles.map((p) => (
    <span key={p.key} className={`${styles.particle} ${styles[kind]}`} style={p.style}>
      {shape && <ShapeSvg shape={shape} color={p.color} size={p.size} />}
    </span>
  ));
}

// ── The 20-minute moment ───────────────────────────────────

function Moment({ kind, Art, Rider, flash, colors }) {
  if (kind === 'moonRider') {
    return (
      <>
        {flash && <div className={styles.flash} />}
        <div className={styles.moon}><Moon /></div>
        <div className={styles.rider}><Rider /></div>
      </>
    );
  }
  if (kind === 'fly') return <div className={styles.fly}><Art /></div>;
  if (kind === 'walk') return <div className={styles.walk}><div className={styles.waddle}><Art /></div></div>;
  if (kind === 'hop') return <div className={styles.hopTrack}><div className={styles.hop}><Art /></div></div>;
  if (kind === 'rainbow') return <div className={styles.rainbowWrap}><Rainbow /></div>;
  if (kind === 'shower') {
    return Array.from({ length: 18 }, (_, i) => (
      <div
        key={i}
        className={styles.showerItem}
        style={{ left: `${Math.round(seeded(i + 7) * 96)}vw`, animationDelay: `${(seeded(i + 31) * 2.5).toFixed(2)}s` }}
      >
        <svg width="26" height="26" viewBox="-12 -12 24 24"><Coin /></svg>
      </div>
    ));
  }
  if (kind === 'fireworks') {
    return Array.from({ length: 6 }, (_, b) => (
      <svg
        key={b}
        className={styles.burst}
        width="200" height="200" viewBox="-40 -40 80 80"
        style={{
          left: `calc(${Math.round(15 + seeded(b + 3) * 70)}vw - 100px)`,
          top: `calc(${Math.round(12 + seeded(b + 13) * 35)}vh - 100px)`,
          animationDelay: `${(b * 0.9).toFixed(1)}s`,
        }}
      >
        <Spark color={colors[b % colors.length]} />
      </svg>
    ));
  }
  return null;
}

// ── Holiday-specific edge pieces ───────────────────────────

function HalloweenExtras() {
  return (
    <>
      <Cobweb className={styles.webLeft} />
      <Cobweb className={styles.webRight} />
      <div className={styles.spiderThread}><div className={styles.spider}><Spider /></div></div>
      <div className={styles.ghost}><Ghost /></div>
      <div className={styles.mummy}><Mummy /></div>
    </>
  );
}

function ChristmasExtras() {
  return (
    <div className={styles.edgeTop}>
      {Array.from({ length: 34 }, (_, i) => <GarlandSegment key={i} offset={i} />)}
    </div>
  );
}

function July4Extras() {
  return (
    <div className={styles.edgeTop}>
      {Array.from({ length: 80 }, (_, i) => <BuntingFan key={i} />)}
    </div>
  );
}
