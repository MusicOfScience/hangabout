#!/usr/bin/env python3
import json
from pathlib import Path
from urllib.parse import urlparse

PATH = Path('data/known-art-places.json')
REQUIRED = {'id','name','locality','lat','lng','placeType','precision','sourceName','sourceUrl','lastVerified'}
ALLOWED_PRECISION = {'locality','exact','building'}

rows = json.loads(PATH.read_text())
assert isinstance(rows, list), 'known-art-places.json must be a list'
ids = set()
for index, row in enumerate(rows):
    missing = REQUIRED - set(row)
    assert not missing, f'row {index} missing {sorted(missing)}'
    assert row['id'] not in ids, f'duplicate id {row["id"]}'
    ids.add(row['id'])
    assert isinstance(row['name'], str) and row['name'].strip(), f'bad name at {index}'
    assert isinstance(row['locality'], str) and row['locality'].strip(), f'bad locality at {index}'
    assert isinstance(row['lat'], (int, float)) and -90 <= row['lat'] <= 90, f'bad lat at {index}'
    assert isinstance(row['lng'], (int, float)) and -180 <= row['lng'] <= 180, f'bad lng at {index}'
    assert row['precision'] in ALLOWED_PRECISION, f'bad precision at {index}'
    parsed = urlparse(row['sourceUrl'])
    assert parsed.scheme in {'http','https'} and parsed.netloc, f'bad sourceUrl at {index}'

print(f'known art places valid: {len(rows)} records')
