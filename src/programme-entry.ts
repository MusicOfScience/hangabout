import './programme.css';

import { loadDataset } from './data/load';
import { datePartsInTimeZone, DEFAULT_TIME_ZONE } from './time';
import type { ProgrammeEvent, Venue } from './types';

type ProgrammeWindow = 'tonight' | 'week' | 'all';

const dataset = loadDataset();
const venueById = new Map(dataset.venues.map(venue => [venue.id, venue]));
let selectedWindow: ProgrammeWindow = 'week';

mountWhenReady();

function mountWhenReady(attempt = 0) {
  const filters = document.querySelector<HTMLElement>('#seePanel .filters');
  if (!filters) {
    if (attempt < 30) requestAnimationFrame(() => mountWhenReady(attempt + 1));
    return;
  }
  if (document.querySelector('#programmePanel')) return;

  filters.insertAdjacentHTML('afterend', `
    <section id="programmePanel" class="programme-panel" aria-labelledby="programmeHeading">
      <div class="programme-head">
        <div>
          <p class="eyebrow">live programme</p>
          <h2 id="programmeHeading">happening soon.</h2>
        </div>
        <p class="programme-trust">First-party verified where published. Deliberately incomplete rather than guessed.</p>
      </div>
      <div class="programme-controls" role="group" aria-label="programme time window">
        <button class="chip" data-programme-window="tonight" aria-pressed="false">tonight</button>
        <button class="chip is-active" data-programme-window="week" aria-pressed="true">next 7 days</button>
        <button class="chip" data-programme-window="all" aria-pressed="false">all upcoming</button>
      </div>
      <div class="programme-summary"><strong id="programmeCount">0</strong> <span id="programmeCountLabel">verified events</span></div>
      <div id="programmeList" class="programme-list" aria-live="polite"></div>
    </section>
  `);

  const panel = document.querySelector<HTMLElement>('#programmePanel')!;
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-programme-window]');
    if (!button) return;
    selectedWindow = button.dataset.programmeWindow as ProgrammeWindow;
    panel.querySelectorAll<HTMLButtonElement>('[data-programme-window]').forEach(item => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  });

  document.querySelector<HTMLInputElement>('#searchInput')?.addEventListener('input', render);
  document.querySelector<HTMLSelectElement>('#venueKind')?.addEventListener('change', render);
  render();
}

function render() {
  const list = document.querySelector<HTMLElement>('#programmeList');
  const count = document.querySelector<HTMLElement>('#programmeCount');
  const label = document.querySelector<HTMLElement>('#programmeCountLabel');
  if (!list || !count || !label) return;

  const query = normalise(document.querySelector<HTMLInputElement>('#searchInput')?.value ?? '');
  const venueKind = document.querySelector<HTMLSelectElement>('#venueKind')?.value ?? 'all';
  const rows = dataset.programmeEvents
    .filter(event => event.status !== 'cancelled' || eventIsUpcoming(event))
    .filter(eventIsUpcoming)
    .filter(event => inSelectedWindow(event, selectedWindow))
    .filter(event => {
      const venue = venueById.get(event.venueId);
      if (!venue) return false;
      if (venueKind !== 'all' && venue.kind !== venueKind) return false;
      if (!query) return true;
      return normalise([
        event.title,
        event.eventType,
        event.people?.map(person => `${person.name} ${person.role}`).join(' ') ?? '',
        event.tags?.join(' ') ?? '',
        venue.name,
        venue.suburb,
      ].join(' ')).includes(query);
    })
    .sort(compareProgrammeEvents);

  count.textContent = String(rows.length);
  label.textContent = selectedWindow === 'tonight'
    ? 'verified for tonight'
    : selectedWindow === 'week'
      ? 'verified in the next 7 days'
      : 'verified upcoming events';

  list.innerHTML = rows.length
    ? rows.map(programmeCard).join('')
    : emptyMessage(selectedWindow);
}

