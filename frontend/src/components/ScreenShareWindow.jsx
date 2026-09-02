import React, { useEffect, useRef, useState } from 'react';
import { useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import styles from './ScreenShareWindow.module.css';

const SIZE_PRESETS = { small: { width: 360, height: 220 }, normal: { width: 560, height: 340 }, large: { width: 800, height: 480 } };
const SIZE_ORDER = ['small', 'normal', 'large'];
const QUALITY_KEY = 'crowsnest_screenshare_quality';

// A screen share renders as its own floating, draggable window instead of a
// grid tile — minimize/maximize/full-screen, plus a detail-vs-motion quality
// toggle for whoever's sharing. Handles at most one active share at a time,
// which is the only case this app's voice channels actually produce.
export default function ScreenShareWindow() {
  const tracks = useTracks([Track.Source.ScreenShare]);
  const activeTrack = tracks[0];
  const [windowState, setWindowState] = useState('normal'); // 'normal' | 'minimized' | 'maximized'
  const [sizePreset, setSizePreset] = useState('normal');
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const [quality, setQuality] = useState(() => localStorage.getItem(QUALITY_KEY) || 'detail');
  const videoRef = useRef(null);
  const prevTrackSidRef = useRef(null);

  const trackSid = activeTrack?.publication?.trackSid;
  const isLocalShare = !!activeTrack?.participant?.isLocal;

  // Pop back to a visible default whenever a *new* share starts — otherwise
  // a share left minimized from last time would silently never resurface.
  useEffect(() => {
    if (trackSid && trackSid !== prevTrackSidRef.current) {
      setWindowState('normal');
      setPosition({ x: 24, y: 24 });
    }
    prevTrackSidRef.current = trackSid || null;
  }, [trackSid]);

  // contentHint can be changed on a live capture at any time without
  // restarting it — this is what actually makes "switchable mid-call" true
  // for quality mode, since we don't control the initial getDisplayMedia
  // call (that still goes through LiveKit's own Share Screen button).
  const applyQuality = (mode) => {
    setQuality(mode);
    localStorage.setItem(QUALITY_KEY, mode);
    const mediaTrack = activeTrack?.publication?.track?.mediaStreamTrack;
    if (mediaTrack) mediaTrack.contentHint = mode;
  };

  useEffect(() => {
    if (isLocalShare) applyQuality(quality);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocalShare, trackSid]);

  const startDrag = (e) => {
    if (windowState !== 'normal') return;
    const startX = e.clientX - position.x;
    const startY = e.clientY - position.y;
    const onMove = (ev) => {
      const size = SIZE_PRESETS[sizePreset];
      const maxX = Math.max(window.innerWidth - size.width - 8, 8);
      const maxY = Math.max(window.innerHeight - size.height - 8, 8);
      setPosition({
        x: Math.min(Math.max(ev.clientX - startX, 8), maxX),
        y: Math.min(Math.max(ev.clientY - startY, 8), maxY),
      });
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const cycleSize = () => {
    const next = SIZE_ORDER[(SIZE_ORDER.indexOf(sizePreset) + 1) % SIZE_ORDER.length];
    setSizePreset(next);
  };

  const stopSharing = () => {
    if (isLocalShare) activeTrack.participant.setScreenShareEnabled(false);
  };

  if (!activeTrack) return null;

  const sharerLabel = activeTrack.participant.isLocal ? 'You are' : `${activeTrack.participant.name || activeTrack.participant.identity} is`;

  if (windowState === 'minimized') {
    return (
      <button type="button" className={styles.pill} onClick={() => setWindowState('normal')}>
        🖥️ {sharerLabel} sharing — click to expand
      </button>
    );
  }

  const size = windowState === 'maximized' ? { width: '80vw', height: '80vh' } : SIZE_PRESETS[sizePreset];
  const style = windowState === 'maximized'
    ? { width: size.width, height: size.height, left: '10vw', top: '10vh' }
    : { width: size.width, height: size.height, left: position.x, top: position.y };

  return (
    <div className={styles.window} style={style}>
      <div className={styles.titleBar} onMouseDown={startDrag}>
        <span className={styles.title}>🖥️ {sharerLabel} sharing</span>
        <div className={styles.titleActions} onMouseDown={(e) => e.stopPropagation()}>
          {isLocalShare && (
            <>
              <select
                className={styles.qualitySelect}
                value={quality}
                onChange={(e) => applyQuality(e.target.value)}
                title="Quality mode — Detail favors sharpness, Motion favors smoothness"
              >
                <option value="detail">Detail</option>
                <option value="motion">Motion</option>
              </select>
              <button type="button" onClick={stopSharing} title="Stop sharing">⏹</button>
            </>
          )}
          {windowState === 'normal' && (
            <button type="button" onClick={cycleSize} title="Resize">⤢</button>
          )}
          <button type="button" onClick={() => videoRef.current?.requestFullscreen?.()} title="Full screen">⛶</button>
          <button
            type="button"
            onClick={() => setWindowState(windowState === 'maximized' ? 'normal' : 'maximized')}
            title={windowState === 'maximized' ? 'Restore' : 'Maximize'}
          >
            {windowState === 'maximized' ? '🗗' : '🗖'}
          </button>
          <button type="button" onClick={() => setWindowState('minimized')} title="Minimize">─</button>
        </div>
      </div>
      <VideoTrack ref={videoRef} trackRef={activeTrack} className={styles.video} />
    </div>
  );
}
