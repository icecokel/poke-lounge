#!/usr/bin/env python3
"""Read-only Korean HeartGold trainer extraction; JSON goes to stdout only."""

import argparse
import hashlib
import json
from pathlib import Path
import struct


ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
TRAINER_IDS = [244, 246, 418, 247, 245, 20, 21, 30, 31, 34, 33, 32, 35,
               701, 702, 703, 704, 705]


def narc_members(rom, file_id):
    # SHA-1로 고정된 IPKK ROM의 파일 ID: a/0/5/5=184, a/0/5/6=185.
    fat_offset = struct.unpack_from("<I", rom, 0x48)[0]
    start, end = struct.unpack_from("<II", rom, fat_offset + file_id * 8)
    archive = rom[start:end]
    assert archive[:4] == b"NARC"
    header_size, block_count = struct.unpack_from("<HH", archive, 12)
    offset = header_size
    entries = None
    data_offset = None
    for _ in range(block_count):
        tag = archive[offset:offset + 4]
        size = struct.unpack_from("<I", archive, offset + 4)[0]
        assert size >= 8 and offset + size <= len(archive)
        if tag == b"BTAF":
            count = struct.unpack_from("<H", archive, offset + 8)[0]
            entries = [struct.unpack_from("<II", archive, offset + 12 + i * 8)
                       for i in range(count)]
        elif tag == b"GMIF":
            data_offset = offset + 8
        offset += size
    assert entries is not None and data_offset is not None
    assert len(entries) == 738
    return [(archive[data_offset + a:data_offset + b], start + data_offset + a)
            for a, b in entries]


def extract(rom):
    if hashlib.sha1(rom).hexdigest() != ROM_SHA1:
        raise ValueError(f"Expected Korean HeartGold ROM SHA-1 {ROM_SHA1}")
    headers = narc_members(rom, 184)
    parties = narc_members(rom, 185)
    trainers = []
    for trainer_id in TRAINER_IDS:
        header, header_offset = headers[trainer_id]
        party, party_offset = parties[trainer_id]
        assert len(header) == 20 and header[0] == 3
        count = header[3]
        assert len(party) == (count * 18 + 3) // 4 * 4
        assert not any(party[count * 18:])
        members = []
        for slot in range(count):
            offset = slot * 18
            species = struct.unpack_from("<H", party, offset + 4)[0]
            assert species >> 10 == 0
            members.append({
                "speciesId": species & 1023,
                "level": struct.unpack_from("<H", party, offset + 2)[0],
                "moveIds": [m for m in struct.unpack_from("<4H", party, offset + 8) if m],
                "heldItemId": struct.unpack_from("<H", party, offset + 6)[0],
                "difficulty": party[offset],
                "genderAbilityOverride": party[offset + 1],
            })
        trainers.append({
            "trainerId": trainer_id,
            "trainerClass": header[1],
            "partyCount": count,
            "headerRomOffset": hex(header_offset),
            "partyRomOffset": hex(party_offset),
            "members": members,
        })
    return {"romSha1": ROM_SHA1, "trainers": trainers}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    args = parser.parse_args()
    print(json.dumps(extract(args.rom.read_bytes()), ensure_ascii=False, indent=2))
