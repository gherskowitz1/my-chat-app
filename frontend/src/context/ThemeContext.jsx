import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = 'crowsnest_theme';
const ACCENT_STORAGE_KEY = 'crowsnest_accent';

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'dark');
  // Layers on top of light/dark (data-accent), same relationship Discord's
  // own theme picker uses — pick a base look, then a color independently.
  const [accent, setAccentState] = useState(() => localStorage.getItem(ACCENT_STORAGE_KEY) || 'blurple');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const setAccent = useCallback((next) => {
    setAccentState(next);
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
