import React, { useState } from 'react';
import { api } from '../services/api';
import styles from './InviteModal.module.css';

export default function InviteModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await api.post('/invite', { email: email.trim() });
      setSent(true);
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Invite People</h3>
        <p className={styles.hint}>Send someone a direct link to join The Crows Nest.</p>

        {error && <div className={styles.error}>{error}</div>}
        {sent && <div className={styles.success}>Invite sent! Send another below if you'd like.</div>}

        <form onSubmit={submit} className={styles.form}>
          <input
            type="email"
            required
            autoFocus
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Close</button>
            <button type="submit" className={styles.sendBtn} disabled={sending || !email.trim()}>
              {sending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
