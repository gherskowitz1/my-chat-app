// Shared helpers for the :name: custom-emoji syntax, used both for inline
// message text and for reaction values (message_reactions.emoji is a plain
// string column, so a custom-emoji reaction is just stored as ":name:").
export const EMOJI_TOKEN_RE = /:([a-zA-Z0-9_]{2,30}):/g;
const EXACT_TOKEN_RE = /^:([a-zA-Z0-9_]{2,30}):$/;

export function buildEmojiMap(list) {
  return new Map((list || []).map((e) => [e.name.toLowerCase(), e]));
}

// If `value` is exactly a ":name:" token, returns the lowercased name — used
// to detect a custom-emoji reaction (as opposed to a literal unicode emoji).
export function customEmojiName(value) {
  const m = typeof value === 'string' ? EXACT_TOKEN_RE.exec(value) : null;
  return m ? m[1].toLowerCase() : null;
}
