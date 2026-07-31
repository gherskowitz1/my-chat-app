// Shared @everyone plumbing — a synthetic "user" injected into the mention
// candidate list for channels (not DMs, where it wouldn't mean anything with
// only two participants) so it flows through the same autocomplete,
// highlighting, and notification-matching code paths as a real @username.
export const EVERYONE_USER = { id: 'everyone', username: 'everyone', avatar_color: '#ed4245' };

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True if `content` @mentions this specific username, or @everyone.
export function mentionsUser(content, username) {
  if (!username) return false;
  const re = new RegExp(`@(?:${escapeRegExp(username)}|everyone)\\b`, 'i');
  return re.test(content);
}
