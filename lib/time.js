const DAY_MS = 86_400_000;

export function isoToUtc(dateString) {
  return new Date(`${dateString}T00:00:00Z`);
}

export function dateAdd(dateString, days) {
  return new Date(isoToUtc(dateString).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function dateDiff(from, to) {
  return Math.round((isoToUtc(to) - isoToUtc(from)) / DAY_MS);
}

export function weekendDates(today, weekday) {
  // Sunday belongs to the weekend already in progress.
  const daysUntilSaturday = weekday === 0 ? -1 : (6 - weekday + 7) % 7;
  const saturday = dateAdd(today, daysUntilSaturday);
  return [saturday, dateAdd(saturday, 1)];
}

export function clockStringToMinutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function openingWithinDays(opening, clock, horizonDays = 7) {
  if (!opening) return false;
  const days = dateDiff(clock.date, opening.date);
  if (days < 0 || days > horizonDays) return false;
  if (days === 0 && clockStringToMinutes(opening.end) <= clock.minutes) return false;
  return true;
}
