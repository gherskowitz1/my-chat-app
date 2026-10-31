import React from 'react';
import styles from '../SeasonalTheme.module.css';

// Hand-drawn SVG artwork for the holiday themes (see SeasonalTheme.jsx).
// Drawn as plain inline SVG instead of emoji so it looks identical on every
// OS, stays crisp at any size, and matches each holiday's palette.
//
// Shapes (Heart, Leaf, ...) are drawn in a -20..20 box and wrapped by
// <ShapeSvg> for the ambient particles; the Corner/Moment pieces are full
// little scenes with their own viewBox.

// ── Small shapes ───────────────────────────────────────────

export const Heart = ({ color }) => (
  <path fill={color} d="M0 -4 C -4 -12 -16 -10 -14 0 C -12 7 -4 11 0 15 C 4 11 12 7 14 0 C 16 -10 4 -12 0 -4 Z" />
);

export const Leaf = ({ color }) => (
  <path fill={color} d="M0,-20 L4,-10 L12,-14 L9,-4 L18,-2 L10,4 L13,12 L3,9 L1,20 L-1,20 L-3,9 L-13,12 L-10,4 L-18,-2 L-9,-4 L-12,-14 L-4,-10 Z" />
);

export const Snowflake = ({ color = '#fff' }) => (
  <g stroke={color} strokeWidth="2.2" strokeLinecap="round" fill="none">
    {[0, 60, 120, 180, 240, 300].map((a) => (
      <path key={a} transform={`rotate(${a})`} d="M0 0 V-17 M0 -10 l-5 -4.5 M0 -10 l5 -4.5 M0 -5 l-3.5 -3 M0 -5 l3.5 -3" />
    ))}
  </g>
);

export const Shamrock = ({ color }) => (
  <g fill={color}>
    {[0, 120, 240].map((a) => (
      <g key={a} transform={`rotate(${a}) translate(0,-9) scale(.55) rotate(180)`}>
        <Heart color={color} />
      </g>
    ))}
    <path d="M0 2 Q 3 12 8 18" stroke={color} strokeWidth="2" fill="none" />
  </g>
);

export const Bat = ({ color = '#0b0710' }) => (
  <g className={styles.flap}>
    <path fill={color} d="M0,2 C-3,-3 -9,-7 -20,-3 C-15,-2 -14,2 -13,5 C-10,2 -7,3 -5,6 C-3,3 -1,3 0,4 C1,3 3,3 5,6 C7,3 10,2 13,5 C14,2 15,-2 20,-3 C9,-7 3,-3 0,2 Z M-2,-1 L-3,-5 L-1,-2 Z M2,-1 L3,-5 L1,-2 Z" />
  </g>
);

export const StarOfDavid = ({ color }) => (
  <path fill="none" stroke={color} strokeWidth="2" d="M0 -14 L12.1 7 L-12.1 7 Z M0 14 L12.1 -7 L-12.1 -7 Z" />
);

export const Petal = ({ color }) => <ellipse rx="7" ry="11" fill={color} />;

export const Star5 = ({ color, ...rest }) => (
  <path fill={color} {...rest} d="M0,-10 L2.9,-3.1 L9.5,-3.1 L4.2,1.2 L5.9,8.1 L0,4 L-5.9,8.1 L-4.2,1.2 L-9.5,-3.1 L-2.9,-3.1 Z" />
);

export const Coin = () => (
  <g>
    <circle r="9" fill="#e6b325" />
    <circle r="6.5" fill="none" stroke="#b8860b" strokeWidth="1.4" />
  </g>
);

const SHAPES = { heart: Heart, leaf: Leaf, snowflake: Snowflake, shamrock: Shamrock, bat: Bat, starOfDavid: StarOfDavid, petal: Petal, coin: Coin };

export function ShapeSvg({ shape, color, size }) {
  const Shape = SHAPES[shape];
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" style={{ display: 'block', overflow: 'visible' }}>
      <Shape color={color} />
    </svg>
  );
}

