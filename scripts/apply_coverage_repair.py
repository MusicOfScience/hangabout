#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return json.loads((ROOT / rel).read_text(encoding='utf-8'))


def write(rel, value):
    (ROOT / rel).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

# Current/upcoming exhibitions: repair known omissions from first-party sources.
events = read('data/events-current.json')
by_id = {item['id']: item for item in events}
repairs = [
    {
        'id': 'apw-impressions-45-years-in-print-2026',
        'venueId': 'australian-print-workshop',
        'title': 'IMPRESSIONS: 45 Years in Print',
        'artists': ['More than 140 Australian Print Workshop alumni artists'],
        'startDate': '2026-11-06',
        'endDate': '2027-02-28',
        'endDatePrecision': 'month',
        'eventType': 'group exhibition',
        'tags': ['printmaking', 'fundraising exhibition', 'contemporary Australian printmaking', '45th anniversary'],
        'admission': 'unknown',
        'opening': {'date': '2026-11-06', 'start': '18:00'},
        'sourceName': 'Australian Print Workshop',
        'sourceType': 'official',
        'sourceUrl': 'https://www.australianprintworkshop.com/projects/special-projects/impressions-45-years-print',
        'lastVerified': '2026-11-03',
    },
    {
        'id': 'firestation-lindesay-dresdon-2026',
        'venueId': 'firestation-print-studio',
        'title': 'Solo Exhibition',
        'artists': ['Lindesay Dresdon'],
        'startDate': '2026-10-28',
        'endDate': '2026-11-14',
        'eventType': 'solo exhibition',
        'tags': ['printmaking', 'artist-run', 'community print studio'],
        'admission': 'unknown',
        'opening': {'date': '2026-10-29', 'start': '18:00', 'end': '20:00'},
        'sourceName': 'Firestation Print Studio',
        'sourceType': 'official',
        'sourceUrl': 'https://www.fps.org.au/fps-gallery',
        'lastVerified': '2026-11-03',
    },
    {
        'id': 'atw-lara-tilbrook-2026',
        'venueId': 'australian-tapestry-workshop',
        'title': 'Lara Tilbrook (Narungga, Kaurna, Ngarrindjeri)',
        'artists': ['Lara Tilbrook'],
        'startDate': '2026-09-10',
        'endDate': '2026-11-07',
        'eventType': 'solo exhibition',
        'tags': ['textile art', 'tapestry', 'contemporary art'],
        'admission': 'unknown',
        'sourceName': 'Australian Tapestry Workshop',
        'sourceType': 'official',
        'sourceUrl': 'https://www.austapestry.com.au/whats-on/exhibitions',
        'lastVerified': '2026-11-03',
    },
]
existing = {item['id'] for item in events}
for record in repairs:
    by_id[record['id']] = record
events = [by_id[item['id']] for item in events] + [record for record in repairs if record['id'] not in existing]
write('data/events-current.json', events)

programme = read('data/programme-events.json')
for item in programme:
    if item.get('id') == 'apw-impressions-45-years-opening-2026-11-06':
        item['exhibitionId'] = 'apw-impressions-45-years-in-print-2026'
        item['lastVerified'] = '2026-11-03'
write('data/programme-events.json', programme)

venues = read('data/venues.json')
for venue in venues:
    if venue.get('id') == 'firestation-print-studio':
        venue['coverageStatus'] = 'maintained-programme'
        venue['lastVerified'] = '2026-11-03'
        venue['sourceUrl'] = 'https://www.fps.org.au/contact'
        venue['hoursSourceUrl'] = 'https://www.fps.org.au/contact'
write('data/venues.json', venues)

resources = read('data/make-resources.json')
for resource in resources:
    if resource.get('id') == 'firestation-workshop-access':
        resource['website'] = 'https://www.fps.org.au/'
        resource['sourceName'] = 'Firestation Print Studio'
        resource['sourceType'] = 'official'
        resource['lastVerified'] = '2026-11-03'
        resource['studioType'] = 'workshop'
        resource['practiceTypes'] = ['printmaking', 'etching', 'relief printing', 'letterpress']
if not any(r.get('id') == 'troppo-print-studio-open-access' for r in resources):
    resources.append({
        'id': 'troppo-print-studio-open-access',
        'name': 'Troppo Print Studio — open-access screenprinting',
        'resourceType': 'workspace',
        'suburb': 'Coburg',
        'address': '503 Sydney Road, Coburg VIC 3058',
        'summary': 'Artist-run open-access screenprint studio offering workshops, membership access and collaborative printmaking events.',
        'availability': 'membership / workshops',
        'tags': ['screenprinting', 'open access', 'workshops', 'membership', 'artist-run'],
        'website': 'https://www.troppoprintstudio.com/',
        'sourceName': 'Troppo Print Studio',
        'sourceType': 'official',
        'lastVerified': '2026-11-03',
        'studioType': 'workshop',
        'practiceTypes': ['screenprinting'],
        'premisesStatus': 'active',
        'coordinatePrecision': 'building',
    })
