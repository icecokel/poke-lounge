import { z } from "zod";
import {
  LEAGUE_JUDGE_PROTOCOL,
  LEAGUE_PARTY_SIZE,
  LEAGUE_MATCH_COUNT,
  LEAGUE_MAX_INPUTS_PER_MATCH,
  type LeagueJudgeOp,
  type LeagueJudgeErrorCode,
  type LeagueSeasonRoster,
  type LeaguePrepareEntryResult,
  type LeagueJudgeMatchResult,
} from "@poke-lounge/battle/league/contract";
import { Fraction } from "@poke-lounge/battle/league/fraction";

export const MAX_BODY_BYTES = 1024 * 1024;
export const JOB_TIMEOUT_MS = 7000;
export const QUEUE_TIMEOUT_MS = 500;
export const MAX_QUEUE = 8;

const integer = (min: number, max: number) => z.number().int().min(min).max(max);
const slot = integer(0, 5);
const level = integer(1, 100);
const species = integer(1, 493);
const moveId = integer(1, 467);
const gender = z.enum(["male", "female", "genderless"]);
const stats = (max: number) =>
  z.strictObject({
    hp: integer(0, max),
    attack: integer(0, max),
    defense: integer(0, max),
    specialAttack: integer(0, max),
    specialDefense: integer(0, max),
    speed: integer(0, max),
  });
const ivs = stats(31);
const evs = stats(255).refine(value => Object.values(value).reduce((sum, n) => sum + n, 0) <= 510);
const compositionFields = {
  slotIndex: slot,
  monId: z.uuid().optional(),
  speciesId: species,
  level,
  natureId: integer(0, 24),
  abilityId: integer(1, 123),
  gender,
  happiness: integer(0, 255),
  individualValues: ivs,
  effortValues: evs,
  heldItemId: integer(0, 65535),
};
const compositionMember = z.strictObject({
  ...compositionFields,
  moves: z
    .array(z.strictObject({ moveId, maxPp: integer(1, 64) }))
    .min(1)
    .max(4),
});
const composition = z.strictObject({
  version: z.literal(1),
  leadSlot: slot,
  members: z.array(compositionMember).min(1).max(LEAGUE_PARTY_SIZE),
});
const battleMember = z
  .strictObject({
    ...compositionFields,
    originalLevel: level,
    maxHp: integer(1, 65535),
    attack: integer(1, 65535),
    defense: integer(1, 65535),
    specialAttack: integer(1, 65535),
    specialDefense: integer(1, 65535),
    speed: integer(1, 65535),
    currentHp: integer(0, 65535),
    status: z.enum(["normal", "fainted"]),
    moves: z
      .array(
        z
          .strictObject({ moveId, pp: integer(0, 64), maxPp: integer(1, 64) })
          .refine(move => move.pp <= move.maxPp),
      )
      .min(1)
      .max(4),
  })
  .refine(
    member =>
      member.currentHp <= member.maxHp &&
      (member.currentHp === 0) === (member.status === "fainted") &&
      new Set(member.moves.map(move => move.moveId)).size === member.moves.length,
  );
const battleParty = z
  .strictObject({
    version: z.literal(1),
    activeSlotIndex: slot,
    members: z.array(battleMember).length(LEAGUE_PARTY_SIZE),
  })
  .refine(
    party => new Set(party.members.map(member => member.slotIndex)).size === LEAGUE_PARTY_SIZE,
  );
const claim = z.strictObject({
  version: z.literal(1),
  leadSlot: slot,
  members: z
    .array(
      z.strictObject({
        slotIndex: slot,
        monId: z.uuid(),
        speciesId: species,
        level,
        experience: integer(0, Number.MAX_SAFE_INTEGER),
        effortValues: evs,
        happiness: integer(0, 255),
        moveIds: z.array(moveId).min(1).max(4),
      }),
    )
    .length(LEAGUE_PARTY_SIZE),
});
const mon = z.strictObject({
  monId: z.uuid(),
  speciesId: species,
  level,
  individualValues: ivs,
  natureId: integer(0, 24),
  abilityId: integer(1, 123),
  gender,
});
const meta = z.strictObject({
  kind: z.enum(["npc", "player"]),
  position: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  displayName: z.string().min(1).max(100),
  npcKey: z.enum(["lance", "karen", "bruno", "koga", "will"]).optional(),
});
const fraction = z
  .strictObject({
    num: z
      .string()
      .max(256)
      .regex(/^(0|[1-9]\d*)$/),
    den: z
      .string()
      .max(256)
      .regex(/^[1-9]\d*$/),
  })
  .refine(value => {
    try {
      const q = Fraction.fromJSON(value);
      return q.compare(new Fraction(0)) >= 0 && q.compare(new Fraction(100)) <= 0;
    } catch {
      return false;
    }
  });
export const requestSchema = z.strictObject({
  protocol: z.literal(LEAGUE_JUDGE_PROTOCOL),
  requestId: z.uuid(),
  engineVersion: z.string().max(96),
  op: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("season-roster") }),
    z.strictObject({
      kind: z.literal("prepare-entry"),
      claim,
      mons: z.array(mon).max(LEAGUE_PARTY_SIZE),
      opponents: z.array(z.strictObject({ meta, composition })).length(LEAGUE_MATCH_COUNT),
    }),
    z
      .strictObject({
        kind: z.literal("judge-match"),
        seed: z.tuple([integer(0, 65535), integer(0, 65535), integer(0, 65535), integer(0, 65535)]),
        matchIndex: integer(0, 4),
        carryParty: battleParty,
        opponent: battleParty,
        leadSlot: slot,
        inputs: z
          .array(z.union([z.tuple([z.literal("m"), moveId]), z.tuple([z.literal("s"), slot])]))
          .max(LEAGUE_MAX_INPUTS_PER_MATCH),
        previousQ: z.array(fraction).max(4),
      })
      .refine(op => op.previousQ.length === op.matchIndex),
  ]),
});
export interface JudgeRequest {
  protocol: typeof LEAGUE_JUDGE_PROTOCOL;
  requestId: string;
  engineVersion: string;
  op: LeagueJudgeOp;
}
export type JudgeResponse = {
  protocol: typeof LEAGUE_JUDGE_PROTOCOL;
  requestId: string;
  engineVersion: string;
} & (
  | { ok: true; data: LeagueSeasonRoster | LeaguePrepareEntryResult | LeagueJudgeMatchResult }
  | { ok: false; code: LeagueJudgeErrorCode; detail: unknown }
);
export type WorkerMessage =
  | { ready: true; engineVersion: string }
  | { result: JudgeResponse; advances?: number; outcome?: string; errorClass?: string };
