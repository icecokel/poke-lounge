import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  AnimationRom,
  encodePng,
  readAnimationCommands,
  readNarc,
  readSpa,
  rgb555,
} from "./nds-animation-data";

function words(values: number[]): Buffer {
  const result = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => result.writeUInt32LE(value >>> 0, index * 4));
  return result;
}

function narcFixture(files: Buffer[]): Buffer {
  const header = Buffer.alloc(16);
  header.write("NARC");
  const table = Buffer.alloc(12 + files.length * 8);
  table.write("BTAF");
  table.writeUInt32LE(table.length, 4);
  table.writeUInt16LE(files.length, 8);
  let offset = 0;
  files.forEach((file, index) => {
    table.writeUInt32LE(offset, 12 + index * 8);
    offset += file.length;
    table.writeUInt32LE(offset, 16 + index * 8);
  });
  const image = Buffer.alloc(8);
  image.write("GMIF");
  image.writeUInt32LE(8 + offset, 4);
  return Buffer.concat([header, table, image, ...files]);
}

function textureFixture(format: 1 | 6): Buffer {
  const paletteSize = format === 1 ? 64 : 16;
  const textureSize = 32 + 64 + paletteSize;
  const source = Buffer.alloc(32 + textureSize);
  source.write(" APS");
  source.writeUInt16LE(1, 10);
  source.writeUInt32LE(32, 24);
  source.writeUInt32LE(format, 36);
  source.writeUInt32LE(96, 44);
  source.writeUInt32LE(paletteSize, 48);
  source.writeUInt32LE(textureSize, 60);
  // First pixel transparent, second opaque and last opaque using the highest palette index.
  source[64] = 0;
  source[65] = format === 1 ? 0xe0 : 0xf8;
  source[127] = 0xff;
  source.writeUInt16LE(31, 128);
  source.writeUInt16LE(31 << 10, 128 + paletteSize - 2);
  return source;
}

test("NitroFS readers reject truncated and out-of-bounds ranges without modifying the source", () => {
  assert.throws(() => new AnimationRom(Buffer.alloc(16)), /Truncated/);
  const source = Buffer.alloc(512);
  const before = Buffer.from(source);
  const rom = new AnimationRom(source);
  assert.equal(rom.sha1.length, 40);
  assert.equal(rom.range(512, 0).length, 0);
  for (const [start, length] of [
    [-1, 1],
    [0, -1],
    [511, 2],
    [0.5, 1],
    [NaN, 1],
  ]) {
    assert.throws(() => rom.range(start!, length!), /bounds/);
  }
  assert.throws(() => rom.file("a/0/1/0"), /Missing/);
  assert.deepEqual(source, before);
});

test("NARC validates blocks, member counts and member boundaries", () => {
  const input = narcFixture([Buffer.from("fly"), Buffer.from("dig")]);
  assert.deepEqual(
    readNarc(input).map(file => file.toString()),
    ["fly", "dig"],
  );
  const invalidBlock = Buffer.from(input);
  invalidBlock.writeUInt32LE(7, 20);
  assert.throws(() => readNarc(invalidBlock), /block size/);
  const invalidMember = Buffer.from(input);
  invalidMember.writeUInt32LE(9999, 32);
  assert.throws(() => readNarc(invalidMember), /member range/);
  const invalidCount = Buffer.from(input);
  invalidCount.writeUInt16LE(9999, 24);
  assert.throws(() => readNarc(invalidCount), /FAT/);
  assert.throws(() => readNarc(input.subarray(0, input.length - 1)), /block size/);
});

test("Animation parsing treats relative branches and native callback parameters as operands", () => {
  const source = words([13, 100, -20, 45, 36, 5, 1, 0, 1, 2, 264, 4]);
  assert.deepEqual(readAnimationCommands(source), [
    { word: 0, op: 13, args: [100, -20] },
    { word: 3, op: 45, args: [36, 5, 1, 0, 1, 2, 264] },
    { word: 11, op: 4, args: [] },
  ]);
  assert.throws(() => readAnimationCommands(Buffer.alloc(3)), /whole words/);
  assert.throws(() => readAnimationCommands(words([9999])), /Unknown/);
  assert.throws(() => readAnimationCommands(words([45, 36])), /Truncated/);
  assert.throws(() => readAnimationCommands(words([45, 36, 1000000])), /size/);
});