// A firework: 12 rays that burst outward and fade.
export const Spark = ({ color, className, style }) => (
  <g className={className} style={style} stroke={color} strokeLinecap="round" strokeWidth="2.4">
    {Array.from({ length: 12 }, (_, i) => <path key={i} d="M0 -14 V-34" transform={`rotate(${i * 30})`} />)}
  </g>
);

// ── Corner scenes (bottom-left, glowing) ───────────────────

const Pumpkin = ({ carved, faceDelay = 0 }) => (
  <g>
    <ellipse cx="-14" cy="0" rx="18" ry="24" fill="#e0610b" />
    <ellipse cx="14" cy="0" rx="18" ry="24" fill="#e0610b" />
    <ellipse rx="20" ry="26" fill="#ff7518" />
    <path d="M-2 -26 Q 0 -36 6 -38" stroke="#4a7a2a" strokeWidth="4" fill="none" strokeLinecap="round" />
    {carved === 'triangle' && (
      <g fill="#ffd84d" className={styles.flicker} style={{ animationDelay: `${faceDelay}s` }}>
        <path d="M-14 -8 L-6 -8 L-10 -16 Z" /><path d="M14 -8 L6 -8 L10 -16 Z" />
        <path d="M-16 4 Q 0 18 16 4 L 10 6 L 6 2 L 2 7 L -2 2 L -6 7 L -10 2 Z" />
      </g>
    )}
    {carved === 'round' && (
      <g fill="#ffd84d" className={styles.flicker} style={{ animationDelay: `${faceDelay}s` }}>
        <circle cx="-8" cy="-7" r="4" /><circle cx="8" cy="-7" r="4" /><ellipse cy="8" rx="8" ry="4.5" />
      </g>
    )}
  </g>
);

export const HalloweenCorner = () => (
  <svg width="150" height="76" viewBox="-70 -42 160 82">
    <ellipse cx="10" cy="4" rx="70" ry="30" fill="#ff7518" className={styles.glowPulse} />
    <Pumpkin carved="triangle" />
    <g transform="translate(48,10) scale(.65)"><Pumpkin carved="round" faceDelay={-0.7} /></g>
  </svg>
);

export const ThanksgivingCorner = () => (
  <svg width="130" height="90" viewBox="-60 -70 130 90">
    <g stroke="#e6b325" strokeWidth="2" fill="none">
      <path d="M-40 10 Q -44 -30 -50 -50" /><path d="M-36 10 Q -36 -30 -36 -56" /><path d="M-32 10 Q -26 -30 -22 -50" />
    </g>
    <g fill="#e6b325">
      <ellipse cx="-50" cy="-52" rx="3" ry="8" transform="rotate(-12 -50 -52)" />
      <ellipse cx="-36" cy="-58" rx="3" ry="8" />
      <ellipse cx="-22" cy="-52" rx="3" ry="8" transform="rotate(12 -22 -52)" />
    </g>
    <ellipse cx="-14" cy="0" rx="18" ry="16" fill="#c2410c" /><ellipse cx="14" cy="0" rx="18" ry="16" fill="#c2410c" />
    <ellipse rx="20" ry="18" fill="#ea580c" />
    <path d="M0 -18 Q 2 -26 7 -27" stroke="#4a7a2a" strokeWidth="4" fill="none" />
    <g transform="translate(46,0) rotate(20)">
      <ellipse rx="9" ry="22" fill="#f2c94c" />
      <g fill="#d9a520"><circle cx="-3" cy="-10" r="2" /><circle cx="3" cy="-4" r="2" /><circle cx="-3" cy="2" r="2" /><circle cx="3" cy="8" r="2" /></g>
      <path d="M-9 12 Q -18 -4 -12 -24 M9 12 Q 18 -4 12 -24" stroke="#7a9a3a" strokeWidth="4" fill="none" />
    </g>
  </svg>
);

