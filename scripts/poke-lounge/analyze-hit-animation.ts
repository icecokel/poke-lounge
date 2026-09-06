import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** Read-only verification of the locally supplied HG Korean ROM. No ROM data is published. */
const rom = readFileSync(process.argv[2] ?? "data/roms/포켓몬스터 하트골드(K).nds");
const sha1 = createHash("sha1").update(rom).digest("hex");
if (sha1 !== "5834fb3a2d751c48501d47d6a56898d7af6ccf9e") throw Error("Unexpected ROM revision");
const fat = rom.readUInt32LE(0x48);
const fnt = rom.readUInt32LE(0x40);
function file(id: number) {
  return rom.subarray(rom.readUInt32LE(fat + id * 8), rom.readUInt32LE(fat + id * 8 + 4));
}
function findFile(path: string) {
  let dir = 0xf000;
  const segments = path.split("/");
  for (let segment = 0; segment < segments.length; segment++) {
    const entry = fnt + (dir & 0xfff) * 8;
    let pos = fnt + rom.readUInt32LE(entry),
      id = rom.readUInt16LE(entry + 4);
    let matched = false;
    for (;;) {
      const len = rom[pos++];
      if (!len) break;
      const name = rom.toString("ascii", pos, pos + (len & 127));
      pos += len & 127;
      if (len & 128) {
        const next = rom.readUInt16LE(pos);
        pos += 2;
        if (name === segments[segment]) {
          dir = next;
          matched = true;
          break;
        }
      } else {
        if (name === segments[segment] && segment === segments.length - 1) return file(id);
        id++;
      }
    }
    if (!matched) throw Error("File not found " + path);
  }
  throw Error("Expected file");
}
function decompress(data: Buffer) {
  const extra = data.readUInt32LE(data.length - 4);
  if (!extra) return data;
  const footer = data.readUInt32LE(data.length - 8),
    header = footer >>> 24,
    compressed = footer & 0xffffff;
  if (header < 8 || header > data.length || compressed > data.length || extra > 10000000)
    throw Error("Invalid compression footer");
  const out = Buffer.alloc(data.length + extra);
  data.copy(out);
  let src = data.length - header,
    dst = out.length;
  const end = data.length - compressed;
  while (dst > end) {
    const flags = data[--src];
    for (let mask = 128; mask && dst > end; mask >>= 1) {
      if (flags & mask) {
        const a = data[--src],
          b = data[--src],
          len = (a >>> 4) + 3,
          disp = (((a & 15) << 8) | b) + 3;
        for (let i = 0; i < len && dst > end; i++) {
          --dst;
          if (dst + disp >= out.length) throw Error("Invalid backreference");
          out[dst] = out[dst + disp];
        }
      } else out[--dst] = data[--src];
    }
  }
  return out;
}
const overlayTable = rom.readUInt32LE(0x50);
const entry = overlayTable + 12 * 32;
if (rom.readUInt32LE(entry) !== 12) throw Error("Overlay not found");
const packed = file(rom.readUInt32LE(entry + 24));
const overlay = (rom.readUInt32LE(entry + 28) >>> 24) & 1 ? decompress(packed) : packed;
// Thumb: push{r3,r4,r5,lr}; add r4,r1,0; add r5,r0,0; ldrb r0,[r4,9]; cmp r0,6.
const signature = Buffer.from("38b50c1c051c607a0628", "hex");
const offset = overlay.indexOf(signature);
if (offset < 0 || overlay.indexOf(signature, offset + 1) >= 0)
  throw Error("Flicker task signature missing/ambiguous");
const routine = overlay.subarray(offset, offset + 92);

// Validate the delay=2 store, incremented toggle count and visibility XOR=1.
for (const pattern of ["0220a072", "401c6072", "0122", "5a40", "1722"])
  if (!routine.includes(Buffer.from(pattern, "hex")))
    throw Error("Unexpected flicker instruction " + pattern);
const archive = findFile("a/0/0/1");
if (archive.toString("ascii", 0, 4) !== "NARC") throw Error("Expected battle subscript NARC");
const btaf = 16;
const count = archive.readUInt16LE(btaf + 8);
const start = archive.readUInt32LE(btaf + 12 + 2 * 8),
  end = archive.readUInt32LE(btaf + 16 + 2 * 8);
let gmif = 16;
while (archive.toString("ascii", gmif, gmif + 4) !== "GMIF") {
  gmif += archive.readUInt32LE(gmif + 4);
  if (gmif >= archive.length) throw Error("Missing GMIF");
}
const script = archive.subarray(gmif + 8 + start, gmif + 8 + end);
const words = Array.from({ length: script.length / 4 }, (_, i) => script.readUInt32LE(i * 4));
if (!words.includes(25)) throw Error("UpdateHp subscript lacks FlickerMon");
const report = {
  romSha1: sha1,
  gameCode: rom.toString("ascii", 12, 16),
  overlayId: 12,
  overlayRamAddress: rom.readUInt32LE(entry + 4),
  flickerTaskOffset: offset,
  flickerTaskAddress: rom.readUInt32LE(entry + 4) + offset,
  taskSha256: createHash("sha256").update(routine).digest("hex"),
  subscriptArchive: "a/0/0/1",
  subscriptIndex: 2,
  subscriptCount: count,
  subscriptWords: words,
  toggles: 6,
  delayTicks: 2,
  toggleIntervalFrames: 3,
  toggleFrames: [0, 3, 6, 9, 12, 15],
  restoreFrame: 16,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n");
