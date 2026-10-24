#!/usr/bin/env python3
"""Extract HeartGold's normal-grass billboard, checking its original model and keys."""
from __future__ import annotations

from rom_constants import ROM_SHA1

import argparse
import hashlib
import json
import runpy
import struct
from pathlib import Path

from ndspy import _common, color
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ROM = ROOT / "data/roms/포켓몬스터 하트골드(K).nds"
DEST = ROOT / "apps/web/public/assets/poke-lounge/world"
EVIDENCE = ROOT / "output/rom-grass-port-20261021"
ARCHIVE = "a/1/0/3"


def signed(value: int, bits: int) -> int:
    return value - (1 << bits) if value & (1 << (bits - 1)) else value


def extract_grass_effect(rom: NintendoDSRom) -> tuple[list[Image.Image], dict]:
    archive = NARC(rom.getFileByName(ARCHIVE))
    model, control, texture_data = (bytes(archive.files[i]) for i in (126, 140, 25))
    assert model[:4] == b"BMD0"
    block = struct.unpack_from("<I", model, 16)[0]
    assert model[block:block + 4] == b"MDL0"
    resources = _common.loadInfoBlock(model, block + 8, 4)
    assert len(resources) == 1 and resources[0][0] == "kusaeff"
    start = block + struct.unpack("<I", resources[0][3])[0]
    _, sbc, material, shape, _ = struct.unpack_from("<5I", model, start)
    info = model[start + 20:start + 64]
    assert tuple(info[3:6]) == (1, 1, 1), "Expected one node, material, and shape"
    scale = struct.unpack_from("<i", info, 8)[0] / 4096
    assert scale == 8
    nodes = _common.loadInfoBlock(model, start + 64, 4)
    assert len(nodes) == 1 and nodes[0][0] == "kusaeff"
    node = start + 64 + struct.unpack("<I", nodes[0][3])[0]
    assert struct.unpack_from("<HH", model, node) == (0xF807, 0x1000), "Expected identity node"
    # The original SBC billboards this quad: baking a camera rotation would apply it twice.
    expected_sbc = bytes.fromhex("06 00 00 00 02 00 01 07 00 0b 04 00 05 00 2b 01")
    assert model[start + sbc:start + material] == expected_sbc
    shapes = _common.loadInfoBlock(model, start + shape, 4)
    assert len(shapes) == 1 and shapes[0][0] == "polygon0"
    shape_start = start + shape + struct.unpack("<I", shapes[0][3])[0]
    _, shape_size, flags, display_offset, display_size = struct.unpack_from("<HHIII", model, shape_start)
    assert shape_size == 16 and flags == 5
    display = model[shape_start + display_offset:shape_start + display_offset + display_size]
    offset, vertices, uv = 0, [], None
    position = [0.0, 0.0, 0.0]
    command_words = {0: 0, 0x21: 1, 0x22: 1, 0x24: 1, 0x25: 1, 0x40: 1, 0x41: 0}
    while offset < len(display):
        commands = display[offset:offset + 4]
        offset += 4
        for command in commands:
            assert command in command_words, f"Unimplemented GX command {command:#x}"
            count = command_words[command]
            arguments = struct.unpack_from(f"<{count}I", display, offset)
            offset += count * 4
            value = arguments[0] if arguments else 0
            if command == 0x40:
                assert value == 1, "Expected a GX QUADS primitive"
            elif command == 0x21:
                assert value == 0x1FF00000, "Expected front-facing normal"
            elif command == 0x22:
                uv = [signed(value & 0xFFFF, 16) / 16, signed(value >> 16, 16) / 16]
            elif command == 0x24:
                position = [signed((value >> shift) & 1023, 10) / 64 for shift in (0, 10, 20)]
                vertices.append({"position": [p * scale for p in position], "uv": uv})
            elif command == 0x25:
                position[:2] = [signed(value & 0xFFFF, 16) / 4096, signed(value >> 16, 16) / 4096]
                vertices.append({"position": [p * scale for p in position], "uv": uv})
    assert offset == len(display)
    assert vertices == [
        {"position": [-16, 0, 0], "uv": [0, 32]},
        {"position": [16, 0, 0], "uv": [32, 32]},
        {"position": [16, 32, 0], "uv": [32, 0]},
        {"position": [-16, 32, 0], "uv": [0, 0]},
    ], "The original billboard no longer maps one texture pixel to one world unit"
    material_start = start + material
    materials = _common.loadInfoBlock(model, material_start + 4, 4)
    assert len(materials) == 1 and materials[0][0] == "kusaeff_mat"
    material_record = material_start + struct.unpack("<I", materials[0][3])[0]
    diffuse_ambient, specular_emission, polygon_attributes = struct.unpack_from("<III", model, material_record + 4)
    assert diffuse_ambient == 0x7FFF8000 and specular_emission == 0, "Expected white ambient without diffuse lighting"
    assert ((polygon_attributes >> 16) & 31) == 31, "Expected full polygon alpha"
    count = struct.unpack_from("<I", control)[0]
    assert count == 4 and len(control) == 20
    ticks = list(struct.unpack_from(f"<{count}H", control, 4))
    texture_indices = list(control[4 + count * 2:4 + count * 3])
    palette_indices = list(control[4 + count * 3:])
    assert ticks == [0, 4, 8, 12] and texture_indices == [0, 1, 2, 3] and palette_indices == [0] * 4
    decode_member = runpy.run_path(str(ROOT / "scripts/poke-lounge/generate-autumn-field.py"))["decode_member"]
    textures, palettes = decode_member(texture_data)
    color.prepareLUTs()
    names = [f"kusaeff.{index + 1}" for index in texture_indices]
    assert list(textures) == names and list(palettes) == ["kusaeff"]
    frames = [textures[name].renderAsImage(palettes["kusaeff"]).convert("RGBA") for name in names]
    assert all(frame.size == (32, 32) for frame in frames)
    assert all(set(frame.getchannel("A").getdata()) == {0, 255} for frame in frames)
    assert len({frame.tobytes() for frame in frames}) == 4
    metadata = {
        "romSha1": ROM_SHA1,
        "archive": ARCHIVE,
        "controlMember": 140,
        "textureMember": 25,
        "membersSha256": {str(i): hashlib.sha256(bytes(archive.files[i])).hexdigest() for i in (126, 140, 25)},
        "textures": names,
        "palette": "kusaeff",
        "frameKeys": ticks,
        "tickRate": 30,
        "frameWidth": 32,
        "frameHeight": 32,
        "worldWidth": 32,
        "worldHeight": 32,
        "paletteIndices": palette_indices,
        "model": {"name": "kusaeff", "member": 126, "positionScale": scale, "billboard": True, "vertices": vertices},
        "originalTileWorldUnits": 16,
        "tileAnchorWorld": [8, 18],
        "projectTilePixels": 32,
        "projectSize": [64, 64],
        "projectAnchor": [32, 64],
        "projectTileAnchor": [16, 36],
        "projectOriginOffset": [-16, -28],
        "alphaBounds": [list(frame.getbbox()) for frame in frames],
        "alphaValues": [sorted(set(frame.getchannel("A").getdata())) for frame in frames],
        "processing": "Original full RGBA and UV orientation; nearest-neighbor 2x only. No crop, recolor, opacity adjustment, or generated motion.",
        "sourceReferences": [
            {"claim": "normal grass resource loading", "file": "asm/overlay_01_021FEEEC.s", "lines": [43, 76]},
            {"claim": "tile anchor X=tile*16+8, Z=tile*16+18", "file": "asm/overlay_01_021FEEEC.s", "lines": [340, 362]},
            {"claim": "map tile world size is 16", "file": "src/map_object.c", "lines": [1989, 1995]},
            {"claim": "main queue runs every two VBlanks", "file": "src/main.c", "lines": [104, 129]},
            {"claim": "field effects run on main queue", "file": "asm/unk_020689C8.s", "lines": [291, 291]},
        ],
    }
    return frames, metadata


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEST)
    destination = parser.parse_args().output.resolve()
    assert ROOT == destination or ROOT in destination.parents, "Output must remain inside this workspace"
    assert hashlib.sha1(ROM.read_bytes()).hexdigest() == ROM_SHA1, "Unexpected ROM revision"
    frames, metadata = extract_grass_effect(NintendoDSRom.fromFile(ROM))
    destination.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    native_sheet = Image.new("RGBA", (128, 32))
    sheet = Image.new("RGBA", (256, 64))
    preview = Image.new("RGBA", (256, 64), (64, 176, 128, 255))
    for index, frame in enumerate(frames):
        frame.save(EVIDENCE / f"kusaeff-{index}.png")
        native_sheet.paste(frame, (index * 32, 0))
        ported = frame.resize((64, 64), Image.Resampling.NEAREST)
        sheet.paste(ported, (index * 64, 0))
        preview.alpha_composite(ported, (index * 64, 0))
    native_sheet.save(destination / "field-grass-effect.png")
    sheet.save(EVIDENCE / "grass-step.png")
    preview.resize((768, 192), Image.Resampling.NEAREST).save(EVIDENCE / "grass-step-contact.png")
    (destination / "field-grass-effect.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(destination.relative_to(ROOT)), "frames": 4, "size": metadata["projectSize"], "keys": metadata["frameKeys"]}))


if __name__ == "__main__":
    main()
