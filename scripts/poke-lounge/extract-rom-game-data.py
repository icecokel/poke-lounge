#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

try:
    from ndspy import lz10
    from ndspy.narc import NARC
    from ndspy.rom import NintendoDSRom
except ImportError:
    lz10 = None
    NARC = None
    NintendoDSRom = None

try:
    from PIL import Image
except ImportError:
    Image = None


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROM_PATH = REPO_ROOT / "data/roms/포켓몬스터 하트골드(K).nds"
DEFAULT_POKEMON_DATA_PATH = REPO_ROOT / "apps/web/public/game-data/pokemon-data.json"
DEFAULT_LEVEL_UP_MOVE_TABLE_PATH = (
    REPO_ROOT / "apps/web/public/game-data/level-up-move-table.json"
)
DEFAULT_ITEM_DATA_PATH = REPO_ROOT / "apps/web/public/game-data/item-data.json"
DEFAULT_GROWTH_TABLE_PATH = (
    REPO_ROOT
    / "apps/web/src/components/poke-lounge/runtime/game/battle/growthTable.json"
)
DEFAULT_SPRITE_SHEET_DIRECTORY = REPO_ROOT / "apps/web/public/assets/pokemon/sheets"
DEFAULT_EVOLUTION_BACKGROUND_PATH = (
    REPO_ROOT / "apps/web/public/assets/pokemon/battle/evolution-background.png"
)

PERSONAL_NARC_PATH = "a/0/0/2"
MOVE_NARC_PATH = "a/0/1/1"
ITEM_NARC_PATH = "a/0/1/7"
GROWTH_NARC_PATH = "a/0/0/3"
LEARNSET_NARC_PATH = "a/0/3/3"
EVOLUTION_NARC_PATH = "a/0/3/4"
MESSAGE_NARC_PATH = "a/0/2/7"
POKEMON_NAME_MESSAGE_INDEX = 233
MOVE_NAME_MESSAGE_INDEX = 743
ITEM_DESCRIPTION_MESSAGE_INDEX = 219
ITEM_NAME_MESSAGE_INDEX = 220
KOREAN_CHARACTER_MAP_PATH = "data/str2uni.bin"
BATTLE_SPRITE_NARC_PATH = "a/0/0/4"
EVOLUTION_PRESENTATION_NARC_PATH = "a/1/1/5"
ITEM_ICON_NARC_PATH = "a/0/1/8"
# HGSS src/item.c sItemNarcIds: Poké Ball (item 4), Ultra Ball (item 2).
BALL_ICON_MEMBERS = {"pokeball": (8, 9), "ultraBall": (4, 5)}
DEFAULT_BALL_ICON_DIRECTORY = REPO_ROOT / "apps/web/public/assets/pokemon/battle/balls"

EXPECTED_ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
EXPECTED_ARCHIVE_FILE_COUNTS = {
    PERSONAL_NARC_PATH: 508,
    MOVE_NARC_PATH: 471,
    ITEM_NARC_PATH: 514,
    GROWTH_NARC_PATH: 8,
    LEARNSET_NARC_PATH: 508,
    EVOLUTION_NARC_PATH: 508,
    MESSAGE_NARC_PATH: 822,
    BATTLE_SPRITE_NARC_PATH: 2964,
    EVOLUTION_PRESENTATION_NARC_PATH: 11,
}
EXPECTED_POKEMON_NAME_COUNT = 496
EXPECTED_MOVE_NAME_COUNT = 468
EXPECTED_ITEM_NAME_COUNT = 537
EXPECTED_KOREAN_CHARACTER_COUNT = 2416
EXPECTED_POKEMON_NAMES = {
    1: "이상해씨",
    25: "피카츄",
    29: "니드런♀",
    32: "니드런♂",
    152: "치코리타",
    233: "폴리곤2",
    474: "폴리곤Z",
    493: "아르세우스",
    494: "알",
    495: "불량알",
}
EXPECTED_MOVE_NAMES = {
    1: "막치기",
    33: "몸통박치기",
    77: "독가루",
    98: "전광석화",
    345: "메지컬리프",
    467: "섀도다이브",
}
EXPECTED_ITEM_NAMES = {
    1: "마스터볼",
    2: "하이퍼볼",
    4: "몬스터볼",
    17: "상처약",
    28: "기력의조각",
    50: "이상한사탕",
    80: "태양의돌",
    109: "각성의돌",
}
SHOP_CATALOGS = {
    "basic": [17, 4, 18, 26],
    "premium": [80, 81, 82, 83, 84, 85, 107, 108, 109, 25, 28, 2, 50],
}

NATIONAL_DEX_SPECIES_COUNT = 493
KOREAN_CHARACTER_CODE_OFFSET = 0x401
MESSAGE_TABLE_KEY_MULTIPLIER = 0x2FD
MESSAGE_STRING_KEY_MULTIPLIER = 0x91BD3
MESSAGE_STRING_KEY_INCREMENT = 0x493D
GEN4_STANDARD_NAME_CHARACTERS = {
    **{0x121 + index: str(index) for index in range(10)},
    **{0x12B + index: chr(ord("A") + index) for index in range(26)},
    0x1AC: "?",
    0x1AD: ",",
    0x1AE: ".",
    0x1B4: "“",
    0x1B5: "”",
    0x1BB: "♂",
    0x1BC: "♀",
    0x1BE: "-",
    0x1D2: "%",
    0x1DE: " ",
    0xE000: "\n",
}

BATTLE_SPRITE_MEMBERS_PER_SPECIES = 6
BATTLE_SPRITE_MEMBER_OFFSETS = {
    "back": {"fallback": 0, "default": 1},
    "front": {"fallback": 2, "default": 3},
}
BATTLE_SPRITE_PALETTE_MEMBER_OFFSET = 4
BATTLE_SPRITE_ENCRYPTION_MULTIPLIER = 0x41C64E6D
BATTLE_SPRITE_ENCRYPTION_INCREMENT = 0x6073
BATTLE_SPRITE_SOURCE_SIZE = (160, 80)
BATTLE_SPRITE_FRAME_SIZE = 80
BATTLE_SPRITE_SHEET_COLUMNS = 16
BATTLE_SPRITE_SHEET_SIZE = BATTLE_SPRITE_FRAME_SIZE * BATTLE_SPRITE_SHEET_COLUMNS
BATTLE_SPRITE_SHEET_RANGES = ((1, 256), (257, NATIONAL_DEX_SPECIES_COUNT))
EVOLUTION_BACKGROUND_CHARACTER_MEMBER = 0
EVOLUTION_BACKGROUND_SCREEN_MEMBER = 1
EVOLUTION_BACKGROUND_PALETTE_MEMBER = 8
EVOLUTION_BACKGROUND_SIZE = (256, 192)

