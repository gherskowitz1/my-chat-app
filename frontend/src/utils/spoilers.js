// Spoiler tags — ||hidden text||, the same syntax Discord uses. Rendered as
// a click-to-reveal block in Message.jsx; everywhere a message is shown
// *outside* the message itself (reply previews, toasts, desktop
// notifications, search results) uses maskSpoilers so the hidden part never
// leaks there. src/socket/index.js masks push notification bodies the same
// way on the server.

// Non-greedy, may span lines, needs at least one character inside.
export const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g;

// Fixed-width block regardless of the spoiler's length, so even how long
// the hidden text is doesn't give anything away.
export const SPOILER_MASK = '▒▒▒▒▒';

export function maskSpoilers(text) {
  return text ? text.replace(SPOILER_RE, SPOILER_MASK) : text;
}

// For link-preview extraction — a spoilered link shouldn't get an embed
// card that shows its title/thumbnail in plain view.
export function stripSpoilers(text) {
  return text ? text.replace(SPOILER_RE, ' ') : text;
}
