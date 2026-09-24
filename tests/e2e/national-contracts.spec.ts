import { test, expect } from '@playwright/test';
import { matchesStudioQuery, studioMonthlyAmount } from '../../src/studio-search';
import { datePartsInTimeZone, isVenueOpenNow } from '../../src/time';
import { venuePoint } from '../../src/geo';
import type { MakeResource, Venue } from '../../src/types';

test.describe('national and studio data contracts', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'pure contract checks run once');
  });

  test('structured studio queries do not treat unknown facts as matches', () => {
    const studio: MakeResource = {
      id: 'fixture-studio', name: 'Brunswick Print Studio', resourceType: 'studio', suburb: 'Brunswick',
      address: '1 Fixture Street', summary: 'A quiet shared printmaking room', website: 'https://fixture.example.org',
      sourceName: 'Fixture', sourceType: 'official', lastVerified: '2026-09-01', priceAmount: 450, pricePeriod: 'month',
      practiceTypes: ['printmaking'], features: { quiet: true, sink: true, 'natural-light': true },
    };
    expect(matchesStudioQuery(studio, 'Brunswick printmaking')).toBe(true);
    expect(matchesStudioQuery(studio, 'quiet studio natural light')).toBe(true);
    expect(matchesStudioQuery(studio, 'under $500 month')).toBe(true);
    expect(matchesStudioQuery(studio, '24/7')).toBe(false);
    expect(studioMonthlyAmount(studio)).toBe(450);
  });

  test('venue local time handles half-hour offsets and national coordinates', () => {
    const adelaide = datePartsInTimeZone(new Date('2026-01-01T14:00:00Z'), 'Australia/Adelaide');
    const perth = datePartsInTimeZone(new Date('2026-01-01T14:00:00Z'), 'Australia/Perth');
    expect(adelaide.iso).toBe('2026-01-02');
    expect(perth.iso).toBe('2026-01-01');

    const venue: Venue = {
      id: 'fixture-adelaide', name: 'Fixture Adelaide', kind: 'independent', suburb: 'Adelaide', address: '1 Test Street',
      stateCode: 'SA', countryCode: 'AU', timeZone: 'Australia/Adelaide', hoursVerified: true, hours: { '5': [0, 1440] },
      website: 'https://fixture.example.org', lat: -34.9285, lng: 138.6007,
    };
    expect(isVenueOpenNow(venue, new Date('2026-01-02T00:30:00Z'))).toBe(true);
    expect(venuePoint(venue)).toEqual([-34.9285, 138.6007]);
  });
});