for (const format of [1, 6] as const) {
  test(`SPL texture format ${format} preserves palette color and per-pixel alpha`, () => {
    const source = textureFixture(format);
    const { textures, emitters } = readSpa(source);
    assert.equal(emitters.length, 0);
    assert.equal(textures.length, 1);
    assert.equal(textures[0]!.width, 8);
    assert.equal(textures[0]!.height, 8);
    assert.deepEqual([...textures[0]!.rgba.subarray(0, 8)], [255, 0, 0, 0, 255, 0, 0, 255]);
    assert.deepEqual([...textures[0]!.rgba.subarray(-4)], [0, 0, 255, 255]);
    assert.throws(() => readSpa(source.subarray(0, source.length - 1)), /size/);
    const invalidPalette = Buffer.from(source);
    invalidPalette.writeUInt32LE(1, 48);
    assert.throws(() => readSpa(invalidPalette), /palette index/);
  });
}

test("SPL optional resources are bounded by the texture table", () => {
  const source = Buffer.alloc(120);
  source.write(" APS");
  source.writeUInt16LE(1, 8);
  source.writeUInt32LE(120, 24);
  assert.equal(readSpa(source).emitters.length, 1);
  source.writeUInt32LE(1 << 8, 32);
  assert.throws(() => readSpa(source), /optional resource/);
  assert.deepEqual(rgb555(0x7fff), [255, 255, 255]);
  assert.deepEqual(rgb555(0), [0, 0, 0]);
});

test("PNG encoding produces lossless RGBA scanlines with valid size checks", () => {
  const pixels = Buffer.from([255, 0, 0, 0, 10, 20, 30, 255]);
  const encoded = encodePng(2, 1, pixels);
  assert.equal(encoded.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < encoded.length;) {
    const size = encoded.readUInt32BE(offset);
    const type = encoded.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(encoded.subarray(offset + 8, offset + 8 + size));
    offset += 12 + size;
  }
  assert.deepEqual(inflateSync(Buffer.concat(chunks)), Buffer.concat([Buffer.from([0]), pixels]));
  assert.throws(() => encodePng(3, 1, pixels), /mismatch/);
});

const romPath =
  process.env.POKE_LOUNGE_TEST_ROM ??
  fileURLToPath(new URL("../../data/roms/포켓몬스터 하트골드(K).nds", import.meta.url));
test(
  "Local IPKK archive verification: all 551 scripts and 486 particle resources decode",
  { skip: !existsSync(romPath) },
  () => {
    const rom = new AnimationRom(readFileSync(romPath));
    assert.equal(rom.sha1, "5834fb3a2d751c48501d47d6a56898d7af6ccf9e");
    const moves = readNarc(rom.file("a/0/1/0"));
    const common = readNarc(rom.file("a/0/6/1"));
    const particles = readNarc(rom.file("a/0/2/9"));
    assert.equal(moves.length, 501);
    assert.equal(common.length, 50);
    assert.equal(particles.length, 486);
    for (const bytes of [...moves, ...common]) {
      const commands = readAnimationCommands(bytes);
      assert.equal(
        commands.reduce((sum, command) => sum + 4 * (command.args.length + 1), 0),
        bytes.length,
      );
    }
    for (const bytes of particles) assert.ok(readSpa(bytes));
    for (const id of [19, 91]) {
      const commands = readAnimationCommands(moves[id]!);
      assert.ok(commands.some(command => command.op === 13));
      const visibility = commands.filter(command => command.op === 45 && command.args[0] === 40);
      assert.ok(visibility.some(command => command.args[3] === 1));
      assert.ok(visibility.some(command => command.args[3] === 0));
    }
  },
);
