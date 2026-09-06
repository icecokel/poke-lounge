/**
 * Extracts move-specific particle bindings and artwork from a locally supplied IPKK ROM.
 * Usage: ./apps/web/node_modules/.bin/tsx scripts/poke-lounge/extract-battle-animations.ts [rom.nds]
 * References (format descriptions only; no fetched scripts are redistributed):
 * - BluRosie/hg-engine armips/include/animscriptcmd.s
 * - pret/pokeplatinum lib/spl/include/{spl_resource,spl_texture}.h
 * Script sequencing, native callbacks and 3D projection are adapted by the web renderer;
 * this is NOT a Nintendo DS emulator or a claim of pixel-identical native callbacks.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileURLToPath } from "node:url";
import {
  AnimationRom,
  readNarc,
  readAnimationCommands,
  readSpa,
  encodePng,
  rgb555,
  type AnimCommand,
  type SpaEmitter,
} from "./nds-animation-data";

process.chdir(fileURLToPath(new URL("../../", import.meta.url)));

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const rom = new AnimationRom(
  readFileSync(process.argv[2] ?? resolve(repositoryRoot, "data/roms/포켓몬스터 하트골드(K).nds")),
);
if (rom.sha1 !== "5834fb3a2d751c48501d47d6a56898d7af6ccf9e")
  throw new Error("Unverified ROM revision; check archive layouts before adding another hash");
const moveBytes = readNarc(rom.file("a/0/1/0")),
  commonBytes = readNarc(rom.file("a/0/6/1"));
const moves = moveBytes.map(readAnimationCommands),
  common = commonBytes.map(readAnimationCommands);
const resources = readNarc(rom.file("a/0/2/9")).map(readSpa);
if (moves.length !== 501 || common.length !== 50 || resources.length !== 486)
  throw new Error("Archive count mismatch");
const pngs: { width: number; height: number; rgba: Buffer }[] = [];
const textureIds = new Map<string, number>();
const emitters: Record<string, unknown> = {};
function texture(resourceId: number, index: number, color: number): number {
  const source = resources[resourceId]?.textures[index];
  if (!source) throw new Error(`Missing texture ${resourceId}/${index}`);
  const rgba = Buffer.from(source.rgba),
    rgb = rgb555(color);
  for (let i = 0; i < rgba.length; i += 4)
    for (let c = 0; c < 3; c++) rgba[i + c] = Math.round((rgba[i + c]! * rgb[c]!) / 255);
  const key = createHash("sha256")
    .update(Buffer.from([source.width, source.height]))
    .update(rgba)
    .digest("hex");
  const existing = textureIds.get(key);
  if (existing !== undefined) return existing;
  const id = pngs.length;
  pngs.push({ ...source, rgba });
  textureIds.set(key, id);
  return id;
}
function addEmitter(resourceId: number, index: number): string | null {
  const e = resources[resourceId]?.emitters[index];
  if (!e) return null;
  const key = `${resourceId}:${index}`;
  if (emitters[key]) return key;
  const { flags, texture: tex, color, textureFrames, ...rest } = e;
  emitters[key] = {
    ...rest,
    emission: flags & 15,
    rotate: Boolean(flags & (1 << 12)),
    gravity: Boolean(flags & (1 << 24)),
    frames: (textureFrames.length ? textureFrames : [tex]).map(i => texture(resourceId, i, color)),
  };
  return key;
}
function profile(commands: AnimCommand[], id: number, commonAnimation = false) {
  const slots = new Map<number, number>();
  const emit: { resource: string; target: number; at: number }[] = [];
  let delay = 0;
  const functions: number[] = [];
  let shake = 0,
    shakeCount = 0,
    tint: number | null = null,
    slide: number[] | null = null;
  for (const c of commands) {
    if (c.op === 51) slots.set(c.args[0]!, c.args[1]!);
    if (c.op === 0) delay += Math.max(0, c.args[0]!);
    if (c.op === 4) delay = 0; // alternate branches start their own relative timeline
    if (c.op === 45) {
      const func = c.args[0]!,
        p = c.args.slice(2);
      functions.push(func);
      if (func === 36 && p.length >= 5 && [264, 272, 288].includes(p[4]!)) {
        shake = Math.max(shake, Math.abs(p[3]!));
        shakeCount = Math.max(shakeCount, Math.abs(p[0]!));
      }
      if (func === 34 && p.length >= 4) tint = p[3]!;
      if (func === 57 && !slide && p.length >= 4) slide = [p[1]!, p[2]!];
    }
    if ([46, 47, 48, 49].includes(c.op)) {
      const resourceId = slots.get(c.args[0]!);
      if (resourceId === undefined) continue;
      // Six-direction emitter tables: use the P>E definition; the renderer mirrors coordinates for E>P.
      const index = c.args[1]!,
        target = c.args.at(-1)!;
      const resource = addEmitter(resourceId, index);
      if (!resource) continue;
      if (!emit.some(e => e.resource === resource && e.target === target && e.at === delay))
        emit.push({ resource, target, at: Math.min(delay, 90) });
    }
  }
  const windup = [19, 91, 291, 340, 467].includes(id)
    ? id === 19 || id === 340
      ? "air"
      : id === 91
        ? "ground"
        : id === 291
          ? "water"
          : "shadow"
    : [13, 76, 130, 143, 553].includes(id)
      ? "charge"
      : "none";
  return {
    emit: emit.slice(0, 24),
    shake: Math.min(shake, 12),
    shakeCount: Math.min(shakeCount, 8),
    tint,
    slide,
    windup: commonAnimation ? "none" : windup,
    functions: [...new Set(functions)],
    scriptBytes: (commands.at(-1)?.word ?? 0) * 4 + 4,
  };
}
const moveProfiles = Object.fromEntries(
  moves.slice(1, 471).map((commands, index) => [index + 1, profile(commands, index + 1)]),
);
// IPKK common archive indexes verified against particle IDs and native tint commands:
// 2: SPA27 emitter7 purple; 3: SPA27 emitter2 red; 5: SPA115 emitter1 black/yellow.
const statusProfiles = Object.fromEntries(
  Object.entries({ poisoned: 2, burned: 3, paralyzed: 5 }).map(([status, index]) => [
    status,
    { ...profile(common[index]!, index, true), scriptIndex: index },
  ]),
);
// Safe missing-asset fallback also uses the ROM's common impact texture, not an unrelated move's effect.
const fallback = profile(moves[33]!, 33);
const ATLAS = 1024;
let page = 0,
  x = 1,
  y = 1,
  rowHeight = 0;
const pages: Buffer[] = [Buffer.alloc(ATLAS * ATLAS * 4)];
const frames = pngs.map(png => {
  if (x + png.width + 1 > ATLAS) {
    x = 1;
    y += rowHeight + 2;
    rowHeight = 0;
  }
  if (y + png.height + 1 > ATLAS) {
    page++;
    pages.push(Buffer.alloc(ATLAS * ATLAS * 4));
    x = 1;
    y = 1;
    rowHeight = 0;
  }
  for (let row = 0; row < png.height; row++)
    png.rgba.copy(
      pages[page]!,
      ((y + row) * ATLAS + x) * 4,
      row * png.width * 4,
      (row + 1) * png.width * 4,
    );
  const result = { page, x, y, width: png.width, height: png.height };
  x += png.width + 2;
  rowHeight = Math.max(rowHeight, png.height);
  return result;
});
const dest = resolve(repositoryRoot, "apps/web/public/assets/poke-lounge/battle-effects");
mkdirSync(dest, { recursive: true });
pages.forEach((bytes, index) =>
  writeFileSync(`${dest}/particles-${index}.png`, encodePng(ATLAS, ATLAS, bytes)),
);
const catalog = {
  version: 1,
  source: {
    gameCode: "IPKK",
    sha1: rom.sha1,
    moveArchive: "a/0/1/0",
    particleArchive: "a/0/2/9",
    statusArchive: "a/0/6/1",
    parsedScripts: moves.length + common.length,
    moveCount: 470,
    particleResources: resources.length,
  },
  atlasSize: ATLAS,
  frames,
  emitters,
  moves: moveProfiles,
  statuses: statusProfiles,
  fallback,
};
writeFileSync(
  resolve(
    repositoryRoot,
    "apps/web/src/components/poke-lounge/runtime/game/battle/move-animations.generated.json",
  ),
  JSON.stringify(catalog) + "\n",
);
console.log(
  JSON.stringify(
    {
      ...catalog.source,
      atlasPages: pages.length,
      uniqueTextures: frames.length,
      usedEmitters: Object.keys(emitters).length,
      movesWithEmitters: Object.values(moveProfiles).filter(p => p.emit.length > 0).length,
    },
    null,
    2,
  ),
);
