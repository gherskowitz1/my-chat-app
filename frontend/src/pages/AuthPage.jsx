import React, { useState } from 'react';
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
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="20" fill="#5865F2"/>
            <path d="M28 14c-2-1-4-1.5-4-1.5l-.4.8c1.4.4 2.8 1 4 1.8A13.3 13.3 0 0 0 20 14c-2.8 0-5 .6-7.6 1.1 1.2-.8 2.7-1.4 4-1.8L16 12.5S14 13 12 14c-2.5 4-3 8-3 8s1.5 2 4.5 2.5l1-1.3c-.8-.2-1.8-.5-2.5-1 .2.1.4.2.6.3C14 23.2 17 24 20 24s6-.8 7.4-1.5l.6-.3c-.7.5-1.7.8-2.5 1l1 1.3C29.5 24 31 22 31 22s-.5-4-3-8ZM17 21a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" fill="white"/>
          </svg>
          <span>Chatter</span>
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
        </form>

        <p className={styles.toggle}>
          {mode === 'login' ? (
            <>Need an account? <button onClick={() => { setMode('signup'); setError(''); }}>Register</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode('login'); setError(''); }}>Log In</button></>
          )}
        </p>
      </div>
    </div>
  );
}
