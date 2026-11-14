import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import Avatar from './Avatar';
import styles from './WrappedModal.module.css';

// Crows Nest Wrapped — the yearly recap, as full-screen story slides (tap
// the right side / → for next, left side / ← for back, Esc to close).
// Data comes from GET /wrapped (wrappedController.js); slides without data
// for this person (no DMs, no voice time yet...) are simply skipped.

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

// Shown Dec 1 – Jan 31: December recaps the current year, January the one
// that just ended.
export function wrappedYear(now = new Date()) {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}
export function isWrappedSeason(now = new Date()) {
  return now.getMonth() === 11 || now.getMonth() === 0;
}

function hourPersona(hour) {
  if (hour === null) return null;
  const label = new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
  if (hour < 5 || hour >= 22) return { emoji: '🦉', title: 'Night Owl', line: `Your chattiest hour was ${label}. Go to bed.` };
  if (hour < 11) return { emoji: '🐦', title: 'Early Bird', line: `Your chattiest hour was ${label}. Coffee first, then the Crows Nest.` };
  if (hour < 17) return { emoji: '☀️', title: 'Daytime Regular', line: `Your chattiest hour was ${label}. Totally working, definitely.` };
  return { emoji: '🌙', title: 'Evening Crew', line: `Your chattiest hour was ${label}. Prime time.` };
}

export default function WrappedModal({ year, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.get(`/wrapped?year=${year}`).then(setData).catch((err) => setError(err.message || 'Couldn’t load your Wrapped.'));
  }, [year]);

  const slides = useMemo(() => (data ? buildSlides(data) : []), [data]);
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, slides.length - 1)), [slides.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  const slide = slides[index];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.story} ${slide ? styles[slide.theme] : styles.t0}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!slide) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (e.clientX - rect.left < rect.width * 0.3) prev(); else next();
        }}
        data-no-swipe
      >
        <div className={styles.progress}>
          {slides.map((s, i) => (
            <span key={s.key} className={i <= index ? styles.progressDone : ''} />
          ))}
        </div>
        <button className={styles.close} onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close">✕</button>

        {!data && !error && <div className={styles.center}><div className={styles.loading}>Crunching your year…</div></div>}
        {error && <div className={styles.center}><p>{error}</p></div>}
        {slide && <div key={slide.key} className={styles.slide}>{slide.render()}</div>}

        {slide && index < slides.length - 1 && <div className={styles.tapHint}>Tap to continue</div>}
      </div>
    </div>
  );
}

