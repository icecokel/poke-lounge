"""Rebuild the approved autumn forest layout and its static overview."""
import json
import hashlib
import math
import runpy
from random import Random
from pathlib import Path
from collections import deque
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from ndspy import color
from ndspy.narc import NARC
from ndspy.rom import NintendoDSRom

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/autumn-structure-implementation'
OUT.mkdir(parents=True, exist_ok=True)
W, H, S = 40, 24, 32
atlas = Image.open(ROOT/'apps/web/public/assets/poke-lounge/world/autumn-forest-32px-extruded.png').convert('RGBA')
paths, clear, grass, collision = set(), set(), set(), set()
world = [0] * (W * H)

def rect(x1,y1,x2,y2):
    return {(x,y) for y in range(y1,y2) for x in range(x1,x2)}
def corridor(points):
    for (x1,y1),(x2,y2) in zip(points,points[1:]):
        assert x1==x2 or y1==y2
        for y in range(min(y1,y2), max(y1,y2)+1):
            for x in range(min(x1,x2),max(x1,x2)+1):
                paths.update(rect(x,y,x+2,y+2))

# The hub, entrance and two connected loops are physically different from the old cross.
corridor([(19,21),(19,14)])
corridor([(19,21),(24,21)])
corridor([(17,13),(11,13),(11,10),(7,10),(7,9),(4,9),(4,3),(10,3),(10,2),(15,2),(15,8),(17,8),(17,12)])
corridor([(11,13),(11,18),(8,18),(8,20),(3,20),(2,20),(2,19),(2,11),(7,11)])
corridor([(22,12),(22,9),(18,9),(18,3),(25,3),(25,9),(30,9),(30,13),(23,13)])
corridor([(23,14),(24,14),(24,21),(36,21),(37,21),(37,20),(37,16),(32,16),(32,13),(30,13)])
corridor([(30,10),(31,10),(31,8)])
# A stepped silhouette keeps the service hub compact and recognizable.
paths.update(rect(17,12,24,16))
paths.update(rect(18,11,23,17))
paths.update(rect(29,13,35,16))
paths.update(rect(18,21,23,23))
zones = [(6,5,5,3),(20,5,5,3),(4,13,6,5),(26,18,10,3)]
for x,y,w,h in zones:
    zone=rect(x,y,x+w,y+h)
    assert not zone & grass
    grass |= zone
assert len(grass)==90 and not paths & grass
# A small clearing gives each grass patch an accessible edge.
clear.update(paths | grass)
for x,y in grass:
    clear.update(rect(max(0,x-1),max(0,y-1),min(W,x+2),min(H,y+2)))
clear.update(rect(28,2,37,9))
clear.update(rect(17,11,25,18))
clear.update(rect(17,20,24,24))
# Use the exact original fountain structure, relocated and given a broad southern gate.
MAP_PATH = ROOT / 'apps/web/public/maps/pokemmo-reference/town.json'
map_data = json.loads(MAP_PATH.read_text())
fountain = [(0,0,241),(10,0,243),(0,1,241),(4,1,273),(5,1,274),(6,1,275),(10,1,243),(0,2,241),(4,2,297),(5,2,298),(6,2,299),(10,2,243),(0,3,241),(2,3,225),(4,3,321),(5,3,322),(6,3,323),(8,3,225),(10,3,243),(0,4,241),(10,4,243),(0,5,241),(5,5,121),(10,5,243),(0,6,241),(10,6,243),(0,7,265),(1,7,218),(2,7,218),(3,7,268),(7,7,269),(8,7,218),(9,7,218),(10,7,267)]
for sx,sy,gid in fountain:
    x,y=sx+27,sy+1
    world[y*W+x]=gid
    if gid!=121:collision.add((x,y))
# Remove the existing decorative flower from the widened entrance itself.
for y in range(7,10):
    for x in range(31,34):
        world[y*W+x]=0;collision.discard((x,y))
