"""Bake original autumn artwork into the approved field layout and its static overview."""
import json
import math
import runpy
from random import Random
from pathlib import Path
from collections import deque
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/natural-path-verges'
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
# Row runs let each patch taper and bend while retaining the existing encounter model.
zones = [(7,5,3,1),(6,6,5,1),(7,7,4,1),(8,8,2,1),
         (21,5,3,1),(20,6,5,1),(20,7,4,1),(21,8,2,1),
         (5,13,3,1),(4,14,5,1),(4,15,6,1),(5,16,5,1),(6,17,3,1),
         (29,17,3,1),(27,18,7,1),(26,19,9,1),(28,20,6,1)]
for x,y,w,h in zones:
    zone=rect(x,y,x+w,y+h)
    assert not zone & grass
    grass |= zone
assert grass and not paths & grass
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
# Bake the selected original sprites into the existing 32px map renderer.
field=runpy.run_path(str(ROOT/'scripts/poke-lounge/generate-autumn-field.py'))
ART=ROOT/'apps/web/public/assets/poke-lounge/world/original-autumn'
art={path.stem:Image.open(path).convert('RGBA') for path in ART.glob('*.png')}
assert len(art)==9 and all(set(img.getchannel('A').getdata())<={0,255} for img in art.values())
groups={name:art[file] for name,file in (('orange','04-rust-grove'),('gold','05-golden-grove'),
                                       ('transition','06-mixed-grove'),('shrub','11-autumn-shrub'),
                                       ('red-tree','03-red-maple'),('gold-tree','02-golden-maple'))}
