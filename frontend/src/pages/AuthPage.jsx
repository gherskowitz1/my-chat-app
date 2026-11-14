import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import styles from './AuthPage.module.css';

// "Remember me" stores the raw password in localStorage so the login form
// can pre-fill it — a deliberate tradeoff (not encrypted; anything that can
// read this browser's localStorage, e.g. an XSS payload, could read it too)
// chosen over the safer "remember email only" alternative.
const REMEMBER_KEY = 'crowsnest_remembered_login';

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AuthPage() {
  const { login, signup } = useAuth();
  // Set when the password was right but this device isn't trusted yet —
  // swaps the form for the code step (CodeStep below).
  const [challenge, setChallenge] = useState(null);
  const [searchParams] = useSearchParams();
  const remembered = loadRemembered();
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [form, setForm] = useState({
    username: '',
    email: searchParams.get('email') || remembered?.email || '',
    password: remembered?.password || '',
    inviteCode: '',
  });
  const [rememberMe, setRememberMe] = useState(!!remembered);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupCodeRequired, setSignupCodeRequired] = useState(false);

  useEffect(() => {
    api.get('/auth/config').then((c) => setSignupCodeRequired(c.signupCodeRequired)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login(form.email, form.password);
        if (result.mfaRequired) setChallenge(result);
        if (rememberMe) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: form.email, password: form.password }));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } else {
        await signup(form.username, form.email, form.password, form.inviteCode);
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

        {!challenge && (
          <>
            <h1>{mode === 'login' ? 'Welcome back!' : 'Create an account'}</h1>
            <p className={styles.subtitle}>
              {mode === 'login' ? "We're so excited to see you again!" : 'Join the conversation today.'}
            </p>
          </>
        )}

        {challenge ? (
          <CodeStep challenge={challenge} onBack={() => { setChallenge(null); setError(''); }} />
        ) : (
        <>
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
          {mode === 'signup' && signupCodeRequired && (
            <label className={styles.field}>
              <span>INVITE CODE</span>
              <input
                type="text"
                value={form.inviteCode}
                onChange={set('inviteCode')}
                required
                placeholder="Ask whoever invited you"
                autoComplete="off"
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
          {mode === 'login' && (
            <label className={styles.rememberRow}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me</span>
            </label>
          )}
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
        </>
        )}

        <div className={styles.downloadSection}>
          <div className={styles.downloadDivider}><span>or</span></div>
          <a
            href="https://github.com/gherskowitz1/my-chat-app/releases/latest/download/The-Crows-Nest-Setup.exe"
            className={styles.downloadBtn}
            download
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download Windows App
          </a>
          <p className={styles.downloadHint}>Windows 10/11 · 64-bit · ~95 MB</p>

          <a
            href="https://github.com/gherskowitz1/my-chat-app/releases/latest/download/The-Crows-Nest-Setup.AppImage"
            className={styles.downloadBtn}
            download
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download Linux App
          </a>
          <p className={styles.downloadHint}>AppImage · 64-bit · ~105 MB</p>
        </div>

        <p className={styles.privacy}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}

const RESEND_COOLDOWN_S = 60;

// Second step of signing in on a device that isn't trusted yet: the 6-digit
// code from the email (or, for people who turned it on, their
// authenticator app). Getting it right signs in and remembers this device.
function CodeStep({ challenge, onBack }) {
  const { verifyLogin, resendLoginCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const isApp = challenge.method === 'totp';

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await verifyLogin(challenge.challengeId, code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      await resendLoginCode(challenge.challengeId);
      setNotice('A new code is on its way.');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <h1>{isApp ? 'Enter your app code' : 'Check your email'}</h1>
      <p className={styles.subtitle}>
        {isApp
          ? 'Open your authenticator app (Authy, Google Authenticator…) and enter the 6-digit code for The Crows Nest.'
          : <>We sent a 6-digit code to <strong>{challenge.emailHint}</strong>.</>}
      </p>
      <p className={styles.codeHint}>This is a new device for your account. After this, it’ll be remembered and you won’t need a code here again.</p>

      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      <form onSubmit={submit} className={styles.form}>
        <label className={styles.field}>
          <span>{isApp ? 'CODE (OR A BACKUP CODE)' : 'SIGN-IN CODE'}</span>
          <input
            className={styles.codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={isApp ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={isApp ? 20 : 7}
            autoFocus
            required
          />
        </label>
        <button type="submit" className={styles.submit} disabled={busy || code.trim().length < 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </form>

      <p className={styles.toggle}>
        {!isApp && (
          cooldown > 0
            ? <span>Didn’t get it? You can resend in {cooldown}s · </span>
            : <><button onClick={resend}>Resend code</button> · </>
        )}
        <button onClick={onBack}>Back to sign in</button>
      </p>
      {!isApp && (
        <p className={styles.codeFooter}>Check spam too. Still nothing? An admin can let you in without a code.</p>
      )}
    </>
  );
}