function programmeCard(event: ProgrammeEvent): string {
  const venue = venueById.get(event.venueId)!;
  const people = event.people?.slice(0, 4).map(person =>
    `<span class="programme-person">${escapeHtml(person.name)} · ${escapeHtml(person.role)}</span>`
  ).join('') ?? '';
  const remainingPeople = Math.max(0, (event.people?.length ?? 0) - 4);
  const registration = registrationLabel(event);
  const price = event.price ?? (event.admission === 'free' ? 'free' : event.admission === 'paid' ? 'paid' : '');
  const status = event.status && event.status !== 'scheduled' ? event.status : '';
  const type = event.eventType.replaceAll('-', ' ');

  return `
    <article class="programme-card${event.status === 'cancelled' ? ' is-cancelled' : ''}" id="programme-${escapeHtml(event.id)}">
      <div class="programme-card-top">
        <span class="programme-type">${escapeHtml(type)}</span>
        <time datetime="${escapeHtml(event.startDate)}">${escapeHtml(formatWhen(event))}</time>
      </div>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="programme-venue"><strong>${escapeHtml(venue.name)}</strong> · ${escapeHtml(venue.suburb)}</p>
      ${event.locationNote ? `<p class="programme-location">${escapeHtml(event.locationNote)}</p>` : ''}
      ${people ? `<div class="programme-people">${people}${remainingPeople ? `<span class="programme-person">+${remainingPeople} more</span>` : ''}</div>` : ''}
      <div class="programme-badges">
        ${price ? `<span>${escapeHtml(price)}</span>` : ''}
        ${registration ? `<span>${escapeHtml(registration)}</span>` : ''}
        ${status ? `<span>${escapeHtml(status)}</span>` : ''}
      </div>
      ${event.audienceNote ? `<p class="programme-note">${escapeHtml(event.audienceNote)}</p>` : ''}
      ${event.materialsNote ? `<p class="programme-note">${escapeHtml(event.materialsNote)}</p>` : ''}
      <a class="programme-source" href="${safeUrl(event.sourceUrl)}" target="_blank" rel="noopener">official details ↗</a>
    </article>
  `;
}

function registrationLabel(event: ProgrammeEvent): string {
  const registration = event.registration;
  if (!registration) return '';
  if (registration.status === 'fully-booked') return 'fully booked';
  if (registration.status === 'sold-out') return 'sold out';
  if (registration.status === 'waitlist') return 'waitlist';
  if (registration.status === 'closed') return 'bookings closed';
  if (registration.required) return 'bookings required';
  return '';
}

function eventIsUpcoming(event: ProgrammeEvent, nowDate = new Date()): boolean {
  const venue = venueById.get(event.venueId);
  const timeZone = venue?.timeZone ?? DEFAULT_TIME_ZONE;
  const now = datePartsInTimeZone(nowDate, timeZone);
  const finalDate = event.endDate ?? event.startDate;
  if (finalDate < now.iso) return false;
  if (event.startDate > now.iso || finalDate > now.iso) return true;

  const nowMinutes = now.hour * 60 + now.minute;
  const endMinutes = parseTime(event.endTime);
  if (endMinutes != null) return endMinutes > nowMinutes;
  const startMinutes = parseTime(event.startTime);
  // With no published end time, keep the event upcoming until it starts rather than
  // inventing a duration and implying it is still running later.
  return startMinutes == null || startMinutes >= nowMinutes;
}

function inSelectedWindow(event: ProgrammeEvent, window: ProgrammeWindow): boolean {
  if (window === 'all') return true;
  const venue = venueById.get(event.venueId);
  const timeZone = venue?.timeZone ?? DEFAULT_TIME_ZONE;
  const today = datePartsInTimeZone(new Date(), timeZone).iso;
  if (window === 'week') return event.startDate >= today && event.startDate <= addDays(today, 6);

  if (event.startDate !== today) return false;
  const start = parseTime(event.startTime);
  const end = parseTime(event.endTime) ?? start;
  return start != null && end != null && end >= 16 * 60;
}

function compareProgrammeEvents(a: ProgrammeEvent, b: ProgrammeEvent): number {
  const byDate = a.startDate.localeCompare(b.startDate);
  if (byDate) return byDate;
  const byTime = (a.startTime ?? '23:59').localeCompare(b.startTime ?? '23:59');
  return byTime || a.title.localeCompare(b.title);
}

function formatWhen(event: ProgrammeEvent): string {
  const date = parseIsoDate(event.startDate);
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
  if (!event.startTime) return dateLabel;
  const start = formatClock(event.startTime);
  const end = event.endTime ? formatClock(event.endTime) : '';
  return `${dateLabel} · ${start}${end ? `–${end}` : ''}`;
}

function formatClock(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date).replace(' am', 'am').replace(' pm', 'pm');
}

function parseTime(value?: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour! * 60 + minute! : null;
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalise(value: string): string {
  return value.toLocaleLowerCase('en-AU').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function emptyMessage(window: ProgrammeWindow): string {
  const text = window === 'tonight'
    ? 'Nothing verified for tonight yet.'
    : window === 'week'
      ? 'Nothing verified in this window yet.'
      : 'No upcoming timed programme is verified yet.';
  return `<div class="programme-empty"><strong>${text}</strong><span>That means our maintained coverage is incomplete, not that Melbourne has stopped making art.</span></div>`;
}
