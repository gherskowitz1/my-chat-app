// Birthdays on the client — what the member list, profile cards and the
// day-before heads-up show. Uses the viewer's own calendar date (so
// "today" is today where you are); the #general post itself goes out at
// 9am the birthday person's time (server: jobs/birthdays.js). Feb 29
// birthdays count as Feb 28 in non-leap years, matching the server.

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function isBirthdayOn(person, date) {
  if (!person?.birthday_month || !person?.birthday_day) return false;
  let day = person.birthday_day;
  if (person.birthday_month === 2 && day === 29 && !isLeap(date.getFullYear())) day = 28;
  return date.getMonth() + 1 === person.birthday_month && date.getDate() === day;
}

export const isBirthdayToday = (person, now = new Date()) => isBirthdayOn(person, now);

export function isBirthdayTomorrow(person, now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return isBirthdayOn(person, tomorrow);
}

// "March 14"
export function formatBirthday(month, day) {
  return new Date(2000, month - 1, day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}
