import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import styles from './AuthPage.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/crowsnest.png" alt="The Crows Nest" width="48" height="48" style={{ borderRadius: '8px' }} />
          <span>The Crows Nest</span>
        </div>

        {sent ? (
          <>
            <h1>Check your email</h1>
            <p className={styles.subtitle}>
              If an account exists for <strong>{email}</strong>, we sent a password reset link. Check your inbox and spam folder.
            </p>
            <Link to="/auth" className={styles.submit} style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
              Back to Login
            </Link>
          </>
        ) : (
          <>
            <h1>Forgot your password?</h1>
            <p className={styles.subtitle}>
              Enter your email and we'll send you a reset link.
            </p>

            {error && <div className={styles.error}>{error}</div>}

            <form onSubmit={handleSubmit} className={styles.form}>
              <label className={styles.field}>
                <span>EMAIL</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <button type="submit" className={styles.submit} disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>

            <p className={styles.toggle}>
              <Link to="/auth">← Back to Login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
