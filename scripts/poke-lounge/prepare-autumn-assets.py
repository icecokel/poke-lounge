"""Prepare the three image_gen sheets at native field scale; no artwork is generated here."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'apps/web/public/assets/poke-lounge/world'


def cell(sheet, x, y):
    w, h = sheet.size
    return sheet.crop((x*w//2, y*h//2, (x+1)*w//2, (y+1)*h//2))


def native(image, size, colors):
    image = image.resize(size, Image.Resampling.NEAREST)
    alpha = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    image = image.convert('RGB').quantize(colors=colors, dither=Image.Dither.NONE).convert('RGBA')
    image.putalpha(alpha)
    return image


def main():
    trees_path, ground_path, leaves_path = map(Path, sys.argv[1:])
    trees, ground, leaves = [Image.open(p).convert('RGBA') for p in (trees_path, ground_path, leaves_path)]
    tree_sprites = []
    for x, y in ((0, 0), (1, 0), (0, 1)):
        sprite = cell(trees, x, y)
        sprite.putalpha(sprite.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
        sprite = sprite.crop(sprite.getbbox())
        size = (round(sprite.width * 54 / sprite.height), 54)
        sprite = native(sprite, size, 12)
        frame = Image.new('RGBA', (64, 64))
        frame.alpha_composite(sprite, ((64-size[0])//2, 2))
        tree_sprites.append(frame)
    red, gold, orange = tree_sprites
    assets = {'02-golden-maple.png': gold, '03-red-maple.png': red}
    for name, height, order in (
        ('04-rust-grove.png', 88, (red, orange, red, orange)),
        ('05-golden-grove.png', 83, (gold, gold, gold, gold)),
        ('06-mixed-grove.png', 80, (red, gold, orange, gold)),
    ):
        grove = Image.new('RGBA', (128, height))
        for sprite, position in zip(order, ((8, 0), (58, 0), (-8, height-56), (42, height-56))):
            grove.alpha_composite(sprite, position)
        assets[name] = grove
    shrub = cell(trees, 1, 1)
    shrub.putalpha(shrub.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    shrub = shrub.crop(shrub.getbbox())
    assets['11-autumn-shrub.png'] = native(shrub, (30, 22), 8)
    for name, xy in (('07-dense-gold-floor.png', (0, 0)), ('08-mixed-forest-floor.png', (1, 0)), ('12-scattered-leaves.png', (0, 1))):
        assets[name] = native(cell(leaves, *xy), (64, 64), 8)
    entries = []
    for name, sprite in assets.items():
        assert set(sprite.getchannel('A').getdata()) <= {0, 255}
        sprite.save(DEST/'original-autumn'/name, optimize=True)
        source = leaves_path if name.startswith(('07-', '08-', '12-')) else trees_path
        entries.append({'file': name, 'size': list(sprite.size), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    manifest = {
        'origin': 'Original artwork generated with built-in image_gen, 2026-10-25',
        'reference': 'Pokemon HeartGold field perspective, clustered shading and native pixel scale.',
        'preparation': 'Crop sheet cells and opaque bounds; nearest-neighbor native sizing; binary alpha; 8–12 color palettes without dithering. Trees are 54px tall in 64px frames, root y=56. Groves assemble native tree sprites without scaling.',
        'assets': entries,
    }
    (DEST/'original-autumn/source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    entries = []
    ground_assets = {}
    for name, xy in (('01-meadow-grass.png', (0, 0)), ('02-meadow-leaves.png', (1, 0)), ('03-golden-earth.png', (0, 1)), ('04-golden-earth-leaves.png', (1, 1))):
        sprite = native(cell(ground, *xy), (128, 128), 12)
        assert sprite.getchannel('A').getextrema() == (255, 255)
        if xy[0]:
            # Keep the exact base texture so switching to a leaf variant cannot make a color seam.
            mask = Image.frombytes('L', sprite.size, bytes(255 if r-g>(45 if xy[1] else 0) else 0 for r,g,b,a in sprite.getdata()))
            sprite = Image.composite(sprite, ground_assets[xy[1]], mask)
        else:
            ground_assets[xy[1]] = sprite
        sprite.save(DEST/'original-ground'/name, optimize=True)
        entries.append({'file': name, 'size': list(sprite.size), 'sourceSha256': hashlib.sha256(ground_path.read_bytes()).hexdigest()})
    manifest.update(preparation='Crop four sheet cells to native 128px patches with nearest-neighbor sampling and 12 colors, no dithering. Warm leaf pixels overlay the matching base patch to avoid variant seams. The map generator mirrors repeats and slices 32px tiles.', assets=entries)
    (DEST/'original-ground/source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print('Prepared 13 native autumn assets from image_gen sheets.')


if __name__ == '__main__':
    main()
