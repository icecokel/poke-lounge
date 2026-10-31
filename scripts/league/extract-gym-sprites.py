#!/usr/bin/env python3
"""Extract the eight Johto leaders' walking frames from a read-only local Korean HG ROM."""
import argparse
import hashlib
from pathlib import Path
import runpy
from ndspy import color
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e"
# pret: sprites.h SPRITE_GSLEADER1..8 -> mmodel.h MMODEL_GSLEADER1..8.
# ROM a/0/8/1 members 146..153 contain gsleader1..8 textures.
def extract(path, preview):
    raw = path.read_bytes()
    if hashlib.sha1(raw).hexdigest() != ROM_SHA1:
        raise ValueError("Unexpected ROM SHA-1")
    rom = NintendoDSRom(raw)
    archive = NARC(rom.getFileByName("a/0/8/1"))
    decode = runpy.run_path(str(ROOT / "scripts/poke-lounge/generate-autumn-field.py"))["decode_member"]
    color.prepareLUTs()
    sheet = Image.new("RGBA", (128 * 4, 144 * 2), "#e0e0e0") if preview else None
    for leader in range(1, 9):
        member = 145 + leader
        textures, palettes = decode(bytes(archive.files[member]))
        palette = next(iter(palettes.values()))
        for frame in range(1, 17):
            image = textures[f"gsleader{leader}.{frame}"].renderAsImage(palette).convert("RGBA")
            if image.size != (32, 32):
                raise ValueError(f"Unexpected sprite size: {image.size}")
            destination = ROOT / f"apps/web/public/assets/poke-lounge/textures/a_0_8_1_{member:04d}/gsleader{leader}_{frame}.png"
            if frame == 5:
                with Image.open(destination) as existing:
                    if existing.convert("RGBA").tobytes() != image.tobytes():
                        raise ValueError(f"Existing front frame differs: {destination}")
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                image.save(destination, optimize=True)
            if sheet is not None:
                x = (leader - 1) % 4 * 128 + (frame - 1) % 4 * 32
                y = (leader - 1) // 4 * 144 + 16 + (frame - 1) // 4 * 32
                sheet.alpha_composite(image, (x, y))
        print(f"gsleader{leader}: 16 frames (existing front frame preserved)")
        if sheet is not None:
            ImageDraw.Draw(sheet).text(((leader - 1) % 4 * 128, (leader - 1) // 4 * 144), f"gsleader{leader} / ROM order", fill="black")
    if sheet is not None:
        preview.mkdir(parents=True, exist_ok=True)
        destination = preview / "gym-walk-preview.png"
        sheet.resize((sheet.width * 8, sheet.height * 8), Image.Resampling.NEAREST).save(destination)
        print(destination)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rom", type=Path)
    parser.add_argument("--preview", type=Path, nargs="?", const=ROOT / "output/league-gym-sprites")
    args = parser.parse_args()
    extract(args.rom, args.preview)
