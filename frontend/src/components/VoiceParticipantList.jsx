import React from 'react';
import { useParticipants, useSpeakingParticipants } from '@livekit/components-react';
import { Track } from 'livekit-client';
import styles from './VoiceParticipantList.module.css';

// Shown to everyone in the call (not just admins, unlike VoiceAdminControls'
// mute/kick panel) — a live roster driven by LiveKit's own real-time audio
// level detection, not a polled REST snapshot, so the highlight tracks
// actual speech with no perceptible lag.
export default function VoiceParticipantList() {
  const participants = useParticipants();
  const speaking = useSpeakingParticipants();
  const speakingIds = new Set(speaking.map((p) => p.identity));

  if (participants.length === 0) return null;

  return (
    <div className={styles.list}>
      {participants.map((p) => {
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const muted = micPub?.isMuted ?? true;
        const isSpeaking = speakingIds.has(p.identity) && !muted;
        return (
          <div key={p.identity} className={`${styles.participant} ${isSpeaking ? styles.speaking : ''}`}>
            <span className={styles.dot} />
            <span className={styles.name}>{p.name || p.identity.slice(0, 12)}</span>
            {muted && <MutedIcon />}
          </div>
        );
      })}
    </div>
  );
}

const MutedIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--text-muted)" style={{ flexShrink: 0 }}>
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);
