import { useEffect, useRef } from 'react';

const PREFIX = 'crowsnest_draft_';

// Persists the message-box text per channel/DM so switching away and back
// doesn't lose what you were writing — restores on `key` change, and saves
// whatever was typed for the *previous* key right before switching away
// from it (or on unmount). Call `clearDraft()` once a message is actually
// sent so it doesn't reappear next time.
export function useDraft(key, input, setInput) {
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    const saved = localStorage.getItem(PREFIX + key);
    setInput(saved || '');

    return () => {
      const current = inputRef.current;
      if (current?.trim()) localStorage.setItem(PREFIX + key, current);
      else localStorage.removeItem(PREFIX + key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const clearDraft = () => localStorage.removeItem(PREFIX + key);

  return { clearDraft };
}
