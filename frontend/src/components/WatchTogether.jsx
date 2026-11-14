import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './WatchTogether.module.css';

// Watch together — the synced YouTube window everyone in a voice channel
// sees (server: src/socket/watchParty.js). The server holds the shared
// state; this component nudges its own player to match it about once a
// second. YouTube's own controls are hidden so every play/pause/seek goes
// through the shared state (otherwise people would fight their own
// players). The player is driven through YouTube's documented iframe
// postMessage protocol, so no extra YouTube script has to be loaded.

const YT_ORIGIN = 'https://www.youtube.com';
const DRIFT_LIMIT_S = 1.5;
const SIZES = { small: 360, normal: 560, large: 820 };
const SIZE_ORDER = ['small', 'normal', 'large'];

const fmt = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export default function WatchTogether({ channelId, party, serverOffset, socket }) {
  const iframeRef = useRef(null);
  const info = useRef({ currentTime: 0, playerState: undefined, duration: 0 });
  const [joined, setJoined] = useState(false); // needs a click first, so the browser allows sound
  const [, setTick] = useState(0);
  const [volume, setVolume] = useState(70);
  const [size, setSize] = useState('normal');
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState({ x: 24, y: 80 });

  // Where the shared video should be right now.
  const expectedAt = useCallback(() => {
    const now = Date.now() + serverOffset;
    return party.playing ? party.position + (now - party.updatedAt) / 1000 : party.position;
  }, [party, serverOffset]);

  const send = useCallback((func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: channelId, channel: 'widget' }), YT_ORIGIN);
  }, [channelId]);

  // Listen to the player's own reports (time, state, duration).
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== YT_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      let data;
      try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
      if (data?.event === 'infoDelivery' && data.info) {
        if (typeof data.info.currentTime === 'number') info.current.currentTime = data.info.currentTime;
        if (typeof data.info.playerState === 'number') info.current.playerState = data.info.playerState;
        if (typeof data.info.duration === 'number') info.current.duration = data.info.duration;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Ask the player to start reporting (repeated until it's listening), and
  // keep it in step with the shared state.
  // A new video (or joining) means a new player that hasn't reported yet.
  useEffect(() => {
    info.current = { currentTime: 0, playerState: undefined, duration: 0 };
  }, [joined, party.videoId]);

  useEffect(() => {
    if (!joined) return undefined;
    const id = setInterval(() => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame) return;
      if (info.current.playerState === undefined) {
        frame.postMessage(JSON.stringify({ event: 'listening', id: channelId, channel: 'widget' }), YT_ORIGIN);
        return;
      }
      const { playerState, currentTime, duration } = info.current;
      let expected = expectedAt();
      if (duration) expected = Math.min(expected, duration);
      // 1 = playing, 2 = paused, 3 = buffering, 0 = ended, 5 = cued
      if (party.playing && playerState !== 1 && playerState !== 3 && playerState !== 0) send('playVideo');
      if (!party.playing && playerState === 1) send('pauseVideo');
      if (Math.abs(currentTime - expected) > DRIFT_LIMIT_S) send('seekTo', [expected, true]);
      setTick((t) => t + 1); // refresh the time display
    }, 1000);
    return () => clearInterval(id);
  }, [joined, party, expectedAt, send, channelId]);

  useEffect(() => { if (joined) send('setVolume', [volume]); }, [volume, joined, send]);

  const control = (action, position) => socket?.emit('watch:control', { channelId, action, position });
  const togglePlay = () => control(party.playing ? 'pause' : 'play', expectedAt());
  const skip = (delta) => control('seek', Math.max(0, expectedAt() + delta));
  const seekTo = (e) => {
    const { duration } = info.current;
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    control('seek', ((e.clientX - rect.left) / rect.width) * duration);
  };
  const end = () => {
    if (confirm('End the watch party for everyone in this voice channel?')) socket?.emit('watch:stop', { channelId });
  };

  const startDrag = (e) => {
    if (e.target.closest('button')) return;
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev) => setPos({
      x: Math.min(Math.max(ev.clientX - startX, 0), window.innerWidth - 120),
      y: Math.min(Math.max(ev.clientY - startY, 0), window.innerHeight - 60),
    });
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const expected = expectedAt();
  const duration = info.current.duration;
  const width = SIZES[size];
  // Built once per video (and on joining) — the start time is baked in, so
  // rebuilding it every render would reload the player every second.
  const src = useMemo(
    () => `https://www.youtube.com/embed/${party.videoId}?enablejsapi=1&controls=0&disablekb=1&playsinline=1&rel=0&modestbranding=1&autoplay=1&start=${Math.floor(expectedAt())}&origin=${encodeURIComponent(window.location.origin)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party.videoId, joined]
  );

  if (minimized) {
    return (
      <button className={styles.pill} style={{ left: pos.x, top: pos.y }} onClick={() => setMinimized(false)}>
        📺 Watching together {party.playing ? '▶' : '⏸'} {fmt(expected)}
      </button>
    );
  }

  return (
    <div className={styles.window} style={{ left: pos.x, top: pos.y, width }} data-no-swipe>
      <div className={styles.titleBar} onMouseDown={startDrag}>
        <span className={styles.title}>📺 Watch together · started by {party.startedByName}</span>
        <div className={styles.titleActions}>
          <button onClick={() => setSize(SIZE_ORDER[(SIZE_ORDER.indexOf(size) + 1) % SIZE_ORDER.length])} title="Resize">⤢</button>
          <button onClick={() => setMinimized(true)} title="Minimize">–</button>
          <button onClick={end} title="End for everyone">✕</button>
        </div>
      </div>

      <div className={styles.player}>
        {joined ? (
          <iframe
            key={party.videoId}
            ref={iframeRef}
            src={src}
            title="Watch together"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button className={styles.joinOverlay} onClick={() => setJoined(true)}
            style={{ backgroundImage: `url(https://img.youtube.com/vi/${party.videoId}/hqdefault.jpg)` }}>
            <span>▶ Join the watch party</span>
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <button onClick={togglePlay} title={party.playing ? 'Pause for everyone' : 'Play for everyone'}>{party.playing ? '⏸' : '▶'}</button>
        <button onClick={() => skip(-10)} title="Back 10 seconds">⏪</button>
        <button onClick={() => skip(10)} title="Forward 10 seconds">⏩</button>
        <div className={styles.progress} onClick={seekTo} title="Jump to here (for everyone)">
          <div className={styles.progressFill} style={{ width: duration ? `${Math.min(100, (expected / duration) * 100)}%` : 0 }} />
        </div>
        <span className={styles.time}>{fmt(expected)}{duration ? ` / ${fmt(duration)}` : ''}</span>
        <input
          type="range" min="0" max="100" value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className={styles.volume}
          title="Your volume (only you)"
        />
      </div>
      {party.lastActionBy && <div className={styles.lastAction}>Last control: {party.lastActionBy}</div>}
    </div>
  );
}

// The "📺 Watch together" button + link box in the voice panel.
export function WatchStarter({ channelId, socket, active, error }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  const start = (e) => {
    e.preventDefault();
    socket?.emit('watch:start', { channelId, url });
    setUrl('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button className={styles.starterBtn} onClick={() => setOpen(true)}>
        📺 {active ? 'Change video' : 'Watch together'}
      </button>
    );
  }
  return (
    <form className={styles.starterForm} onSubmit={start}>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube link"
        autoFocus
      />
      <button type="submit" disabled={!url.trim()}>Start</button>
      <button type="button" onClick={() => setOpen(false)}>✕</button>
      {error && <div className={styles.starterError}>{error}</div>}
    </form>
  );
}