// A menorah lit for tonight (night 0-8; 0 = just the shamash), plus a
// rocking dreidel and some gelt. Candles are added right to left.
export const HanukkahCorner = ({ night = 0 }) => {
  const xs = [-80, -60, -40, -20, 20, 40, 60, 80];
  return (
    <svg width="200" height="139" viewBox="-95 -160 280 195">
      <ellipse cx="0" cy="-80" rx="120" ry="60" fill="#f2c94c" className={styles.glowPulse} />
      <g fill="none" stroke="#f2c94c" strokeWidth="5" strokeLinecap="round">
        <path d="M0 -8 V-100" />
        <path d="M-20 -100 Q -20 -60 0 -60 Q 20 -60 20 -100" />
        <path d="M-40 -100 Q -40 -44 0 -44 Q 40 -44 40 -100" />
        <path d="M-60 -100 Q -60 -30 0 -30 Q 60 -30 60 -100" />
        <path d="M-80 -100 Q -80 -18 0 -18 Q 80 -18 80 -100" />
      </g>
      <path d="M-26 0 L26 0 L14 -10 L-14 -10 Z" fill="#f2c94c" />
      <rect x="-4" y="-124" width="8" height="24" fill="#f2c94c" />
      <rect x="-6" y="-124" width="12" height="5" rx="2" fill="#f2c94c" />
      {xs.map((x, i) => {
        const lit = 8 - i <= night; // rightmost candle is night 1
        return (
          <g key={x}>
            <rect x={x - 6} y="-104" width="12" height="5" rx="2" fill="#f2c94c" />
            <rect x={x - 3} y="-122" width="6" height="18" fill="#cfe0ff" opacity={lit ? 1 : 0.35} />
            {lit && <Flame x={x} y={-128} delay={-(i % 4) * 0.12} />}
          </g>
        );
      })}
      <rect x="-3" y="-142" width="6" height="18" fill="#cfe0ff" />
      <Flame x={0} y={-148} />
      <g transform="translate(140,-30)">
        <g className={styles.dreidel}>
          <rect x="-4" y="-46" width="8" height="18" rx="3" fill="#cfe0ff" />
          <path d="M-26 -30 H26 V10 L0 40 L-26 10 Z" fill="#4d8dff" />
          <path d="M-26 -30 H0 V40 L-26 10 Z" fill="#3670d9" />
          <text x="13" y="0" fontSize="26" fill="#f2c94c" textAnchor="middle" fontFamily="serif" fontWeight="700">ש</text>
        </g>
        <g transform="translate(-34,26)"><Coin /></g>
        <g transform="translate(30,30)"><Coin /></g>
      </g>
    </svg>
  );
};

const Flame = ({ x, y, delay = 0 }) => (
  <g>
    <ellipse className={styles.flame} style={{ animationDelay: `${delay}s` }} cx={x} cy={y} rx="3.5" ry="6" fill="#ffb84d" />
    <ellipse className={styles.flame} style={{ animationDelay: `${delay}s` }} cx={x} cy={y + 2} rx="1.5" ry="3" fill="#fff3c4" />
  </g>
);

