import React, { useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSocket } from '../context/SocketContext';
import { api } from '../services/api';
import voiceStyles from './VoiceControls.module.css';
import styles from './Soundboard.module.css';

const DEFAULT_SERVER = '00000000-0000-0000-0000-000000000001';

// Publishing the clip's own captured audio stream means every other
// participant's existing <RoomAudioRenderer/> just picks it up like any
// other remote track (it already renders Track.Source.Unknown tracks) — no
// signaling of our own needed. The clicking user hears it through the normal
// <audio> element playback, which doubles as the capture source.
const CAN_CAPTURE = typeof window !== 'undefined' && !!window.HTMLMediaElement?.prototype?.captureStream;

export default function Soundboard() {
  const room = useRoomContext();
  const { socket } = useSocket();
  const [sounds, setSounds] = useState([]);
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const audioRef = useRef(null);
  const publishedTrackRef = useRef(null);

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

    try {
      await audio.play();
      if (CAN_CAPTURE && room?.localParticipant) {
        const stream = audio.captureStream();
        const [track] = stream.getAudioTracks();
        if (track) {
          publishedTrackRef.current = track;
          await room.localParticipant.publishTrack(track, { source: Track.Source.Unknown, name: `sfx-${sound.name}` });
        }
      }
    } catch (err) {
      console.error('soundboard play error', err);
      finish();
    }
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
          <div className={styles.grid}>
            {sounds.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.soundBtn} ${playingId === s.id ? styles.playing : ''}`}
                onClick={() => play(s)}
                disabled={!!playingId}
                title={s.name}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
