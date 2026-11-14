import React, { useEffect, useState } from 'react';
import styles from './LfgCard.module.css';

// The party card on a /lfg message — "looking for 3 more for Helldivers 2",
// one slot per player wanted, and an I'm in / Leave button. Updated live by
// the server's lfg:update broadcast (see ChatArea). Server: lfgController.js.
export default function LfgCard({ lfg, posterName, currentUserId, onToggle }) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Re-render each minute so "expires in" and the expired state stay current.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const minutesLeft = Math.round((new Date(lfg.expiresAt) - Date.now()) / 60000);
  const expired = minutesLeft <= 0;
  const full = lfg.members.length >= lfg.needed;
  const mine = lfg.createdBy === currentUserId;
  const joined = lfg.members.some((m) => m.userId === currentUserId);
  const openSlots = Math.max(0, lfg.needed - lfg.members.length);

  const toggle = async () => {
    setBusy(true);
    setError('');
    try { await onToggle(lfg.id); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  let status;
  if (full) status = <span className={styles.full}>🎉 Party full!</span>;
  else if (expired) status = <span className={styles.expired}>Expired</span>;
  else status = <span className={styles.timer}>{minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m left` : `${minutesLeft}m left`}</span>;

  return (
    <div className={`${styles.card} ${full ? styles.isFull : ''} ${expired && !full ? styles.isExpired : ''}`}>
      <div className={styles.top}>
        <span className={styles.icon}>🎮</span>
        <div className={styles.titleBlock}>
          <div className={styles.game}>{lfg.game}</div>
          <div className={styles.sub}>
            {posterName} is looking for {lfg.needed} more · {status}
          </div>
        </div>
      </div>

      <div className={styles.slots}>
        <span className={`${styles.slot} ${styles.host}`} title="Host">{posterName}</span>
        {lfg.members.map((m) => (
          <span key={m.userId} className={`${styles.slot} ${styles.filled}`}>{m.username}</span>
        ))}
        {Array.from({ length: openSlots }, (_, i) => <span key={`open-${i}`} className={`${styles.slot} ${styles.open}`}>open</span>)}
      </div>

      {!mine && (joined || (!full && !expired)) && (
        <button className={joined ? styles.leaveBtn : styles.joinBtn} onClick={toggle} disabled={busy}>
          {joined ? 'Leave party' : '✋ I’m in'}
        </button>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
