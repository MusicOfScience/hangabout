#!/usr/bin/env python3
"""Validate hangabout's v3 layered data contract before deploy."""

from __future__ import annotations

from pathlib import Path
import validate_data_v2 as base

ROOT = Path(__file__).resolve().parents[1]
base.KINDS.add("major-institution")
base.RESOURCE_TYPES.add("opportunity")


def load_optional(name: str):
    path = ROOT / "data" / name
    return base.load(path) if path.exists() else []


def validate_studio_vacancy(vacancy: dict, premise_ids: set[str]):
    context = vacancy.get("id", "<vacancy>")
    base.require(base.ID_RE.fullmatch(context) is not None, f"{context}: invalid vacancy id")
    base.require(vacancy.get("premisesId") in premise_ids, f"{context}: unknown premises")
    base.require(vacancy.get("availabilityStatus") in {"advertised", "occupied", "waitlist", "unknown", "expired"}, f"{context}: bad availability status")
    base.require(str(vacancy.get("sourceName", "")).strip(), f"{context}: missing sourceName")
    base.require(vacancy.get("sourceType") in base.SOURCE_TYPES, f"{context}: bad sourceType")
    base.require(base.valid_url(vacancy.get("sourceUrl", "")), f"{context}: bad source URL")
    base.valid_date(vacancy.get("lastVerified"), context)
    if vacancy.get("availableFrom"):
        base.valid_date(vacancy["availableFrom"], context)
    if vacancy.get("priceAmount") is not None:
        base.require(isinstance(vacancy["priceAmount"], (int, float)) and vacancy["priceAmount"] >= 0, f"{context}: bad priceAmount")


def main():
    venues = [
        *base.load(ROOT / "data" / "venues.json"),
        *load_optional("venues-extra.json"),
        *load_optional("venues-major.json"),
    ]
    events = [
        *base.load(ROOT / "data" / "events.json"),
        *load_optional("events-extra.json"),
        *load_optional("events-major.json"),
    ]
    resources = [
        *load_optional("make-resources.json"),
        *load_optional("make-resources-extra.json"),
    ]
    vacancies = load_optional("studio-vacancies.json")

    venue_ids = [v.get("id") for v in venues]
    event_ids = [e.get("id") for e in events]
    resource_ids = [r.get("id") for r in resources]

    base.require(len(venue_ids) == len(set(venue_ids)), "duplicate venue id across data layers")
    base.require(len(event_ids) == len(set(event_ids)), "duplicate event id across data layers")
    base.require(len(resource_ids) == len(set(resource_ids)), "duplicate make-resource id across data layers")

    for venue in venues:
        base.validate_venue(venue)
    known_venues = set(venue_ids)
    for event in events:
        base.validate_event(event, known_venues)
    for resource in resources:
        base.validate_resource(resource)
    premise_ids = {r["id"] for r in resources if r.get("resourceType") == "studio"}
    vacancy_ids = [row.get("id") for row in vacancies]
    base.require(len(vacancy_ids) == len(set(vacancy_ids)), "duplicate studio vacancy id")
    for vacancy in vacancies:
        validate_studio_vacancy(vacancy, premise_ids)

    official = sum(event["sourceType"] == "official" for event in events)
    directory = len(events) - official
    exact = sum("lat" in venue for venue in venues)
    opportunities = sum(resource["resourceType"] == "opportunity" for resource in resources)
    print(
        f"validated {len(venues)} venues ({exact} exact pins), "
        f"{len(events)} events ({official} official, {directory} directory), "
        f"{len(resources)} make-art resources ({opportunities} opportunities), {len(vacancies)} studio vacancy records"
    )


if __name__ == "__main__":
    main()
