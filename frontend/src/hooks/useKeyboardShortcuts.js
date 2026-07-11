import { useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'crows_nest_shortcuts';

export const DEFAULT_SHORTCUTS = {
  toggleMute:   { label: 'Toggle Mute',        key: 'm',      description: 'Mute / unmute your microphone' },
  toggleDeafen: { label: 'Toggle Deafen',       key: 'd',      description: 'Deafen / undeafen (mute all audio)' },
  pushToTalk:   { label: 'Push to Talk',        key: ' ',      description: 'Hold to temporarily unmute' },
  leaveVoice:   { label: 'Leave Voice Channel', key: 'escape', description: 'Disconnect from voice' },
};

export function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_SHORTCUTS, ...Object.fromEntries(
      Object.entries(DEFAULT_SHORTCUTS).map(([id, def]) => [
        id, { ...def, key: saved[id]?.key ?? def.key }
      ])
    )};
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts) {
  const minimal = Object.fromEntries(
    Object.entries(shortcuts).map(([id, s]) => [id, { key: s.key }])
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
}

export function formatKey(key) {
  if (key === ' ') return 'Space';
  if (key === 'escape') return 'Esc';
  return key.toUpperCase();
}

/**
 * useKeyboardShortcuts
 * @param {Object} handlers - { toggleMute, toggleDeafen, pushToTalk, leaveVoice }
 * @param {boolean} active - only listen when in a voice channel
 */
export function useKeyboardShortcuts(handlers, active = false) {
  const handlersRef = useRef(handlers);
  const pttActiveRef = useRef(false);

  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  useEffect(() => {
    if (!active) return;

    const shortcuts = loadShortcuts();

    const onKeyDown = (e) => {
      // Don't fire when typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      const key = e.key.toLowerCase();

      if (key === shortcuts.pushToTalk.key && !pttActiveRef.current) {
        pttActiveRef.current = true;
        handlersRef.current.pushToTalk?.(true);
        return;
      }
      if (e.repeat) return; // ignore held keys for other shortcuts

      if (key === shortcuts.toggleMute.key) {
        e.preventDefault();
        handlersRef.current.toggleMute?.();
      } else if (key === shortcuts.toggleDeafen.key) {
        e.preventDefault();
        handlersRef.current.toggleDeafen?.();
      } else if (key === shortcuts.leaveVoice.key) {
        e.preventDefault();
        handlersRef.current.leaveVoice?.();
      }
    };

    const onKeyUp = (e) => {
      const shortcuts = loadShortcuts();
      if (e.key.toLowerCase() === shortcuts.pushToTalk.key && pttActiveRef.current) {
        pttActiveRef.current = false;
        handlersRef.current.pushToTalk?.(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [active]);
}
