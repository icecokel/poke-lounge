#!/usr/bin/env python3
"""Project Bellchime Trail's static tree geometry into uniformly fitted 64px frames."""
from __future__ import annotations

import hashlib
import json
import math
import re
import runpy
import struct
from pathlib import Path

from ndspy import _common, color, model
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "apps/web/public/assets/poke-lounge/world"
EVIDENCE = ROOT / "output/rom-tree-port-20261022"
ROM = ROOT / "data/roms/포켓몬스터 하트골드(K).nds"
ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
CAMERA = {"distanceFx32": 0x29AEC1, "pitchIdx": 0xDD62, "yawIdx": 0, "perspectiveIdx": 0x05C1}


def read_tree_parts(rom: NintendoDSRom):
    land = bytes(NARC(rom.getFileByName("a/0/6/5")).files[447])
    bmd_offset = land.index(b"BMD0")
    bmd = land[bmd_offset:]
    assert bmd_offset == 2164 and bmd[20:24] == b"MDL0"
    mdl0 = bmd[20:]
    name, _, _, offset = _common.loadInfoBlock(mdl0, 8, 4)[0]
    data = mdl0[struct.unpack("<I", offset)[0]:]
    _, sbc, materials, shapes, _ = struct.unpack_from("<5I", data)
    position_scale = struct.unpack_from("<i", data, 28)[0] / 4096
    assert name == "m_dun1711_01_00c" and position_scale == 64
    node = _common.loadInfoBlock(data, 64, 4)
    assert len(node) == 1 and struct.unpack_from("<H", data, 64 + struct.unpack("<I", node[0][3])[0])[0] & 7 == 7
    mats = _common.loadInfoBlock(data, materials + 4, 4)
    # This static model's SBC pairs each material with one display list.
    pairs = re.findall(b"\x04(.)\x05(.)", data[sbc:materials], re.S)
    shape_material = {shape[0]: material[0] for material, shape in pairs}
    assert len(shape_material) == len(mats) == 13
    parts = {}
    for index, (_, _, _, shape_offset) in enumerate(_common.loadInfoBlock(data, shapes, 4)):
        material_name, _, _, material_offset = mats[shape_material[index]]
        if not material_name.startswith("t_tree2_"):
            continue
        texture_name = material_name.split("_lm")[0]
        mat_offset = materials + struct.unpack("<I", material_offset)[0]
        polygon_attr = struct.unpack_from("<I", data, mat_offset + 12)[0]
        alpha = ((polygon_attr >> 16) & 31) / 31
        cull = (polygon_attr >> 6) & 3
        assert cull in (2, 3)
        assert struct.unpack_from("<I", data, mat_offset + 20)[0] & 0xF0000 == 0x30000
        shape_offset = shapes + struct.unpack("<I", shape_offset)[0]
        _, _, dl_offset, dl_size = struct.unpack_from("<4I", data, shape_offset)
        display_list = data[shape_offset + dl_offset:shape_offset + dl_offset + dl_size]
        offset, position, uv, quads = 0, [0, 0, 0], (0, 0), []
        while offset < len(display_list):
            commands = display_list[offset:offset + 4]
            offset += 4
            for command in commands:
                count = model._COMMANDS_BY_ID[command].PARAM_COUNT
                params = display_list[offset:offset + count * 4]
                offset += count * 4
                if command == 0x40:
                    primitive = struct.unpack("<I", params)[0]
                    assert primitive in (1, 2)
                    vertices = []
                elif command == 0x41:
                    assert len(vertices) % 4 == 0
                    if primitive == 2:
                        assert len(vertices) == 4
                    quads.extend(vertices[i:i + 4] for i in range(0, len(vertices), 4))
                elif command == 0x22:
                    uv = tuple(value / 16 for value in struct.unpack("<hh", params))
                elif command == 0x23:
                    position = list(struct.unpack("<hhh", params[:6]))
                elif command in (0x25, 0x26, 0x27):
                    axes = {0x25: (0, 1), 0x26: (0, 2), 0x27: (1, 2)}[command]
                    for axis, value in zip(axes, struct.unpack("<hh", params)):
                        position[axis] = value
                else:
                    assert command in (0, 0x21), f"Unsupported tree geometry command: {command:#x}"
                if command in (0x23, 0x25, 0x26, 0x27):
                    vertices.append([*[value * position_scale / 4096 for value in position], *uv])
        assert offset == len(display_list)
        parts[texture_name] = {"alpha": alpha, "cull": cull, "primitive": primitive, "quads": quads}
    return parts, bmd_offset


