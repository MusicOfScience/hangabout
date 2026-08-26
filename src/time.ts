import type { Event, Venue } from './types';

const MELBOURNE_TZ = 'Australia/Melbourne';

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';

  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

const weekdayIndex: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function todayMelbourne(): string {
  return dateParts().iso;
}

export function melbourneLabel(): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date()).toLowerCase();
}

export function isEventCurrent(event: Event, iso = todayMelbourne()): boolean {
  return event.startDate <= iso && event.endDate >= iso;
}

export function isEventUpcoming(event: Event, iso = todayMelbourne()): boolean {
  return event.endDate >= iso;
}

export function isVenueOpenNow(venue: Venue): boolean {
  if (!venue.hoursVerified || !venue.hours) return false;
  const now = dateParts();
  const day = weekdayIndex[now.weekday];
  if (day == null) return false;
  const hours = venue.hours[String(day)];
  if (!hours) return false;
  const minutes = now.hour * 60 + now.minute;
  return minutes >= hours[0] && minutes < hours[1];
}

export function isVenueOpenToday(venue: Venue): boolean {
  if (!venue.hoursVerified || !venue.hours) return false;
  const day = weekdayIndex[dateParts().weekday];
  return day != null && Boolean(venue.hours[String(day)]);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

export function closesWithin(event: Event, days: number): boolean {
  const today = todayMelbourne();
  return event.endDate >= today && event.endDate <= addDays(today, days);
}

export function openingWithin(event: Event, days: number): boolean {
  if (!event.opening?.date) return false;
  const today = todayMelbourne();
  return event.opening.date >= today && event.opening.date <= addDays(today, days);
}

export function intersectsThisWeekend(event: Event): boolean {
  const now = dateParts();
  const day = weekdayIndex[now.weekday] ?? 1;
  const today = now.iso;
  const untilSaturday = day === 0 ? -1 : 6 - day;
  const saturday = day === 0 ? addDays(today, -1) : addDays(today, untilSaturday);
  const sunday = addDays(saturday, 1);
  return event.startDate <= sunday && event.endDate >= saturday;
}

export function formatDateRange(start: string, end: string): string {
  const parse = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!));
  };
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  const fmt = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: crossesYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
  return start === end ? fmt.format(parse(start)) : `${fmt.format(parse(start))} — ${fmt.format(parse(end))}`;
}
