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

    shadow = get(88, "t_tree2_g")
    shadow = shadow.crop(shadow.getbbox()).resize((48, 14), NEAREST)
    shadow.putalpha(shadow.getchannel("A").point(lambda a: round(a * .3)))
    trunk = get(6, "tree_en2_un")
    key = trunk.getpixel((0, 0))[:3]
    trunk.putdata([p[:3] + (0 if max(abs(p[i] - key[i]) for i in range(3)) < 20 or (p[1] > p[0] * 1.25 and p[2] > p[0] * 1.1) else p[3],) for p in trunk.getdata()])
    trunk = trunk.crop(trunk.getbbox()).resize((17, 24), NEAREST)
    tree_previews = []
    motion_tiles = {}
    for first, name in ((745, "t_tree2_ex"), (749, "t_tree2_e"), (753, "t_tree2_ey")):
        canopy = get(88, name)
        canopy = canopy.crop(canopy.getbbox()).resize((60, 46), NEAREST)
        if first == 745:
            canopy = palette_tone(canopy, (130, 37, 27), (220, 81, 39))
        fixed_tree = Image.new("RGBA", (64, 64))
        fixed_tree.alpha_composite(shadow, (8, 47))
        fixed_tree.alpha_composite(trunk, (24, 35))
        tree_frames = []
        for frame, offset in enumerate((0, -1, 0, 1)):
            tree = fixed_tree.copy()
            tree.alpha_composite(canopy, (2 + offset, 3))
            tree_frames.append(tree)
            for index in range(4):
                x, y = index % 2 * 32, index // 2 * 32
                motion_tiles[len(tree_previews) * 16 + frame * 4 + index] = tree.crop((x, y, x + 32, y + 32))
        assert tree_frames[0].tobytes() == tree_frames[2].tobytes()
        assert tree_frames[1].tobytes() != tree_frames[3].tobytes()
        assert all(frame.crop((0, 49, 64, 64)).tobytes() == fixed_tree.crop((0, 49, 64, 64)).tobytes() for frame in tree_frames)
        tree = tree_frames[0]
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
        motion_tiles[64 + mask] = tile
        motion_tiles[80 + mask] = fringe
    tiles[757] = motion_tiles[79]
    tiles[758] = motion_tiles[95]
    assert len(tiles) == 35 and all(tile.size == (32, 32) for tile in tiles.values())

    grass_textures, grass_palettes = decode_member(bytes(NARC(rom.getFileByName("a/1/0/3")).files[22]))
    grass_sources = []
    for frame, name in enumerate(("ngrass_ani1.1", "ngrass_ani1.2")):
        palette_name = name + "_pl"
        grass = grass_textures[name].renderAsImage(grass_palettes[palette_name]).convert("RGBA")
        assert grass.size == (16, 16)
        foreground = grass.resize((32, 32), NEAREST)
        foreground.paste((0, 0, 0, 0), (0, 0, 32, 20))
        foreground.putalpha(foreground.getchannel("A").point(lambda alpha: round(alpha * .4)))
        assert foreground.getbbox()[1] >= 20 and foreground.getbbox()[3] <= 32
        assert max(foreground.getchannel("A").getdata()) <= 102
        motion_tiles[48 + frame] = foreground
        grass_sources.append({"texture": name, "palette": palette_name, "size": [16, 16]})
    assert len(motion_tiles) == 82 and all(tile.size == (32, 32) for tile in motion_tiles.values())
    assert motion_tiles[48].tobytes() != motion_tiles[49].tobytes()
    assert motion_tiles[79].getchannel("A").getextrema() == (255, 255)
    assert motion_tiles[64].getchannel("A").getextrema() == (0, 255)
    assert all(motion_tiles[80 + mask].crop((0, 22, 32, 32)).convert("RGB").tobytes() == motion_tiles[64 + mask].crop((0, 22, 32, 32)).convert("RGB").tobytes() for mask in range(16))
    assert all(max(motion_tiles[80 + mask].getchannel("A").getdata()) <= 102 for mask in range(16))
    motion_atlas = Image.new("RGBA", (544, 204))
    for index, tile in motion_tiles.items():
        paste_extruded_tile(motion_atlas, tile, index, 16)

    atlas = Image.new("RGBA", (816, 1088))
    atlas.paste(source, (0, 0))
    for gid, tile in tiles.items():
        paste_extruded_tile(atlas, tile, gid - 1, 24)
    assert ImageChops.difference(atlas.crop((0, 0, 816, 1020)), source).getbbox() is None
    assert atlas.getbbox() and atlas.size == (816, 1088)
    DEST.mkdir(parents=True, exist_ok=True)
    atlas.save(DEST / "autumn-forest-32px-extruded.png", optimize=True)
    motion_atlas.save(DEST / "autumn-forest-motion.png", optimize=True)
    manifest = {
        "rom": "포켓몬스터 하트골드(K).nds", "romSha1": ROM_SHA1, "archive": "a/0/4/4",
        "baseAtlas": str(SOURCE.relative_to(ROOT)), "baseAtlasSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "processing": "Preserve base 720 tiles. Restore pre-autumn green ground from original atlas GID 126; use the same atlas's pale Path GID 174 for the current paths. Remove fallen-leaf ground overlays. Keep autumn ROM tree canopy/trunk/shadow assembly. Encounter grass uses original ROM green palettes and overlaps full-proportion egrass_u leaves in staggered rows, with exposed-edge silhouettes and matching lower-10px foreground at 40% opacity. No generated artwork.",
        "tileSize": 32, "margin": 1, "spacing": 2, "columns": 24, "tileCount": 768,
        "gids": {"721-725": "original green ground, mirrored ground, ground, mirrored ground, green grass detail", "729-744": "original pale dirt with path mask 0..15 (N=1 E=2 S=4 W=8)", "745-748": "red tree row-major", "749-752": "orange tree row-major", "753-756": "gold tree row-major", "757": "green encounter grass", "758": "encounter grass foreground"},
        "textures": used,
        "motionAtlas": {
            "path": "apps/web/public/assets/poke-lounge/world/autumn-forest-motion.png",
            "size": [544, 204], "tileSize": 32, "margin": 1, "spacing": 2, "columns": 16, "rows": 6,
            "trees": {
                "provenance": "Derived from the static ROM canopy, trunk and shadow assembly; not an original ROM wind animation.",
                "rows": ["red", "orange", "gold"], "frameCount": 4, "quadrantsPerFrame": 4,
                "quadrantOrder": "top-left, top-right, bottom-left, bottom-right",
                "canopyOffsetsX": [0, -1, 0, 1], "trunkAndShadow": "fixed",
            },
            "grass": {
                "provenance": "ROM egrass_u leaves retain their original green palette and are scaled uniformly 2x, staggered every 16px over the original atlas ground. Connectivity masks trim exposed patch edges only; the foreground copies the same bottom 10px at 40% opacity. Two original ROM ngrass leaf frames provide a brief footstep overlay; original 3D control and timing are not reproduced.",
                "staticBaseTileIndices": [64, 79], "staticForegroundTileIndices": [80, 95],
                "connectivityMask": "N=1 E=2 S=4 W=8; connected sides stay seamless",
                "archive": "a/1/0/3", "member": 22, "textures": grass_sources,
                "frameCount": 2, "foregroundTileIndices": [48, 49],
                "foreground": {"y": 20, "height": 12, "maxAlpha": 102},
            },
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
    print(f"Wrote 35 autumn tiles, 50 motion tiles and 32 connected-grass tiles; preserved 720 original tiles: {DEST}")


if __name__ == "__main__":
    main()