def project(vertex):
    x, y, z, u, v = vertex
    pitch = -CAMERA["pitchIdx"] * math.tau / 65536
    distance = CAMERA["distanceFx32"] / 4096
    depth = distance - y * math.sin(pitch) - z * math.cos(pitch)
    focal = 96 / math.tan(CAMERA["perspectiveIdx"] * math.tau / 65536)
    return (focal * x / depth, focal * (z * math.sin(pitch) - y * math.cos(pitch)) / depth, depth, u, v)


def render(parts, textures, bounds):
    left, top, right, bottom = bounds
    fragments = {}
    for part in parts:
        texture = textures[part["texture"]]
        for quad in part["quads"]:
            triangles = ((0, 1, 2), (2, 1, 3)) if part["primitive"] == 2 else ((0, 1, 2), (0, 2, 3))
            for indices in triangles:
                a, b, c = [project(quad[i]) for i in indices]
                denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
                if abs(denominator) < 1e-9:
                    continue
                if part["cull"] == 2 and denominator > 0:
                    continue
                for y in range(max(top, math.floor(min(a[1], b[1], c[1]))), min(bottom, math.ceil(max(a[1], b[1], c[1])))):
                    for x in range(max(left, math.floor(min(a[0], b[0], c[0]))), min(right, math.ceil(max(a[0], b[0], c[0])))):
                        px, py = x + .5, y + .5
                        wa = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / denominator
                        wb = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / denominator
                        weights = (wa, wb, 1 - wa - wb)
                        if min(weights) < -1e-9:
                            continue
                        inverse_depth = sum(w / p[2] for w, p in zip(weights, (a, b, c)))
                        uv = [sum(w * p[i] / p[2] for w, p in zip(weights, (a, b, c))) / inverse_depth for i in (3, 4)]
                        tx, ty = math.floor(uv[0]) % texture.width, math.floor(uv[1]) % texture.height
                        red, green, blue, alpha = texture.getpixel((tx, ty))
                        if alpha:
                            fragments.setdefault((x - left, y - top), []).append((1 / inverse_depth, (red, green, blue, round(alpha * part["alpha"]))))
    image = Image.new("RGBA", (right - left, bottom - top))
    for coordinate, layers in fragments.items():
        pixel = Image.new("RGBA", (1, 1))
        previous = None
        for depth, rgba in sorted(layers, reverse=True):
            # Shared triangle edges must not blend the same translucent polygon twice.
            if previous and abs(depth - previous[0]) < 1e-7 and rgba == previous[1]:
                continue
            pixel.alpha_composite(Image.new("RGBA", (1, 1), rgba))
            previous = depth, rgba
        image.putpixel(coordinate, pixel.getpixel((0, 0)))
    return image


