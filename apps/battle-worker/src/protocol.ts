import { z } from "zod";
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from "@poke-lounge/battle/competitive-ruleset-config";

export const ENGINE_VERSION = `gen4:${COMPETITIVE_RULESET_VERSION}:${COMPETITIVE_RULESET_HASH}`;
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_JOBS = 64;
export const JOB_TIMEOUT_MS = 8_000;

const boundedId = z.string().min(1).max(160);
const aiDifficulty = z.enum(["easy", "normal", "hard"]);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const requestSchema = z.strictObject({
  protocolVersion: z.literal(1),
  requestId: z.uuid(),
  roomInstanceId: z.uuid(),
  stateRevision: integer,
  engineVersion: z.literal(ENGINE_VERSION),
  operation: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("normalize-party"),
      party: z.unknown(),
      restore: z.boolean().default(false),
    }),
    z.strictObject({ kind: z.literal("initial-party"), seed: boundedId }),
    z.strictObject({
      kind: z.literal("initialize"),
      players: z.array(z.strictObject({ playerId: boundedId, party: z.unknown() })).length(2),
      seed: boundedId,
    }),
    z.strictObject({
      kind: z.literal("validate"),
      state: z.unknown(),
      playerId: boundedId,
      action: z.unknown(),
    }),
    z.strictObject({
      kind: z.literal("resolve"),
      state: z.unknown(),
      actions: z.record(z.string(), z.unknown()),
      seed: boundedId,
    }),
    z.strictObject({
      kind: z.literal("choose-ai"),
      state: z.unknown(),
      playerId: boundedId,
      difficulty: aiDifficulty,
      seed: boundedId,
    }),
    z.strictObject({ kind: z.literal("forfeit"), state: z.unknown(), loserPlayerId: boundedId }),
    z.strictObject({
      kind: z.literal("ai-step"),
      party: z.unknown(),
      adventure: z.unknown().nullable(),
      nowMs: integer,
      roundIndex: integer.min(1).max(3),
      preparing: z.boolean(),
      starting: z.boolean(),
      gathering: z.boolean(),
      playerId: boundedId,
      playerIds: z.array(boundedId).min(1).max(8),
      difficulty: aiDifficulty,
      startAtMs: integer.nullable(),
      roundDurationMs: z.union([z.literal(90_000), z.literal(180_000), z.literal(300_000)]),
      seed: boundedId,
    }),
  ]),
});
export type ComputeRequest = z.infer<typeof requestSchema>;
export type ComputeResponse = {
  protocolVersion: 1;
  requestId: string;
  roomInstanceId: string;
  stateRevision: number;
  engineVersion: string;
} & ({ ok: true; data: unknown } | { ok: false; code: "INVALID_INPUT" | "COMPUTE_FAILED" });

const iv = z.strictObject({
  hp: integer.max(31),
  attack: integer.max(31),
  defense: integer.max(31),
  specialAttack: integer.max(31),
  specialDefense: integer.max(31),
  speed: integer.max(31),
});
const ev = z.strictObject({
  hp: integer.max(255),
  attack: integer.max(255),
  defense: integer.max(255),
  specialAttack: integer.max(255),
  specialDefense: integer.max(255),
  speed: integer.max(255),
});
// Explicit input fields. Calculated stats are not accepted from a browser.
export const partySchema = z.object({
  version: z.literal(2),
  activeSlotIndex: integer.max(5),
  members: z
    .array(
      z.object({
        slotIndex: integer.max(5),
        speciesId: integer.min(1).max(493),
        level: integer.min(1).max(100),
        currentHp: integer.max(10_000),
        status: z.enum([
          "normal",
          "poisoned",
          "badlyPoisoned",
          "burned",
          "paralyzed",
          "asleep",
          "frozen",
          "fainted",
        ]),
        individualValues: iv,
        moves: z
          .array(z.strictObject({ moveId: integer.min(1).max(470), pp: integer.max(100) }))
          .min(1)
          .max(4),
        gender: z.enum(["male", "female", "genderless"]).optional(),
        natureId: integer.max(24).optional(),
        abilityId: integer.max(123).optional(),
        heldItemId: integer.max(536).optional(),
        statusTurns: integer.max(7).optional(),
        happiness: integer.max(255).optional(),
        effortValues: ev.optional(),
      }),
    )
    .min(1)
    .max(6),
});
export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("move"),
    moveId: z.union([integer.min(1).max(470), z.literal("struggle")]),
  }),
  z.strictObject({ kind: z.literal("switch"), slotIndex: integer.max(5) }),
  z.strictObject({ kind: z.literal("continue") }),
]);
