"""Fetch a bounded national Wikidata seed list for editorial review (CC0)."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://query.wikidata.org/sparql'
# Directly classified Australian galleries/museums only. Additional classes,
# missing country statements and venues without Wikidata items require other sources.
QUERY = """
SELECT DISTINCT ?item ?itemLabel ?website WHERE {
  VALUES ?kind { wd:Q1007870 wd:Q207694 }
  ?item wdt:P31 ?kind; wdt:P17 wd:Q408.
  OPTIONAL { ?item wdt:P856 ?website }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?item ?website LIMIT 501
"""


def candidates(bindings, reviewed):
    by_item = {}
    for row in bindings[:500]:
        entity = row["item"]["value"]
        qid = entity.rsplit("/", 1)[-1]
        record = by_item.setdefault(qid, {
            "id": qid, "sourceUrl": entity, "matchedVenueId": reviewed.get(qid),
            "name": row["itemLabel"]["value"], "websiteCandidates": [],
        })
        website = row.get("website", {}).get("value")
        if website and website not in record["websiteCandidates"]:
            record["websiteCandidates"].append(website)
    return list(by_item.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    url = ENDPOINT + "?" + urlencode({"query": QUERY, "format": "json"})
    request = Request(url, headers={"User-Agent": "Hangabout/1.0 (https://github.com/MusicOfScience/hangabout)",
                                    "Accept": "application/sparql-results+json"})
    with urlopen(request, timeout=45) as response:
        bindings = json.load(response)["results"]["bindings"]
    if not bindings:
        raise ValueError("Wikidata returned no gallery candidates; review the query")
    reviewed = {venue["wikidataId"]: venue["id"] for path in (ROOT / "data").glob("venues*.json")
                for venue in json.loads(path.read_text()) if venue.get("wikidataId")}
    report = {"source": ENDPOINT, "observedAt": datetime.now(timezone.utc).isoformat(),
              "truncated": len(bindings) > 500, "candidates": candidates(bindings, reviewed)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(report['candidates'])} Wikidata venue candidates; truncated={report['truncated']}")


if __name__ == "__main__":
    main()
