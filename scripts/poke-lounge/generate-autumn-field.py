#!/usr/bin/env python3
"""Assemble the autumn field atlas from the checked HeartGold ROM and existing atlas."""
from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

from ndspy import _common, color, texture
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
ROM = ROOT / "data/roms/포켓몬스터 하트골드(K).nds"
ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
SOURCE = ROOT / "apps/web/public/assets/pokemmo-reference/tilesets/tuxmon-sample-32px-extruded.png"
DEST = ROOT / "apps/web/public/assets/poke-lounge/world"
NEAREST = Image.Resampling.NEAREST


def decode_member(data: bytes) -> tuple[dict, dict]:
    assert data[:4] == b"BTX0", "Expected an uncompressed NSBTX member"
    btx = texture.NSBTX(data)
    block = data[0x14:]
    assert block[:4] == b"TEX0"
    values = struct.unpack_from("<IHH3IHH4IHH2I", block, 8)
    palette_length, palette_offset, palette_data = values[-4] * 8, values[-2], values[-1]
    records = [
        (name, palette_data + struct.unpack("<HH", header)[0] * 8)
        for name, _, _, header in _common.loadInfoBlock(block, palette_offset, 4)
    ]
    # Shared palette offsets must end at the next greater offset; ndspy 4.2 uses the next entry.
    ends = sorted({offset for _, offset in records} | {palette_data + palette_length})
    palettes = {}
    for name, start in records:
        end = next(offset for offset in ends if offset > start)
        palettes[name] = SimpleNamespace(colors=list(struct.unpack(f"<{(end - start) // 2}H", block[start:end])))
    return dict(btx.textures), palettes


def paste_extruded_tile(atlas: Image.Image, tile: Image.Image, index: int, columns: int) -> None:
    x, y = index % columns * 34 + 1, index // columns * 34 + 1
    atlas.paste(tile, (x, y))
    atlas.paste(tile.crop((0, 0, 32, 1)), (x, y - 1))
    atlas.paste(tile.crop((0, 31, 32, 32)), (x, y + 32))
    atlas.paste(tile.crop((0, 0, 1, 32)), (x - 1, y))
    atlas.paste(tile.crop((31, 0, 32, 32)), (x + 32, y))
    for a, b in ((0, 0), (31, 0), (0, 31), (31, 31)):
        atlas.putpixel((x - 1 if a == 0 else x + 32, y - 1 if b == 0 else y + 32), tile.getpixel((a, b)))