EXTRA_FORM_SPECIES = {
    496: {
        "baseSpeciesId": 386,
        "formName": "어택폼",
        "name": "테오키스 어택폼",
    },
    497: {
        "baseSpeciesId": 386,
        "formName": "디펜스폼",
        "name": "테오키스 디펜스폼",
    },
    498: {
        "baseSpeciesId": 386,
        "formName": "스피드폼",
        "name": "테오키스 스피드폼",
    },
    499: {
        "baseSpeciesId": 413,
        "formName": "모래땅도롱",
        "name": "도롱마담 모래땅도롱",
    },
    500: {
        "baseSpeciesId": 413,
        "formName": "슈레도롱",
        "name": "도롱마담 슈레도롱",
    },
    501: {
        "baseSpeciesId": 487,
        "formName": "오리진폼",
        "name": "기라티나 오리진폼",
    },
    502: {
        "baseSpeciesId": 492,
        "formName": "스카이폼",
        "name": "쉐이미 스카이폼",
    },
    503: {
        "baseSpeciesId": 479,
        "formName": "히트로토무",
        "name": "히트로토무",
    },
    504: {
        "baseSpeciesId": 479,
        "formName": "워시로토무",
        "name": "워시로토무",
    },
    505: {
        "baseSpeciesId": 479,
        "formName": "프로스트로토무",
        "name": "프로스트로토무",
    },
    506: {
        "baseSpeciesId": 479,
        "formName": "스핀로토무",
        "name": "스핀로토무",
    },
    507: {
        "baseSpeciesId": 479,
        "formName": "커트로토무",
        "name": "커트로토무",
    },
}

GEN4_TYPE_NAMES = [
    "노말",
    "격투",
    "비행",
    "독",
    "땅",
    "바위",
    "벌레",
    "고스트",
    "강철",
    "???",
    "불꽃",
    "물",
    "풀",
    "전기",
    "에스퍼",
    "얼음",
    "드래곤",
    "악",
]

GEN4_MOVE_CATEGORY_NAMES = {
    0: "physical",
    1: "special",
    2: "status",
}
GEN4_MOVE_EFFECT_MAX = 276
GEN4_MOVE_TARGET_RANGES = frozenset({0} | {1 << bit for bit in range(11)})
GEN4_MOVE_PRIORITY_MIN = -7
GEN4_MOVE_PRIORITY_MAX = 5
GEN4_MOVE_MAX_ACCURACY = 100
GEN4_MOVE_MAX_PP = 40
GEN4_MOVE_MAX_EFFECT_CHANCE = 100
GEN4_MOVE_MAX_CONTEST_EFFECT = 23
GEN4_MOVE_MAX_CONTEST_TYPE = 4
MAX_LEVEL_UP_MOVE_ID = EXPECTED_MOVE_NAME_COUNT - 1
MAX_POKEMON_LEVEL = 100


def require_extraction_dependencies() -> None:
    if lz10 is None or NARC is None or NintendoDSRom is None:
        raise SystemExit(
            "Missing Python package 'ndspy'. Install it with: "
            "python3 -m pip install --user ndspy"
        )
    if Image is None:
        raise SystemExit(
            "Missing Python package 'Pillow'. Install it with: "
            "python3 -m pip install --user Pillow"
        )


