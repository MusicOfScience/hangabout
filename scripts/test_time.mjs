import assert from 'node:assert/strict';
import { weekendDates, openingWithinDays } from '../lib/time.js';

assert.deepEqual(weekendDates('2026-08-19', 3), ['2026-08-22', '2026-08-23']);
assert.deepEqual(weekendDates('2026-08-22', 6), ['2026-08-22', '2026-08-23']);
assert.deepEqual(weekendDates('2026-08-23', 0), ['2026-08-22', '2026-08-23']);

const opening = { date: '2026-08-19', start: '18:00', end: '20:00' };
assert.equal(openingWithinDays(opening, { date: '2026-08-19', minutes: 17 * 60 }), true);
assert.equal(openingWithinDays(opening, { date: '2026-08-19', minutes: 19 * 60 }), true);
assert.equal(openingWithinDays(opening, { date: '2026-08-19', minutes: 20 * 60 }), false);
assert.equal(openingWithinDays({ ...opening, date: '2026-08-26' }, { date: '2026-08-19', minutes: 0 }), true);
assert.equal(openingWithinDays({ ...opening, date: '2026-08-27' }, { date: '2026-08-19', minutes: 0 }), false);

console.log('time semantics passed');
