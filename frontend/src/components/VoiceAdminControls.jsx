import React, { useState, useEffect, useCallback } from 'react';
import styles from './VoiceAdminControls.module.css';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

export default function VoiceAdminControls({ roomName }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({}); // identity -> true while action in flight

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/livekit/rooms/${encodeURIComponent(roomName)}/participants`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (Array.isArray(data)) setParticipants(data);
    } catch {}
    finally { setLoading(false); }
  }, [roomName]);

  // Poll every 5 seconds to keep participant list fresh
  useEffect(() => {
    fetchParticipants();
    const id = setInterval(fetchParticipants, 5000);
    return () => clearInterval(id);
  }, [fetchParticipants]);

  const mute = async (identity, currentlyMuted) => {
    setBusy(b => ({ ...b, [identity]: true }));
    try {
      await fetch(`${BASE}/livekit/rooms/${encodeURIComponent(roomName)}/mute/${encodeURIComponent(identity)}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ muted: !currentlyMuted }),
      });
      await fetchParticipants();
    } catch {}
    finally { setBusy(b => ({ ...b, [identity]: false })); }
  };

  const kick = async (identity, name) => {
    if (!confirm(`Remove ${name} from the voice channel?`)) return;
    setBusy(b => ({ ...b, [identity]: true }));
    try {
      await fetch(`${BASE}/livekit/rooms/${encodeURIComponent(roomName)}/participants/${encodeURIComponent(identity)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      setParticipants(p => p.filter(x => x.identity !== identity));
    } catch {}
    finally { setBusy(b => ({ ...b, [identity]: false })); }
  };

  if (participants.length === 0) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
          <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
        </svg>
        <span>In Voice ({participants.length})</span>
        <button className={styles.refresh} onClick={fetchParticipants} title="Refresh" disabled={loading}>↻</button>
      </div>

      {participants.map(p => (
        <div key={p.identity} className={styles.participant}>
          <div className={styles.name} title={p.name}>{p.name || p.identity.slice(0, 8)}</div>
          <div className={styles.actions}>
            <button
              className={`${styles.btn} ${p.isMuted ? styles.muted : styles.unmuted}`}
              onClick={() => mute(p.identity, p.isMuted)}
              disabled={busy[p.identity]}
              title={p.isMuted ? 'Unmute' : 'Mute'}
            >
              {p.isMuted ? <MutedIcon /> : <MicIcon />}
            </button>
            <button
              className={`${styles.btn} ${styles.kick}`}
              onClick={() => kick(p.identity, p.name)}
              disabled={busy[p.identity]}
              title="Remove from channel"
            >
              <KickIcon />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const MicIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
    <path d="M19 10a7 7 0 0 1-14 0H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.06A9 9 0 0 0 21 10h-2z"/>
  </svg>
);

const MutedIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);

const KickIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.95-2.05L6.64 18.36A9 9 0 1 0 13 3zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z"/>
  </svg>
);
