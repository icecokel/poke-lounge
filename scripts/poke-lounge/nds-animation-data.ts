import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

/** NitroFS/NARC readers. Read-only, bounds checked; never modifies the supplied ROM. */
export class AnimationRom {
  readonly sha1: string;
  constructor(readonly bytes: Buffer) {
    if (bytes.length < 0x200) throw new Error("Truncated NDS header");
    this.sha1 = createHash("sha1").update(bytes).digest("hex");
  }
  range(start: number, length: number): Buffer {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < 0 ||
      length < 0 ||
      start + length > this.bytes.length
    )
      throw new Error("NDS range out of bounds");
    return this.bytes.subarray(start, start + length);
  }
  file(path: string): Buffer {
    const fnt = this.bytes.readUInt32LE(0x40),
      fat = this.bytes.readUInt32LE(0x48);
    let directory = 0xf000;
    const segments = path.split("/");
    for (const [index, segment] of segments.entries()) {
      const entry = this.range(fnt + (directory & 0xfff) * 8, 8);
      let cursor = fnt + entry.readUInt32LE(0),
        id = entry.readUInt16LE(4),
        found = false;
      for (let guard = 0; guard < 65536; guard++) {
        const size = this.range(cursor++, 1)[0]!;
        if (!size) break;
        const name = this.range(cursor, size & 127).toString("ascii");
        cursor += size & 127;
        if (size & 128) {
          const next = this.range(cursor, 2).readUInt16LE(0);
          cursor += 2;
          if (name === segment) {
            directory = next;
            found = true;
            break;
          }
        } else {
          if (name === segment && index === segments.length - 1) {
            const allocation = this.range(fat + id * 8, 8);
            return this.range(
              allocation.readUInt32LE(0),
              allocation.readUInt32LE(4) - allocation.readUInt32LE(0),
            );
          }
          id++;
        }
      }
      if (!found) throw new Error(`Missing NitroFS file: ${path}`);
    }
    throw new Error(`Expected file: ${path}`);
  }
}

export function readNarc(bytes: Buffer): Buffer[] {
  if (bytes.length < 24 || bytes.toString("ascii", 0, 4) !== "NARC")
    throw new Error("Invalid NARC header");
  let allocation: Buffer | undefined, image: Buffer | undefined;
  for (let offset = 16; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error("Truncated NARC block");
    const kind = bytes.toString("ascii", offset, offset + 4),
      size = bytes.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > bytes.length) throw new Error("Invalid NARC block size");
    if (kind === "BTAF") allocation = bytes.subarray(offset, offset + size);
    if (kind === "GMIF") image = bytes.subarray(offset + 8, offset + size);
    offset += size;
  }
  if (!allocation || !image || allocation.length < 12) throw new Error("Missing NARC blocks");
  const count = allocation.readUInt16LE(8);
  if (12 + count * 8 > allocation.length) throw new Error("Truncated NARC FAT");
  return Array.from({ length: count }, (_, index) => {
    const start = allocation!.readUInt32LE(12 + index * 8),
      end = allocation!.readUInt32LE(16 + index * 8);
    if (end < start || end > image!.length) throw new Error("Invalid NARC member range");
    return image!.subarray(start, end);
  });
}

export interface AnimCommand {
  word: number;
  op: number;
  args: number[];
}
// Verified against every instruction in IPKK a/0/1/0 and a/0/6/1. Relative branch words
// are operands, not opcodes. Native animation callbacks are NOT ARM emulated here.
const ARG_COUNTS = [
  1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 2, 2, 0, 0, 2, 2, 2, 0, 0, 0, 2, 0, 5, 4, 3, 0, 0, 0, 0, 2, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, -1, 3, 4, 8, 6, 0, 2, 0, 1, -1, -1, 0, 1, 4, 0, 1, 0, 2, 0, 3,
  3, 1, 0, 1, 1, 5, 1, 1, 8, 2, 3, 2, 2, -1, 8, 1, 2, 3, 1, 0, 1, 3, 1, 2,
];
export function readAnimationCommands(bytes: Buffer): AnimCommand[] {
  if (bytes.length % 4) throw new Error("Animation script must contain whole words");
  const result: AnimCommand[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const op = bytes.readUInt32LE(offset);
    let count = ARG_COUNTS[op];
    if (count === undefined) throw new Error(`Unknown animation opcode ${op} at ${offset}`);
    const dynamic =
      op === 45 ? [2, 2] : op === 54 ? [4, 4] : op === 55 ? [1, 1] : op === 78 ? [9, 9] : null;
    if (dynamic) {
      if (offset + (dynamic[0]! + 1) * 4 > bytes.length)
        throw new Error("Truncated variable instruction");
      count = dynamic[1]! + bytes.readUInt32LE(offset + dynamic[0]! * 4);
    }
    if (count < 0 || count > 32 || offset + (count + 1) * 4 > bytes.length)
      throw new Error("Invalid instruction size");
    result.push({
      word: offset / 4,
      op,
      args: Array.from({ length: count }, (_, i) => bytes.readInt32LE(offset + 4 + i * 4)),
    });
    offset += (count + 1) * 4;
  }
  return result;
}