def main() -> None:
    assert hashlib.sha1(ROM.read_bytes()).hexdigest() == ROM_SHA1, "Unexpected ROM revision"
    for script in ("extract-field-trees.py", "extract-field-grass-effect.py"):
        subprocess.run([sys.executable, "-B", str(ROOT / "scripts/poke-lounge" / script)], check=True)
    source = Image.open(SOURCE).convert("RGBA")
    assert source.size == (816, 1020), "Expected 24 columns × 30 rows of extruded 32px tiles"
    color.prepareLUTs()
    rom = NintendoDSRom.fromFile(ROM)
    archive = NARC(rom.getFileByName("a/0/4/4"))
    members = {6: decode_member(bytes(archive.files[6]))}
    used = []

    def get(member: int, name: str, palette_name: str | None = None) -> Image.Image:
        textures, palettes = members[member]
        if palette_name is None:
            palette_name = next((n for n in (name, name + "_pl") if n in palettes), None)
        assert palette_name in palettes, f"No exact palette for {member}:{name}"
        image = textures[name].renderAsImage(palettes[palette_name]).convert("RGBA")
        assert image.width in (16, 32, 64) and image.height in (16, 32, 64)
        used.append({"member": member, "texture": name, "palette": palette_name, "size": list(image.size)})
        return image

    # Restore the pre-autumn terrain while retaining the ROM foliage and current map layout.
    ground = source.crop((171, 171, 203, 203))  # Original atlas GID 126.
    ground_variant = ground.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    grass_detail = ground.copy()
    blades = get(6, "grass01_a")
    grass_detail.alpha_composite(blades, (5, 9))
    path = source.crop((171, 239, 203, 271))  # Original atlas Path GID 174.
    tiles = {721: ground, 722: ground_variant, 723: ground, 724: ground_variant, 725: grass_detail}

    for mask in range(16):
        tile = path.copy()
        # Unconnected sides retain a thin ground verge; opposite tiles join without seams.
        for bit, box in ((1, (0, 0, 32, 3)), (2, (29, 0, 32, 32)), (4, (0, 29, 32, 32)), (8, (0, 0, 3, 32))):
            if not mask & bit:
                tile.paste(ground.crop(box), box[:2])
        tiles[729 + mask] = tile

    tree_atlas = Image.open(DEST / "field-trees.png").convert("RGBA")
    assert tree_atlas.size == (192, 64)
    tree_previews = []
    grass_tiles = {}
    for index, first in enumerate((745, 749, 753)):
        tree = tree_atlas.crop((index * 64, 0, (index + 1) * 64, 64))
        tree_previews.append(tree)
        for index in range(4):
            x, y = index % 2 * 32, index // 2 * 32
            tiles[first + index] = tree.crop((x, y, x + 32, y + 32))

    blades = get(6, "egrass_u").resize((32, 32), NEAREST)
    encounter = ground.copy()
    # Overlap full-proportion ROM leaves across tile boundaries instead of flattening each clump.
    for row in range(-2, 2):
        for column in range(-1, 2):
            encounter.alpha_composite(blades, (column * 32 + (row % 2) * 16, row * 16))
    leaf_alpha = blades.crop(blades.getbbox()).getchannel("A")
    upper = [next(y for y in range(leaf_alpha.height) if leaf_alpha.getpixel((x, y))) for x in range(32)]
    lower = [next(y for y in range(leaf_alpha.height) if leaf_alpha.getpixel((x, leaf_alpha.height - 1 - y))) for x in range(32)]
    for mask in range(16):
        tile = encounter.copy()
        # Only exposed patch edges reveal the ground; connected tiles keep their shared pixels.
        alpha = Image.new("L", (32, 32))
        alpha.putdata([
            255 if ((mask & 1 or y >= upper[x] + 2)
                    and (mask & 2 or x < 30 - upper[y] // 2)
                    and (mask & 4 or y < 30 - lower[(x + 16) % 32])
                    and (mask & 8 or x >= 2 + upper[y] // 2)) else 0
            for y in range(32) for x in range(32)
        ])
        tile.putalpha(alpha)
        fringe = tile.copy()
        fringe.paste((0, 0, 0, 0), (0, 0, 32, 22))
        fringe.putalpha(fringe.getchannel("A").point(lambda a: round(a * .4)))
        grass_tiles[mask] = tile
        grass_tiles[16 + mask] = fringe
    tiles[757] = grass_tiles[15]
    tiles[758] = grass_tiles[31]
    assert len(tiles) == 35 and all(tile.size == (32, 32) for tile in tiles.values())

    assert len(grass_tiles) == 32 and all(tile.size == (32, 32) for tile in grass_tiles.values())
    assert grass_tiles[15].getchannel("A").getextrema() == (255, 255)
    assert grass_tiles[0].getchannel("A").getextrema() == (0, 255)
    assert all(grass_tiles[16 + mask].crop((0, 22, 32, 32)).convert("RGB").tobytes() == grass_tiles[mask].crop((0, 22, 32, 32)).convert("RGB").tobytes() for mask in range(16))
    assert all(max(grass_tiles[16 + mask].getchannel("A").getdata()) <= 102 for mask in range(16))
    grass_atlas = Image.new("RGBA", (544, 68))
    for index, tile in grass_tiles.items():
        paste_extruded_tile(grass_atlas, tile, index, 16)

    atlas = Image.new("RGBA", (816, 1088))
    atlas.paste(source, (0, 0))
    for gid, tile in tiles.items():
        paste_extruded_tile(atlas, tile, gid - 1, 24)
    assert ImageChops.difference(atlas.crop((0, 0, 816, 1020)), source).getbbox() is None
    assert atlas.getbbox() and atlas.size == (816, 1088)
    DEST.mkdir(parents=True, exist_ok=True)
    atlas.save(DEST / "autumn-forest-32px-extruded.png", optimize=True)
    # Older open clients still preload the previously published autumn-forest-motion.png.
    grass_atlas.save(DEST / "autumn-forest-grass.png", optimize=True)
    manifest = {
        "rom": "포켓몬스터 하트골드(K).nds", "romSha1": ROM_SHA1, "archive": "a/0/4/4",
        "baseAtlas": str(SOURCE.relative_to(ROOT)), "baseAtlasSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "processing": "Preserve base 720 tiles and the approved green ground/path colors and map layout. Trees use the original autumn map model geometry, UVs and colors, projected and uniformly fitted to 64px. Static grass retains the existing staggered egrass_u layout and matching lower-10px foreground at 40% opacity. The separate normal-grass step effect preserves the full original RGBA and model dimensions. No generated artwork or synthetic wind.",
        "tileSize": 32, "margin": 1, "spacing": 2, "columns": 24, "tileCount": 768,
        "gids": {"721-725": "original green ground, mirrored ground, ground, mirrored ground, green grass detail", "729-744": "original pale dirt with path mask 0..15 (N=1 E=2 S=4 W=8)", "745-748": "red tree row-major", "749-752": "orange tree row-major", "753-756": "gold tree row-major", "757": "green encounter grass", "758": "encounter grass foreground"},
        "textures": used,
        "trees": {"sourceManifest": "field-trees.json", "quadrantOrder": "top-left, top-right, bottom-left, bottom-right"},
        "grassStep": {"sourceManifest": "field-grass-effect.json", "lifecycle": "Initially settled; entries play to tick 12 at 30Hz; tick 13 begins exit checks; final pose remains while the actor occupies the tile."},
        "grassAtlas": {
            "path": "apps/web/public/assets/poke-lounge/world/autumn-forest-grass.png",
            "size": [544, 68], "tileSize": 32, "margin": 1, "spacing": 2, "columns": 16, "rows": 2,
            "staticBaseTileIndices": [0, 15], "staticForegroundTileIndices": [16, 31],
            "connectivityMask": "N=1 E=2 S=4 W=8; connected sides stay seamless",
        },
    }
    (DEST / "autumn-forest-source.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    preview = Image.new("RGBA", (384, 192), ground.getpixel((0, 0)))
    for index, tree in enumerate(tree_previews):
        preview.alpha_composite(tree, (index * 96 + 16, 8))
    for index, gid in enumerate((721, 723, 724, 725, 744, 757, 758)):
        preview.alpha_composite(tiles[gid], (index * 48 + 8, 104))
    for index, gid in enumerate((729, 730, 732, 734, 736, 739, 744)):
        preview.alpha_composite(tiles[gid], (index * 48 + 8, 152))
    evidence = ROOT / "output/environment-sprite-refine"
    evidence.mkdir(parents=True, exist_ok=True)
    preview.resize((1152, 576), NEAREST).save(evidence / "asset-preview.png")
    print(f"Wrote 35 field tiles and 32 connected-grass tiles; preserved 720 original tiles: {DEST}")


if __name__ == "__main__":
    main()