def main():
    assert hashlib.sha1(ROM.read_bytes()).hexdigest() == ROM_SHA1, "Unexpected ROM revision"
    rom = NintendoDSRom.fromFile(ROM)
    camera_data = bytes(rom.loadArm9Overlays({1})[1].data)
    camera_prefix = struct.pack("<I4H2H", CAMERA["distanceFx32"], CAMERA["pitchIdx"], 0, 0, 0, 0, CAMERA["perspectiveIdx"])
    assert camera_data.count(camera_prefix) == 1
    camera_offset = camera_data.index(camera_prefix)
    parts, bmd_offset = read_tree_parts(rom)
    color.prepareLUTs()
    decode = runpy.run_path(str(ROOT / "scripts/poke-lounge/generate-autumn-field.py"))["decode_member"]
    texture_data, palettes = decode(bytes(NARC(rom.getFileByName("a/0/4/4")).files[88]))
    textures = {name: texture.renderAsImage(palettes[name + "_pl"]).convert("RGBA") for name, texture in texture_data.items() if name.startswith("t_tree2_")}
    trees = []
    for name, suffix in (("red", "x"), ("orange", ""), ("gold", "y")):
        canopy = parts["t_tree2_e" + suffix]["quads"][:4]
        center = [sum(vertex[i] for quad in canopy for vertex in quad) / 16 for i in (0, 2)]
        selected = []
        for texture, count in (("t_tree2_e" + suffix, 4), ("t_tree2_b" + suffix, 2), ("t_tree2_f" + suffix, 1), ("t_tree2_c", 2), ("t_tree2_g", 1), ("t_tree2_g_", 1)):
            def distance(quad):
                return math.hypot(sum(v[0] for v in quad) / 4 - center[0], sum(v[2] for v in quad) / 4 - center[1])
            quads = sorted(parts[texture]["quads"], key=distance)[:count]
            assert max(map(distance, quads)) < 2, f"Mismatched tree part: {texture}"
            selected.append({"texture": texture, "alpha": parts[texture]["alpha"], "cull": parts[texture]["cull"], "primitive": parts[texture]["primitive"], "quads": [[[v[0] - center[0], v[1], v[2] - center[1], v[3], v[4]] for v in quad] for quad in quads]})
        trees.append({"color": name, "sourceCenterXZ": center, "parts": selected})
    projected = [project(vertex) for tree in trees for part in tree["parts"] for quad in part["quads"] for vertex in quad]
    bounds = [math.floor(min(p[0] for p in projected)), math.floor(min(p[1] for p in projected)), math.ceil(max(p[0] for p in projected)), math.ceil(max(p[1] for p in projected))]
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    scale = 60 / max(width, height)
    size = (round(width * scale), round(height * scale))
    padding = ((64 - width * scale) / 2, (64 - height * scale) / 2)
    atlas = Image.new("RGBA", (192, 64))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for index, tree in enumerate(trees):
        native = render(tree["parts"], textures, bounds)
        assert native.getbbox() is not None
        native.save(EVIDENCE / (tree["color"] + "-native.png"))
        fitted = native.transform((64, 64), Image.Transform.AFFINE, (1 / scale, 0, -padding[0] / scale, 0, 1 / scale, -padding[1] / scale), Image.Resampling.NEAREST)
        atlas.alpha_composite(fitted, (index * 64, 0))
    manifest = {
        "romSha1": ROM_SHA1, "landArchive": "a/0/6/5", "landMember": 447,
        "model": "m_dun1711_01_00c", "bmdOffset": bmd_offset, "textureArchive": "a/0/4/4", "textureMember": 88,
        "camera": {**CAMERA, "type": 0, "viewport": [256, 192], "koreanRomOverlay": 1, "overlayOffset": camera_offset, "source": "pokeheartgold asm/overlay_01_021EABA8.s:ov01_02206478 and src/data/map_headers.h:MAP_BELLCHIME_TOWER; camera constants verified against the Korean ROM"},
        "projection": {"nativeBounds": bounds, "uniformScale": scale, "fittedSize": size, "frameGroundOrigin": [padding[0] - bounds[0] * scale, padding[1] - bounds[1] * scale], "frameSize": [64, 64], "atlasSize": [192, 64]},
        "animation": "Static source geometry. No linked canopy wind animation found in field texture/prop animation registries; no synthetic wind frames.",
        "limitations": "Perspective and part geometry/UV/material alpha are reproduced; DS lighting, fog, edge/antialias rasterization and view-position-dependent perspective are not emulated. Original-game screenshot parity is unverified.",
        "trees": [{"color": tree["color"], "frame": [index * 64, 0, 64, 64], "sourceCenterXZ": tree["sourceCenterXZ"], "materials": [{"texture": p["texture"], "alpha": p["alpha"], "cull": p["cull"], "primitive": "triangle_strip" if p["primitive"] == 2 else "quads", "primitiveCount": len(p["quads"])} for p in tree["parts"]]} for index, tree in enumerate(trees)],
    }
    PUBLIC.mkdir(parents=True, exist_ok=True)
    atlas.save(PUBLIC / "field-trees.png", optimize=True)
    (PUBLIC / "field-trees.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (EVIDENCE / "geometry.json").write_text(json.dumps(trees, ensure_ascii=False, indent=2) + "\n")
    preview = Image.new("RGBA", atlas.size, (63, 174, 132, 255))
    preview.alpha_composite(atlas)
    preview.resize((1152, 384), Image.Resampling.NEAREST).save(EVIDENCE / "preview.png")
    print(f"Projected three static ROM trees at uniform scale {scale:.5f}: {PUBLIC / 'field-trees.png'}")


if __name__ == "__main__":
    main()