export const ChristmasCorner = () => (
  <svg width="130" height="126" viewBox="-92 -172 180 174">
    <rect x="-8" y="-18" width="16" height="18" fill="#6b3a1f" />
    <path d="M-62 -18 L62 -18 L0 -88 Z" fill="#1f6b35" />
    <path d="M-50 -60 L50 -60 L0 -122 Z" fill="#2a8443" />
    <path d="M-36 -98 L36 -98 L0 -150 Z" fill="#3a9e55" />
    <path d="M-48 -34 Q 0 -20 46 -44 M-34 -76 Q 0 -64 34 -86 M-22 -110 Q 0 -102 22 -118" stroke="#f2c94c" strokeWidth="2" fill="none" />
    <circle cx="-30" cy="-30" r="5" fill="#d4373c" /><circle cx="20" cy="-38" r="5" fill="#4db8ff" />
    <circle cx="-12" cy="-70" r="5" fill="#f2c94c" /><circle cx="24" cy="-80" r="5" fill="#d4373c" />
    <circle cx="-8" cy="-112" r="4.5" fill="#4db8ff" /><circle cx="40" cy="-26" r="4" fill="#f2c94c" />
    <g transform="translate(0,-156) scale(1.3)" className={styles.twinkle}><Star5 color="#f2c94c" /></g>
    <g transform="translate(66,0)">
      <rect x="-18" y="-30" width="36" height="30" fill="#d4373c" />
      <rect x="-3" y="-30" width="6" height="30" fill="#f2c94c" />
      <rect x="-18" y="-18" width="36" height="6" fill="#f2c94c" />
      <path d="M0 -30 q -12 -12 -12 -2 q 0 6 12 2 q 12 4 12 -2 q 0 -10 -12 2" fill="#f2c94c" />
    </g>
    <g transform="translate(-74,0)">
      <rect x="-14" y="-22" width="28" height="22" fill="#4db8ff" />
      <rect x="-2.5" y="-22" width="5" height="22" fill="#f3f7f2" />
      <rect x="-14" y="-13" width="28" height="5" fill="#f3f7f2" />
    </g>
  </svg>
);

const Flute = ({ tilt, bubbleDelay = 0 }) => (
  <g transform={`rotate(${tilt}) translate(${tilt < 0 ? -22 : 22},0)`}>
    <path d="M-14 -110 L14 -110 L8 -60 Q 0 -52 -8 -60 Z" fill="#f5f3ee" opacity=".25" stroke="#f5f3ee" strokeWidth="1.5" />
    <path d="M-12 -94 L12 -94 L8 -60 Q 0 -52 -8 -60 Z" fill="#e6b325" />
    <path d="M0 -55 V-8 M-14 -6 H14" stroke="#f5f3ee" strokeWidth="2.5" strokeLinecap="round" />
    <g fill="#fff3c4">
      <circle cx="-3" cy="-80" r="1.4" className={styles.twinkle} style={{ animationDelay: `${bubbleDelay}s` }} />
      <circle cx="3" cy="-70" r="1.2" className={styles.twinkle} style={{ animationDelay: `${bubbleDelay - 0.5}s` }} />
    </g>
  </g>
);

export const NewYearCorner = () => (
  <svg width="96" height="108" viewBox="-62 -138 124 140">
    <Flute tilt={-14} />
    <Flute tilt={14} bubbleDelay={-0.9} />
    <g transform="translate(0,-124) scale(.6)" className={styles.twinkle}><Star5 color="#f0c850" /></g>
    <g transform="translate(-30,-130) scale(.4)" className={styles.twinkle} style={{ animationDelay: '-.6s' }}><Star5 color="#f0c850" /></g>
    <g transform="translate(30,-128) scale(.45)" className={styles.twinkle} style={{ animationDelay: '-1.1s' }}><Star5 color="#f0c850" /></g>
  </svg>
);

const Rose = ({ x, y, scale = 1, petal, light, dark }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    <circle r="16" fill={petal} />
    <path d="M-8 -4 q 8 -12 16 0 q -4 10 -12 6 q -2 -6 4 -6" stroke={light} strokeWidth="2" fill="none" />
    <path d="M-12 4 q 12 12 24 0" stroke={dark} strokeWidth="2" fill="none" />
  </g>
);

