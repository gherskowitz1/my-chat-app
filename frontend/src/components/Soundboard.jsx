import React, { useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import voiceStyles from './VoiceControls.module.css';
import styles from './Soundboard.module.css';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';
const VOLUME_KEY_PREFIX = 'crowsnest_sound_volume_';

// Routing playback through a Web Audio graph (rather than relying on
// <audio>.volume, which some browsers don't reflect into captureStream())
// means the per-clip volume slider reliably affects both what you hear
// locally and what gets published for everyone else.
const AudioCtor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
const CAN_CAPTURE = typeof window !== 'undefined' && !!window.MediaStream && !!AudioCtor;

function getStoredVolume(soundId) {
  const raw = localStorage.getItem(VOLUME_KEY_PREFIX + soundId);
  const n = raw != null ? Number(raw) : 100;
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 100;
}

export default function Soundboard() {
  const room = useRoomContext();
  const { socket } = useSocket();
  const [sounds, setSounds] = useState([]);
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);
  const [volumes, setVolumes] = useState({}); // soundId -> 0-100, lazily filled from localStorage
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const publishedTrackRef = useRef(null);
  const previewAudioRef = useRef(null);

  const load = () => api.get(`/servers/${DEFAULT_SERVER}/sounds`).then(setSounds).catch(() => {});

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('soundboard:updated', load);
    return () => socket.off('soundboard:updated', load);
  }, [socket]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const volumeOf = (soundId) => volumes[soundId] ?? getStoredVolume(soundId);

  const setVolume = (soundId, value) => {
    setVolumes((v) => ({ ...v, [soundId]: value }));
    localStorage.setItem(VOLUME_KEY_PREFIX + soundId, String(value));
  };

  const cleanupPublishedTrack = async () => {
    const track = publishedTrackRef.current;
    publishedTrackRef.current = null;
    if (track) {
      try { await room?.localParticipant.unpublishTrack(track, true); } catch { /* already gone */ }
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* already closed */ }
      audioContextRef.current = null;
    }
  };

  // On unmount (leaving the voice channel mid-clip), make sure the published
  // track doesn't keep streaming into the room forever.
  useEffect(() => () => { cleanupPublishedTrack(); }, []);

  const play = async (sound) => {
    if (playingId) return;
    setPlayingId(sound.id);

    const audio = new Audio(sound.audio_data);
    audioRef.current = audio;
    const finish = () => { cleanupPublishedTrack(); setPlayingId(null); };
    audio.onended = finish;
    audio.onerror = finish;

    const vol = volumeOf(sound.id) / 100;

    try {
      if (CAN_CAPTURE && room?.localParticipant) {
        const ctx = new AudioCtor();
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = vol;
        const destination = ctx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(destination);
        gain.connect(ctx.destination); // still audible locally through the normal output
        audioContextRef.current = ctx;

        await audio.play();

        const [track] = destination.stream.getAudioTracks();
        if (track) {
          publishedTrackRef.current = track;
          await room.localParticipant.publishTrack(track, { source: Track.Source.Unknown, name: `sfx-${sound.name}` });
        }
      } else {
        audio.volume = vol;
        await audio.play();
      }
    } catch (err) {
      console.error('soundboard play error', err);
      finish();
    }
  };

  // Local-only preview — no LiveKit involved, so it works even outside a
  // voice channel and never gets published for anyone else to hear.
  const preview = (sound) => {
    if (previewingId) return;
    setPreviewingId(sound.id);
    const audio = new Audio(sound.audio_data);
    audio.volume = volumeOf(sound.id) / 100;
    previewAudioRef.current = audio;
    const finish = () => { previewAudioRef.current = null; setPreviewingId(null); };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  };

  if (sounds.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${voiceStyles.ctrl} ${voiceStyles.on}`}
        onClick={() => setOpen((o) => !o)}
        title="Soundboard"
      >
        {'🔊'}
        <span>Soundboard</span>
      </button>

      {open && (
        <div ref={popoverRef} className={styles.popover}>
          {!CAN_CAPTURE && <p className={styles.hint}>Your browser can't broadcast soundboard clips to others — they'll only play for you.</p>}
          <div className={styles.list}>
            {sounds.map((s) => (
              <div key={s.id} className={styles.soundRow}>
                <button
                  type="button"
                  className={`${styles.soundBtn} ${playingId === s.id ? styles.playing : ''}`}
                  onClick={() => play(s)}
                  disabled={!!playingId}
                  title={`Play "${s.name}" for everyone`}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  className={styles.previewBtn}
                  onClick={() => preview(s)}
                  disabled={!!previewingId}
                  title="Preview (only you hear this)"
                >
                  {previewingId === s.id ? '…' : '👂'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volumeOf(s.id)}
                  onChange={(e) => setVolume(s.id, Number(e.target.value))}
                  className={styles.volumeSlider}
                  title={`Volume: ${volumeOf(s.id)}%`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
