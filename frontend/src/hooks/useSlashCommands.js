import { useEffect, useState } from 'react';
import { commandsFor } from '../utils/slashCommands';

// Autocomplete for slash commands — the list pops up while the composer
// holds just "/" plus a partial command name (no space yet), and works like
// the @mention dropdown: arrows to move, Enter/Tab to fill in the command,
// Escape to dismiss.
export function useSlashCommands({ input, setInput, inputRef, isDM }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState(null);

  const match = input.match(/^\/(\w*)$/);
  const suggestions = match
    ? commandsFor({ isDM }).filter((c) => c.name.startsWith(match[1].toLowerCase()))
    : [];
  const isOpen = suggestions.length > 0 && dismissedFor !== input;

  useEffect(() => { setActiveIndex(0); }, [match?.[1]]);

  const select = (name) => {
    const next = `/${name} `;
    setInput(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = next.length;
    });
  };

  // Returns true if it handled the key (so the caller shouldn't also send).
  const handleKeyDown = (e) => {
    if (!isOpen) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % suggestions.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return true; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      select(suggestions[Math.min(activeIndex, suggestions.length - 1)].name);
      return true;
    }
    if (e.key === 'Escape') { e.preventDefault(); setDismissedFor(input); return true; }
    return false;
  };

  return { isOpen, suggestions, activeIndex, select, handleKeyDown };
}
