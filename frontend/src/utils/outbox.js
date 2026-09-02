// Persists not-yet-confirmed sent messages so they survive a dropped
// connection or a page reload — SocketContext retries every pending entry
// as soon as the socket reconnects (including the very first connect after
// a fresh page load), and each retry carries the same clientId so the
// server's ON CONFLICT DO NOTHING makes a duplicate delivery harmless.
const STORAGE_KEY = 'crowsnest_outbox';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAll(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* storage full/unavailable */ }
}

export function addPending(entry) {
  writeAll([...readAll(), entry]);
}

export function removePending(clientId) {
  writeAll(readAll().filter((e) => e.clientId !== clientId));
}

export function getPending() {
  return readAll();
}

export function getPendingFor(type, targetId) {
  return readAll().filter((e) => e.type === type && e.targetId === targetId);
}

export function newClientId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Merges a server-confirmed message into a messages array: replaces the
// matching optimistic (pending) bubble in place if one exists (by
// clientId), no-ops if the real row is already present (a duplicate
// ack/broadcast race), or appends it as a normal new message otherwise —
// the same path a message from another user already takes.
export function reconcileMessage(prevMessages, confirmed) {
  const pendingIndex = confirmed.client_id
    ? prevMessages.findIndex((m) => m.client_id && m.client_id === confirmed.client_id && m.id !== confirmed.id)
    : -1;
  if (pendingIndex !== -1) {
    const next = [...prevMessages];
    const prevReactions = next[pendingIndex].reactions;
    next[pendingIndex] = { ...confirmed, reactions: prevReactions?.length ? prevReactions : (confirmed.reactions || []) };
    return next;
  }
  if (prevMessages.some((m) => m.id === confirmed.id)) return prevMessages;
  return [...prevMessages, confirmed];
}
