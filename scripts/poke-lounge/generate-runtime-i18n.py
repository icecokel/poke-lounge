#!/usr/bin/env python3
"""Generate the compact Poke Lounge runtime term catalog from PokeAPI CSV data."""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
POKEAPI_COMMIT = "d4f9a4af58ade123fbc0558f68b1c69daa97d9e4"
POKEAPI_CSV_ROOT = (
    f"https://raw.githubusercontent.com/PokeAPI/pokeapi/{POKEAPI_COMMIT}/data/v2/csv"
)
OUTPUT_PATH = (
    ROOT
    / "apps/web/src/components/poke-lounge/runtime/game/i18n/runtime-game-terms.generated.json"
)
POKEMON_DATA_PATH = ROOT / "apps/web/public/game-data/pokemon-data.json"
ITEM_DATA_PATH = ROOT / "apps/web/public/game-data/item-data.json"
RUNTIME_ITEM_IDS_PATH = ROOT / "packages/poke-lounge-battle/src/runtime-item-ids.ts"
LOCALE_LANGUAGE_IDS = {"en-US": "9", "ja-JP": "1"}


def read_csv(name: str) -> list[dict[str, str]]:
    request = urllib.request.Request(
        f"{POKEAPI_CSV_ROOT}/{name}", headers={"User-Agent": "poke-lounge-i18n-generator"}
    )
    with urllib.request.urlopen(request) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode("utf-8"))))


def localized_names(
    rows: list[dict[str, str]], id_key: str, ids: set[int]
) -> dict[str, dict[int, str]]:
    result = {locale: {} for locale in LOCALE_LANGUAGE_IDS}
    for row in rows:
        item_id = int(row[id_key])
        if item_id not in ids:
            continue
        for locale, language_id in LOCALE_LANGUAGE_IDS.items():
            if row["local_language_id"] == language_id:
                result[locale][item_id] = row["name"]
    for locale, names in result.items():
        missing = sorted(ids - names.keys())
        if missing:
            raise RuntimeError(f"Missing {locale} names for {id_key}: {missing}")
    return result


def normalize_description(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\u3000", " ")).strip()


def localized_item_descriptions(
    rows: list[dict[str, str]], ids: set[int]
) -> dict[str, dict[int, str]]:
    candidates: dict[str, dict[int, list[tuple[int, str]]]] = {
        locale: {item_id: [] for item_id in ids} for locale in LOCALE_LANGUAGE_IDS
    }
    for row in rows:
        item_id = int(row["item_id"])
        if item_id not in ids:
            continue
        for locale, language_id in LOCALE_LANGUAGE_IDS.items():
            if row["language_id"] == language_id:
                candidates[locale][item_id].append(
                    (int(row["version_group_id"]), normalize_description(row["flavor_text"]))
                )

    result: dict[str, dict[int, str]] = {locale: {} for locale in LOCALE_LANGUAGE_IDS}
    for locale, items in candidates.items():
        for item_id, values in items.items():
            if not values:
                raise RuntimeError(f"Missing {locale} item description for {item_id}")
            exact_hgss = [value for version, value in values if version == 10]
            result[locale][item_id] = exact_hgss[0] if exact_hgss else max(values)[1]
    return result


def runtime_item_ids() -> set[int]:
    source = RUNTIME_ITEM_IDS_PATH.read_text()
    return {int(value) for value in re.findall(r"^\s*\w+:\s*(\d+),", source, re.MULTILINE)}


def term_records(
    canonical_names: dict[int, str], translations: dict[str, dict[int, str]]
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for item_id, canonical_name in canonical_names.items():
        localized = {locale: names[item_id] for locale, names in translations.items()}
        existing = result.get(canonical_name)
        if existing is not None and existing != localized:
            raise RuntimeError(f"Ambiguous canonical term: {canonical_name}")
        result[canonical_name] = localized
    return result


def generate() -> str:
    pokemon_data = json.loads(POKEMON_DATA_PATH.read_text())
    item_data = json.loads(ITEM_DATA_PATH.read_text())

    pokemon_names = {
        int(item_id): item["name"] for item_id, item in pokemon_data["species"].items()
    }
    move_names = {
        int(item_id): item["name"]
        for item_id, item in pokemon_data["moves"].items()
        if item.get("name")
    }
    type_names = {
        (index + 1 if index < 9 else index): name
        for index, name in enumerate(pokemon_data["typeNames"])
        if name != "???"
    }
    item_ids = runtime_item_ids()
    item_names = {item_id: item_data["items"][str(item_id)]["name"] for item_id in item_ids}

    pokemon_translations = localized_names(
        read_csv("pokemon_species_names.csv"), "pokemon_species_id", set(pokemon_names)
    )
    move_translations = localized_names(read_csv("move_names.csv"), "move_id", set(move_names))
    type_translations = localized_names(read_csv("type_names.csv"), "type_id", set(type_names))
    item_translations = localized_names(read_csv("item_names.csv"), "item_id", item_ids)
    item_descriptions = localized_item_descriptions(read_csv("item_flavor_text.csv"), item_ids)

    types = term_records(type_names, type_translations)
    types["???"] = {"en-US": "???", "ja-JP": "???"}
    items = {}
    for item_id, canonical_name in item_names.items():
        items[canonical_name] = {
            locale: {
                "name": item_translations[locale][item_id],
                "description": item_descriptions[locale][item_id],
            }
            for locale in LOCALE_LANGUAGE_IDS
        }

    output = {
        "source": {
            "repository": "https://github.com/PokeAPI/pokeapi",
            "commit": POKEAPI_COMMIT,
        },
        "pokemon": term_records(pokemon_names, pokemon_translations),
        "moves": term_records(move_names, move_translations),
        "types": types,
        "items": items,
    }
    return json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = generate()
    if args.check:
        if not OUTPUT_PATH.exists() or OUTPUT_PATH.read_text() != generated:
            raise SystemExit(f"Runtime i18n catalog is stale: {OUTPUT_PATH.relative_to(ROOT)}")
        print(f"Runtime i18n catalog is current: {OUTPUT_PATH.relative_to(ROOT)}")
        return
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(generated)
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
