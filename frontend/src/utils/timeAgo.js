// How long ago a ms timestamp was, as a short duration ("5m", "2h 5m", "3d")
// — used for the "Away for X" timer, re-computed on each render rather than
// carrying its own clock.
export function formatElapsed(sinceMs) {
  const diffMs = Date.now() - sinceMs;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remMinutes = minutes % 60;
    return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Short relative-time label for an offline member's last-seen timestamp —
// deliberately coarse (minutes/hours/days), not a live-ticking clock.
export function formatLastSeen(dateString) {
  if (!dateString) return null;
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