write('data/make-resources.json', resources)

indexes = read('sources/official-indexes.json')
index_by_id = {item['venueId']: item for item in indexes}
additions = [
    {
        'venueId': 'australian-print-workshop',
        'name': 'Australian Print Workshop',
        'indexUrl': 'https://www.australianprintworkshop.com/',
        'automationAllowed': True,
        'sameDomainOnly': True,
        'includePathPatterns': ['/apw-gallery/', '/projects/special-projects/'],
    },
    {
        'venueId': 'australian-tapestry-workshop',
        'name': 'Australian Tapestry Workshop',
        'indexUrl': 'https://www.austapestry.com.au/whats-on/exhibitions',
        'automationAllowed': True,
        'sameDomainOnly': True,
        'includePathPatterns': ['/whats-on/exhibitions', '/content/'],
    },
    {
        'venueId': 'firestation-print-studio',
        'name': 'Firestation Print Studio',
        'indexUrl': 'https://www.fps.org.au/fps-gallery',
        'automationAllowed': True,
        'sameDomainOnly': True,
        'includePathPatterns': ['/fps-gallery', '/gallery'],
    },
]
existing_index_ids = {item['venueId'] for item in indexes}
for item in additions:
    index_by_id[item['venueId']] = item
indexes = [index_by_id[item['venueId']] for item in indexes] + [item for item in additions if item['venueId'] not in existing_index_ids]
write('sources/official-indexes.json', indexes)

types_path = ROOT / 'src/types.ts'
types = types_path.read_text(encoding='utf-8')
needle = "  endDate: string;\n  eventType?: string;"
replacement = "  endDate: string;\n  /** Source precision for the closing boundary; month means the exact day is not claimed. */\n  endDatePrecision?: 'day' | 'month' | string;\n  eventType?: string;"
if needle not in types:
    raise SystemExit('types.ts exhibition shape changed; refusing blind patch')
types_path.write_text(types.replace(needle, replacement, 1), encoding='utf-8')

time_path = ROOT / 'src/time.ts'
time = time_path.read_text(encoding='utf-8')
time = time.replace(
    "export function closesWithin(event: Event, days: number, timeZone = DEFAULT_TIME_ZONE): boolean {\n  const today = todayInTimeZone(timeZone);",
    "export function closesWithin(event: Event, days: number, timeZone = DEFAULT_TIME_ZONE): boolean {\n  if (event.endDatePrecision === 'month') return false;\n  const today = todayInTimeZone(timeZone);",
    1,
)
old_sig = "export function formatDateRange(start: string, end: string): string {"
new_sig = "export function formatDateRange(start: string, end: string, endPrecision: 'day' | 'month' | string = 'day'): string {"
if old_sig not in time:
    raise SystemExit('formatDateRange signature changed; refusing blind patch')
time = time.replace(old_sig, new_sig, 1)
old_return = "  return start === end ? fmt.format(parse(start)) : `${fmt.format(parse(start))} — ${fmt.format(parse(end))}`;\n}"
new_return = "  if (endPrecision === 'month') {\n    const endMonth = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parse(end));\n    return `${fmt.format(parse(start))} — ${endMonth}`;\n  }\n  return start === end ? fmt.format(parse(start)) : `${fmt.format(parse(start))} — ${fmt.format(parse(end))}`;\n}"
if old_return not in time:
    raise SystemExit('formatDateRange body changed; refusing blind patch')
time_path.write_text(time.replace(old_return, new_return, 1), encoding='utf-8')

main_path = ROOT / 'src/main.ts'
main = main_path.read_text(encoding='utf-8')
main = main.replace('formatDateRange(event.startDate, event.endDate)', 'formatDateRange(event.startDate, event.endDate, event.endDatePrecision)')
main_path.write_text(main, encoding='utf-8')

test_path = ROOT / 'tests/e2e/current-exhibitions.spec.ts'
tests = test_path.read_text(encoding='utf-8')
marker = "test('APW and Firestation surface current or imminent first-party programmes'"
if marker not in tests:
    tests += """

test('APW and Firestation surface current or imminent first-party programmes', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  await page.goto('/');

  const apw = page.locator('#event-apw-impressions-45-years-in-print-2026');
  await expect(apw).toBeVisible();
  await expect(apw).toContainText('IMPRESSIONS: 45 Years in Print');
  await expect(apw).toContainText('6 Nov 2026 — Feb 2027');

  const firestation = page.locator('#event-firestation-lindesay-dresdon-2026');
  await expect(firestation).toBeVisible();
  await expect(firestation).toContainText('Lindesay Dresdon');
});

test('Troppo is present in all making resources', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-03T00:00:00Z'));
  await page.goto('/?mode=make');
  await page.locator('#makeKind').selectOption('resources');
  await expect(page.locator('#resource-troppo-print-studio-open-access')).toBeVisible();
});
"""
    test_path.write_text(tests, encoding='utf-8')
