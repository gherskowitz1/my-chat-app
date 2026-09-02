import React, { useEffect, useRef } from 'react';
import { useConnectionState, useRoomContext } from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import styles from './VoiceReliability.module.css';

// Renders nothing visible most of the time — handles three voice-call
// reliability concerns that have no UI of their own: keeping the screen
// awake, recovering a microphone track that died while backgrounded, and
// surfacing LiveKit's own (silent) reconnection attempts as a banner.
export default function VoiceReliability() {
  const connectionState = useConnectionState();
  const room = useRoomContext();
  const wakeLockRef = useRef(null);

  // Screen wake lock — a video call shouldn't let the display dim/lock.
  useEffect(() => {
    let cancelled = false;
    const requestLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
        } else {
          wakeLockRef.current = lock;
        }
      } catch {
        // Permission denied or unsupported in this context — nothing to do.
      }
    };
    requestLock();

    // The OS/browser releases the lock automatically when the tab is
    // backgrounded; re-request it once the user comes back.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) requestLock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // Mic auto-recovery — some browsers end the capture track outright when
  // the OS suspends/backgrounds the app (e.g. after screen lock). LiveKit
  // still thinks the mic is "enabled" in that case, it just has a dead
  // track underneath — republish it once we're back.
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = pub?.track?.mediaStreamTrack;
      if (room.localParticipant.isMicrophoneEnabled && mediaTrack?.readyState === 'ended') {
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          // Best-effort — if this fails the user still has the normal
          // mute/unmute button to force a retry.
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [room]);

  const reconnecting = connectionState === ConnectionState.Reconnecting
    || connectionState === ConnectionState.SignalReconnecting;

  if (!reconnecting) return null;

  return (
    <div className={styles.banner}>
      <span className={styles.spinner} />
      Reconnecting…
    </div>
  );
}
