import { z } from "zod";
import type { ComputeFailureDiagnostic } from "./diagnostics";
import { STARTER_MODES } from "@poke-lounge/battle/starter-selection";
import { AI_DIFFICULTIES } from "@poke-lounge/battle/ai-difficulty";
import { PARTY_ROSTER_LIMIT } from "@poke-lounge/battle/party-acceptance";
import {
  GEN4_SPECIES_ID_MAX,
  GEN4_MOVE_ID_MAX,
  GEN4_ITEM_ID_MAX,
  GEN4_ABILITY_ID_MAX,
  GEN4_NATURE_ID_MAX,
  GEN4_IV_MAX,
  GEN4_EV_MAX,
  GEN4_HAPPINESS_MAX,
  GEN4_STATUS_TURNS_MAX,
  COMPETITIVE_PP_MAX,
  COMPETITIVE_CURRENT_HP_MAX,
} from "@poke-lounge/battle/competitive-contract";
import { GEN4_STATUSES } from "@poke-lounge/battle/gen4/types";
import { ROUND_DURATION_OPTIONS_MS } from "@poke-lounge/battle/timing";
import {
  GAME_ROUND_COUNT,
  TOURNAMENT_MAX_PARTICIPANT_COUNT,
} from "@poke-lounge/battle/tournament-bracket";
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
const aiDifficulty = z.enum(AI_DIFFICULTIES);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const starterSelection = z.strictObject({ mode: z.enum(STARTER_MODES), seed: boundedId });
const rosterSchema = z.strictObject({
  version: z.literal(1),
  highWaterLevel: integer.min(1).max(100),
  entries: z
    .array(
      z.strictObject({
        ivKey: z.string().regex(/^(?:[0-9]|[12][0-9]|3[01])(?:-(?:[0-9]|[12][0-9]|3[01])){5}$/),
        speciesId: integer.min(1).max(GEN4_SPECIES_ID_MAX),
        level: integer.min(1).max(100),
        moveIds: z.array(integer.min(1).max(GEN4_MOVE_ID_MAX)).max(4),
        updatedAtMs: integer,
      }),
    )
    .max(PARTY_ROSTER_LIMIT),
});
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
      starterSelection: starterSelection.nullish(),
    }),
    z.strictObject({
      kind: z.literal("initial-party"),
      seed: boundedId,
      starterSelection: starterSelection.optional(),
    }),
    z.strictObject({
      kind: z.literal("accept-party"),
      party: z.unknown(),
      roster: rosterSchema.nullable(),
      nowMs: integer,
      trusted: z.boolean(),
      starterSelection: starterSelection.nullish(),
    }),
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
      kind: z.literal("settle-tournament"),
      state: z.unknown(),
      // 한 매치는 참가자 2명이므로 AI도 최대 2명
      aiPlayerIds: z.array(boundedId).max(2),
    }),
    z.strictObject({
      kind: z.literal("complete-progression"),
      party: z.unknown(),
      proposed: z.unknown(),
      previousLevels: z.record(z.string(), integer.min(1).max(100)),
    }),
    z.strictObject({
      kind: z.literal("ai-step"),
      party: z.unknown(),
      adventure: z.unknown().nullable(),
      nowMs: integer,
      roundIndex: integer.min(1).max(GAME_ROUND_COUNT),
      preparing: z.boolean(),
      starting: z.boolean(),
      gathering: z.boolean(),
      playerId: boundedId,
      playerIds: z.array(boundedId).min(1).max(TOURNAMENT_MAX_PARTICIPANT_COUNT),
      difficulty: aiDifficulty,
      startAtMs: integer.nullable(),
      roundDurationMs: z.literal([...ROUND_DURATION_OPTIONS_MS]),
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
} & (
  | { ok: true; data: unknown }
  | { ok: false; code: "INVALID_INPUT" | "COMPUTE_FAILED"; diagnostic: ComputeFailureDiagnostic }
);

const iv = z.strictObject({
  hp: integer.max(GEN4_IV_MAX),
  attack: integer.max(GEN4_IV_MAX),
  defense: integer.max(GEN4_IV_MAX),
  specialAttack: integer.max(GEN4_IV_MAX),
  specialDefense: integer.max(GEN4_IV_MAX),
  speed: integer.max(GEN4_IV_MAX),
});
const ev = z.strictObject({
  hp: integer.max(GEN4_EV_MAX),
  attack: integer.max(GEN4_EV_MAX),
  defense: integer.max(GEN4_EV_MAX),
  specialAttack: integer.max(GEN4_EV_MAX),
  specialDefense: integer.max(GEN4_EV_MAX),
  speed: integer.max(GEN4_EV_MAX),
});
// Explicit input fields. Calculated stats are not accepted from a browser.
export const partySchema = z.object({
  version: z.literal(2),
  activeSlotIndex: integer.max(5),
  members: z
    .array(
      z.object({
        slotIndex: integer.max(5),
        speciesId: integer.min(1).max(GEN4_SPECIES_ID_MAX),
        level: integer.min(1).max(100),
        experience: integer.optional(),
        currentHp: integer.max(COMPETITIVE_CURRENT_HP_MAX),
        status: z.enum(GEN4_STATUSES),
        individualValues: iv,
        moves: z
          .array(
            z.strictObject({
              moveId: integer.min(1).max(GEN4_MOVE_ID_MAX),
              pp: integer.max(COMPETITIVE_PP_MAX),
            }),
          )
          .min(1)
          .max(4),
        gender: z.enum(["male", "female", "genderless"]).optional(),
        natureId: integer.max(GEN4_NATURE_ID_MAX).optional(),
        abilityId: integer.max(GEN4_ABILITY_ID_MAX).optional(),
        heldItemId: integer.max(GEN4_ITEM_ID_MAX).optional(),
        statusTurns: integer.max(GEN4_STATUS_TURNS_MAX).optional(),
        happiness: integer.max(GEN4_HAPPINESS_MAX).optional(),
        effortValues: ev.optional(),
      }),
    )
    .min(1)
    .max(6),
});
export const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("move"),
    moveId: z.union([integer.min(1).max(GEN4_MOVE_ID_MAX), z.literal("struggle")]),
  }),
  z.strictObject({ kind: z.literal("switch"), slotIndex: integer.max(5) }),
  z.strictObject({ kind: z.literal("continue") }),
]);
