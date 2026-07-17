import React, { useEffect, useState, useRef } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useKeyboardShortcuts, loadShortcuts, formatKey } from '../hooks/useKeyboardShortcuts';
import styles from './VoiceControls.module.css';

/**
 * Sits inside <LiveKitRoom> so it has access to LiveKit hooks.
 * Handles keyboard shortcuts + shows a shortcut HUD.
 */
export default function VoiceControls({ onLeave, forceMuted }) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const shortcuts = loadShortcuts();
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [toast, setToast] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const toastTimerRef = useRef(null);
  const preDeafenMuteRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Session timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Sync muted state from LiveKit
  useEffect(() => {
    if (!localParticipant) return;
    const update = () => {
      const micPub = localParticipant.getTrackPublication(Track.Source.Microphone);
      setMuted(micPub?.isMuted ?? false);
    };
    update();
    localParticipant.on('trackMuted', update);
    localParticipant.on('trackUnmuted', update);
    return () => {
      localParticipant.off('trackMuted', update);
      localParticipant.off('trackUnmuted', update);
    };
  }, [localParticipant]);

  // AFK channel — force mic off and keep it locked there
  useEffect(() => {
    if (!forceMuted || !localParticipant) return;
    localParticipant.setMicrophoneEnabled(false);
    setMuted(true);
  }, [forceMuted, localParticipant]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1500);
  };

  const toggleMute = () => {
    if (!localParticipant || forceMuted) return;
    const newMuted = !muted;
    localParticipant.setMicrophoneEnabled(!newMuted);
    setMuted(newMuted);
    showToast(newMuted ? '🎙️ Muted' : '🎙️ Unmuted');
  };

  const toggleDeafen = () => {
    if (!room) return;
    const newDeafened = !deafened;
    if (newDeafened) {
      // Save current mute state, then mute mic too
      preDeafenMuteRef.current = muted;
      localParticipant?.setMicrophoneEnabled(false);
      setMuted(true);
      // Mute all remote audio
      room.remoteParticipants.forEach(p => p.setVolume(0));
    } else {
      // Restore mic state
      localParticipant?.setMicrophoneEnabled(!preDeafenMuteRef.current);
      setMuted(preDeafenMuteRef.current);
      // Restore remote audio
      room.remoteParticipants.forEach(p => p.setVolume(1));
    }
    setDeafened(newDeafened);
    showToast(newDeafened ? '🔇 Deafened' : '🔊 Undeafened');
  };

  // Push to talk — unmute while held, re-mute on release
  const handlePushToTalk = (pressed) => {
    if (!localParticipant || forceMuted) return;
    if (pressed) {
      localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      showToast('🎙️ Transmitting…');
    } else {
      localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
      showToast('🎙️ Muted');
    }
  };

  const handleLeave = () => {
    room?.disconnect();
    onLeave?.();
  };

  useKeyboardShortcuts({
    toggleMute,
    toggleDeafen,
    pushToTalk: handlePushToTalk,
    leaveVoice: handleLeave,
  }, true);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };

  return (
    <>
      {/* Toast notification */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Compact shortcut bar */}
      <div className={styles.bar}>
        <span className={styles.timer} title="Time in voice channel">
          🕐 {formatTime(elapsed)}
        </span>
        <button
          className={`${styles.ctrl} ${muted ? styles.off : styles.on}`}
          onClick={toggleMute}
          disabled={forceMuted}
          title={forceMuted ? 'Muted (AFK channel)' : `${muted ? 'Unmute' : 'Mute'} (${formatKey(shortcuts.toggleMute.key)})`}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
          <span>{muted ? 'Unmute' : 'Mute'}</span>
          <kbd>{formatKey(shortcuts.toggleMute.key)}</kbd>
        </button>

        <button
          className={`${styles.ctrl} ${deafened ? styles.off : styles.on}`}
          onClick={toggleDeafen}
          title={`${deafened ? 'Undeafen' : 'Deafen'} (${formatKey(shortcuts.toggleDeafen.key)})`}
        >
          {deafened ? <DeafenedIcon /> : <HeadphonesIcon />}
          <span>{deafened ? 'Undeafen' : 'Deafen'}</span>
          <kbd>{formatKey(shortcuts.toggleDeafen.key)}</kbd>
        </button>

        <button
          className={`${styles.ctrl} ${styles.ptt}`}
          disabled={forceMuted}
          title={forceMuted ? 'Muted (AFK channel)' : `Push to Talk — hold ${formatKey(shortcuts.pushToTalk.key)}`}
        >
          <PttIcon />
          <span>Push to Talk</span>
          <kbd>{formatKey(shortcuts.pushToTalk.key)}</kbd>
        </button>

        <button
          className={`${styles.ctrl} ${styles.leave}`}
          onClick={handleLeave}
          title={`Leave (${formatKey(shortcuts.leaveVoice.key)})`}
        >
          <LeaveIcon />
          <span>Leave</span>
          <kbd>{formatKey(shortcuts.leaveVoice.key)}</kbd>
        </button>
      </div>
    </>
  );
}

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
    <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
  </svg>
);
const MicOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);
const HeadphonesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h1v-8H4v-1a8 8 0 0 1 16 0v1h-2v8h1c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>
  </svg>
);
const DeafenedIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 3l18 18-1.5 1.5-3.27-3.27A8.97 8.97 0 0 1 12 21a9 9 0 0 1-9-9v-1H1v-1a9 9 0 0 1 .76-3.67L1.5 6 3 4.5 3 3zm12.72 12.72L5.28 5.28A7.96 7.96 0 0 0 4 11v1h2v8h1c.55 0 1-.45 1-1v-7h.28l7.44 7.44zM12 3a9 9 0 0 1 9 9v1h-2v-1a7 7 0 0 0-7-7 6.97 6.97 0 0 0-4.39 1.54L6.08 5.02A8.97 8.97 0 0 1 12 3z"/>
  </svg>
);
const PttIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
  </svg>
);
const LeaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
);
