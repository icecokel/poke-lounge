#!/usr/bin/env python3
"""Assemble the autumn field atlas from the checked HeartGold ROM and existing atlas."""
from __future__ import annotations

import hashlib
import json
import struct
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


def palette_tone(image: Image.Image, low: tuple, high: tuple) -> Image.Image:
    image = image.convert("RGBA")
    colors = {p[:3] for p in image.getdata() if p[3]}
    luma = lambda p: (p[0] * 3 + p[1] * 6 + p[2]) / 10
    darkest, lightest = min(map(luma, colors)), max(map(luma, colors))
    def convert(p):
        amount = (luma(p) - darkest) / max(1, lightest - darkest)
        return tuple(round(a + (b - a) * amount) for a, b in zip(low, high)) + (p[3],)
    image.putdata([convert(p) for p in image.getdata()])
    return image


def main() -> None:
    assert hashlib.sha1(ROM.read_bytes()).hexdigest() == ROM_SHA1, "Unexpected ROM revision"
    source = Image.open(SOURCE).convert("RGBA")
    assert source.size == (816, 1020), "Expected 24 columns × 30 rows of extruded 32px tiles"
    color.prepareLUTs()
    rom = NintendoDSRom.fromFile(ROM)
    archive = NARC(rom.getFileByName("a/0/4/4"))
    members = {index: decode_member(bytes(archive.files[index])) for index in (6, 88)}
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

    ground = palette_tone(get(6, "grass01gs", "grass01"), (143, 143, 91), (151, 151, 99))
    ground_variant = ground.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    leaves = get(88, "momi_load_")
    scattered = leaves.crop((0, 0, 32, 32))
    scattered.putalpha(scattered.getchannel("A").point(lambda a: round(a * .48)))
    litter = ground.copy()
    litter.alpha_composite(scattered)
    sparse = ground.copy()
    sparse.alpha_composite(scattered.crop((8, 5, 24, 21)), (4, 11))
    dry = ground.copy()
    blades = palette_tone(get(6, "grass01_a"), (132, 128, 72), (171, 159, 91))
    dry.alpha_composite(blades, (5, 9))
    path = palette_tone(get(6, "road05"), (167, 130, 85), (193, 158, 106))
    tiles = {721: ground, 722: ground_variant, 723: litter, 724: sparse, 725: dry}

    for mask in range(16):
        tile = path.copy()
        # Unconnected sides retain a thin ground verge; opposite tiles join without seams.
        for bit, box in ((1, (0, 0, 32, 3)), (2, (29, 0, 32, 32)), (4, (0, 29, 32, 32)), (8, (0, 0, 3, 32))):
            if not mask & bit:
                tile.paste(ground.crop(box), box[:2])
        tiles[729 + mask] = tile

    shadow = get(88, "t_tree2_g")
    shadow = shadow.crop(shadow.getbbox()).resize((48, 14), NEAREST)
    shadow.putalpha(shadow.getchannel("A").point(lambda a: round(a * .3)))
    trunk = get(6, "tree_en2_un")
    key = trunk.getpixel((0, 0))[:3]
    trunk.putdata([p[:3] + (0 if max(abs(p[i] - key[i]) for i in range(3)) < 20 or (p[1] > p[0] * 1.25 and p[2] > p[0] * 1.1) else p[3],) for p in trunk.getdata()])
    trunk = trunk.crop(trunk.getbbox()).resize((17, 24), NEAREST)
    tree_previews = []
    for first, name in ((745, "t_tree2_ex"), (749, "t_tree2_e"), (753, "t_tree2_ey")):
        canopy = get(88, name)
        canopy = canopy.crop(canopy.getbbox()).resize((60, 46), NEAREST)
        if first == 745:
            canopy = palette_tone(canopy, (130, 37, 27), (220, 81, 39))
        tree = Image.new("RGBA", (64, 64))
        tree.alpha_composite(shadow, (8, 47))
        tree.alpha_composite(trunk, (24, 35))
        tree.alpha_composite(canopy, (2, 3))
        tree_previews.append(tree)
        for index in range(4):
            x, y = index % 2 * 32, index // 2 * 32
            tiles[first + index] = tree.crop((x, y, x + 32, y + 32))

    encounter = palette_tone(get(6, "egrass"), (61, 79, 43), (119, 135, 64)).resize((32, 32), NEAREST)
    blades = palette_tone(get(6, "egrass_u"), (61, 79, 43), (119, 135, 64))
    fringe = Image.new("RGBA", (32, 32))
    # Keep the original foreground's lower 12px footprint so grass cannot hide trainers' heads.
    fringe.alpha_composite(blades.crop(blades.getbbox()).resize((32, 12), NEAREST), (0, 18))
    fringe.putalpha(fringe.getchannel("A").point(lambda alpha: round(alpha * .4)))
    assert fringe.getbbox()[1] == 18 and fringe.getbbox()[3] <= 30
    assert max(fringe.getchannel("A").getdata()) <= 102
    tiles[757] = encounter
    tiles[758] = fringe
    assert len(tiles) == 35 and all(tile.size == (32, 32) for tile in tiles.values())
    atlas = Image.new("RGBA", (816, 1088))
    atlas.paste(source, (0, 0))
    for gid, tile in tiles.items():
        x, y = (gid - 1) % 24 * 34 + 1, (gid - 1) // 24 * 34 + 1
        atlas.paste(tile, (x, y))
        atlas.paste(tile.crop((0, 0, 32, 1)), (x, y - 1))
        atlas.paste(tile.crop((0, 31, 32, 32)), (x, y + 32))
        atlas.paste(tile.crop((0, 0, 1, 32)), (x - 1, y))
        atlas.paste(tile.crop((31, 0, 32, 32)), (x + 32, y))
        for a, b in ((0, 0), (31, 0), (0, 31), (31, 31)):
            atlas.putpixel((x - 1 if a == 0 else x + 32, y - 1 if b == 0 else y + 32), tile.getpixel((a, b)))
    assert ImageChops.difference(atlas.crop((0, 0, 816, 1020)), source).getbbox() is None
    assert atlas.getbbox() and atlas.size == (816, 1088)
    DEST.mkdir(parents=True, exist_ok=True)
    atlas.save(DEST / "autumn-forest-32px-extruded.png", optimize=True)
    manifest = {
        "rom": "포켓몬스터 하트골드(K).nds", "romSha1": ROM_SHA1, "archive": "a/0/4/4",
        "baseAtlas": str(SOURCE.relative_to(ROOT)), "baseAtlasSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "processing": "Preserve base 720 tiles. Exact named ROM palettes; nearest-neighbor canopy/trunk/shadow assembly; ground/path/encounter grass palette recolor; sparse ROM leaf compositing; grass foreground limited to lower 12px at 40% opacity for trainer visibility. No generated artwork.",
        "tileSize": 32, "margin": 1, "spacing": 2, "columns": 24, "tileCount": 768,
        "gids": {"721-725": "ground, variation, leaf litter, sparse leaf litter, dry grass", "729-744": "path mask 0..15 (N=1 E=2 S=4 W=8)", "745-748": "red tree row-major", "749-752": "orange tree row-major", "753-756": "gold tree row-major", "757": "olive encounter grass", "758": "encounter grass foreground"},
        "textures": used,
    }
    (DEST / "autumn-forest-source.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    preview = Image.new("RGBA", (384, 192), (143, 143, 91, 255))
    for index, tree in enumerate(tree_previews):
        preview.alpha_composite(tree, (index * 96 + 16, 8))
    for index, gid in enumerate((721, 723, 724, 725, 744, 757, 758)):
        preview.alpha_composite(tiles[gid], (index * 48 + 8, 104))
    for index, gid in enumerate((729, 730, 732, 734, 736, 739, 744)):
        preview.alpha_composite(tiles[gid], (index * 48 + 8, 152))
    evidence = ROOT / "output/autumn-red-forest-implementation"
    evidence.mkdir(parents=True, exist_ok=True)
    preview.resize((1152, 576), NEAREST).save(evidence / "asset-preview.png")
    print(f"Wrote 35 autumn tiles; preserved 720 original tiles: {DEST}")


if __name__ == "__main__":
    main()
