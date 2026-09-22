import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'crows_nest_shortcuts';

const combo = (key, mods = {}) => ({ key, ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt });

// 'group' controls which listener a shortcut is checked by — 'voice' ones
// only fire inside useKeyboardShortcuts (gated on actually being in a call),
// 'app' ones fire everywhere via useGlobalShortcuts below.
export const DEFAULT_SHORTCUTS = {
  toggleMute:    { label: 'Toggle Mute',         description: 'Mute / unmute your microphone',         group: 'voice', combo: combo('m', { ctrl: true, shift: true }) },
  toggleDeafen:  { label: 'Toggle Deafen',       description: 'Deafen / undeafen (mute all audio)',     group: 'voice', combo: combo('d', { ctrl: true, shift: true }) },
  pushToTalk:    { label: 'Push to Talk',        description: 'Hold to temporarily unmute',             group: 'voice', combo: combo('space') },
  leaveVoice:    { label: 'Leave Voice Channel', description: 'Disconnect from voice',                  group: 'voice', combo: combo('escape') },
  toggleMembers: { label: 'Toggle Member List',  description: 'Show or hide the member list',           group: 'app',   combo: combo('u', { ctrl: true }) },
  toggleSearch:  { label: 'Search',              description: 'Open the message search panel',         group: 'app',   combo: combo('f', { ctrl: true }) },
  toggleFriends: { label: 'Toggle Friends',      description: 'Open the friends panel',                 group: 'app',   combo: combo('f', { ctrl: true, shift: true }) },
  openSettings:  { label: 'Open Settings',       description: 'Open User Settings',                     group: 'app',   combo: combo(',', { ctrl: true }) },
  markAllRead:   { label: 'Mark All Read',       description: 'Clear every unread channel/DM badge',    group: 'app',   combo: combo('escape', { shift: true }) },
  focusComposer:      { label: 'Focus Message Box',  description: 'Jump the cursor into the message box',           group: 'app', combo: combo('/') },
  toggleEmojiPicker:  { label: 'Toggle Emoji Picker', description: 'Open the emoji picker (channels & DMs)',          group: 'app', combo: combo('e', { ctrl: true }) },
  toggleGifPicker:    { label: 'Toggle GIF Picker',   description: 'Open the GIF picker (channels & DMs)',            group: 'app', combo: combo('g', { ctrl: true }) },
  togglePollComposer: { label: 'Create a Poll',       description: 'Open the poll composer (channels only)',          group: 'app', combo: combo('p', { ctrl: true }) },
};

export function loadShortcuts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const merged = {};
    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      merged[id] = { ...def, combo: saved[id]?.combo || def.combo };
    }
    return merged;
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts) {
  const minimal = Object.fromEntries(
    Object.entries(shortcuts).map(([id, s]) => [id, { combo: s.combo }])
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
}

export function formatCombo(c) {
  if (!c) return '';
  const parts = [];
  if (c.ctrl) parts.push('Ctrl');
  if (c.shift) parts.push('Shift');
  if (c.alt) parts.push('Alt');
  parts.push(c.key === 'space' ? 'Space' : c.key === 'escape' ? 'Esc' : c.key.toUpperCase());
  return parts.join('+');
}

function normalizedKey(e) {
  const k = e.key.toLowerCase();
  return k === ' ' ? 'space' : k;
}

function comboMatches(c, e) {
  if (!c) return false;
  return c.key === normalizedKey(e)
    && !!c.ctrl === (e.ctrlKey || e.metaKey)
    && !!c.shift === e.shiftKey
    && !!c.alt === e.altKey;
}

/**
 * useKeyboardShortcuts — the 4 voice-call actions (mute/deafen/PTT/leave).
 * Only listens while `active` (i.e. actually connected to a voice channel).
 * @param {Object} handlers - { toggleMute, toggleDeafen, pushToTalk, leaveVoice }
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

      if (comboMatches(shortcuts.pushToTalk.combo, e) && !pttActiveRef.current) {
        pttActiveRef.current = true;
        handlersRef.current.pushToTalk?.(true);
        return;
      }
      if (e.repeat) return; // ignore held keys for other shortcuts

      if (comboMatches(shortcuts.toggleMute.combo, e)) {
        e.preventDefault();
        handlersRef.current.toggleMute?.();
      } else if (comboMatches(shortcuts.toggleDeafen.combo, e)) {
        e.preventDefault();
        handlersRef.current.toggleDeafen?.();
      } else if (comboMatches(shortcuts.leaveVoice.combo, e)) {
        e.preventDefault();
        handlersRef.current.leaveVoice?.();
      }
    };

    const onKeyUp = (e) => {
      const shortcuts = loadShortcuts();
      if (comboMatches(shortcuts.pushToTalk.combo, e) && pttActiveRef.current) {
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

/**
 * useGlobalShortcuts — app-wide actions (toggle member list, search, etc.),
 * always listening regardless of whether a voice channel is joined.
 * @param {Object} handlers - keyed by the DEFAULT_SHORTCUTS id, e.g. { toggleMembers, toggleSearch, ... }
 */
export function useGlobalShortcuts(handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      const shortcuts = loadShortcuts();
      for (const [id, s] of Object.entries(shortcuts)) {
        if (s.group !== 'app') continue;
        if (comboMatches(s.combo, e)) {
          e.preventDefault();
          handlersRef.current[id]?.();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
