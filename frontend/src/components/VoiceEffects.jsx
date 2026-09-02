import React, { useEffect, useRef, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { Track, ParticipantEvent } from 'livekit-client';
import { VOICE_EFFECTS, VoiceEffectProcessor } from '../utils/voiceEffects';
import voiceStyles from './VoiceControls.module.css';
import styles from './VoiceEffects.module.css';

const STORAGE_KEY = 'crowsnest_voice_effect';
const CAN_USE_EFFECTS = typeof window !== 'undefined'
  && !!(window.AudioContext || window.webkitAudioContext)
  && typeof window.AudioWorkletNode !== 'undefined';

export default function VoiceEffects() {
  const { localParticipant } = useLocalParticipant();
  const [open, setOpen] = useState(false);
  const [effectId, setEffectId] = useState(() => localStorage.getItem(STORAGE_KEY) || 'none');
  const [error, setError] = useState('');
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const audioContextRef = useRef(null);
  const contextAssignedRef = useRef(false);
  const appliedOnceRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const getMicTrack = () => localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;

  const apply = async (id) => {
    const micTrack = getMicTrack();
    if (!micTrack) {
      setError('Your microphone track is not ready yet — try again in a moment.');
      return;
    }
    setError('');
    try {
      if (id === 'none') {
        if (micTrack.getProcessor()) await micTrack.stopProcessor();
      } else {
        if (!audioContextRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new Ctx();
        }
        if (!contextAssignedRef.current) {
          micTrack.setAudioContext(audioContextRef.current);
          contextAssignedRef.current = true;
        }
        await micTrack.setProcessor(new VoiceEffectProcessor(id));
      }
      setEffectId(id);
      localStorage.setItem(STORAGE_KEY, id);
      setOpen(false);
    } catch (err) {
      console.error('voice effect error', err);
      setError("Could not apply that effect in this browser.");
    }
  };

  // Re-apply a previously-chosen effect once the mic track actually exists —
  // covers this component mounting before LiveKit finishes publishing the
  // microphone. Deliberately mount-only: apply() itself handles every
  // effect change made through the UI afterward.
  useEffect(() => {
    if (!localParticipant || effectId === 'none' || appliedOnceRef.current) return;
    const tryApply = () => {
      if (getMicTrack() && !appliedOnceRef.current) {
        appliedOnceRef.current = true;
        apply(effectId);
      }
    };
    tryApply();
    localParticipant.on(ParticipantEvent.LocalTrackPublished, tryApply);
    return () => localParticipant.off(ParticipantEvent.LocalTrackPublished, tryApply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant]);

  if (!CAN_USE_EFFECTS) return null;

  const current = VOICE_EFFECTS.find((e) => e.id === effectId);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${voiceStyles.ctrl} ${voiceStyles.on}`}
        onClick={() => setOpen((o) => !o)}
        title={current ? `Voice Effect: ${current.label}` : 'Voice Effects'}
      >
        {'🎭'}
        <span>Voice Effects</span>
      </button>

      {open && (
        <div ref={popoverRef} className={styles.popover}>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.grid}>
            <button
              type="button"
              className={`${styles.effectBtn} ${effectId === 'none' ? styles.active : ''}`}
              onClick={() => apply('none')}
            >
              🚫 None
            </button>
            {VOICE_EFFECTS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`${styles.effectBtn} ${effectId === e.id ? styles.active : ''}`}
                onClick={() => apply(e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
