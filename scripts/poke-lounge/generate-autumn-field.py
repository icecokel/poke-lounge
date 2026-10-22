#!/usr/bin/env python3
"""Assemble original yellow meadow grass and autumn ground with the checked HeartGold base atlas."""
from __future__ import annotations

import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path
from random import Random
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

    # Keep the ground palette shared with the map and the rice patch verges.
    ground = Image.open(DEST / "original-ground/01-meadow-grass.png").convert("RGBA").crop((0, 0, 32, 32))
    ground_variant = ground.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    grass_detail = ground.copy()
    blades = get(6, "grass01_a")
    grass_detail.alpha_composite(blades, (5, 9))
    path = Image.open(DEST / "original-ground/03-golden-earth.png").convert("RGBA").crop((0, 0, 32, 32))
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

    rice = DEST / "original-rice"
    clump = Image.open(rice / "13-tall-golden-grass-clump.png").convert("RGBA")
    assert clump.size == (28, 22)
    assert set(clump.getchannel("A").getdata()) == {0, 255}
    assert len({pixel[:3] for pixel in clump.getdata() if pixel[3]}) == 4
    planting = Random(241023)
    tufts = []
    for row in range(14):
        for column in range(9):
            x = round(column*128/9 + (row%2)*7) + planting.randrange(-2,3)
            y = round(row*128/14) + planting.randrange(-3,4)
            sprite = clump.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if planting.random()<.5 else clump
            for dx in (-128,0,128):
                for dy in (-128,0,128):
                    tufts.append((x+dx,y+dy,sprite))
    tufts.sort(key=lambda item:item[1])
    for variant in range(16):
        sx, sy = variant % 4 * 32, variant // 4 * 32
        for mask in range(16):
            tile = Image.new("RGBA", (32,32))
            fringe = Image.new("RGBA", (32,32))
            for root_x,root_y,sprite in tufts:
                x, y = root_x-sprite.width//2-sx, root_y-sprite.height-sy
                if x>=32 or y>=32 or x+sprite.width<=0 or y+sprite.height<=0:
                    continue
                # Exposed edges end in whole plants, with the meadow visible between them.
                if (not mask&8 and root_x<sx) or (not mask&2 and root_x>=sx+32):continue
                if (not mask&1 and root_y<sy) or (not mask&4 and root_y>=sy+32):continue
                seed = (root_x*19 + root_y*31) & 63
                exposed = ((not mask&8 and x<4) or (not mask&2 and x+sprite.width>28)
                           or (not mask&1 and y<4) or (not mask&4 and y+sprite.height>28))
                # Thin the fringe and vary whole-plant positions instead of lining up their roots.
                if exposed and seed%8<3:continue
                if mask&1 and mask&10 and not mask&4 and root_y-sy>30-seed//8:continue
                if not mask&8:x=max(seed%8,x)
                if not mask&2:x=min(32-sprite.width-(seed//8)%8,x)
                if not mask&1:y=max((seed//8)%8,y)
                if not mask&10:x=seed%(33-sprite.width)
                if not mask&5:y=seed%(33-sprite.height)
                tile.alpha_composite(sprite,(x,y))
                if y+sprite.height>=27:fringe.alpha_composite(sprite,(x,y))
            # Only the front eight pixels cover the actor; tall leaves must not hide the head.
            fringe.paste((0,0,0,0),(0,0,32,24))
            fringe.putalpha(fringe.getchannel("A").point(lambda a: round(a*.65)))
            grass_tiles[variant*32 + mask] = tile
            grass_tiles[variant*32 + 16 + mask] = fringe
    tiles[757] = grass_tiles[15]
    tiles[758] = grass_tiles[31]
    assert len(tiles) == 35 and all(tile.size == (32, 32) for tile in tiles.values())

    assert len(grass_tiles) == 512 and all(tile.size == (32, 32) for tile in grass_tiles.values())
    assert all(set(grass_tiles[v*32+15].getchannel("A").getdata()) <= {0, 255} for v in range(16))
    assert grass_tiles[0].getchannel("A").getextrema() == (0, 255)
    assert all(grass_tiles[v*32+m].getbbox() for v in range(16) for m in range(16)), [
        (v,m) for v in range(16) for m in range(16) if not grass_tiles[v*32+m].getbbox()
    ]
    assert all(grass_tiles[v*32+16+m].getchannel("A").getextrema()[1] <= 166 for v in range(16) for m in range(16))
    assert all(not grass_tiles[v*32+16+m].crop((0,0,32,24)).getbbox() for v in range(16) for m in range(16))
    grass_atlas = Image.new("RGBA", (544, 1088))
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
    grass_atlas.save(DEST / "autumn-forest-grass.png", optimize=True)
    manifest = {
        "rom": "포켓몬스터 하트골드(K).nds", "romSha1": ROM_SHA1, "archive": "a/0/4/4",
        "baseAtlas": str(SOURCE.relative_to(ROOT)), "baseAtlasSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "processing": "Preserve base 720 tiles and connected encounter behavior. Use original yellow meadow grass, introduction-matched ground and earth; generate-autumn-map.py then bakes autumn trees and continuous rounded paths into the final atlas.",
        "tileSize": 32, "margin": 1, "spacing": 2, "columns": 24, "tileCount": 768,
        "gids": {"721-725": "original olive ground and grass detail", "729-744": "original golden earth path masks N=1 E=2 S=4 W=8", "745-748": "red projected tree", "749-752": "orange projected tree", "753-756": "gold projected tree", "757": "yellow meadow encounter field", "758": "yellow meadow foreground"},
        "textures": used,
        "trees": {"sourceManifest": "field-trees.json", "quadrantOrder": "top-left, top-right, bottom-left, bottom-right"},
        "grassStep": {"sourceManifest": "original-rice/step.json", "lifecycle": "Initially settled; each grass tile entry plays four bending poses over 400ms. Foreground follows the feet and is clipped below the waist and inside exposed grass edges; final pose remains inside grass and hides immediately on exit."},
        "grassAtlas": {
            "path": "apps/web/public/assets/poke-lounge/world/autumn-forest-grass.png",
            "sourceManifest": "original-rice/source.json",
            "size": [544, 1088], "tileSize": 32, "margin": 1, "spacing": 2, "columns": 16, "rows": 32,
            "variantPattern": "4x4 world-coordinate cells; variant=(y%4)*4+x%4, base=variant*32+mask, foreground=base+16",
            "connectivityMask": "N=1 E=2 S=4 W=8; exposed edges end in whole clumps",
            "planting": "Four flat colors, native 28x22px tall golden grass inspired by ROM encounter grass; 126 overlapping clumps per 128x128 interior, with thinned, uneven whole-clump fringes and up to seven pixels of exposed-edge variation.",
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
    evidence = ROOT / "output/natural-grass-edge"
    evidence.mkdir(parents=True, exist_ok=True)
    preview.resize((1152, 576), NEAREST).save(evidence / "asset-preview.png")
    print(f"Wrote 35 field tiles and 512 connected rice tiles; preserved 720 original tiles: {DEST}")


if __name__ == "__main__":
    main()
