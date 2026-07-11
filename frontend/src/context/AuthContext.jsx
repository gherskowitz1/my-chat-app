import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

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
          .then((data) => setUser(data))
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

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const signup = async (username, email, password) => {
    const data = await api.post('/auth/signup', { username, email, password });
    persistToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
