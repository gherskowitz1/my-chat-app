import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { loadShortcuts, saveShortcuts, formatKey, DEFAULT_SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import Avatar from './Avatar';
import styles from './UserSettings.module.css';

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024; // reject absurd uploads before we even try to resize them
const AVATAR_MAX_DIMENSION = 256;

// Downscale/compress in the browser so we never ship a multi-MB photo to the
// server — a 256px JPEG comfortably fits well under the API's upload limit.
function resizeImageToDataUrl(file, maxDimension = AVATAR_MAX_DIMENSION, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else if (height >= width && height > maxDimension) {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const STORAGE_KEY_IN = 'chatter_audio_input';
const STORAGE_KEY_OUT = 'chatter_audio_output';

export default function UserSettings({ onClose }) {
  const { user, updateAvatar } = useAuth();
  const [tab, setTab] = useState('audio');
  const [avatarError, setAvatarError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const pickAvatar = () => fileInputRef.current?.click();

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setAvatarError('');
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setAvatarError('That image is too large (max 10MB).');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateAvatar(dataUrl);
    } catch (err) {
      setAvatarError(err.message || 'Failed to update avatar');
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarError('');
    setUploading(true);
    try {
      await updateAvatar(null);
    } catch (err) {
      setAvatarError(err.message || 'Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.avatarPickerWrap}>
            <Avatar
              url={user?.avatar_url}
              color={user?.avatar_color}
              username={user?.username}
              className={styles.avatarLarge}
              onClick={pickAvatar}
              title="Change profile picture"
            />
            {uploading && <div className={styles.avatarOverlay}>…</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarSelected}
              style={{ display: 'none' }}
            />
          </div>
          <div>
            <div className={styles.username}>{user?.username}</div>
            <div className={styles.role}>{user?.role}</div>
            <div className={styles.avatarActions}>
              <button className={styles.avatarLink} onClick={pickAvatar} disabled={uploading}>Change photo</button>
              {user?.avatar_url && (
                <button className={styles.avatarLink} onClick={removeAvatar} disabled={uploading}>Remove</button>
              )}
            </div>
            {avatarError && <div className={styles.avatarError}>{avatarError}</div>}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'audio' ? styles.activeTab : ''}`} onClick={() => setTab('audio')}>
            <MicIcon /> Audio
          </button>
          <button className={`${styles.tab} ${tab === 'shortcuts' ? styles.activeTab : ''}`} onClick={() => setTab('shortcuts')}>
            ⌨️ Shortcuts
          </button>
          <button className={`${styles.tab} ${tab === 'status' ? styles.activeTab : ''}`} onClick={() => setTab('status')}>
            <StatusDotIcon /> Status
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'audio' ? <AudioTab /> : tab === 'shortcuts' ? <ShortcutsTab /> : <StatusTab />}
        </div>
      </div>
    </div>
  );
}

// ── Audio Tab ────────────────────────────────────────────────
function AudioTab() {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState(localStorage.getItem(STORAGE_KEY_IN) || '');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem(STORAGE_KEY_OUT) || '');
  const [testing, setTesting] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadDevices(); }, []);

  const loadDevices = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(devices.filter(d => d.kind === 'audioinput'));
      setOutputs(devices.filter(d => d.kind === 'audiooutput'));
      setPermissionError(false);
    } catch { setPermissionError(true); }
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
      const constraints = selectedInput ? { audio: { deviceId: { exact: selectedInput } } } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      src.connect(ctx.createAnalyser());
      setTimeout(() => { stream.getTracks().forEach(t => t.stop()); ctx.close(); setTesting(false); }, 3000);
    } catch { setTesting(false); }
  };

  if (permissionError) {
    return (
      <div className={styles.permError}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <div><strong>Microphone access denied.</strong><br/>Allow microphone access in your browser settings, then reopen this panel.</div>
      </div>
    );
  }

  return (
    <>
      <section className={styles.section}>
        <h3><MicIcon /> Input Device (Microphone)</h3>
        <select className={styles.select} value={selectedInput} onChange={e => setSelectedInput(e.target.value)}>
          <option value="">System Default</option>
          {inputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0,8)}`}</option>)}
        </select>
        <button className={styles.testBtn} onClick={testMic} disabled={testing}>
          {testing ? <><span className={styles.pulse} /> Recording for 3s…</> : <><MicIcon /> Test Microphone</>}
        </button>
      </section>

      <section className={styles.section}>
        <h3><SpeakerIcon /> Output Device (Speakers / Headphones)</h3>
        <select className={styles.select} value={selectedOutput} onChange={e => setSelectedOutput(e.target.value)}>
          <option value="">System Default</option>
          {outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,8)}`}</option>)}
        </select>
        {outputs.length === 0 && <p className={styles.hint}>Output device selection requires Chrome or Edge.</p>}
      </section>

      <div className={styles.footer}>
        <button className={styles.saveBtn} onClick={save}>{saved ? '✓ Saved!' : 'Save Changes'}</button>
        <p className={styles.hint}>Changes apply the next time you join a voice channel.</p>
      </div>
    </>
  );
}

// ── Shortcuts Tab ────────────────────────────────────────────
function ShortcutsTab() {
  const [shortcuts, setShortcuts] = useState(loadShortcuts());
  const [binding, setBinding] = useState(null); // id currently being rebound
  const [saved, setSaved] = useState(false);

  const startBinding = (id) => setBinding(id);

  const handleKeyDown = (e) => {
    if (!binding) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.toLowerCase();
    if (key === 'escape' && binding !== 'leaveVoice') {
      setBinding(null);
      return;
    }
    setShortcuts(prev => ({ ...prev, [binding]: { ...prev[binding], key } }));
    setBinding(null);
  };

  const save = () => {
    saveShortcuts(shortcuts);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    const defaults = Object.fromEntries(
      Object.entries(DEFAULT_SHORTCUTS).map(([id, s]) => [id, { ...shortcuts[id], key: s.key }])
    );
    setShortcuts(defaults);
  };

  return (
    <div onKeyDown={handleKeyDown} tabIndex={-1} style={{ outline: 'none' }}>
      <section className={styles.section}>
        <h3>⌨️ Voice Channel Shortcuts</h3>
        <p className={styles.hint} style={{ marginBottom: 12 }}>
          Shortcuts only work while in a voice channel and not typing in a message box.
        </p>

        <div className={styles.shortcutList}>
          {Object.entries(shortcuts).map(([id, s]) => (
            <div key={id} className={styles.shortcutRow}>
              <div className={styles.shortcutInfo}>
                <span className={styles.shortcutLabel}>{s.label}</span>
                <span className={styles.shortcutDesc}>{s.description}</span>
              </div>
              <button
                className={`${styles.keyBtn} ${binding === id ? styles.bindingActive : ''}`}
                onClick={() => startBinding(id)}
                title="Click to rebind"
              >
                {binding === id ? 'Press a key…' : formatKey(s.key)}
              </button>
            </div>
          ))}
        </div>
      </section>

      {binding && (
        <div className={styles.bindingHint}>
          Press any key to bind to <strong>{shortcuts[binding]?.label}</strong>. Press Escape to cancel (unless binding Leave Voice).
        </div>
      )}

      <div className={styles.footer}>
        <button className={styles.saveBtn} onClick={save}>{saved ? '✓ Saved!' : 'Save Shortcuts'}</button>
        <button className={styles.resetBtn} onClick={reset}>Reset to defaults</button>
      </div>
    </div>
  );
}

// ── Status Tab ───────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'online', label: 'Online', desc: 'Shown as active to everyone.', color: 'var(--green)' },
  { value: 'away', label: 'Away', desc: 'Shown as away, same as the automatic 30-minute idle status.', color: 'var(--yellow)' },
  { value: 'offline', label: 'Offline', desc: "Appear offline to others, even though you're still connected.", color: 'var(--text-muted)' },
];

function StatusTab() {
  const { user } = useAuth();
  const { statusMap, setStatus } = useSocket();
  const [pending, setPending] = useState(null);
  const current = pending || statusMap.get(user.id) || 'online';

  const choose = (value) => {
    setStatus(value);
    setPending(value); // reflect the choice immediately rather than waiting on the round-trip
  };

  return (
    <section className={styles.section}>
      <h3><StatusDotIcon /> Status</h3>
      <p className={styles.hint} style={{ marginBottom: 12 }}>
        Override your automatic online/away status. Resets to automatic the next time you sign in.
      </p>
      <div className={styles.shortcutList}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={styles.shortcutRow}
            style={{ border: current === opt.value ? '1px solid var(--accent)' : '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onClick={() => choose(opt.value)}
          >
            <div className={styles.shortcutInfo}>
              <span className={styles.shortcutLabel}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: opt.color, marginRight: 8 }} />
                {opt.label}
              </span>
              <span className={styles.shortcutDesc}>{opt.desc}</span>
            </div>
            {current === opt.value && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Icons ────────────────────────────────────────────────────
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
const StatusDotIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="8" />
  </svg>
);

export function getAudioPreferences() {
  return {
    inputDeviceId: localStorage.getItem(STORAGE_KEY_IN) || undefined,
    outputDeviceId: localStorage.getItem(STORAGE_KEY_OUT) || undefined,
  };
}
