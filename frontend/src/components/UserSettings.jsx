import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './UserSettings.module.css';

const STORAGE_KEY_IN = 'chatter_audio_input';
const STORAGE_KEY_OUT = 'chatter_audio_output';

export default function UserSettings({ onClose }) {
  const { user } = useAuth();
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState(localStorage.getItem(STORAGE_KEY_IN) || '');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem(STORAGE_KEY_OUT) || '');
  const [testing, setTesting] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    try {
      // Request permission first so device labels are populated
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(devices.filter(d => d.kind === 'audioinput'));
      setOutputs(devices.filter(d => d.kind === 'audiooutput'));
      setPermissionError(false);
    } catch {
      setPermissionError(true);
    }
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY_IN, selectedInput);
    localStorage.setItem(STORAGE_KEY_OUT, selectedOutput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testMic = async () => {
    setTesting(true);
    try {
      const constraints = selectedInput
        ? { audio: { deviceId: { exact: selectedInput } } }
        : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      src.connect(analyser);

      // Show input level for 3 seconds then stop
      setTimeout(() => {
        stream.getTracks().forEach(t => t.stop());
        ctx.close();
        setTesting(false);
      }, 3000);
    } catch {
      setTesting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <div className={styles.avatarLarge} style={{ background: user?.avatar_color }}>
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className={styles.username}>{user?.username}</div>
            <div className={styles.role}>{user?.role}</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <h2>User Settings</h2>

          {permissionError ? (
            <div className={styles.permError}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <div>
                <strong>Microphone access denied.</strong><br/>
                Allow microphone access in your browser settings, then reopen this panel.
              </div>
            </div>
          ) : (
            <>
              <section className={styles.section}>
                <h3>
                  <MicIcon /> Input Device (Microphone)
                </h3>
                <select
                  className={styles.select}
                  value={selectedInput}
                  onChange={e => setSelectedInput(e.target.value)}
                >
                  <option value="">System Default</option>
                  {inputs.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.testBtn}
                  onClick={testMic}
                  disabled={testing}
                >
                  {testing ? (
                    <><span className={styles.pulse} /> Recording for 3s…</>
                  ) : (
                    <><MicIcon /> Test Microphone</>
                  )}
                </button>
              </section>

              <section className={styles.section}>
                <h3>
                  <SpeakerIcon /> Output Device (Speakers / Headphones)
                </h3>
                <select
                  className={styles.select}
                  value={selectedOutput}
                  onChange={e => setSelectedOutput(e.target.value)}
                >
                  <option value="">System Default</option>
                  {outputs.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                {outputs.length === 0 && (
                  <p className={styles.hint}>Output device selection is not supported in Firefox. Use Chrome or Edge.</p>
                )}
              </section>

              <div className={styles.footer}>
                <button className={styles.saveBtn} onClick={save}>
                  {saved ? '✓ Saved!' : 'Save Changes'}
                </button>
                <p className={styles.hint}>Changes apply the next time you join a voice channel.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
    <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
  </svg>
);

const SpeakerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>
);

// Export the device preference helpers for use in VoiceChannel
export function getAudioPreferences() {
  return {
    inputDeviceId: localStorage.getItem(STORAGE_KEY_IN) || undefined,
    outputDeviceId: localStorage.getItem(STORAGE_KEY_OUT) || undefined,
  };
}