function buildSlides(d) {
  const slides = [];
  const add = (key, theme, render) => slides.push({ key, theme, render });
  const persona = hourPersona(d.busiestHour);

  add('intro', 't0', () => (
    <div className={styles.center}>
      <div className={styles.kicker}>The Crows Nest</div>
      <h1 className={styles.huge}>{d.year}<br />Wrapped</h1>
      <p className={styles.lead}>{d.username}, let’s look back at your year.</p>
    </div>
  ));

  if (d.messagesSent > 0) {
    add('messages', 't1', () => (
      <div className={styles.center}>
        <div className={styles.kicker}>You sent</div>
        <div className={styles.bigNumber}><CountUp value={d.messagesSent} /></div>
        <p className={styles.lead}>messages in the channels{d.dmsSent > 0 ? <>, plus <strong>{d.dmsSent.toLocaleString()}</strong> DMs</> : ''}.</p>
        {d.rank && d.memberCount > 1 && (
          <p className={styles.badge}>#{d.rank} most active of {d.memberCount}{d.rank === 1 ? ' 👑' : ''}</p>
        )}
      </div>
    ));
  }

  if (d.topChannels.length > 0) {
    add('channels', 't2', () => (
      <div className={styles.center}>
        <div className={styles.kicker}>Your hangout spots</div>
        <ol className={styles.rankList}>
          {d.topChannels.map((c, i) => (
            <li key={c.name} style={{ animationDelay: `${0.15 + i * 0.2}s` }}>
              <span className={styles.rankNum}>{i + 1}</span>
              <span className={styles.rankName}>#{c.name}</span>
              <span className={styles.rankCount}>{c.count.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    ));
  }

  if (d.topDmPartner || d.replyBuddy) {
    add('people', 't3', () => (
      <div className={styles.center}>
        <div className={styles.kicker}>Your people</div>
        {d.topDmPartner && (
          <PersonLine person={d.topDmPartner} text={<>You DMed <strong>{d.topDmPartner.username}</strong> the most — {d.topDmPartner.count.toLocaleString()} messages between you.</>} />
        )}
        {d.replyBuddy && (
          <PersonLine person={d.replyBuddy} text={<>You replied to <strong>{d.replyBuddy.username}</strong> {d.replyBuddy.count.toLocaleString()} times. They clearly say things worth answering.</>} />
        )}
      </div>
    ));
  }

  if (d.topEmoji.length > 0 || d.reactionsGiven > 0 || d.reactionsReceived > 0) {
    add('emoji', 't4', () => (
      <div className={styles.center}>
        <div className={styles.kicker}>Your emoji</div>
        {d.topEmoji[0] && (
          <>
            <div className={styles.giantEmoji}>{d.topEmoji[0].emoji}</div>
            <p className={styles.lead}>typed <strong>{d.topEmoji[0].count.toLocaleString()}</strong> times{d.topEmoji.length > 1 ? <>, followed by {d.topEmoji.slice(1).map((e) => e.emoji).join(' ')}</> : ''}</p>
          </>
        )}
        <div className={styles.statRow}>
          {d.reactionsGiven > 0 && <Stat value={d.reactionsGiven} label={`reactions given${d.topReactionGiven ? ` (mostly ${d.topReactionGiven.emoji})` : ''}`} />}
          {d.reactionsReceived > 0 && <Stat value={d.reactionsReceived} label={`reactions received${d.topReactionReceived ? ` (mostly ${d.topReactionReceived.emoji})` : ''}`} />}
        </div>
      </div>
    ));
  }

  if (persona) {
    add('time', 't5', () => (
      <div className={styles.center}>
        <div className={styles.giantEmoji}>{persona.emoji}</div>
        <h2 className={styles.title}>{persona.title}</h2>
        <p className={styles.lead}>{persona.line}</p>
        {d.busiestWeekday !== null && <p className={styles.lead}><strong>{WEEKDAYS[d.busiestWeekday]}</strong> were your day.</p>}
        {d.busiestDay && (
          <p className={styles.badge}>
            Biggest day: {new Date(`${d.busiestDay.day}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} — {d.busiestDay.count} messages
          </p>
        )}
      </div>
    ));
  }

  if (d.voiceHours > 0 || d.topGames.length > 0) {
    const since = d.trackedSince && new Date(d.trackedSince).getFullYear() === d.year
      ? new Date(d.trackedSince).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
      : null;
    add('voice', 't6', () => (
      <div className={styles.center}>
        {d.voiceHours > 0 && (
          <>
            <div className={styles.kicker}>You spent</div>
            <div className={styles.bigNumber}><CountUp value={d.voiceHours} decimals={Number.isInteger(d.voiceHours) ? 0 : 1} /></div>
            <p className={styles.lead}>hours in voice{d.topVoiceChannel ? <>, mostly in <strong>{d.topVoiceChannel}</strong></> : ''}.</p>
          </>
        )}
        {d.topGames.length > 0 && (
          <>
            <div className={styles.kicker} style={{ marginTop: 20 }}>Most played</div>
            <ol className={styles.rankList}>
              {d.topGames.map((g, i) => (
                <li key={g.game} style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
                  <span className={styles.rankNum}>{i + 1}</span>
                  <span className={styles.rankName}>{g.game}</span>
                  <span className={styles.rankCount}>{g.hours} hrs</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {since && <p className={styles.footnote}>Voice and game time are counted from {since}, when the Crows Nest started keeping track.</p>}
      </div>
    ));
  }

  if (d.serverMessages > 0) {
    add('community', 't7', () => (
      <div className={styles.center}>
        <div className={styles.kicker}>Together, the Crows Nest sent</div>
        <div className={styles.bigNumber}><CountUp value={d.serverMessages} /></div>
        <p className={styles.lead}>messages this year. The loudest crows:</p>
        <ol className={styles.rankList}>
          {d.topMembers.map((m, i) => (
            <li key={m.username} style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
              <span className={styles.rankNum}>{i + 1}</span>
              <Avatar url={m.avatar_url} color={m.avatar_color} username={m.username} className={styles.rankAvatar} />
              <span className={styles.rankName}>{m.username}</span>
              <span className={styles.rankCount}>{m.count.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      </div>
    ));
  }

  add('outro', 't8', () => (
    <div className={styles.center}>
      <div className={styles.kicker}>{d.username}’s {d.year}</div>
      <div className={styles.summaryGrid}>
        <Stat value={d.messagesSent} label="messages" />
        <Stat value={d.dmsSent} label="DMs" />
        <Stat value={d.reactionsGiven} label="reactions" />
        {d.voiceHours > 0 && <Stat value={d.voiceHours} label="hours in voice" />}
        {d.pollVotes > 0 && <Stat value={d.pollVotes} label="poll votes" />}
        {d.eventsAttended > 0 && <Stat value={d.eventsAttended} label="game nights" />}
      </div>
      {persona && <p className={styles.lead}>{persona.emoji} {persona.title}{d.topEmoji[0] ? ` · ${d.topEmoji[0].emoji}` : ''}{d.topChannels[0] ? ` · #${d.topChannels[0].name}` : ''}</p>}
      <p className={styles.lead}>Thanks for being part of the Crows Nest. Here’s to {d.year + 1}. 🥂</p>
    </div>
  ));

  return slides;
}

function PersonLine({ person, text }) {
  return (
    <div className={styles.person}>
      <Avatar url={person.avatar_url} color={person.avatar_color} username={person.username} className={styles.personAvatar} />
      <p className={styles.lead}>{text}</p>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{Number(value).toLocaleString()}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// Ticks a number up from 0 when its slide appears.
function CountUp({ value, decimals = 0, ms = 1200 }) {
  const [shown, setShown] = useState(0);
  const frame = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, ms]);
  return <>{shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>;
}
