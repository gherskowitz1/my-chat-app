import { useState, useMemo, useCallback } from 'react';

// Finds the @query currently being typed right before the cursor, e.g.
// "hey @gar" with the cursor at the end -> { query: "gar", start: 4 }.
// Requires the @ to be at the start of the text or after whitespace so an
// email address like foo@bar.com doesn't pop the suggestion list.
function findMentionQuery(text, cursor) {
  const upToCursor = text.slice(0, cursor);
  const match = upToCursor.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (!match) return null;
  return { query: match[1], start: cursor - match[1].length - 1 };
}

export function useMentionAutocomplete(users) {
  const [active, setActive] = useState(null); // { query, start } | null
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (active === null) return [];
    const q = active.query.toLowerCase();
    return users.filter((u) => u.username.toLowerCase().startsWith(q)).slice(0, 6);
  }, [active, users]);

  const updateFromCursor = useCallback((text, cursor) => {
    setActive(findMentionQuery(text, cursor));
    setActiveIndex(0);
  }, []);

  const close = useCallback(() => setActive(null), []);

  const moveActiveIndex = useCallback((delta) => {
    setActiveIndex((i) => {
      const count = suggestions.length;
      if (count === 0) return 0;
      return (i + delta + count) % count;
    });
  }, [suggestions.length]);

  // Replaces the in-progress @query with the chosen username, returning the
  // new full text plus where the cursor should end up — or null if there's
  // no active query to apply it to.
  const applySuggestion = useCallback((text, username) => {
    if (active === null) return null;
    const before = text.slice(0, active.start);
    const afterQuery = active.start + 1 + active.query.length;
    const after = text.slice(afterQuery);
    const insertion = `@${username} `;
    return { text: before + insertion + after, cursor: (before + insertion).length };
  }, [active]);

  return {
    isOpen: active !== null && suggestions.length > 0,
    suggestions,
    activeIndex,
    updateFromCursor,
    moveActiveIndex,
    close,
    applySuggestion,
  };
}
