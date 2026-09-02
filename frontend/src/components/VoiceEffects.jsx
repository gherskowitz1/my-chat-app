import React, { useEffect, useRef, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { Track, ParticipantEvent } from 'livekit-client';
import { VOICE_EFFECTS, VoiceEffectProcessor, buildEffectGraph } from '../utils/voiceEffects';
import { getAudioPreferences } from './UserSettings';
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
  const [previewing, setPreviewing] = useState(false);
  const btnRef = useRef(null);
  const popoverRef = useRef(null);
  const audioContextRef = useRef(null);
  const contextAssignedRef = useRef(false);
  const appliedOnceRef = useRef(false);
  const previewStreamRef = useRef(null);
  const previewCtxRef = useRef(null);
  const previewNodesRef = useRef([]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const getMicTrack = () => localParticipant?.getTrackPublication(Track.Source.Microphone)?.track;

  // "Hear yourself" preview — a completely separate, unpublished mic capture
  // routed straight to the local speakers through the same effect graph the
  // real processor uses, so switching/previewing effects never touches what
  // anyone else in the call hears.
  const teardownPreviewGraph = () => {
    previewNodesRef.current.forEach((n) => {
      try { n.disconnect(); } catch { /* already disconnected */ }
      try { n.stop?.(); } catch { /* not a source node */ }
    });
    previewNodesRef.current = [];
  };

  const buildPreviewGraph = async () => {
    const ctx = previewCtxRef.current;
    const stream = previewStreamRef.current;
    if (!ctx || !stream) return;
    teardownPreviewGraph();
    const source = ctx.createMediaStreamSource(stream);
    const graph = await buildEffectGraph(ctx, effectId);
    source.connect(graph.input);
    graph.output.connect(ctx.destination);
    previewNodesRef.current = [source, ...graph.extraNodes];
  };

  const stopPreview = () => {
    teardownPreviewGraph();
    if (previewCtxRef.current) {
      previewCtxRef.current.close().catch(() => {});
      previewCtxRef.current = null;
    }
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    setPreviewing(false);
  };

  const startPreview = async () => {
    if (effectId === 'none') return;
    setError('');
    try {
      const { inputDeviceId } = getAudioPreferences();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      previewStreamRef.current = stream;
      previewCtxRef.current = new Ctx();
      await buildPreviewGraph();
      setPreviewing(true);
    } catch (err) {
      console.error('voice effect preview error', err);
      setError("Could not start the preview — check microphone permission.");
      stopPreview();
    }
  };

  const togglePreview = () => {
    if (previewing) stopPreview();
    else startPreview();
  };

  // Rebuild (not restart) the preview graph when switching effects while
  // already previewing, so it never re-prompts for mic permission. Picking
  // "None" just ends the preview outright — there's no graph to build.
  useEffect(() => {
    if (!previewing) return;
    if (effectId === 'none') stopPreview();
    else buildPreviewGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectId]);

  // Never leave a live mic loopback running once the popover closes.
  useEffect(() => {
    if (!open && previewing) stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopPreview(), []);

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
          <button
            type="button"
            className={`${styles.previewToggle} ${previewing ? styles.previewOn : ''}`}
            onClick={togglePreview}
            disabled={effectId === 'none'}
            title={effectId === 'none' ? 'Pick an effect first' : 'Hear this effect applied to your own mic — nobody else hears the preview'}
          >
            {previewing ? '⏹ Stop Preview' : '🎧 Hear Yourself'}
          </button>
          {previewing && <p className={styles.hint}>Use headphones — playing your own mic through speakers will echo.</p>}
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
