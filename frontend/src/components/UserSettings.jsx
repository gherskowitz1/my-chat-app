import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { loadShortcuts, saveShortcuts, formatKey, DEFAULT_SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { getPushSubscriptionStatus, enablePushNotifications, disablePushNotifications } from '../utils/push';
import { playTestChime } from '../utils/testChime';
import Avatar from './Avatar';
import ImageCropper from './ImageCropper';
import styles from './UserSettings.module.css';

const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024; // reject absurd uploads before the cropper even opens

const STORAGE_KEY_IN = 'chatter_audio_input';
const STORAGE_KEY_OUT = 'chatter_audio_output';
const STORAGE_KEY_NOISE_SUPPRESSION = 'chatter_noise_suppression';
const STORAGE_KEY_BITRATE = 'chatter_bitrate_cap';
const STORAGE_KEY_MIC_MODE = 'crowsnest_mic_mode';
const STORAGE_KEY_VAD_SENSITIVITY = 'crowsnest_vad_sensitivity';

export default function UserSettings({ onClose }) {
  const { user, updateAvatar } = useAuth();
  const [tab, setTab] = useState('account');
  const [avatarError, setAvatarError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const fileInputRef = useRef(null);

  const pickAvatar = () => fileInputRef.current?.click();

  const onAvatarSelected = (e) => {
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
    setCropFile(file);
  };

  const onCropSave = async (dataUrl) => {
    setCropFile(null);
    setUploading(true);
    try {
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
          <button className={`${styles.tab} ${tab === 'account' ? styles.activeTab : ''}`} onClick={() => setTab('account')}>
            👤 Account
          </button>
          <button className={`${styles.tab} ${tab === 'audio' ? styles.activeTab : ''}`} onClick={() => setTab('audio')}>
            <MicIcon /> Audio
          </button>
          <button className={`${styles.tab} ${tab === 'shortcuts' ? styles.activeTab : ''}`} onClick={() => setTab('shortcuts')}>
            ⌨️ Shortcuts
          </button>
          <button className={`${styles.tab} ${tab === 'status' ? styles.activeTab : ''}`} onClick={() => setTab('status')}>
            <StatusDotIcon /> Status
          </button>
          <button className={`${styles.tab} ${tab === 'appearance' ? styles.activeTab : ''}`} onClick={() => setTab('appearance')}>
            🎨 Appearance
          </button>
          <button className={`${styles.tab} ${tab === 'notifications' ? styles.activeTab : ''}`} onClick={() => setTab('notifications')}>
            🔔 Notifications
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'account' ? <AccountTab />
            : tab === 'audio' ? <AudioTab />
            : tab === 'shortcuts' ? <ShortcutsTab />
            : tab === 'status' ? <StatusTab />
            : tab === 'appearance' ? <AppearanceTab />
            : <NotificationsTab />}
        </div>
      </div>
      {cropFile && <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onCrop={onCropSave} />}
    </div>
  );
}

const AVATAR_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3BA55C', '#EB8E2B', '#9B59B6'];

// ── Account Tab ──────────────────────────────────────────────
function AccountTab() {
  const { user, updateUsername, updatePassword, updateAvatarColor, deleteAccount } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState('');

  const [colorSaving, setColorSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const saveUsername = async (e) => {
    e.preventDefault();
    setUsernameError('');
    setUsernameSuccess('');
    setUsernameSaving(true);
    try {
      await updateUsername(username.trim());
      setUsernameSuccess('Username updated.');
    } catch (err) {
      setUsernameError(err.message || 'Failed to update username');
    } finally {
      setUsernameSaving(false);
    }
  };

  const pickColor = async (color) => {
    if (color === user?.avatar_color || colorSaving) return;
    setColorSaving(true);
    try {
      await updateAvatarColor(color);
    } catch {
      // swallow — a failed color change just leaves the old one selected
    } finally {
      setColorSaving(false);
    }
  };

  const submitDelete = async (e) => {
    e.preventDefault();
    setDeleteError('');
    if (!confirm('Delete your account? This can’t be undone — your login stops working immediately. Your past messages stay visible to others, just relabeled as from a "Deleted User".')) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      // No further UI to update — deleteAccount() logs out, and the app
      // itself swaps to the login screen once `user` goes null.
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords don’t match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated. Your other devices have been signed out.');
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <>
      <section className={styles.section}>
        <h3>👤 Username</h3>
        <form onSubmit={saveUsername}>
          <input
            className={styles.input}
            value={username}
            onChange={(e) => { setUsername(e.target.value); setUsernameSuccess(''); }}
            minLength={2}
            maxLength={32}
            required
          />
          <div className={styles.footer}>
            <button type="submit" className={styles.saveBtn} disabled={usernameSaving || !username.trim() || username.trim() === user?.username}>
              {usernameSaving ? 'Saving…' : 'Save Username'}
            </button>
            {usernameError && <div className={styles.avatarError}>{usernameError}</div>}
            {usernameSuccess && <div className={styles.hint}>{usernameSuccess}</div>}
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <h3>🎨 Avatar Colour</h3>
        <div className={styles.colorRow}>
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={styles.colorSwatch}
              style={{ background: c, outline: c === user?.avatar_color ? '2px solid var(--text-primary)' : 'none', outlineOffset: 2 }}
              onClick={() => pickColor(c)}
              disabled={colorSaving}
              title={c}
            />
          ))}
        </div>
        <p className={styles.hint}>Used for your default avatar when you don't have a profile picture.</p>
      </section>

      <section className={styles.section}>
        <h3>🔒 Change Password</h3>
        <form onSubmit={savePassword}>
          <input
            className={styles.input}
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="New password (8+ characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
          <input
            className={styles.input}
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
          <div className={styles.footer}>
            <button type="submit" className={styles.saveBtn} disabled={passwordSaving}>
              {passwordSaving ? 'Saving…' : 'Change Password'}
            </button>
            {passwordError && <div className={styles.avatarError}>{passwordError}</div>}
            {passwordSuccess && <div className={styles.hint}>{passwordSuccess}</div>}
          </div>
        </form>
        <p className={styles.hint}>Changing your password signs out every other device you're logged in on — this one stays logged in.</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.dangerTitle}>⚠️ Delete Account</h3>
        <p className={styles.hint}>
          Permanently deletes your account. Your past messages stay visible to everyone else, just relabeled as
          from a "Deleted User" — they aren't removed.
        </p>
        <form onSubmit={submitDelete}>
          <input
            className={styles.input}
            type="password"
            placeholder="Enter your password to confirm"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div className={styles.footer}>
            <button type="submit" className={styles.dangerBtn} disabled={deleting || !deletePassword}>
              {deleting ? 'Deleting…' : 'Delete My Account'}
            </button>
            {deleteError && <div className={styles.avatarError}>{deleteError}</div>}
          </div>
        </form>
      </section>
    </>
  );
}