def main() -> None:
    require_extraction_dependencies()
    parser = argparse.ArgumentParser(
        description="Extract Poke Lounge game data from a local NDS ROM."
    )
    parser.add_argument("--rom", type=Path, default=DEFAULT_ROM_PATH)
    parser.add_argument("--ball-icons-only", action="store_true")
    parser.add_argument("--ball-icon-directory", type=Path, default=DEFAULT_BALL_ICON_DIRECTORY)
    parser.add_argument("--pokemon-data", type=Path, default=DEFAULT_POKEMON_DATA_PATH)
    parser.add_argument("--level-up-table", type=Path, default=DEFAULT_LEVEL_UP_MOVE_TABLE_PATH)
    parser.add_argument("--item-data", type=Path, default=DEFAULT_ITEM_DATA_PATH)
    parser.add_argument("--growth-table", type=Path, default=DEFAULT_GROWTH_TABLE_PATH)
    parser.add_argument(
        "--sprite-sheet-directory",
        type=Path,
        default=DEFAULT_SPRITE_SHEET_DIRECTORY,
    )
    parser.add_argument(
        "--evolution-background",
        type=Path,
        default=DEFAULT_EVOLUTION_BACKGROUND_PATH,
    )
    args = parser.parse_args()

    rom_path = resolve_repo_path(args.rom)
    if not rom_path.exists():
        raise FileNotFoundError(f"ROM file is missing: {rom_path}")

    rom_bytes = rom_path.read_bytes()
    rom_sha1 = hashlib.sha1(rom_bytes).hexdigest()
    validate_exact_value("ROM SHA-1", rom_sha1, EXPECTED_ROM_SHA1)
    rom = NintendoDSRom(rom_bytes)
    extract_ball_icons(rom, resolve_repo_path(args.ball_icon_directory), rom_sha1)
    if args.ball_icons_only:
        return

    personal = NARC(bytes(rom.getFileByName(PERSONAL_NARC_PATH)))
    moves = NARC(bytes(rom.getFileByName(MOVE_NARC_PATH)))
    items = NARC(bytes(rom.getFileByName(ITEM_NARC_PATH)))
    growth_tables = NARC(bytes(rom.getFileByName(GROWTH_NARC_PATH)))
    learnset_narc = NARC(bytes(rom.getFileByName(LEARNSET_NARC_PATH)))
    evolution_narc = NARC(bytes(rom.getFileByName(EVOLUTION_NARC_PATH)))
    messages = NARC(bytes(rom.getFileByName(MESSAGE_NARC_PATH)))
    battle_sprites = NARC(bytes(rom.getFileByName(BATTLE_SPRITE_NARC_PATH)))
    evolution_presentation = NARC(
        bytes(rom.getFileByName(EVOLUTION_PRESENTATION_NARC_PATH))
    )

    archives = {
        PERSONAL_NARC_PATH: personal,
        MOVE_NARC_PATH: moves,
        ITEM_NARC_PATH: items,
        GROWTH_NARC_PATH: growth_tables,
        LEARNSET_NARC_PATH: learnset_narc,
        EVOLUTION_NARC_PATH: evolution_narc,
        MESSAGE_NARC_PATH: messages,
        BATTLE_SPRITE_NARC_PATH: battle_sprites,
        EVOLUTION_PRESENTATION_NARC_PATH: evolution_presentation,
    }
    for archive_path, archive in archives.items():
        validate_exact_value(
            f"{archive_path} member count",
            len(archive.files),
            EXPECTED_ARCHIVE_FILE_COUNTS[archive_path],
        )

    character_map_data = bytes(rom.getFileByName(KOREAN_CHARACTER_MAP_PATH))
    pokemon_names = parse_message_names(
        bytes(messages.files[POKEMON_NAME_MESSAGE_INDEX]),
        character_map_data,
        entry_label="Pokemon name",
        expected_entry_count=EXPECTED_POKEMON_NAME_COUNT,
        message_index=POKEMON_NAME_MESSAGE_INDEX,
    )
    validate_pokemon_names(pokemon_names)
    move_names = parse_message_names(
        bytes(messages.files[MOVE_NAME_MESSAGE_INDEX]),
        character_map_data,
        entry_label="move name",
        expected_entry_count=EXPECTED_MOVE_NAME_COUNT,
        message_index=MOVE_NAME_MESSAGE_INDEX,
    )
    validate_move_names(move_names)
    item_descriptions = parse_message_names(
        bytes(messages.files[ITEM_DESCRIPTION_MESSAGE_INDEX]),
        character_map_data,
        entry_label="item description",
        expected_entry_count=EXPECTED_ITEM_NAME_COUNT,
        message_index=ITEM_DESCRIPTION_MESSAGE_INDEX,
    )
    validate_exact_value(
        "decoded item description count",
        len(item_descriptions),
        EXPECTED_ITEM_NAME_COUNT - 1,
    )
    item_names = parse_message_names(
        bytes(messages.files[ITEM_NAME_MESSAGE_INDEX]),
        character_map_data,
        entry_label="item name",
        expected_entry_count=EXPECTED_ITEM_NAME_COUNT,
        message_index=ITEM_NAME_MESSAGE_INDEX,
    )
    validate_item_names(item_names)

    learnsets = parse_learnsets(learnset_narc)
    evolutions = parse_evolutions(evolution_narc)
    move_records = parse_move_records(moves, move_names)
    item_records = parse_item_records(items, item_names, item_descriptions)
    growth_table_records = parse_growth_tables(growth_tables)
    pokemon_records = parse_pokemon_records(
        personal,
        learnsets,
        evolutions,
        pokemon_names,
    )
    validate_extracted_records(pokemon_records, move_records, item_records)
    sprite_sheets = build_battle_sprite_sheets(battle_sprites)
    evolution_background = decode_evolution_background(evolution_presentation)

    source = {
        "romPath": str(rom_path.relative_to(REPO_ROOT)),
        "romSha1": rom_sha1,
        "personalPath": PERSONAL_NARC_PATH,
        "movePath": MOVE_NARC_PATH,
        "itemPath": ITEM_NARC_PATH,
        "growthPath": GROWTH_NARC_PATH,
        "learnsetPath": LEARNSET_NARC_PATH,
        "evolutionPath": EVOLUTION_NARC_PATH,
        "messagePath": MESSAGE_NARC_PATH,
        "pokemonNameMessageIndex": POKEMON_NAME_MESSAGE_INDEX,
        "moveNameMessageIndex": MOVE_NAME_MESSAGE_INDEX,
        "itemDescriptionMessageIndex": ITEM_DESCRIPTION_MESSAGE_INDEX,
        "itemNameMessageIndex": ITEM_NAME_MESSAGE_INDEX,
        "characterMapPath": KOREAN_CHARACTER_MAP_PATH,
        "battleSpritePath": BATTLE_SPRITE_NARC_PATH,
        "evolutionPresentationPath": EVOLUTION_PRESENTATION_NARC_PATH,
        "evolutionBackgroundMembers": {
            "character": EVOLUTION_BACKGROUND_CHARACTER_MEMBER,
            "screen": EVOLUTION_BACKGROUND_SCREEN_MEMBER,
            "palette": EVOLUTION_BACKGROUND_PALETTE_MEMBER,
        },
    }

    pokemon_data = {
        "version": 1,
        "source": source,
        "typeNames": GEN4_TYPE_NAMES,
        "moveCategories": GEN4_MOVE_CATEGORY_NAMES,
        "stats": {
            "pokemonRecords": len(pokemon_records),
            "moveRecords": len(move_records),
            "moveNameRecords": len(move_names),
            "learnsetSpecies": sum(1 for record in pokemon_records if record["levelUpMoves"]),
            "encounterableSpecies": sum(
                1 for record in pokemon_records if record["encounterable"]
            ),
            "spriteSpecies": NATIONAL_DEX_SPECIES_COUNT,
        },
        "species": {str(record["speciesId"]): record for record in pokemon_records},
        "moves": {str(record["id"]): record for record in move_records},
    }
    level_up_move_table = {
        "version": 1,
        "source": source,
        "species": {
            str(record["speciesId"]): record["levelUpMoves"]
            for record in pokemon_records
            if record["levelUpMoves"]
        },
    }
    item_data = {
        "version": 1,
        "source": source,
        "stats": {
            "itemRecords": len(item_records),
            "itemNameRecords": len(item_names),
            "itemDescriptionRecords": len(item_descriptions),
        },
        "shopCatalogs": SHOP_CATALOGS,
        "items": {str(record["id"]): record for record in item_records},
    }
    growth_table_data = {
        "version": 1,
        "source": source,
        "stats": {
            "tables": len(growth_table_records),
            "levelsPerTable": 101,
        },
        "tables": growth_table_records,
    }

    write_json(resolve_repo_path(args.pokemon_data), pokemon_data)
    write_json(resolve_repo_path(args.level_up_table), level_up_move_table)
    write_json(resolve_repo_path(args.item_data), item_data)
    write_json(resolve_repo_path(args.growth_table), growth_table_data)
    write_sprite_sheets(resolve_repo_path(args.sprite_sheet_directory), sprite_sheets)
    write_image(resolve_repo_path(args.evolution_background), evolution_background)

    print(
        "Extracted "
        f"{len(pokemon_records)} Pokemon records, "
        f"{len(move_records)} move records, "
        f"{len(item_records)} item records, "
        f"{len(level_up_move_table['species'])} level-up tables, and "
        f"{len(sprite_sheets)} battle sprite sheets with the evolution background."
    )


