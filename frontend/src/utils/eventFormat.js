// Shared wording for Game Night events (EventsPanel, ChatLayout's toasts).

export function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
}

// "Every Friday at 10:00 PM" — in the viewer's own time zone, from one of
// the series' dates. null for a one-off event.
export function describeRecurrence(recurrence, startsAt) {
  if (!recurrence) return null;
  const start = new Date(startsAt);
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const weekday = start.toLocaleDateString(undefined, { weekday: 'long' });
  if (recurrence === 'weekly') return `Every ${weekday} at ${time}`;
  if (recurrence === 'biweekly') return `Every other ${weekday} at ${time}`;
  if (recurrence === 'monthly') return `Monthly on the ${ordinal(start.getDate())} at ${time}`;
  return null;
}