// ── Audio Tab ────────────────────────────────────────────────
function AudioTab() {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState(localStorage.getItem(STORAGE_KEY_IN) || '');
  const [selectedOutput, setSelectedOutput] = useState(localStorage.getItem(STORAGE_KEY_OUT) || '');
  const [noiseSuppression, setNoiseSuppression] = useState(localStorage.getItem(STORAGE_KEY_NOISE_SUPPRESSION) !== 'false');
  const [bitrateCap, setBitrateCap] = useState(localStorage.getItem(STORAGE_KEY_BITRATE) || '');
  const [micMode, setMicMode] = useState(localStorage.getItem(STORAGE_KEY_MIC_MODE) || 'open');
  const [vadSensitivity, setVadSensitivity] = useState(Number(localStorage.getItem(STORAGE_KEY_VAD_SENSITIVITY)) || 50);
  const [testing, setTesting] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);
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
    localStorage.setItem(STORAGE_KEY_NOISE_SUPPRESSION, String(noiseSuppression));
    localStorage.setItem(STORAGE_KEY_BITRATE, bitrateCap);
    localStorage.setItem(STORAGE_KEY_MIC_MODE, micMode);
    localStorage.setItem(STORAGE_KEY_VAD_SENSITIVITY, String(vadSensitivity));
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

  const testOutput = async () => {
    setTestingOutput(true);
    try {
      await playTestChime(selectedOutput);
    } catch { /* ignore — just no chime */ }
    setTimeout(() => setTestingOutput(false), 700);
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
        <h3>🎙️ Microphone Activation</h3>
        <select className={styles.select} value={micMode} onChange={e => setMicMode(e.target.value)}>
          <option value="open">Open Mic — always on unless muted</option>
          <option value="ptt">Push to Talk — hold a key to transmit</option>
          <option value="vad">Voice Activity — transmits automatically when you speak</option>
        </select>
        {micMode === 'ptt' && (
          <p className={styles.hint}>Starts each voice channel muted; hold the Push to Talk key (set under Shortcuts) to transmit.</p>
        )}
        {micMode === 'vad' && (
          <>
            <p className={styles.hint} style={{ marginBottom: 6 }}>Starts each voice channel muted and unmutes automatically while you're talking.</p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sensitivity — higher picks up quieter speech</span>
              <input
                type="range"
                min="0"
                max="100"
                value={vadSensitivity}
                onChange={e => setVadSensitivity(Number(e.target.value))}
              />
            </label>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h3><SpeakerIcon /> Output Device (Speakers / Headphones)</h3>
        <select className={styles.select} value={selectedOutput} onChange={e => setSelectedOutput(e.target.value)}>
          <option value="">System Default</option>
          {outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0,8)}`}</option>)}
        </select>
        <button className={styles.testBtn} onClick={testOutput} disabled={testingOutput}>
          {testingOutput ? <><span className={styles.pulse} /> Playing…</> : <><SpeakerIcon /> Test Speaker</>}
        </button>
        {outputs.length === 0 && <p className={styles.hint}>Output device selection requires Chrome or Edge.</p>}
      </section>

      <section className={styles.section}>
        <h3>🎚️ Voice Quality</h3>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={noiseSuppression} onChange={e => setNoiseSuppression(e.target.checked)} />
          <span>Noise suppression</span>
        </label>
        <p className={styles.hint} style={{ marginTop: -4, marginBottom: 10 }}>Filters out background noise from your microphone.</p>

        <h3 style={{ marginTop: 4 }}>Bitrate Cap</h3>
        <select className={styles.select} value={bitrateCap} onChange={e => setBitrateCap(e.target.value)}>
          <option value="">Auto (recommended)</option>
          <option value="16000">Low — 16 kbps (slow connections)</option>
          <option value="32000">Normal — 32 kbps</option>
          <option value="64000">High — 64 kbps (best quality)</option>
        </select>
        <p className={styles.hint}>Limits how much bandwidth your outgoing voice uses. Lower it if you have a weak connection.</p>
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
  const { user, updateStatusText } = useAuth();
  const { statusMap, setStatus } = useSocket();
  const [pending, setPending] = useState(null);
  const current = pending || statusMap.get(user.id) || 'online';

  const [statusText, setStatusText] = useState(user.status_text || '');
  const [textSaving, setTextSaving] = useState(false);
  const [textSuccess, setTextSuccess] = useState('');

  const choose = (value) => {
    setStatus(value);
    setPending(value); // reflect the choice immediately rather than waiting on the round-trip
  };

  const saveStatusText = async (e) => {
    e.preventDefault();
    setTextSaving(true);
    setTextSuccess('');
    try {
      await updateStatusText(statusText);
      setTextSuccess('Saved.');
    } catch {
      // swallow — a failed status text save just leaves the field as typed
    } finally {
      setTextSaving(false);
    }
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

      <h3 style={{ marginTop: 20 }}>💬 Custom Status Message</h3>
      <p className={styles.hint} style={{ marginBottom: 12 }}>
        A short note others see next to your name, like "brb" or "at the gym". Leave it blank to clear it.
      </p>
      <form onSubmit={saveStatusText}>
        <input
          className={styles.input}
          value={statusText}
          onChange={(e) => { setStatusText(e.target.value); setTextSuccess(''); }}
          maxLength={100}
          placeholder="What's on your mind?"
        />
        <div className={styles.footer}>
          <button type="submit" className={styles.saveBtn} disabled={textSaving || statusText === (user.status_text || '')}>
            {textSaving ? 'Saving…' : 'Save'}
          </button>
          {textSuccess && <div className={styles.hint}>{textSuccess}</div>}
        </div>
      </form>
    </section>
  );
}

// ── Appearance Tab ───────────────────────────────────────────
const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark', desc: 'The default look.', swatch: '#1e1f22' },
  { value: 'light', label: 'Light', desc: 'A brighter theme for daytime use.', swatch: '#ffffff' },
];

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <section className={styles.section}>
      <h3>🎨 Theme</h3>
      <div className={styles.shortcutList}>
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={styles.shortcutRow}
            style={{ border: theme === opt.value ? '1px solid var(--accent)' : '1px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            onClick={() => setTheme(opt.value)}
          >
            <div className={styles.shortcutInfo}>
              <span className={styles.shortcutLabel}>
                <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: opt.swatch, border: '1px solid var(--border-light)', marginRight: 8, verticalAlign: 'middle' }} />
                {opt.label}
              </span>
              <span className={styles.shortcutDesc}>{opt.desc}</span>
            </div>
            {theme === opt.value && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
          </button>
        ))}
      </div>
      <p className={styles.hint} style={{ marginTop: 12 }}>Applies instantly and only to this device. The standalone Admin Portal keeps its own fixed dark look.</p>
    </section>
  );
}

export const STORAGE_KEY_DM_SOUND_MUTED = 'crowsnest_dm_sound_muted';

// ── Notifications Tab ──────────────────────────────────────────
function NotificationsTab() {
  const [status, setStatus] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dmSoundMuted, setDmSoundMuted] = useState(localStorage.getItem(STORAGE_KEY_DM_SOUND_MUTED) === 'true');

  const toggleDmSound = (e) => {
    setDmSoundMuted(e.target.checked);
    localStorage.setItem(STORAGE_KEY_DM_SOUND_MUTED, String(e.target.checked));
  };

  useEffect(() => {
    getPushSubscriptionStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      await enablePushNotifications();
      setStatus('subscribed');
    } catch (err) {
      setError(err.message);
      setStatus(typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'denied' : 'unsubscribed');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      await disablePushNotifications();
      setStatus('unsubscribed');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section}>
      <h3>🔔 Push Notifications</h3>
      <p className={styles.hint}>Get notified about DMs and @mentions even when Crows Nest is completely closed.</p>

      {status === 'unsupported' && <p className={styles.hint}>Not supported in this browser.</p>}
      {status === 'denied' && <p className={styles.hint}>Notifications are blocked for this site — enable them in your browser's site settings, then reopen this tab.</p>}

      {(status === 'unsubscribed' || status === 'checking') && (
        <button className={styles.avatarLink} onClick={enable} disabled={busy || status === 'checking'}>
          {busy ? 'Enabling…' : 'Enable push notifications'}
        </button>
      )}
      {status === 'subscribed' && (
        <button className={styles.avatarLink} onClick={disable} disabled={busy}>
          {busy ? 'Disabling…' : 'Disable push notifications'}
        </button>
      )}
      {error && <div className={styles.avatarError}>{error}</div>}

      <label className={styles.checkboxRow} style={{ marginTop: 16 }}>
        <input type="checkbox" checked={dmSoundMuted} onChange={toggleDmSound} />
        Mute the sound when I get a new DM
      </label>
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
  const bitrate = localStorage.getItem(STORAGE_KEY_BITRATE);
  const sensitivity = localStorage.getItem(STORAGE_KEY_VAD_SENSITIVITY);
  return {
    inputDeviceId: localStorage.getItem(STORAGE_KEY_IN) || undefined,
    outputDeviceId: localStorage.getItem(STORAGE_KEY_OUT) || undefined,
    noiseSuppression: localStorage.getItem(STORAGE_KEY_NOISE_SUPPRESSION) !== 'false',
    bitrateCap: bitrate ? parseInt(bitrate, 10) : undefined,
    micMode: localStorage.getItem(STORAGE_KEY_MIC_MODE) || 'open',
    vadSensitivity: sensitivity ? Number(sensitivity) : 50,
  };
}