export const ValentinesCorner = () => (
  <svg width="84" height="108" viewBox="-46 -106 84 108">
    <path d="M-20 0 Q -24 -50 -14 -80 M6 0 Q 10 -40 18 -66" stroke="#3f8f52" strokeWidth="3" fill="none" />
    <path d="M-20 -40 q -20 -6 -22 -20 q 16 2 22 20" fill="#3f8f52" />
    <path d="M10 -36 q 18 -4 22 -18 q -16 2 -22 18" fill="#3f8f52" />
    <Rose x={-14} y={-86} petal="#c2185b" light="#ff86ad" dark="#8a1040" />
    <Rose x={18} y={-72} scale={0.8} petal="#e03872" light="#ffc2d6" dark="#a0204f" />
  </svg>
);

export const StPatricksCorner = () => (
  <svg width="120" height="76" viewBox="-82 -50 160 100">
    <g transform="scale(2.6)"><Shamrock color="#2fbf5b" /></g>
    <g transform="translate(-50,14) scale(1.6) rotate(-20)"><Shamrock color="#5fe08a" /></g>
    <g transform="translate(48,16) scale(1.4) rotate(18)"><Shamrock color="#239a48" /></g>
  </svg>
);

const Egg = ({ x, y, rotate = 0, scale = 1, children }) => (
  <g transform={`translate(${x},${y}) rotate(${rotate}) scale(${scale})`}>
    <g clipPath="url(#cn-seasonal-egg)">{children}</g>
  </g>
);

