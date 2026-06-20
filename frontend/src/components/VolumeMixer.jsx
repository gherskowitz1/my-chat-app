import React, { useState } from 'react';
import { useRemoteParticipants } from '@livekit/components-react';
import styles from './VolumeMixer.module.css';

export default function VolumeMixer() {
  const participants = useRemoteParticipants();
  const [volumes, setVolumes] = useState({}); // identity -> 0-100

  if (participants.length === 0) return null;

  const getVolume = (identity) => volumes[identity] ?? 100;

  const handleVolume = (participant, value) => {
    const vol = Number(value);
    setVolumes(v => ({ ...v, [participant.identity]: vol }));
    // LiveKit participant volume: 0.0 - 1.0
    participant.setVolume(vol / 100);
  };

  const toggleMute = (participant) => {
    const current = getVolume(participant.identity);
    if (current === 0) {
      // Unmute — restore to 100
      handleVolume(participant, 100);
    } else {
      // Mute locally
      handleVolume(participant, 0);
    }
  };

  return (
    <div className={styles.mixer}>
      <div className={styles.header}>
        <SpeakerIcon />
        <span>Volume Mixer</span>
      </div>
      {participants.map(p => {
        const vol = getVolume(p.identity);
        const isMuted = vol === 0;
        return (
          <div key={p.identity} className={styles.row}>
            <button
              className={`${styles.muteBtn} ${isMuted ? styles.isMuted : ''}`}
              onClick={() => toggleMute(p)}
              title={isMuted ? 'Unmute' : 'Mute locally'}
            >
              {isMuted ? <MutedIcon /> : <SpeakerIcon />}
            </button>
            <span className={styles.name} title={p.name || p.identity}>
              {p.name || p.identity.slice(0, 12)}
            </span>
            <div className={styles.sliderWrap}>
              <input
                type="range"
                min="0"
                max="150"
                value={vol}
                onChange={e => handleVolume(p, e.target.value)}
                className={styles.slider}
                style={{ '--pct': `${Math.min(vol, 100)}%` }}
              />
              <span className={styles.pct}>{vol}%</span>
            </div>
          </div>
        );
      })}
      <p className={styles.hint}>Volume changes only affect what you hear.</p>
    </div>
  );
}

const SpeakerIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

const MutedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.99 2L21 18.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>
);
