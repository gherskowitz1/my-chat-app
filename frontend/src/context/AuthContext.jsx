import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { getDeviceToken, setDeviceToken, deviceLabel, sessionHasDevice } from '../utils/trustedDevice';

const AuthContext = createContext(null);

// Helper — also save token to Electron's native store when running in desktop app
function persistToken(token) {
  localStorage.setItem('token', token);
  if (typeof window.electron?.saveToken === 'function') {
    window.electron.saveToken(token);
  }
}

function clearToken() {
  localStorage.removeItem('token');
  if (typeof window.electron?.clearToken === 'function') {
    window.electron.clearToken();
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If running in Electron, listen for the native-stored token to be restored
    if (window.electron?.onRestoreToken) {
      window.electron.onRestoreToken((token) => {
        if (token && !localStorage.getItem('token')) {
          localStorage.setItem('token', token);
        }
      });
    }

    // Small delay to allow token:restore IPC to fire before we check
    const init = () => {
      const token = localStorage.getItem('token');
      if (token) {
        api.get('/auth/me')
          .then((data) => {
            setUser(data);
            // Signed in from before two-step sign-in existed: make this
            // device trusted now, rather than asking for a code on the day
            // the feature ships (see adoptDevice on the server).
            if (!sessionHasDevice(token)) {
              api.post('/auth/devices/adopt', { deviceLabel: deviceLabel() })
                .then((d) => { persistToken(d.token); setDeviceToken(d.deviceToken); })
                .catch(() => {});
            }
          })
          .catch(() => clearToken())
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    };

    // Give Electron 200ms to inject the restored token before checking
    const isElectron = !!window.electron;
    if (isElectron) {
      setTimeout(init, 200);
    } else {
      init();
    }
  }, []);

  const finishSignIn = (data) => {
    persistToken(data.token);
    setDeviceToken(data.deviceToken);
    setUser(data.user);
    return data.user;
  };

  // Returns { mfaRequired: true, challengeId, method, emailHint } when this
  // device isn't trusted yet — the caller then asks for the code and calls
  // verifyLogin. Otherwise signs straight in.
  const login = async (email, password) => {
    const data = await api.post('/auth/login', {
      email, password, deviceToken: getDeviceToken(), deviceLabel: deviceLabel(),
    });
    if (data.mfaRequired) return data;
    finishSignIn(data);
    return { mfaRequired: false };
  };

  const verifyLogin = async (challengeId, code) => {
    const data = await api.post('/auth/login/verify', { challengeId, code, deviceLabel: deviceLabel() });
    // Signed in with a one-time backup code (lost phone?) — say how many are
    // left, so nobody runs out without noticing.
    if (typeof data.backupCodesLeft === 'number') {
      setTimeout(() => alert(
        `You used a backup code — ${data.backupCodesLeft} left. ` +
        'If you’ve lost your authenticator app, set it up again (or make new backup codes) in User Settings > Account.'
      ), 300);
    }
    return finishSignIn(data);
  };

  const resendLoginCode = (challengeId) => api.post('/auth/login/resend', { challengeId });

  const signup = async (username, email, password, inviteCode) => {
    const data = await api.post('/auth/signup', { username, email, password, inviteCode, deviceLabel: deviceLabel() });
    return finishSignIn(data);
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const updateAvatar = async (avatarUrl) => {
    const updated = await api.patch('/auth/avatar', { avatarUrl });
    setUser(updated);
    return updated;
  };

  const updateUsername = async (username) => {
    const data = await api.patch('/auth/username', { username });
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const updatePassword = async (currentPassword, newPassword) => {
    const data = await api.patch('/auth/password', { currentPassword, newPassword });
    persistToken(data.token);
  };

  const updateAvatarColor = async (avatarColor) => {
    const updated = await api.patch('/auth/avatar-color', { avatarColor });
    setUser(updated);
    return updated;
  };

  const deleteAccount = async (password) => {
    await api.delete('/auth/me', { password });
    logout();
  };

  const updateStatusText = async (statusText) => {
    const data = await api.patch('/auth/status-text', { statusText });
    setUser((u) => (u ? { ...u, status_text: data.statusText } : u));
    return data.statusText;
  };

  // Pass null/'' to unlink. A linked account's own current_game is refreshed
  // separately by the game-presence poll job's presence:playing broadcast,
  // not returned here.
  const linkSteam = async (steamId) => {
    const data = await api.patch('/auth/steam-id', { steamId });
    setUser((u) => (u ? { ...u, steam_id: data.steamId, current_game: null } : u));
    return data.steamId;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLogin, resendLoginCode, signup, logout, updateAvatar, updateUsername, updatePassword, updateAvatarColor, updateStatusText, linkSteam, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
