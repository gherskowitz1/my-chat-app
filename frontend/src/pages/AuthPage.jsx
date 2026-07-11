import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './AuthPage.module.css';

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await signup(form.username, form.email, form.password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/crowsnest.png" alt="The Crows Nest" width="48" height="48" style={{ borderRadius: '8px' }} />
          <span>The Crows Nest</span>
        </div>

        <h1>{mode === 'login' ? 'Welcome back!' : 'Create an account'}</h1>
        <p className={styles.subtitle}>
          {mode === 'login' ? "We're so excited to see you again!" : 'Join the conversation today.'}
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          {mode === 'signup' && (
            <label className={styles.field}>
              <span>USERNAME</span>
              <input
                type="text"
                value={form.username}
                onChange={set('username')}
                required
                minLength={2}
                maxLength={32}
                placeholder="cooluser123"
                autoComplete="username"
              />
            </label>
          )}
          <label className={styles.field}>
            <span>EMAIL</span>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className={styles.field}>
            <span>PASSWORD</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Loading…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
          {mode === 'login' && (
            <Link to="/forgot-password" className={styles.forgotLink}>Forgot your password?</Link>
          )}
        </form>

        <p className={styles.toggle}>
          {mode === 'login' ? (
            <>Need an account? <button onClick={() => { setMode('signup'); setError(''); }}>Register</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }}>Log In</button></>
          )}
        </p>

        <div className={styles.downloadSection}>
          <div className={styles.downloadDivider}><span>or</span></div>
          <a
            href="https://github.com/gherskowitz1/my-chat-app/releases/latest/download/The.Crows.Nest.Setup.1.1.0.exe"
            className={styles.downloadBtn}
            download
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download Windows App
          </a>
          <p className={styles.downloadHint}>Windows 10/11 · 64-bit · ~95 MB</p>
        </div>

        <p className={styles.privacy}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