const Tulip = ({ x, y, color, flip }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -1 : 1},1)`}>
    <path d="M0 0 V-50" stroke="#5aa86a" strokeWidth="3" />
    <path d="M0 -20 q -14 -8 -14 -24 q 10 6 14 24" fill="#5aa86a" />
    <path d="M-10 -52 Q -12 -70 -6 -72 L0 -64 L6 -72 Q 12 -70 10 -52 Q 0 -44 -10 -52 Z" fill={color} />
  </g>
);

export const EasterCorner = () => (
  <svg width="150" height="90" viewBox="-90 -78 184 110">
    <defs><clipPath id="cn-seasonal-egg"><ellipse rx="20" ry="26" /></clipPath></defs>
    <Tulip x={-72} y={-10} color="#f7a8d0" />
    <Tulip x={82} y={-6} color="#ffe08a" flip />
    <Egg x={-40} y={0}>
      <rect x="-20" y="-26" width="40" height="52" fill="#b48cf0" />
      <path d="M-20 -6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l4 -4 V2 l-4 4 l-6 -6 l-6 6 l-6 -6 l-6 6 l-6 -6 l-6 6 Z" fill="#f7a8d0" />
      <rect x="-20" y="10" width="40" height="5" fill="#fff" />
    </Egg>
    <Egg x={6} y={6} rotate={12} scale={0.85}>
      <rect x="-20" y="-26" width="40" height="52" fill="#8fd3ff" />
      <g fill="#fff"><circle cx="-8" cy="-12" r="3" /><circle cx="6" cy="-6" r="3" /><circle cx="-4" cy="4" r="3" /><circle cx="10" cy="10" r="3" /><circle cx="-10" cy="16" r="3" /></g>
    </Egg>
    <Egg x={50} y={4} rotate={-10} scale={0.75}>
      <rect x="-20" y="-26" width="40" height="52" fill="#ffe08a" />
      <rect x="-20" y="-10" width="40" height="6" fill="#b48cf0" />
      <rect x="-20" y="6" width="40" height="6" fill="#7bd38a" />
    </Egg>
  </svg>
);

export const July4Corner = () => (
  <svg width="150" height="72" viewBox="-74 -66 210 100">
    <g transform="scale(3)"><Star5 color="#f4f6ff" /></g>
    <g transform="translate(-52,10) scale(1.8) rotate(-15)"><Star5 color="#e63946" /></g>
    <g transform="translate(50,12) scale(1.6) rotate(15)"><Star5 color="#4d7cff" /></g>
    <path d="M80 30 L120 -50" stroke="#8590b0" strokeWidth="2" />
    <g transform="translate(120,-50) scale(.35)"><Spark color="#ffd84d" className={styles.sparkler} /></g>
  </svg>
);

// ── Edge decorations ───────────────────────────────────────

// One swag of garland with four bulbs; repeated across the top.
export const GarlandSegment = ({ offset }) => {
  const bulbs = [[34, 15.5], [68, 21.3], [102, 21.3], [136, 15.5]];
  const colors = ['#ff4d4d', '#ffd84d', '#4dff88', '#4db8ff', '#ff4dd2'];
  return (
    <svg width="94" height="22" viewBox="0 0 170 40" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M0 4 Q 85 40 170 4" stroke="#2e6b3e" strokeWidth="7" fill="none" />
      <path d="M0 4 Q 85 40 170 4" stroke="#3f8f52" strokeWidth="2" fill="none" strokeDasharray="3 5" />
      {bulbs.map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 2.5} y={y} width="5" height="4" fill="#1a3a22" />
          <ellipse
            cx={x} cy={y + 10} rx="5" ry="7"
            fill={colors[(offset * 4 + i) % colors.length]}
            className={styles.twinkle}
            style={{ animationDelay: `${-((offset * 4 + i) % 5) * 0.4}s` }}
          />
        </g>
      ))}
    </svg>
  );
};

// One red-white-blue bunting fan; repeated across the top.
export const BuntingFan = () => (
  <svg width="40" height="16" viewBox="-32 0 64 26" style={{ flexShrink: 0, display: 'block' }}>
    <path d="M-22 0 A 22 22 0 0 0 22 0 Z" fill="#e63946" />
    <path d="M-17.6 0 A 17.6 17.6 0 0 0 17.6 0 Z" fill="#f4f6ff" />
    <path d="M-13.2 0 A 13.2 13.2 0 0 0 13.2 0 Z" fill="#e63946" />
    <path d="M-8.8 0 A 8.8 8.8 0 0 0 8.8 0 Z" fill="#f4f6ff" />
    <path d="M-22 0 A 22 6 0 0 0 22 0 Z" fill="#2747a8" />
    <g transform="translate(-11,2) scale(.18)"><Star5 color="#fff" /></g>
    <g transform="translate(0,3.4) scale(.18)"><Star5 color="#fff" /></g>
    <g transform="translate(11,2) scale(.18)"><Star5 color="#fff" /></g>
    <path d="M-32 0.5 H32" stroke="#c0c9e6" strokeWidth="1" />
  </svg>
);

export const Cobweb = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.8">
    <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20" />
    <path d="M0 18 Q9 9 18 0 M0 36 Q18 18 36 0 M0 56 Q28 28 56 0 M0 78 Q39 39 78 0" />
  </svg>
);

export const Spider = () => (
  <svg width="30" height="30" viewBox="-15 -15 30 30">
    <g fill="#0b0710" stroke="#0b0710">
      <ellipse rx="6" ry="7" stroke="none" />
      <circle cy="-8" r="4" stroke="none" />
      <path strokeWidth="1.4" fill="none" d="M-5 -2 l-9 -5 M-5 2 l-10 1 M-5 5 l-8 6 M5 -2 l9 -5 M5 2 l10 1 M5 5 l8 6" />
    </g>
  </svg>
);

// No mummy emoji exists anyway — this one peeks in from the right edge.
export const Mummy = () => (
  <svg width="64" height="80" viewBox="0 0 64 80">
    <rect x="8" y="6" width="48" height="74" rx="22" fill="#e8e0c8" />
    <g stroke="#b9ad8c" strokeWidth="3" strokeLinecap="round">
      <path d="M8 20 L56 14" /><path d="M8 40 L56 46" /><path d="M8 54 L56 50" /><path d="M8 66 L56 70" />
    </g>
    <rect x="12" y="24" width="40" height="12" rx="4" fill="#2a2333" />
    <circle cx="24" cy="30" r="3.5" fill="#9cff57" />
    <circle cx="40" cy="30" r="3.5" fill="#9cff57" />
  </svg>
);

export const Ghost = () => (
  <svg width="44" height="54" viewBox="-22 -28 44 54">
    <path d="M-18 24 V-6 A 18 18 0 0 1 18 -6 V24 L12 18 L6 24 L0 18 L-6 24 L-12 18 Z" fill="#f2eefa" opacity=".9" />
    <ellipse cx="-6" cy="-6" rx="3" ry="4.5" fill="#1f1a29" />
    <ellipse cx="6" cy="-6" rx="3" ry="4.5" fill="#1f1a29" />
    <ellipse cx="0" cy="6" rx="3.5" ry="4" fill="#1f1a29" />
  </svg>
);

// ── 20-minute moments ──────────────────────────────────────

export const Moon = () => (
  <svg width="140" height="140" viewBox="-70 -70 140 140">
    <circle r="70" fill="#ffd27a" opacity=".22" />
    <circle r="52" fill="#f7e2a8" />
    <circle cx="-18" cy="-14" r="8" fill="#e9cf8c" />
    <circle cx="14" cy="16" r="11" fill="#e9cf8c" />
    <circle cx="20" cy="-18" r="5" fill="#e9cf8c" />
  </svg>
);

export const WitchSilhouette = () => (
  <svg width="120" height="80" viewBox="-70 -50 110 80">
    <g fill="#120c18">
      <path d="M-40 18 L40 10" stroke="#5a3a1a" strokeWidth="3" />
      <path d="M-40 18 L-62 8 L-60 16 L-66 18 L-60 21 L-62 28 Z" fill="#8a6a2a" />
      <path d="M-6 14 L10 -14 L22 12 Z" />
      <circle cx="10" cy="-18" r="6" />
      <path d="M-4 -20 L26 -22 L10 -24 Z" /><path d="M6 -24 L14 -46 L16 -23 Z" />
      <path d="M2 10 L-14 4 L-10 12 Z" />
    </g>
  </svg>
);

const Reindeer = ({ dx }) => (
  <g transform={`translate(${dx},0)`}>
    <ellipse cx="0" cy="-6" rx="12" ry="5.5" />
    <path d="M8 -9 L14 -18 L18 -16 L12 -6 Z" />
    <ellipse cx="18" cy="-19" rx="5" ry="3" />
    <g strokeWidth="1.4" fill="none">
      <path d="M15 -21 L13 -28 L10 -30 M13 -28 L15 -31 M18 -22 L19 -29 L17 -32 M19 -29 L22 -31" />
    </g>
    <g strokeWidth="2" fill="none" strokeLinecap="round">
      <path d="M-9 -3 L-15 4 M-6 -2 L-9 6 M6 -2 L12 4 M9 -3 L15 2 M-12 -7 L-15 -10" />
    </g>
  </g>
);

export const SleighSilhouette = () => (
  <svg width="170" height="56" viewBox="-100 -40 175 58">
    <g fill="#0a120d" stroke="#0a120d">
      <path d="M-95 0 Q -96 12 -84 14 H-30 Q -22 14 -20 6" strokeWidth="3" fill="none" />
      <path d="M-88 10 L-86 -14 L-50 -14 Q -40 -14 -36 -4 L-30 10 Z" stroke="none" />
      <circle cx="-80" cy="-18" r="7" stroke="none" />
      <path d="M-70 -14 Q -66 -30 -54 -14 Z" stroke="none" />
      <circle cx="-62" cy="-24" r="6" stroke="none" />
      <path d="M-66 -28 L-54 -38 L-58 -26 Z" stroke="none" />
      <path d="M-40 -10 L 52 -8" strokeWidth="1" fill="none" />
      <Reindeer dx={14} />
      <Reindeer dx={50} />
    </g>
  </svg>
);

export const Turkey = () => (
  <svg width="96" height="96" viewBox="-60 -78 120 122">
    {[[-60, '#9a3412', 40], [-30, '#d9822b', 42], [0, '#e6b325', 44], [30, '#d9822b', 42], [60, '#9a3412', 40]].map(([a, c, ry]) => (
      <ellipse key={a} cx="0" cy="-30" rx="12" ry={ry} fill={c} transform={`rotate(${a})`} />
    ))}
    <ellipse cx="0" cy="4" rx="28" ry="30" fill="#6b3a1f" />
    <ellipse cx="0" cy="-26" rx="13" ry="14" fill="#8a5a3a" />
    <circle cx="-5" cy="-29" r="2.2" fill="#18120e" /><circle cx="5" cy="-29" r="2.2" fill="#18120e" />
    <path d="M-4 -23 L4 -23 L0 -15 Z" fill="#f2b25c" />
    <path d="M2 -20 Q 6 -10 2 -6 Q -2 -12 2 -20" fill="#d4373c" />
    <path d="M-10 32 L-12 42 M10 32 L12 42" stroke="#f2b25c" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Bunny = () => (
  <svg width="90" height="104" viewBox="-40 -90 90 104">
    <ellipse cx="0" cy="-16" rx="26" ry="22" fill="#ece6ff" />
    <circle cx="-26" cy="-14" r="8" fill="#fff" />
    <ellipse cx="22" cy="-36" rx="15" ry="14" fill="#ece6ff" />
    <g transform="rotate(-10 18 -66)"><ellipse cx="18" cy="-66" rx="5" ry="20" fill="#ece6ff" /><ellipse cx="18" cy="-66" rx="2.5" ry="14" fill="#f7a8d0" /></g>
    <g transform="rotate(14 30 -64)"><ellipse cx="30" cy="-64" rx="5" ry="20" fill="#ece6ff" /><ellipse cx="30" cy="-64" rx="2.5" ry="14" fill="#f7a8d0" /></g>
    <circle cx="28" cy="-38" r="2.2" fill="#26233a" /><circle cx="36" cy="-33" r="2" fill="#f7a8d0" />
    <ellipse cx="12" cy="4" rx="10" ry="5" fill="#fff" />
  </svg>
);

export const CupidArrow = () => (
  <svg width="180" height="80" viewBox="-95 -40 180 80">
    <g transform="scale(2.2)"><Heart color="#ff4f8b" /></g>
    <g transform="translate(-9,-7) scale(.6)"><Heart color="#ffc2d6" /></g>
    <g transform="rotate(-12)">
      <path d="M-80 0 H70" stroke="#f2c94c" strokeWidth="3" />
      <path d="M78 0 L64 -8 L64 8 Z" fill="#f2c94c" />
      <path d="M-80 0 l-10 -8 h10 l6 8 l-6 8 h-10 Z" fill="#fdf0f5" />
    </g>
  </svg>
);

export const Rainbow = () => (
  <svg width="100%" height="100%" viewBox="0 0 400 210" preserveAspectRatio="xMidYMax meet">
    {['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].map((c, i) => (
      <path key={c} d={`M${10 + i * 12} 210 A ${190 - i * 12} ${190 - i * 12} 0 0 1 ${390 - i * 12} 210`} stroke={c} strokeWidth="12" fill="none" opacity=".7" />
    ))}
    <g transform="translate(355,200)">
      <g transform="translate(-14,-40)"><Coin /></g><g transform="translate(4,-44)"><Coin /></g>
      <g transform="translate(18,-38)"><Coin /></g><g transform="translate(-4,-34)"><Coin /></g>
      <ellipse cx="0" cy="-30" rx="32" ry="7" fill="#2a2a2a" />
      <path d="M-32 -30 Q -36 6 -20 16 H20 Q 36 6 32 -30 Z" fill="#1a1a1a" />
    </g>
  </svg>
);