# Render the woodland as one overlapping canopy; individual map cells only store its final pixels.
rng=Random(1711)
field=runpy.run_path(str(ROOT/'scripts/poke-lounge/generate-autumn-field.py'))
rom_data=(ROOT/"data/roms/포켓몬스터 하트골드(K).nds").read_bytes()
assert hashlib.sha1(rom_data).hexdigest()==field['ROM_SHA1']
rom=NintendoDSRom(rom_data)
archive=NARC(rom.getFileByName("a/0/4/4"))
textures,palettes=field['decode_member'](bytes(archive.files[6]))
color.prepareLUTs()
canopies={(family,repeat):textures[f"tree_en{family}"+('_re' if repeat else '')].renderAsImage(palettes[f"tree_en{family}"+('_re' if repeat else '')+'_pl']).convert('RGBA') for family in range(2,6) for repeat in (False,True)}
canopy=Image.new('RGBA',(W*S,H*S))
trees=[]
for row in range(-2,math.ceil(H*S/23)+2):
    for column in range(-2,math.ceil(W*S/43)+2):
        px=column*43+(row%2)*21+rng.randrange(-12,13)
        py=row*23+rng.randrange(-8,9)
        cx,cy=px+32,py+35
        border=(cy<52+19*math.sin(cx/137)+8*math.sin(cx/49)
                or cx<59+19*math.sin(cy/109)
                or cx>W*S-54-16*math.sin(cy/121)
                or cy>H*S-53-17*math.sin(cx/113))
        if not border:continue
        family=2
        if ((cx-308)/122)**2+((cy-18)/90)**2<1 or ((cx-52)/95)**2+((cy-641)/105)**2<1 or ((cx-1240)/75)**2+((cy-458)/102)**2<1:family=3
        if cx>1185 and cy<90:family=4
        elif cx>1110 and cy<155:family=5
        if rng.random()<.09:family=3 if family==2 else 2
        repeat=rng.random()<.65
        image=canopies[family,repeat]
        left,top,right,bottom=image.getbbox()
        footprint=rect(max(0,(px+left)//S),max(0,(py+top)//S),min(W,math.ceil((px+right)/S)),min(H,math.ceil((py+bottom)/S)))
        if not footprint or footprint & (clear|collision):continue
        canopy.alpha_composite(image,(px,py))
        trees.append((px,py,family,repeat))
# Store the baked canopy in the existing tile renderer, without changing paths or game objects.
forest_tiles=[]
for y in range(H):
    for x in range(W):
        tile=canopy.crop((x*S,y*S,(x+1)*S,(y+1)*S))
        if not tile.getbbox():continue
        assert (x,y) not in clear and not world[y*W+x]
        world[y*W+x]=759+len(forest_tiles)
        forest_tiles.append(tile)
        collision.add((x,y))
# Keep a few original trees as quiet accents at the edge of the playable clearings.
for x,y,first in ((12,4,749),(12,8,753),(13,10,745),(25,11,745),(28,11,749),(26,15,745),(13,16,749),(15,18,753)):
    block=rect(x,y,x+2,y+2)
    if block & (clear|collision):continue
    for i,gid in enumerate(range(first,first+4)):world[(y+i//2)*W+x+i%2]=gid
    collision |= block
assert not paths & collision and not grass & collision
# Static layout sanity: every path cell and every zone must connect to the hub.
walkable={(x,y) for y in range(H) for x in range(W)}-collision
start=(19,14)
seen={start};q=deque([start])
while q:
    x,y=q.popleft()
    for p in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if p in walkable and p not in seen:seen.add(p);q.append(p)
assert paths <= seen and grass <= seen
for p in ((19,21),(19,12),(21,12),(32,14),(31,8)):assert p in seen
below=[]
for y in range(H):
    for x in range(W):
        p=(x,y)
        if p in paths:
            mask=sum(bit for bit,dx,dy in ((1,0,-1),(2,1,0),(4,0,1),(8,-1,0)) if (x+dx,y+dy) in paths)
            below.append(729+mask)
        else:below.append(724 if (x*11+y*7)%19<3 else (725 if (x*7+y*5)%37==0 else 721))
# Use the ROM leaf carpet beneath the outer woodland, with its original ragged edge pieces.
leaf_textures,leaf_palettes=field['decode_member'](bytes(archive.files[88]))
leaves={name:leaf_textures[name].renderAsImage(leaf_palettes[name+'_pl']).convert('RGBA') for name in ('momi','momi_load_','momi_loada','momi_loadb')}
leaf_edges={}
for direction,name,box in ((8,'momi_loada',(16,0,32,32)),(2,'momi_loada',(0,0,16,32)),(1,'momi_loadb',(0,16,32,32)),(4,'momi_loadb',(0,0,32,16))):
    edge=leaves[name].copy()
    edge.putalpha(Image.frombytes('L',edge.size,bytes(255 if r>g*.95 and r>140 and b<r*.7 else 0 for r,g,b,a in edge.getdata())))
    edge.paste((0,0,0,0),box)
    assert edge.getbbox() and edge.getchannel('A').getextrema()==(0,255)
    leaf_edges[direction]=edge
forest_cells={(i%W,i//W) for i,gid in enumerate(world) if gid>=759}
patches=Image.new('L',canopy.size)
patch_draw=ImageDraw.Draw(patches)
for cx,cy,rx,ry in ((300,36,130,60),(35,520,64,125),(365,748,105,64),(1250,445,55,115)):
    patch_draw.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=185)
patches=patches.filter(ImageFilter.GaussianBlur(14))
canopy_alpha=canopy.getchannel('A')
floor_mask=ImageChops.lighter(canopy_alpha,ImageChops.multiply(canopy_alpha.filter(ImageFilter.MaxFilter(49)),patches))
scatter_mask=ImageChops.multiply(ImageChops.subtract(canopy_alpha.filter(ImageFilter.MaxFilter(65)),canopy_alpha.filter(ImageFilter.MaxFilter(49))),patches)
baked_tiles=list(forest_tiles)
floor_cache={}
leaf_cells=[]
for y in range(H):
    for x in range(W):
        p=(x,y)
        if p in paths or p in grass or world[y*W+x] and p not in forest_cells:continue
        mask=sum(bit for bit,dx,dy in ((1,0,-1),(2,1,0),(4,0,1),(8,-1,0)) if (x+dx,y+dy) in forest_cells)
        box=(x*S,y*S,(x+1)*S,(y+1)*S)
        coverage=floor_mask.crop(box)
        scattered=scatter_mask.crop(box)
        if not coverage.getbbox() and not scattered.getbbox():continue
        gid=below[y*W+x]-1;sx=gid%24*34+1;sy=gid//24*34+1
        tile=atlas.crop((sx,sy,sx+32,sy+32))
        if p in forest_cells:
            carpet=leaves['momi'].copy();carpet.putalpha(coverage);tile.alpha_composite(carpet)
        else:
            for bit,edge in leaf_edges.items():
                if mask & bit:
                    fringe=edge.copy();fringe.putalpha(ImageChops.multiply(edge.getchannel('A'),coverage));tile.alpha_composite(fringe)
        scatter=leaves['momi_load_'].crop((x%2*32,y%2*32,x%2*32+32,y%2*32+32))
        scatter.putalpha(ImageChops.multiply(scatter.getchannel('A'),scattered));tile.alpha_composite(scatter)
        pixels=tile.tobytes()
        if pixels not in floor_cache:
            floor_cache[pixels]=759+len(baked_tiles)
            baked_tiles.append(tile)
        below[y*W+x]=floor_cache[pixels]
        leaf_cells.append(p)
base_atlas=atlas.crop((0,0,816,1088))
atlas=Image.new('RGBA',(816,math.ceil((758+len(baked_tiles))/24)*34))
atlas.paste(base_atlas,(0,0))
for index,tile in enumerate(baked_tiles):field['paste_extruded_tile'](atlas,tile,758+index,24)
atlas.save(ROOT/'apps/web/public/assets/poke-lounge/world/autumn-forest-32px-extruded.png',optimize=True)
# Keep Tiled metadata and stable object IDs, replacing only the approved field layout.
map_data.update(width=W, height=H)
map_data['editorsettings']['export']['target']='autumn-forest-town.json'
layers = {layer['name']:layer for layer in map_data['layers']}
for name,data in (('Below Player',below),('World',world),('Above Player',[0]*(W*H))):
    layers[name].update(width=W,height=H,data=data)
for i,(x,y,w,h) in enumerate(zones):
    layers['TallGrassZones']['objects'][i].update(x=x*S,y=y*S,width=w*S,height=h*S)
for spawn in layers['SpawnPoints']['objects']:
    spawn.update(x=624,y=688)
for npc in layers['Npcs']['objects']:
    x,y={'nurse':(624,400),'storagePc':(688,400),'soloChallenger':(1040,464)}[npc['name']]
    npc.update(x=x,y=y)
for exit_zone in layers['Worlds']['objects']:
    exit_zone.update(x=576,y=736,width=160,height=32)
assert all(len(layers[name]['data'])==W*H for name in ('Below Player','World','Above Player'))
map_data['tilesets'][0].update(imageheight=atlas.height,tilecount=atlas.width//34*(atlas.height//34))
collision_gids = {tile['id']+1 for tile in map_data['tilesets'][0]['tiles'] if any(p['name']=='collides' and p['value'] is True for p in tile.get('properties',[]))}
map_data['tilesets'][0]['tiles']=[tile for tile in map_data['tilesets'][0]['tiles'] if tile['id']<758]
collision_gids={gid for gid in collision_gids if gid<759}
for gid in range(759,759+len(forest_tiles)):
    if gid not in collision_gids:
        map_data['tilesets'][0]['tiles'].append({'id':gid-1,'properties':[{'name':'collides','type':'bool','value':True}]})
        collision_gids.add(gid)
assert {(i%W,i//W) for i,gid in enumerate(world) if gid in collision_gids} == collision
source_path=ROOT/'apps/web/public/assets/poke-lounge/world/autumn-forest-source.json'
source=json.loads(source_path.read_text())
source.update(tileCount=atlas.width//34*(atlas.height//34))
source['forestFloor']={'textures':['a/0/4/4#88 momi','momi_load_','momi_loada','momi_loadb'],'tiles':len(floor_cache),'cells':len(leaf_cells),'placement':'Native leaf carpet follows canopy silhouettes with original leaf-edge pieces and a thin scattered-leaf fringe; paths and encounter grass excluded.'}
source['bakedForest']={'seed':1711,'canopies':len(trees),'tileRange':[759,758+len(forest_tiles)],'palette':'native tree_en2..5 / _re palettes','placement':'Overlapping native canopies on a continuous outer band, with an uneven inner contour and grouped autumn colors; no resized clusters or leaf piles.'}
source_path.write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
MAP_PATH.write_text(json.dumps(map_data,ensure_ascii=False,indent=2)+'\n')
canvas=Image.new('RGBA',(W*S,H*S))
def draw(gid,x,y):
    if not gid:return
    i=gid-1;sx=i%24*34+1;sy=i//24*34+1
    assert sy+32<=atlas.height
    canvas.alpha_composite(atlas.crop((sx,sy,sx+32,sy+32)),(x*S,y*S))
for i,gid in enumerate(below):draw(gid,i%W,i//W)
for i,gid in enumerate(world):draw(gid,i%W,i//W)
for x,y in grass:draw(757,x,y)
npcs=[('nurse',19.5,12.5,'a_0_8_1_0133/pcwoman1_5.png'),('storagePc',21.5,12.5,'a_0_7_0_0093/tmfl04_door1.png'),('soloChallenger',32.5,14.5,'a_0_8_1_0039/gentleman_5.png')]
for name,x,y,path in npcs:
    img=Image.open(ROOT/'apps/web/public/assets/poke-lounge/textures'/path).convert('RGBA').resize((40,40),Image.Resampling.NEAREST)
    canvas.alpha_composite(img,(round(x*S)-20,round(y*S)-40))
for x,y in grass:draw(758,x,y)
canvas.convert('RGB').save(OUT/'full-map-implemented.png')
(OUT/'layout-manifest.json').write_text(json.dumps({'status':'implemented','width':W,'height':H,'tileSize':S,'grassCells':len(grass),'trees':trees,'leafCells':leaf_cells,'paths':sorted(paths),'collision':sorted(collision),'zones':zones,'npcTilePositions':[(n,x,y) for n,x,y,_ in npcs],'spawnTile':[19.5,21.5]},indent=2)+'\n')
print(f'Wrote autumn map: {W}x{H}, {len(trees)} overlapping canopy instances, {len(forest_tiles)} baked forest tiles, {len(paths)} path cells, 90 grass cells. Static connectivity checked; no gameplay validation.')