def extract_ball_icons(rom: NintendoDSRom, directory: Path, rom_sha1: str) -> None:
    archive = NARC(bytes(rom.getFileByName(ITEM_ICON_NARC_PATH)))
    validate_exact_value("Item icon archive member count", len(archive.files), 797)
    assets = {}
    for name, (character_member, palette_member) in BALL_ICON_MEMBERS.items():
        image = decode_ball_icon(bytes(archive.files[character_member]), bytes(archive.files[palette_member]))
        destination = directory / f"{name}.png"
        write_image(destination, image)
        assets[name] = {
            "characterMember": character_member,
            "paletteMember": palette_member,
            "width": image.width,
            "height": image.height,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        }
    write_json(directory / "manifest.json", {
        "romSha1": rom_sha1,
        "archive": ITEM_ICON_NARC_PATH,
        "mappingSource": "https://github.com/pret/pokeheartgold/blob/master/src/item.c",
        "processing": "Decode 32x32 4bpp tiled NCGR and BGR555 NCLR; palette index 0 transparent; trim transparent margin without resampling.",
        "assets": assets,
    })
    print(f"Extracted {len(assets)} ROM ball icons.")


def decode_ball_icon(character_data: bytes, palette_data: bytes) -> Image.Image:
    if (len(character_data) != 0x230 or character_data[:4] != b"RGCN"
            or character_data[16:20] != b"RAHC" or read_u32le(character_data, 0x1C) != 3
            or read_u32le(character_data, 0x28) != 512):
        raise ValueError("Ball icon must be a 32x32 4bpp NCGR")
    if (len(palette_data) != 0x228 or palette_data[:4] != b"RLCN"
            or palette_data[16:20] != b"TTLP"):
        raise ValueError("Ball icon palette must be an NCLR")
    palette = decode_opaque_nitro_palette(palette_data[0x28:0x48])
    palette[0] = (0, 0, 0, 0)
    pixels = []
    for y in range(32):
        for x in range(32):
            pixel_index = ((y // 8) * 4 + x // 8) * 64 + (y % 8) * 8 + x % 8
            packed = character_data[0x30 + pixel_index // 2]
            pixels.append(palette[(packed >> (4 * (pixel_index % 2))) & 15])
    image = Image.new("RGBA", (32, 32))
    image.putdata(pixels)
    bounds = image.getbbox()
    if not bounds:
        raise ValueError("Ball icon is empty")
    return image.crop(bounds)


def parse_pokemon_records(
    personal: NARC,
    learnsets: dict[int, list[dict[str, int]]],
    evolutions: dict[int, list[dict[str, int]]],
    pokemon_names: dict[int, str],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for species_id, file_data in enumerate(personal.files):
        if species_id == 0:
            continue

        data = bytes(file_data)
        if len(data) != 44:
            raise ValueError(
                f"Personal record {species_id} has {len(data)} bytes; expected 44"
            )

        primary_type = data[6]
        secondary_type = data[7]
        type_ids = unique_type_ids([primary_type, secondary_type])
        name = pokemon_names.get(species_id)
        form = EXTRA_FORM_SPECIES.get(species_id)
        if form:
            name = form["name"]
        if not name:
            raise ValueError(f"Pokemon record {species_id} has no decoded name")

        record: dict[str, Any] = {
            "speciesId": species_id,
            "rawHex": data.hex(),
            "nationalDexId": (
                species_id if 1 <= species_id <= NATIONAL_DEX_SPECIES_COUNT else None
            ),
            "name": name,
            "encounterable": 1 <= species_id <= NATIONAL_DEX_SPECIES_COUNT,
            "baseStats": {
                "hp": data[0],
                "attack": data[1],
                "defense": data[2],
                "speed": data[3],
                "specialAttack": data[4],
                "specialDefense": data[5],
            },
            "types": {
                "primary": primary_type,
                "secondary": secondary_type if secondary_type != primary_type else None,
                "ids": type_ids,
                "names": [GEN4_TYPE_NAMES[type_id] for type_id in type_ids],
            },
            "catchRate": data[8],
            "baseExpYield": data[9],
            "evYieldRaw": read_u16le(data, 10),
            "heldItemsRaw": {
                "item1": read_u16le(data, 12),
                "item2": read_u16le(data, 14),
            },
            "genderRatio": data[16],
            "eggCycles": data[17],
            "baseFriendship": data[18],
            "growthRate": data[19],
            "eggGroups": {
                "primary": data[20],
                "secondary": data[21],
            },
            "abilities": {
                "primary": data[22],
                "secondary": data[23] or None,
            },
            "safariFleeRate": data[24],
            "colorFlipRaw": data[25],
            "levelUpMoves": learnsets.get(species_id, []),
            "evolutions": evolutions.get(species_id, []),
        }
        if form:
            record["form"] = {
                "baseSpeciesId": form["baseSpeciesId"],
                "name": form["formName"],
            }

        records.append(record)

    return records


def parse_message_names(
    message_data: bytes,
    character_map_data: bytes,
    *,
    entry_label: str,
    expected_entry_count: int,
    message_index: int,
) -> dict[int, str]:
    if len(character_map_data) % 2 != 0:
        raise ValueError(
            f"{KOREAN_CHARACTER_MAP_PATH} has an odd byte length: "
            f"{len(character_map_data)}"
        )

    character_map = [
        read_u16le(character_map_data, offset)
        for offset in range(0, len(character_map_data), 2)
    ]
    validate_exact_value(
        f"{KOREAN_CHARACTER_MAP_PATH} character count",
        len(character_map),
        EXPECTED_KOREAN_CHARACTER_COUNT,
    )

    if len(message_data) < 4:
        raise ValueError(
            f"{entry_label} message {message_index} is too short: "
            f"{len(message_data)} bytes"
        )

    entry_count = read_u16le(message_data, 0)
    seed = read_u16le(message_data, 2)
    validate_exact_value(
        f"{entry_label} message {message_index} entry count",
        entry_count,
        expected_entry_count,
    )

    table_end = 4 + entry_count * 8
    if table_end > len(message_data):
        raise ValueError(
            f"{entry_label} message table ends at {table_end}, "
            f"past its {len(message_data)}-byte payload"
        )

    names: dict[int, str] = {}
    table_key_base = (seed * MESSAGE_TABLE_KEY_MULTIPLIER) & 0xFFFF
    for entry_id in range(1, entry_count):
        table_offset = 4 + entry_id * 8
        table_key = (table_key_base * (entry_id + 1)) & 0xFFFF
        table_key_32 = table_key | (table_key << 16)
        string_offset = read_u32le(message_data, table_offset) ^ table_key_32
        string_length = read_u32le(message_data, table_offset + 4) ^ table_key_32

        if string_length <= 0:
            raise ValueError(f"{entry_label} {entry_id} has no encoded characters")
        if string_offset < table_end or string_offset + string_length * 2 > len(message_data):
            raise ValueError(
                f"{entry_label} {entry_id} points outside its message payload: "
                f"offset={string_offset}, length={string_length}"
            )

        string_key = (
            MESSAGE_STRING_KEY_MULTIPLIER * (entry_id + 1)
        ) & 0xFFFF
        decoded_characters: list[str] = []
        found_terminator = False
        for character_number in range(string_length):
            encoded_character = read_u16le(
                message_data,
                string_offset + character_number * 2,
            )
            character_code = encoded_character ^ string_key
            string_key = (string_key + MESSAGE_STRING_KEY_INCREMENT) & 0xFFFF

            if character_code == 0xFFFF:
                found_terminator = True
                break
            if character_code == 0xF100:
                raise ValueError(
                    f"{entry_label} {entry_id} unexpectedly uses compressed text"
                )

            standard_character = GEN4_STANDARD_NAME_CHARACTERS.get(character_code)
            if standard_character:
                decoded_characters.append(standard_character)
                continue

            character_index = character_code - KOREAN_CHARACTER_CODE_OFFSET
            if not 0 <= character_index < len(character_map):
                raise ValueError(
                    f"{entry_label} {entry_id} has unmapped character code "
                    f"0x{character_code:04x}"
                )

            unicode_code_point = character_map[character_index]
            if unicode_code_point == 0:
                raise ValueError(
                    f"{entry_label} {entry_id} maps character code "
                    f"0x{character_code:04x} to U+0000"
                )
            decoded_characters.append(chr(unicode_code_point))

        if not found_terminator:
            raise ValueError(f"{entry_label} {entry_id} has no terminator")

        name = "".join(decoded_characters)
        if not name:
            raise ValueError(f"{entry_label} {entry_id} decoded to an empty string")
        names[entry_id] = name

    return names


def validate_pokemon_names(pokemon_names: dict[int, str]) -> None:
    validate_exact_value(
        "decoded Pokemon name count",
        len(pokemon_names),
        EXPECTED_POKEMON_NAME_COUNT - 1,
    )
    for species_id, expected_name in EXPECTED_POKEMON_NAMES.items():
        validate_exact_value(
            f"Pokemon name {species_id}",
            pokemon_names.get(species_id),
            expected_name,
        )


def validate_move_names(move_names: dict[int, str]) -> None:
    validate_exact_value(
        "decoded move name count",
        len(move_names),
        EXPECTED_MOVE_NAME_COUNT - 1,
    )
    for move_id, expected_name in EXPECTED_MOVE_NAMES.items():
        validate_exact_value(
            f"move name {move_id}",
            move_names.get(move_id),
            expected_name,
        )


def validate_item_names(item_names: dict[int, str]) -> None:
    validate_exact_value(
        "decoded item name count",
        len(item_names),
        EXPECTED_ITEM_NAME_COUNT - 1,
    )
    for item_id, expected_name in EXPECTED_ITEM_NAMES.items():
        validate_exact_value(
            f"item name {item_id}",
            item_names.get(item_id),
            expected_name,
        )


def validate_extracted_records(
    pokemon_records: list[dict[str, Any]],
    move_records: list[dict[str, Any]],
    item_records: list[dict[str, Any]],
) -> None:
    pokemon_by_id = {record["speciesId"]: record for record in pokemon_records}
    moves_by_id = {record["id"]: record for record in move_records}
    items_by_id = {record["id"]: record for record in item_records}

    missing_shop_item_ids = {
        item_id
        for item_ids in SHOP_CATALOGS.values()
        for item_id in item_ids
        if item_id not in items_by_id
    }
    if missing_shop_item_ids:
        raise ValueError(f"shop catalog items are missing: {sorted(missing_shop_item_ids)}")

    validate_exact_value(
        "Pidgey safari flee rate",
        pokemon_by_id[16]["safariFleeRate"],
        90,
    )
    validate_exact_value(
        "Hypnosis accuracy",
        moves_by_id[95]["accuracy"],
        60,
    )
    validate_exact_value("Ultra Ball price", items_by_id[2]["price"], 1200)
    validate_exact_value(
        "Potion HP restoration",
        items_by_id[17]["partyUseEffects"]["hpRestoreParam"],
        20,
    )
    validate_exact_value("Revive price", items_by_id[28]["price"], 1500)
    validate_exact_value(
        "Revive effect",
        items_by_id[28]["partyUseEffects"]["revive"],
        True,
    )
    validate_exact_value("Rare Candy price", items_by_id[50]["price"], 4800)
    validate_exact_value(
        "Rare Candy level-up effect",
        items_by_id[50]["partyUseEffects"]["levelUp"],
        True,
    )


def build_battle_sprite_sheets(battle_sprites: NARC) -> dict[str, Image.Image]:
    sheets: dict[str, Image.Image] = {}

    for side in ("front", "back"):
        for start_species_id, end_species_id in BATTLE_SPRITE_SHEET_RANGES:
            filename = f"{side}-{start_species_id}-{end_species_id}.png"
            sheet = Image.new(
                "RGBA",
                (BATTLE_SPRITE_SHEET_SIZE, BATTLE_SPRITE_SHEET_SIZE),
                (0, 0, 0, 0),
            )

            for species_id in range(start_species_id, end_species_id + 1):
                frame = decode_battle_sprite_frame(battle_sprites, species_id, side)
                frame_index = species_id - start_species_id
                frame_x = (
                    frame_index % BATTLE_SPRITE_SHEET_COLUMNS
                ) * BATTLE_SPRITE_FRAME_SIZE
                frame_y = (
                    frame_index // BATTLE_SPRITE_SHEET_COLUMNS
                ) * BATTLE_SPRITE_FRAME_SIZE
                sheet.paste(frame, (frame_x, frame_y))

            sheets[filename] = sheet

    return sheets


def decode_evolution_background(evolution_presentation: NARC) -> Image.Image:
    character_data = lz10.decompress(
        bytes(
            evolution_presentation.files[
                EVOLUTION_BACKGROUND_CHARACTER_MEMBER
            ]
        )
    )
    screen_data = lz10.decompress(
        bytes(evolution_presentation.files[EVOLUTION_BACKGROUND_SCREEN_MEMBER])
    )
    palette_data = bytes(
        evolution_presentation.files[EVOLUTION_BACKGROUND_PALETTE_MEMBER]
    )

    if character_data[:4] != b"RGCN" or character_data[16:20] != b"RAHC":
        raise ValueError("Evolution background character data is not a supported NCGR")
    if screen_data[:4] != b"RCSN" or screen_data[16:20] != b"NRCS":
        raise ValueError("Evolution background screen data is not a supported NSCR")
    if palette_data[:4] != b"RLCN" or palette_data[16:20] != b"TTLP":
        raise ValueError("Evolution background palette data is not a supported NCLR")

    character_pixels = character_data[0x30:]
    screen_entries = screen_data[0x24:]
    palette = decode_opaque_nitro_palette(palette_data[0x28:0x68])
    width, height = EVOLUTION_BACKGROUND_SIZE
    pixels: list[tuple[int, int, int, int]] = []

    for y in range(height):
        tile_y, source_pixel_y = divmod(y, 8)
        for x in range(width):
            tile_x, source_pixel_x = divmod(x, 8)
            screen_offset = (tile_y * 32 + tile_x) * 2
            screen_entry = read_u16le(screen_entries, screen_offset)
            tile_index = screen_entry & 0x03FF
            palette_index = screen_entry >> 12
            pixel_x = 7 - source_pixel_x if screen_entry & 0x0400 else source_pixel_x
            pixel_y = 7 - source_pixel_y if screen_entry & 0x0800 else source_pixel_y

            tile_pixel_index = pixel_y * 8 + pixel_x
            packed_pixel = character_pixels[tile_index * 32 + tile_pixel_index // 2]
            color_index = (
                packed_pixel & 0x0F
                if tile_pixel_index % 2 == 0
                else packed_pixel >> 4
            )
            pixels.append(palette[palette_index * 16 + color_index])

    image = Image.new("RGBA", EVOLUTION_BACKGROUND_SIZE)
    image.putdata(pixels)
    return image


def decode_opaque_nitro_palette(
    palette_data: bytes,
) -> list[tuple[int, int, int, int]]:
    if len(palette_data) % 2 != 0:
        raise ValueError(
            f"Evolution background palette has an odd byte length: {len(palette_data)}"
        )

    return [
        (
            (color & 0x1F) << 3,
            ((color >> 5) & 0x1F) << 3,
            ((color >> 10) & 0x1F) << 3,
            255,
        )
        for color in (
            read_u16le(palette_data, offset)
            for offset in range(0, len(palette_data), 2)
        )
    ]


def decode_battle_sprite_frame(
    battle_sprites: NARC,
    species_id: int,
    side: str,
) -> Image.Image:
    member_offsets = BATTLE_SPRITE_MEMBER_OFFSETS[side]
    member_base = species_id * BATTLE_SPRITE_MEMBERS_PER_SPECIES
    default_member = bytes(
        battle_sprites.files[member_base + member_offsets["default"]]
    )
    sprite_data = default_member
    if not sprite_data:
        sprite_data = bytes(
            battle_sprites.files[member_base + member_offsets["fallback"]]
        )
    if not sprite_data:
        raise ValueError(f"Pokemon {species_id} has no {side} battle sprite")

    palette_data = bytes(
        battle_sprites.files[member_base + BATTLE_SPRITE_PALETTE_MEMBER_OFFSET]
    )
    palette = decode_battle_sprite_palette(palette_data, species_id)
    pixel_indexes = decrypt_battle_sprite_pixels(sprite_data, species_id, side)
    rgba_pixels = bytearray()
    for packed_indexes in pixel_indexes:
        rgba_pixels.extend(palette[packed_indexes & 0x0F])
        rgba_pixels.extend(palette[packed_indexes >> 4])

    image = Image.frombytes("RGBA", BATTLE_SPRITE_SOURCE_SIZE, bytes(rgba_pixels))
    return image.crop((0, 0, BATTLE_SPRITE_FRAME_SIZE, BATTLE_SPRITE_FRAME_SIZE))


def decrypt_battle_sprite_pixels(
    sprite_data: bytes,
    species_id: int,
    side: str,
) -> bytes:
    expected_pixel_data_size = (
        BATTLE_SPRITE_SOURCE_SIZE[0] * BATTLE_SPRITE_SOURCE_SIZE[1] // 2
    )
    expected_file_size = 0x30 + expected_pixel_data_size
    if len(sprite_data) != expected_file_size:
        raise ValueError(
            f"Pokemon {species_id} {side} NCGR has {len(sprite_data)} bytes; "
            f"expected {expected_file_size}"
        )
    if sprite_data[:4] != b"RGCN" or sprite_data[16:20] != b"RAHC":
        raise ValueError(f"Pokemon {species_id} {side} sprite is not a supported NCGR")

    encrypted_pixels = sprite_data[0x30:]
    encryption_seed = read_u16le(encrypted_pixels, 0)
    decrypted_pixels = bytearray()
    for offset in range(0, len(encrypted_pixels), 2):
        encrypted_word = read_u16le(encrypted_pixels, offset)
        decrypted_word = encrypted_word ^ (encryption_seed & 0xFFFF)
        decrypted_pixels.extend(decrypted_word.to_bytes(2, "little"))
        encryption_seed = (
            encryption_seed * BATTLE_SPRITE_ENCRYPTION_MULTIPLIER
            + BATTLE_SPRITE_ENCRYPTION_INCREMENT
        ) & 0xFFFFFFFF

    return bytes(decrypted_pixels)


def decode_battle_sprite_palette(
    palette_data: bytes,
    species_id: int,
) -> list[tuple[int, int, int, int]]:
    expected_file_size = 0x28 + 16 * 2
    if len(palette_data) != expected_file_size:
        raise ValueError(
            f"Pokemon {species_id} NCLR has {len(palette_data)} bytes; "
            f"expected {expected_file_size}"
        )
    if palette_data[:4] != b"RLCN" or palette_data[16:20] != b"TTLP":
        raise ValueError(f"Pokemon {species_id} palette is not a supported NCLR")

    palette: list[tuple[int, int, int, int]] = []
    for color_index in range(16):
        color = read_u16le(palette_data, 0x28 + color_index * 2)
        if color_index == 0:
            palette.append((0, 0, 0, 0))
            continue

        palette.append(
            (
                (color & 0x1F) << 3,
                ((color >> 5) & 0x1F) << 3,
                ((color >> 10) & 0x1F) << 3,
                255,
            )
        )

    return palette


def parse_move_records(
    moves: NARC,
    move_names: dict[int, str],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for move_id, file_data in enumerate(moves.files):
        data = bytes(file_data)
        if len(data) != 16:
            raise ValueError(f"Move record {move_id} has {len(data)} bytes; expected 16")

        effect_code = read_u16le(data, 0)
        category_id = data[2]
        if category_id not in GEN4_MOVE_CATEGORY_NAMES:
            raise ValueError(f"Move record {move_id} has invalid category {category_id}")

        type_id = data[4]
        if type_id >= len(GEN4_TYPE_NAMES):
            raise ValueError(f"Move record {move_id} has invalid type {type_id}")

        accuracy = data[5]
        pp = data[6]
        effect_chance = data[7]
        target_range = read_u16le(data, 8)
        priority = read_i8(data, 10)
        contest_effect = data[12]
        contest_type = data[13]
        unknown14 = read_u16le(data, 14)

        validate_integer_range(
            f"Move record {move_id} effect code", effect_code, 0, GEN4_MOVE_EFFECT_MAX
        )
        validate_integer_range(
            f"Move record {move_id} accuracy", accuracy, 0, GEN4_MOVE_MAX_ACCURACY
        )
        validate_integer_range(
            f"Move record {move_id} PP",
            pp,
            0 if move_id == 0 else 1,
            GEN4_MOVE_MAX_PP,
        )
        validate_integer_range(
            f"Move record {move_id} effect chance",
            effect_chance,
            0,
            GEN4_MOVE_MAX_EFFECT_CHANCE,
        )
        if target_range not in GEN4_MOVE_TARGET_RANGES:
            raise ValueError(
                f"Move record {move_id} has invalid target range {target_range}"
            )
        validate_integer_range(
            f"Move record {move_id} priority",
            priority,
            GEN4_MOVE_PRIORITY_MIN,
            GEN4_MOVE_PRIORITY_MAX,
        )
        validate_integer_range(
            f"Move record {move_id} contest effect",
            contest_effect,
            0,
            GEN4_MOVE_MAX_CONTEST_EFFECT,
        )
        validate_integer_range(
            f"Move record {move_id} contest type",
            contest_type,
            0,
            GEN4_MOVE_MAX_CONTEST_TYPE,
        )
        validate_exact_value(f"Move record {move_id} unknown14", unknown14, 0)

        record = {
            "id": move_id,
            "rawHex": data.hex(),
            "effectCode": effect_code,
            "category": GEN4_MOVE_CATEGORY_NAMES[category_id],
            "categoryId": category_id,
            "power": data[3],
            "typeId": type_id,
            "typeName": GEN4_TYPE_NAMES[type_id],
            "accuracy": accuracy,
            "pp": pp,
            "effectChance": effect_chance,
            "range": target_range,
            "priority": priority,
            "flags": data[11],
            "contestEffect": contest_effect,
            "contestType": contest_type,
            "unknown14": unknown14,
        }
        move_name = move_names.get(move_id)
        if 1 <= move_id <= MAX_LEVEL_UP_MOVE_ID:
            if not move_name:
                raise ValueError(f"Move record {move_id} has no decoded name")
            record["name"] = move_name
        elif move_name:
            raise ValueError(f"Internal move record {move_id} unexpectedly has a name")
        records.append(record)

    return records


def parse_item_records(
    items: NARC,
    item_names: dict[int, str],
    item_descriptions: dict[int, str],
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for item_id, file_data in enumerate(items.files):
        if item_id == 0:
            continue

        data = bytes(file_data)
        if len(data) != 34:
            raise ValueError(f"Item record {item_id} has {len(data)} bytes; expected 34")

        name = item_names.get(item_id)
        if not name:
            raise ValueError(f"Item record {item_id} has no decoded name")
        description = item_descriptions.get(item_id)
        if not description:
            raise ValueError(f"Item record {item_id} has no decoded description")

        packed_properties = read_u16le(data, 8)
        record: dict[str, Any] = {
            "id": item_id,
            "rawHex": data.hex(),
            "name": name,
            "description": description,
            "price": read_u16le(data, 0),
            "holdEffect": data[2],
            "holdEffectParam": data[3],
            "pluckEffect": data[4],
            "flingEffect": data[5],
            "flingPower": data[6],
            "naturalGiftPower": data[7],
            "naturalGiftType": packed_properties & 0x1F,
            "preventToss": bool(packed_properties & 0x20),
            "selectable": bool(packed_properties & 0x40),
            "fieldPocket": (packed_properties >> 7) & 0x0F,
            "battlePocket": (packed_properties >> 11) & 0x1F,
            "fieldUseFunc": data[10],
            "battleUseFunc": data[11],
            "partyUse": bool(data[12]),
        }
        if record["partyUse"]:
            record["partyUseEffects"] = parse_item_party_use_effects(data)
        records.append(record)

    return records


def parse_item_party_use_effects(data: bytes) -> dict[str, Any]:
    return {
        "sleepHeal": bool(data[14] & 0x01),
        "poisonHeal": bool(data[14] & 0x02),
        "burnHeal": bool(data[14] & 0x04),
        "freezeHeal": bool(data[14] & 0x08),
        "paralysisHeal": bool(data[14] & 0x10),
        "confusionHeal": bool(data[14] & 0x20),
        "infatuationHeal": bool(data[14] & 0x40),
        "guardSpec": bool(data[14] & 0x80),
        "revive": bool(data[15] & 0x01),
        "reviveAll": bool(data[15] & 0x02),
        "levelUp": bool(data[15] & 0x04),
        "evolve": bool(data[15] & 0x08),
        "attackStages": data[15] >> 4,
        "defenseStages": data[16] & 0x0F,
        "specialAttackStages": data[16] >> 4,
        "specialDefenseStages": data[17] & 0x0F,
        "speedStages": data[17] >> 4,
        "accuracyStages": data[18] & 0x0F,
        "criticalRateStages": (data[18] >> 4) & 0x03,
        "ppUp": bool(data[18] & 0x40),
        "ppMax": bool(data[18] & 0x80),
        "ppRestore": bool(data[19] & 0x01),
        "ppRestoreAll": bool(data[19] & 0x02),
        "hpRestore": bool(data[19] & 0x04),
        "hpEvUp": bool(data[19] & 0x08),
        "attackEvUp": bool(data[19] & 0x10),
        "defenseEvUp": bool(data[19] & 0x20),
        "speedEvUp": bool(data[19] & 0x40),
        "specialAttackEvUp": bool(data[19] & 0x80),
        "specialDefenseEvUp": bool(data[20] & 0x01),
        "friendshipLow": bool(data[20] & 0x02),
        "friendshipMedium": bool(data[20] & 0x04),
        "friendshipHigh": bool(data[20] & 0x08),
        "hpEvUpParam": read_i8(data, 21),
        "attackEvUpParam": read_i8(data, 22),
        "defenseEvUpParam": read_i8(data, 23),
        "speedEvUpParam": read_i8(data, 24),
        "specialAttackEvUpParam": read_i8(data, 25),
        "specialDefenseEvUpParam": read_i8(data, 26),
        "hpRestoreParam": data[27],
        "ppRestoreParam": data[28],
        "friendshipLowParam": read_i8(data, 29),
        "friendshipMediumParam": read_i8(data, 30),
        "friendshipHighParam": read_i8(data, 31),
    }


def parse_growth_tables(growth_tables: NARC) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []

    for growth_rate, file_data in enumerate(growth_tables.files):
        data = bytes(file_data)
        if len(data) != 404:
            raise ValueError(
                f"Growth table {growth_rate} has {len(data)} bytes; expected 404"
            )
        records.append(
            {
                "growth_rate": growth_rate,
                "experience": [
                    read_u32le(data, offset) for offset in range(0, len(data), 4)
                ],
            }
        )

    validate_exact_value("growth table 0 level 100", records[0]["experience"][100], 1_000_000)
    validate_exact_value("growth table 1 level 100", records[1]["experience"][100], 600_000)
    validate_exact_value("growth table 2 level 100", records[2]["experience"][100], 1_640_000)
    validate_exact_value("growth table 3 level 100", records[3]["experience"][100], 1_059_860)
    return records


def parse_learnsets(learnset_narc: NARC) -> dict[int, list[dict[str, int]]]:
    learnsets: dict[int, list[dict[str, int]]] = {}

    for species_id, file_data in enumerate(learnset_narc.files):
        rows: list[dict[str, int]] = []
        data = bytes(file_data)
        if len(data) % 2 != 0:
            raise ValueError(
                f"Learnset {species_id} has an odd byte length: {len(data)}"
            )

        values = [read_u16le(data, offset) for offset in range(0, len(data), 2)]
        terminator_indexes = [
            index for index, value in enumerate(values) if value == 0xFFFF
        ]
        if len(terminator_indexes) != 1:
            raise ValueError(
                f"Learnset {species_id} has {len(terminator_indexes)} FFFF terminators; "
                "expected exactly 1"
            )

        terminator_index = terminator_indexes[0]
        expected_padding = [0] if terminator_index % 2 == 0 else []
        padding = values[terminator_index + 1 :]
        if padding != expected_padding:
            raise ValueError(
                f"Learnset {species_id} has invalid data after its FFFF terminator: "
                f"expected {expected_padding}, got {padding}"
            )

        seen_rows: set[tuple[int, int]] = set()
        for value in values[:terminator_index]:
            move_id = value & 0x1FF
            level = value >> 9
            validate_integer_range(
                f"Learnset {species_id} move ID", move_id, 1, MAX_LEVEL_UP_MOVE_ID
            )
            validate_integer_range(
                f"Learnset {species_id} level", level, 1, MAX_POKEMON_LEVEL
            )

            row = (level, move_id)
            if row in seen_rows:
                raise ValueError(
                    f"Learnset {species_id} has duplicate row: "
                    f"level {level}, move ID {move_id}"
                )
            seen_rows.add(row)
            rows.append({"level": level, "moveId": move_id})

        learnsets[species_id] = rows

    return learnsets


def parse_evolutions(evolution_narc: NARC) -> dict[int, list[dict[str, int]]]:
    evolutions: dict[int, list[dict[str, int]]] = {}

    for species_id, file_data in enumerate(evolution_narc.files):
        rows: list[dict[str, int]] = []
        data = bytes(file_data)

        for offset in range(0, len(data) - 5, 6):
            method = read_u16le(data, offset)
            parameter = read_u16le(data, offset + 2)
            target_species_id = read_u16le(data, offset + 4)

            if method == 0 and parameter == 0 and target_species_id == 0:
                continue

            rows.append(
                {
                    "method": method,
                    "parameter": parameter,
                    "targetSpeciesId": target_species_id,
                }
            )

        evolutions[species_id] = rows

    return evolutions


def read_u16le(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset : offset + 2], "little")


def read_i8(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset : offset + 1], "little", signed=True)


def read_u32le(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset : offset + 4], "little")


def validate_exact_value(label: str, actual: Any, expected: Any) -> None:
    if actual != expected:
        raise ValueError(f"Unexpected {label}: expected {expected!r}, got {actual!r}")


def validate_integer_range(label: str, actual: int, minimum: int, maximum: int) -> None:
    if not minimum <= actual <= maximum:
        raise ValueError(
            f"Unexpected {label}: expected {minimum}..{maximum}, got {actual}"
        )


def unique_type_ids(type_ids: list[int]) -> list[int]:
    unique: list[int] = []
    for type_id in type_ids:
        if type_id not in unique:
            unique.append(type_id)
    return unique


def resolve_repo_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_sprite_sheets(directory: Path, sprite_sheets: dict[str, Image.Image]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for filename, sprite_sheet in sprite_sheets.items():
        sprite_sheet.save(directory / filename, format="PNG")


def write_image(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")


if __name__ == "__main__":
    main()