accent_sources={745:'03-red-maple',749:'02-golden-maple',753:'02-golden-maple'}
for first,name in accent_sources.items():
    sprite=art[name]
    tree=Image.new('RGBA',(64,64))
    tree.alpha_composite(sprite,((64-sprite.width)//2,56-sprite.height))
    for i in range(4):
        x,y=i%2*S,i//2*S
        field['paste_extruded_tile'](atlas,tree.crop((x,y,x+S,y+S)),first+i-1,24)
canopy=Image.new('RGBA',(W*S,H*S))
trees=[]
grove_rng=Random(241022)
placements=[]
for x in range(-40,W*S,90):
    name='gold' if 100<x<310 else 'transition' if x>1000 else 'orange'
    placements.append((name,x+grove_rng.randrange(-9,10),grove_rng.randrange(-48,-31)))
for y in range(-25,H*S,64):
    placements.append(('gold' if 420<y<620 else 'orange',grove_rng.randrange(-84,-71),y+grove_rng.randrange(-8,9)))
for y in range(-25,H*S,66):
    name='transition' if y<160 else 'gold' if 420<y<600 else 'orange'
    placements.append((name,grove_rng.randrange(1228,1240),y+grove_rng.randrange(-8,9)))
for x in (*range(-48,405,90),416,768,*range(880,W*S,90)):
    placements.append(('gold' if 130<x<280 or 1000<x<1160 else 'orange',x,grove_rng.randrange(706,723)))
placements += [('shrub',x,y) for x,y in ((38,151),(32,354),(34,610),(1220,210),(1226,420),(1222,650),
                                       (70,40),(520,44),(910,36),(350,718),(925,712))]
# A narrow outer belt closes gaps where paths leave only one tile of forest depth.
for x in range(-12,W*S,28):
    name='gold-tree' if 140<x<280 or 1040<x<1140 else 'red-tree'
    placements.append((name,x+grove_rng.randrange(-3,4),-18+grove_rng.randrange(-4,5)))
    if x+40<=544 or x>=768:
        placements.append((name,x+grove_rng.randrange(-3,4),746+grove_rng.randrange(-4,5)))
for y in range(0,H*S,26):
    name='gold-tree' if 430<y<590 else 'red-tree'
    placements.append((name,-22+grove_rng.randrange(-3,4),y))
    placements.append((name,1260+grove_rng.randrange(-3,4),y+grove_rng.randrange(-4,5)))
for name,px,py in sorted(placements,key=lambda item:item[2]+groups[item[0]].height):
    sprite=groups[name]
    # Shift a whole grove outward when a fence/path narrows the border; never cut its canopy.
    dx,dy=(0,-4) if py<0 else (-4,0) if px<0 else (4,0) if px>=1220 else (0,4) if py>=706 else (0,0)
    for _ in range(24):
        footprint=rect(max(0,px//S),max(0,py//S),min(W,math.ceil((px+sprite.width)/S)),min(H,math.ceil((py+sprite.height)/S)))
        if not footprint or not footprint & (clear|collision) or name=='shrub':break
        px+=dx;py+=dy
    if not footprint or footprint & (clear|collision):continue
    canopy.alpha_composite(sprite,(px,py))
    trees.append({'group':name,'position':[px,py]})
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
# Keep accent artwork in place; only the two lower tiles contain the trunk hitbox.
for x,y,first in ((12,4,749),(12,8,753),(13,10,745),(25,11,745),(28,11,749),(26,15,745),(13,16,749),(15,18,753)):
    block=rect(x,y,x+2,y+2)
    if block & (clear|collision):continue
    for i,gid in enumerate(range(first,first+4)):world[(y+i//2)*W+x+i%2]=gid
    collision |= rect(x,y+1,x+2,y+2)
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
# Mirror adjacent copies so the generated floor textures meet at identical edge pixels.
carpet=Image.blend(art['07-dense-gold-floor'],art['08-mixed-forest-floor'],.25)
leaf_pattern=Image.new('RGBA',(128,128))
for x,y in ((0,0),(64,0),(0,64),(64,64)):
    tile=carpet
    if x:tile=tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if y:tile=tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    leaf_pattern.paste(tile,(x,y))
assert leaf_pattern.crop((0,0,1,128)).tobytes()==leaf_pattern.crop((127,0,128,128)).tobytes()
assert leaf_pattern.crop((0,0,128,1)).tobytes()==leaf_pattern.crop((0,127,128,128)).tobytes()
forest_cells={(i%W,i//W) for i,gid in enumerate(world) if gid>=759}
# Match the green strips marked in the reference, keeping paths and encounter grass open.
marked_leaves=(rect(2,2,10,3)|rect(2,3,4,12)|rect(16,1,27,3)|rect(16,3,18,9)
               |rect(27,1,38,4)|rect(37,3,38,9)|rect(10,20,19,23)|rect(16,23,28,24))-paths-grass
# Blend the original carpet into green ground, keeping its leaf pixels sharp.
leaf_rng=Random(1712)
scattered_leaves=Image.new('RGBA',canopy.size)
leaf_patches=((104,204,58,100),(240,82,90,40),(574,90,125,45),(560,215,40,65),
              (1020,100,165,48),(430,702,108,58),(780,752,145,36),
              (66,455,66,215),(1230,440,55,190))
canopy_alpha=canopy.getchannel('A')
forest_core=canopy_alpha.filter(ImageFilter.MaxFilter(25)).filter(ImageFilter.MinFilter(25))
# A small distance field gives every canopy the same smooth, outward opacity falloff.
distance_scale=4
dw,dh=W*S//distance_scale,H*S//distance_scale
core_samples=forest_core.resize((dw,dh),Image.Resampling.BOX)
distances=[0.0 if a else float('inf') for a in core_samples.getdata()]
for rows,columns,neighbors in ((range(dh),range(dw),((-1,0,1),(0,-1,1),(-1,-1,math.sqrt(2)),(1,-1,math.sqrt(2)))),
                               (range(dh-1,-1,-1),range(dw-1,-1,-1),((1,0,1),(0,1,1),(-1,1,math.sqrt(2)),(1,1,math.sqrt(2))))):
    for y in rows:
        for x in columns:
            i=y*dw+x
            if distances[i]==0:continue
            for dx,dy,cost in neighbors:
                if 0<=x+dx<dw and 0<=y+dy<dh:
                    distances[i]=min(distances[i],distances[(y+dy)*dw+x+dx]+cost)
falloff=[round(255*(1-d/64)**1.5) for d in range(65)]
assert falloff[0]==255 and falloff[-1]==0 and all(a>=b for a,b in zip(falloff,falloff[1:]))
soft_floor=Image.frombytes('L',(dw,dh),bytes(falloff[min(64,round(d*distance_scale))] for d in distances))
soft_floor=soft_floor.resize(canopy.size,Image.Resampling.BILINEAR)
scatter_count=0
for x,y in sorted(marked_leaves|forest_cells):
    clustered=any(((x*S+16-cx)/rx)**2+((y*S+16-cy)/ry)**2<1 for cx,cy,rx,ry in leaf_patches)
    if leaf_rng.random()>(.34 if clustered else .035):continue
    stamp=art['12-scattered-leaves']
    if leaf_rng.random()<.5:stamp=stamp.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    scattered_leaves.alpha_composite(stamp,(x*S+leaf_rng.randrange(-24,9),y*S+leaf_rng.randrange(-24,9)))
    scatter_count+=1
scatter_alpha=scattered_leaves.getchannel('A').point(lambda a:round(a*.42))
scattered_leaves.putalpha(ImageChops.multiply(scatter_alpha,soft_floor))
assert scattered_leaves.getchannel('A').getextrema()[1]<=107
# Repeat original ground in world coordinates so adjacent 32px cells share a texture.
def ground_surface(name):
    patch=Image.open(ROOT/'apps/web/public/assets/poke-lounge/world/original-ground'/name).convert('RGBA')
    assert patch.size==(128,128) and patch.getchannel('A').getextrema()==(255,255)
    pattern=Image.new('RGBA',(256,256))
    for x,y in ((0,0),(128,0),(0,128),(128,128)):
        tile=patch
        if x:tile=tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if y:tile=tile.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        pattern.paste(tile,(x,y))
    assert pattern.crop((0,0,1,256)).tobytes()==pattern.crop((255,0,256,256)).tobytes()
    assert pattern.crop((0,0,256,1)).tobytes()==pattern.crop((0,255,256,256)).tobytes()
    surface=Image.new('RGBA',canopy.size)
    for y in range(0,H*S,256):
        for x in range(0,W*S,256):surface.paste(pattern,(x,y))
    return surface
leaf_mix=Image.frombytes('L',(dw,dh),bytes(round(255*max(0,1-d*distance_scale/180)) for d in distances))
leaf_mix=leaf_mix.resize(canopy.size,Image.Resampling.BILINEAR)
ground=Image.composite(ground_surface('02-meadow-leaves.png'),ground_surface('01-meadow-grass.png'),leaf_mix)
earth=Image.composite(ground_surface('04-golden-earth-leaves.png'),ground_surface('03-golden-earth.png'),leaf_mix)
path_mask=Image.new('L',canopy.size)
path_draw=ImageDraw.Draw(path_mask)
for x,y in paths:path_draw.rectangle((x*S,y*S,(x+1)*S-1,(y+1)*S-1),fill=255)
# Vary the contour in world coordinates so worn verges stay continuous across tile seams.
verge_rng=Random(241024)
variation=Image.new('L',(W*2+1,H*2+1))
variation.putdata([verge_rng.randrange(32,225) for _ in range(variation.width*variation.height)])
variation=variation.resize(canopy.size,Image.Resampling.BICUBIC)
soft_path=path_mask.filter(ImageFilter.GaussianBlur(6))
rounded_mask=Image.frombytes('L',canopy.size,bytes(255 if a>=128+(n-128)*.5 else 0
    for a,n in zip(soft_path.getdata(),variation.getdata())))
rounded_draw=ImageDraw.Draw(rounded_mask)
for x,y in grass:rounded_draw.rectangle((x*S,y*S,(x+1)*S-1,(y+1)*S-1),fill=0)
assert all(rounded_mask.getpixel((x*S+S//2,y*S+S//2))==255 for x,y in paths)
assert all(not rounded_mask.crop((x*S,y*S,(x+1)*S,(y+1)*S)).getbbox() for x,y in grass)
assert ImageChops.subtract(rounded_mask,path_mask.filter(ImageFilter.MaxFilter(21))).getbbox() is None
assert ImageChops.subtract(path_mask.filter(ImageFilter.MinFilter(21)),rounded_mask).getbbox() is None
edge=rounded_mask.filter(ImageFilter.GaussianBlur(1.6))
edge.putdata([255 if a==255 else min(255,max(0,(a-170+(g[1]-150)*3)*5)) if inside else 0
              for a,inside,g in zip(edge.getdata(),rounded_mask.getdata(),ground.getdata())])
assert ImageChops.subtract(edge,rounded_mask).getbbox() is None
ground=Image.composite(earth,ground,edge)
baked_tiles=list(forest_tiles)
floor_cache={}
leaf_cells=[]
below=[]
for y in range(H):
    for x in range(W):
        p=(x,y)
        box=(x*S,y*S,(x+1)*S,(y+1)*S)
        tile=ground.crop(box)
        if p not in grass and (not world[y*W+x] or p in forest_cells|marked_leaves):
            coverage=soft_floor.crop(box)
            scatter=scattered_leaves.crop(box)
            if p in forest_cells:
                coverage=ImageChops.lighter(coverage,forest_core.crop(box))
            # Follow the rendered path edge so its grassy corners do not expose square tile seams.
            verge=ImageChops.invert(edge.crop(box))
            coverage=ImageChops.multiply(coverage,verge)
            scatter.putalpha(ImageChops.multiply(scatter.getchannel('A'),verge))
            path_interior=edge.crop(box).point(lambda a:255 if a==255 else 0)
            assert not ImageChops.multiply(coverage,path_interior).getbbox()
            assert not ImageChops.multiply(scatter.getchannel('A'),path_interior).getbbox()
            if coverage.getbbox() or scatter.getbbox():
                sx,sy=x%4*S,y%4*S
                carpet=leaf_pattern.crop((sx,sy,sx+S,sy+S));carpet.putalpha(coverage);tile.alpha_composite(carpet)
                tile.alpha_composite(scatter)
                leaf_cells.append(p)
        pixels=tile.tobytes()
        if pixels not in floor_cache:
            floor_cache[pixels]=759+len(baked_tiles)
            baked_tiles.append(tile)
        below.append(floor_cache[pixels])
assert len(below)==W*H and all(gid>=759+len(forest_tiles) for gid in below)
assert forest_cells <= set(leaf_cells) and not set(leaf_cells) & grass
assert set(leaf_cells) & paths  # Rounded path tiles retain leaf-covered verges.
base_atlas=atlas.crop((0,0,816,1088))
atlas=Image.new('RGBA',(816,math.ceil((758+len(baked_tiles))/24)*34))
atlas.paste(base_atlas,(0,0))
for index,tile in enumerate(baked_tiles):field['paste_extruded_tile'](atlas,tile,758+index,24)
atlas.save(ROOT/'apps/web/public/assets/poke-lounge/world/autumn-forest-32px-extruded.png',optimize=True)
# Preserve Tiled metadata and service object IDs while replacing the rice row runs.
map_data.update(width=W, height=H)
map_data['editorsettings']['export']['target']='autumn-forest-town.json'
layers = {layer['name']:layer for layer in map_data['layers']}
for name,data in (('Below Player',below),('World',world),('Above Player',[0]*(W*H))):
    layers[name].update(width=W,height=H,data=data)
next_id = max(obj['id'] for layer in map_data['layers'] if layer['name']!='TallGrassZones' for obj in layer.get('objects',[])) + 1
layers['TallGrassZones']['objects'] = [
    {'id':next_id+i,'name':f'rice-patch-row-{i+1}','type':'wild-encounter-grass',
     'rotation':0,'visible':True,'x':x*S,'y':y*S,'width':w*S,'height':h*S}
    for i,(x,y,w,h) in enumerate(zones)]
map_data['nextobjectid'] = next_id + len(zones)
for spawn in layers['SpawnPoints']['objects']:
    spawn.update(x=624,y=688)
for npc in layers['Npcs']['objects']:
    x,y={'nurse':(624,400),'storagePc':(688,400),'soloChallenger':(1040,464)}[npc['name']]
    npc.update(x=x,y=y)
for exit_zone in layers['Worlds']['objects']:
    exit_zone.update(x=576,y=736,width=160,height=32)
assert all(len(layers[name]['data'])==W*H for name in ('Below Player','World','Above Player'))
map_data['tilesets'][0].update(imageheight=atlas.height,tilecount=atlas.width//34*(atlas.height//34))
accent_gids=set(range(745,757))
map_data['tilesets'][0]['tiles']=[tile for tile in map_data['tilesets'][0]['tiles'] if tile['id']+1 not in accent_gids]
for first in accent_sources:
    for offset,x in ((2,22),(3,0)):
        map_data['tilesets'][0]['tiles'].append({
            'id':first+offset-1,'properties':[{'name':'collides','type':'bool','value':True}],
            'objectgroup':{'type':'objectgroup','objects':[{'id':1,'x':x,'y':8,'width':10,'height':16,'rotation':0}]}})
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
source.update(tileCount=atlas.width//34*(atlas.height//34),processing='Preserve paths and service game objects; reshape connected rice encounter patches into tapered row runs. Bake original introduction-matched ground, earth, natural path verges, autumn trees and forest-floor falloff into the current 32px tile map.')
source['ground']={'sourceManifest':'original-ground/source.json','tiles':len(floor_cache),'tileRange':[759+len(forest_tiles),758+len(baked_tiles)],'patchSize':128,'repeatSize':256,'leafFadeDistancePixels':180,'cornerSmoothingPixels':6,'vergeVariationSeed':241024,'placement':'Mirror repeats in world coordinates for exact edge matching. Blend leaf variants toward forest edges, soften path corners with irregular grass and earth contours sampled across the whole map, then slice into extruded 32px tiles. Preserve path centers and keep encounter patches clear of collision data.'}
source['gids'].update({'745-748':'original red maple','749-752':'original golden maple','753-756':'original golden maple'})
source['forestFloor']={'textures':['original-autumn/07-dense-gold-floor.png','original-autumn/08-mixed-forest-floor.png','original-autumn/12-scattered-leaves.png'],'tiles':len({below[y*W+x] for x,y in leaf_cells}),'cells':len(leaf_cells),'forestCells':len(forest_cells),'scatterPatches':scatter_count,'fadeDistancePixels':64,'placement':'Original leaf ground at 100% beneath canopy groups, fading by distance to transparent over 64px; scattered leaves share the same falloff at 42% strength. The rendered path mask clips leaves per pixel, retaining continuous foliage on grassy verges and rounded corners. Path interiors and encounter grass stay clear.'}
source['bakedForest']={'sourceManifest':'original-autumn/source.json','seed':241022,
                       'counts':{name:sum(tree['group']==name for tree in trees) for name in groups},
                       'tileRange':[759,758+len(forest_tiles)],'accentTrees':accent_sources,
                       'placement':'Original pixel-art groves at native scale, staggered and depth sorted. Whole sprites move outward where paths or fences narrow the perimeter; protected clearings stay open.'}
source['trees']={'sourceManifest':'original-autumn/source.json','quadrantOrder':'top-left, top-right, bottom-left, bottom-right'}
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
grass_atlas=Image.open(ROOT/'apps/web/public/assets/poke-lounge/world/autumn-forest-grass.png').convert('RGBA')
def draw_grass(x,y,foreground=False):
    mask=sum(bit for bit,p in ((1,(x,y-1)),(2,(x+1,y)),(4,(x,y+1)),(8,(x-1,y))) if p in grass)
    sx=1+mask*34;sy=1+((y%4)*4+x%4)*68+(34 if foreground else 0)
    canvas.alpha_composite(grass_atlas.crop((sx,sy,sx+32,sy+32)),(x*S,y*S))
for x,y in grass:draw_grass(x,y)
npcs=[('nurse',19.5,12.5,'a_0_8_1_0133/pcwoman1_5.png'),('storagePc',21.5,12.5,'a_0_7_0_0093/tmfl04_door1.png'),('soloChallenger',32.5,14.5,'a_0_8_1_0039/gentleman_5.png')]
for name,x,y,path in npcs:
    img=Image.open(ROOT/'apps/web/public/assets/poke-lounge/textures'/path).convert('RGBA').resize((40,40),Image.Resampling.NEAREST)
    canvas.alpha_composite(img,(round(x*S)-20,round(y*S)-40))
for x,y in grass:draw_grass(x,y,True)
canvas.convert('RGB').save(OUT/'full-map-implemented.png')
(OUT/'layout-manifest.json').write_text(json.dumps({'status':'implemented','width':W,'height':H,'tileSize':S,'grassCells':len(grass),'trees':trees,'leafCells':leaf_cells,'paths':sorted(paths),'collision':sorted(collision),'zones':zones,'npcTilePositions':[(n,x,y) for n,x,y,_ in npcs],'spawnTile':[19.5,21.5]},indent=2)+'\n')
print(f'Wrote autumn map: {W}x{H}, {len(trees)} original forest sprites, {len(forest_tiles)} baked forest tiles, {len(paths)} path cells, {len(grass)} grass cells. Static connectivity checked; no gameplay validation.')
