#!/usr/bin/env python3
"""Extract the eight Johto leaders' front frames from a read-only local Korean HG ROM."""
import argparse
import hashlib
from pathlib import Path
import runpy
from ndspy import color
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom

ROOT = Path(__file__).resolve().parents[2]
ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
# pret: sprites.h SPRITE_GSLEADER1..8 -> mmodel.h MMODEL_GSLEADER1..8.
# ROM a/0/8/1 members 146..153 contain gsleader1..8 textures.
def extract(path):
    raw = path.read_bytes()
    if hashlib.sha1(raw).hexdigest() != ROM_SHA1:
        raise ValueError("Unexpected ROM SHA-1")
    rom = NintendoDSRom(raw)
    archive = NARC(rom.getFileByName("a/0/8/1"))
    decode = runpy.run_path(str(ROOT / "scripts/poke-lounge/generate-autumn-field.py"))["decode_member"]
    color.prepareLUTs()
    for leader in range(1, 9):
        member = 145 + leader
        textures, palettes = decode(bytes(archive.files[member]))
        name = f"gsleader{leader}.5"
        texture = textures[name]
        palette = next(iter(palettes.values()))
        image = texture.renderAsImage(palette).convert("RGBA")
        if image.size != (32, 32):
            raise ValueError(f"Unexpected sprite size: {image.size}")
        destination = ROOT / f"apps/web/public/assets/poke-lounge/textures/a_0_8_1_{member:04d}/gsleader{leader}_5.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, optimize=True)
        print(destination.relative_to(ROOT))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    extract(parser.parse_args().rom)
