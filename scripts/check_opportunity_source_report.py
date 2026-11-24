"""Require a successful hosted check for each monitored source changed by a PR."""

import argparse
from pathlib import Path

from refresh_opportunities import read_json


def changed_monitored_sources(base, proposed):
    previous = {source["id"]: source for source in base["sources"]}
    return sorted(
        source["id"] for source in proposed["sources"]
        if source["state"] in {"active", "discovery"} and source != previous.get(source["id"])
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_registry", type=Path)
    parser.add_argument("proposed_registry", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()

    required = changed_monitored_sources(read_json(args.base_registry), read_json(args.proposed_registry))
    results = read_json(args.report)["sources"]
    if not required:
        print("No new or changed monitored sources require a successful hosted check.")
        return 0

    failed = False
    for source_id in required:
        row = results.get(source_id, {})
        status = row.get("status", "missing from report")
        print(f"{source_id}: {status}")
        if status != "ok":
            failed = True
    if failed:
        print("New or changed monitored sources must pass a hosted check. See the source health artifact for details.")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