export interface SpaTexture {
  width: number;
  height: number;
  rgba: Buffer;
}
export interface SpaEmitter {
  flags: number;
  count: number;
  radius: number;
  scale: number;
  aspect: number;
  delay: number;
  emitterLife: number;
  life: number;
  interval: number;
  alpha: number;
  texture: number;
  color: number;
  rotation: number;
  velocity: number;
  scaleCurve: number[];
  alphaCurve: number[];
  textureFrames: number[];
  textureStep: number;
}
export interface SpaResource {
  emitters: SpaEmitter[];
  textures: SpaTexture[];
}
const rounded = (n: number) => Math.round(n * 1000) / 1000;
export function rgb555(color: number): [number, number, number] {
  return [color & 31, (color >> 5) & 31, (color >> 10) & 31].map(c =>
    Math.round((c * 255) / 31),
  ) as [number, number, number];
}
export function readSpa(bytes: Buffer): SpaResource {
  if (bytes.length < 32 || bytes.toString("ascii", 0, 4) !== " APS")
    throw new Error("Invalid SPL resource");
  const emitters: SpaEmitter[] = [],
    textures: SpaTexture[] = [];
  const textureOffset = bytes.readUInt32LE(24);
  let offset = 32;
  for (let i = 0; i < bytes.readUInt16LE(8); i++) {
    if (offset + 88 > textureOffset) throw new Error("Truncated SPL emitter");
    const flags = bytes.readUInt32LE(offset);
    const emitter: SpaEmitter = {
      flags,
      count: rounded(bytes.readInt32LE(offset + 16) / 4096),
      radius: rounded(bytes.readInt32LE(offset + 20) / 4096),
      color: bytes.readUInt16LE(offset + 34),
      scale: rounded(bytes.readInt32LE(offset + 44) / 4096),
      aspect: rounded(bytes.readInt16LE(offset + 48) / 4096),
      delay: bytes.readUInt16LE(offset + 50),
      rotation: bytes.readInt16LE(offset + 54),
      emitterLife: bytes.readUInt16LE(offset + 60),
      life: bytes.readUInt16LE(offset + 62),
      interval: bytes[offset + 68]!,
      alpha: bytes[offset + 69]!,
      texture: bytes[offset + 71]!,
      velocity: rounded(bytes.readInt32LE(offset + 36) / 4096),
      scaleCurve: [1, 1, 1],
      alphaCurve: [0, 1, 0],
      textureFrames: [],
      textureStep: 1,
    };
    offset += 88;
    for (const [bit, size] of [
      [8, 12],
      [9, 12],
      [10, 8],
      [11, 12],
      [16, 20],
      [24, 8],
      [25, 8],
      [26, 16],
      [27, 4],
      [28, 8],
      [29, 16],
    ] as const) {
      if (!(flags & (1 << bit))) continue;
      if (offset + size > textureOffset) throw new Error("Truncated SPL optional resource");
      if (bit === 8)
        emitter.scaleCurve = [0, 2, 4].map(n => rounded(bytes.readInt16LE(offset + n) / 4096));
      if (bit === 10) {
        const alpha = bytes.readUInt16LE(offset);
        emitter.alphaCurve = [alpha & 31, (alpha >> 5) & 31, (alpha >> 10) & 31].map(n =>
          rounded(n / 31),
        );
      }
      if (bit === 11) {
        const count = bytes[offset + 8]!;
        if (count > 8) throw new Error("Invalid texture frame count");
        emitter.textureFrames = [...bytes.subarray(offset, offset + count)];
        emitter.textureStep = bytes[offset + 9]!;
      }
      offset += size;
    }
    emitters.push(emitter);
  }
  if (offset !== textureOffset) throw new Error("SPL emitter layout mismatch");
  for (let i = 0; i < bytes.readUInt16LE(10); i++) {
    if (offset + 32 > bytes.length) throw new Error("Truncated SPL texture");
    const param = bytes.readUInt32LE(offset + 4),
      format = param & 15;
    const width = 8 << ((param >> 4) & 15),
      height = 8 << ((param >> 8) & 15),
      size = bytes.readUInt32LE(offset + 28);
    const paletteOffset = bytes.readUInt32LE(offset + 12),
      paletteSize = bytes.readUInt32LE(offset + 16);
    if (
      width > 256 ||
      height > 256 ||
      size < 32 ||
      offset + size > bytes.length ||
      paletteOffset + paletteSize > size
    )
      throw new Error("Invalid SPL texture size");
    if (format !== 1 && format !== 6) throw new Error(`Unsupported SPL texture format ${format}`);
    if (32 + width * height > size) throw new Error("Truncated texture pixels");
    const rgba = Buffer.alloc(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
      const value = bytes[offset + 32 + pixel]!,
        index = value & (format === 1 ? 31 : 7),
        alpha = value >>> (format === 1 ? 5 : 3);
      if (index * 2 >= paletteSize) throw new Error("Texture palette index out of range");
      const color = rgb555(bytes.readUInt16LE(offset + paletteOffset + index * 2));
      color.forEach((c, channel) => (rgba[pixel * 4 + channel] = c));
      rgba[pixel * 4 + 3] = Math.round((alpha * 255) / (format === 1 ? 7 : 31));
    }
    textures.push({ width, height, rgba });
    offset += size;
  }
  if (offset !== bytes.length) throw new Error("Unexpected trailing SPL data");
  return { emitters, textures };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(name: string, data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from(name), data]),
    size = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(content));
  return Buffer.concat([size, content, crc]);
}
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  if (rgba.length !== width * height * 4) throw new Error("PNG pixel size mismatch");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scan = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++)
    rgba.copy(scan, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scan)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
