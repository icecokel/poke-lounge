import { advanceGen4Battle, createGen4Battle, validateGen4Action } from "../gen4/engine";
import type { Gen4Action, Gen4ActionRequest, Gen4Frame, Gen4Step } from "../gen4/types";
import {
  LEAGUE_MAX_ADVANCES_PER_MATCH,
  LEAGUE_MAX_INPUTS_PER_MATCH,
  LEAGUE_PARTY_SIZE,
  LEAGUE_TURN_LIMIT,
  type LeagueBattleParty,
  type LeagueInput,
  type LeagueMatchMeasure,
  type LeagueSeed,
} from "./contract";
import { chooseLeagueAiAction } from "./ai-view";
import { countLuck } from "./luck";
import { LeaguePartyError, toGen4Party } from "./party";
import { Fraction } from "./fraction";
import { leagueHash } from "./hash";
import { scoreMatch } from "./score";

export interface LeagueMatchRules {
  turnLimit: number;
  maxAdvances: number;
  maxInputs: number;
}
export const LEAGUE_MATCH_RULES: LeagueMatchRules = {
  turnLimit: LEAGUE_TURN_LIMIT,
  maxAdvances: LEAGUE_MAX_ADVANCES_PER_MATCH,
  maxInputs: LEAGUE_MAX_INPUTS_PER_MATCH,
};
export interface LeagueMatchInit {
  seed: LeagueSeed;
  challenger: LeagueBattleParty;
  opponent: LeagueBattleParty;
  leadSlot: number;
  rules: LeagueMatchRules;
}
export interface LeagueMatchProgress {
  readonly init: LeagueMatchInit;
  readonly frame: Gen4Frame;
  readonly inputs: readonly LeagueInput[];
  readonly advances: number;
  readonly startFainted: number;
  readonly outcome: null | "won" | "lost" | "draw";
  readonly drawReason: null | "engine" | "turn_limit";
  readonly steps: readonly Gen4Step[];
  readonly allSteps?: never;
}
export class LeagueInputError extends Error {
  constructor(
    readonly kind: "ILLEGAL_INPUT" | "INCOMPLETE_INPUT" | "TRAILING_INPUT" | "TOO_LONG",
    readonly at: number,
  ) {
    super(kind);
  }
}

// Retain counters, not the full presentation history, across immutable progress objects.
const luckByProgress = new WeakMap<LeagueMatchProgress, LeagueMatchMeasure["luck"]>();

function needsPlayer(frame: Gen4Frame): boolean {
  const request = frame.requests[0];
  return (
    request.kind === "switch" ||
    (request.kind === "move" && !request.recharge && request.forcedMoveId === null)
  );
}

function advance(
  p: LeagueMatchProgress,
  challenger: Gen4Action | undefined,
  opponent: Gen4Action | undefined,
): LeagueMatchProgress {
  if (p.advances >= p.init.rules.maxAdvances)
    throw new LeagueInputError("TOO_LONG", p.inputs.length);
  const frame = advanceGen4Battle(p.frame.session, [challenger, opponent]);
  if (frame.escapedBy !== undefined) throw new Error("ENGINE_STALL");
  const outcome = frame.ended
    ? frame.winner === 0
      ? "won"
      : frame.winner === 1
        ? "lost"
        : "draw"
    : frame.turn > p.init.rules.turnLimit
      ? "draw"
      : null;
  const next: LeagueMatchProgress = {
    ...p,
    frame,
    advances: p.advances + 1,
    outcome,
    drawReason: outcome === "draw" ? (frame.ended ? "engine" : "turn_limit") : null,
    steps: [...p.steps, ...frame.steps],
  };
  const before = luckByProgress.get(p)!;
  const delta = countLuck(frame.steps);
  luckByProgress.set(next, {
    critsFor: before.critsFor + delta.critsFor,
    critsAgainst: before.critsAgainst + delta.critsAgainst,
    missesFor: before.missesFor + delta.missesFor,
    missesAgainst: before.missesAgainst + delta.missesAgainst,
  });
  return next;
}

function autoProgress(p: LeagueMatchProgress): LeagueMatchProgress {
  while (p.outcome === null && !needsPlayer(p.frame)) {
    const challenger: Gen4Action | undefined =
      p.frame.requests[0].kind === "move" ? { kind: "continue" } : undefined;
    const opponent = chooseLeagueAiAction(p.frame);
    if (!challenger && !opponent) throw new Error("ENGINE_STALL");
    p = advance(p, challenger, opponent);
  }
  return p;
}

export function startLeagueMatch(init: LeagueMatchInit): LeagueMatchProgress {
  for (const [party, lead] of [
    [init.challenger, init.leadSlot],
    [init.opponent, init.opponent.activeSlotIndex],
  ] as const) {
    if (
      party.members.length < 1 ||
      party.members.length > LEAGUE_PARTY_SIZE ||
      new Set(party.members.map(member => member.slotIndex)).size !== party.members.length
    )
      throw new LeaguePartyError("PARTY_SIZE_OR_SLOTS", -1);
    if (
      !party.members.some(
        member => member.slotIndex === lead && member.currentHp > 0 && member.status !== "fainted",
      )
    )
      throw new LeaguePartyError("LEAD_SLOT", lead);
  }
  if (
    init.seed.length !== 4 ||
    !init.seed.every(value => Number.isInteger(value) && value >= 0 && value <= 65535)
  )
    throw new Error("Invalid league seed");
  if (
    ![init.rules.turnLimit, init.rules.maxAdvances, init.rules.maxInputs].every(
      value => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new Error("Invalid league rules");
  let seedIndex = 0;
  const frame = createGen4Battle(
    [
      toGen4Party(init.challenger, init.leadSlot),
      toGen4Party(init.opponent, init.opponent.activeSlotIndex),
    ],
    () => {
      if (seedIndex >= 4) throw new Error("Seed reader exhausted");
      return init.seed[seedIndex++]! / 65536;
    },
  );
  if (frame.escapedBy !== undefined) throw new Error("ENGINE_STALL");
  const outcome = frame.ended
    ? frame.winner === 0
      ? "won"
      : frame.winner === 1
        ? "lost"
        : "draw"
    : null;
  const p: LeagueMatchProgress = {
    init,
    frame,
    inputs: [],
    advances: 0,
    startFainted: init.challenger.members.filter(member => member.currentHp === 0).length,
    outcome,
    drawReason: outcome === "draw" ? "engine" : null,
    steps: frame.steps,
  };
  luckByProgress.set(p, countLuck(frame.steps));
  return autoProgress(p);
}

export function getPlayerChoices(
  p: LeagueMatchProgress,
):
  | { kind: "move"; moves: Gen4ActionRequest["moves"]; switchSlots: number[]; trapped: boolean }
  | { kind: "switch"; switchSlots: number[] }
  | { kind: "none" } {
  if (p.outcome !== null || !needsPlayer(p.frame)) return { kind: "none" };
  const request = p.frame.requests[0];
  return request.kind === "switch"
    ? { kind: "switch", switchSlots: request.switchSlots }
    : {
        kind: "move",
        moves: request.moves,
        switchSlots: request.switchSlots,
        trapped: request.trapped,
      };
}

export function applyPlayerInput(p: LeagueMatchProgress, input: LeagueInput): LeagueMatchProgress {
  const at = p.inputs.length;
  if (p.outcome !== null) throw new LeagueInputError("TRAILING_INPUT", at);
  if (at >= p.init.rules.maxInputs) throw new LeagueInputError("TOO_LONG", at);
  if (
    !Array.isArray(input) ||
    input.length !== 2 ||
    !["m", "s"].includes(input[0]) ||
    !Number.isSafeInteger(input[1]) ||
    !needsPlayer(p.frame)
  )
    throw new LeagueInputError("ILLEGAL_INPUT", at);
  const action: Gen4Action =
    input[0] === "m" ? { kind: "move", moveId: input[1] } : { kind: "switch", slotIndex: input[1] };
  try {
    validateGen4Action(p.frame.requests[0], action);
  } catch {
    throw new LeagueInputError("ILLEGAL_INPUT", at);
  }
  const ready = { ...p, steps: [] };
  luckByProgress.set(ready, luckByProgress.get(p)!);
  const advanced = advance(ready, action, chooseLeagueAiAction(p.frame));
  const recorded = { ...advanced, inputs: [...p.inputs, [input[0], input[1]] as LeagueInput] };
  luckByProgress.set(recorded, luckByProgress.get(advanced)!);
  return autoProgress(recorded);
}

export function replayLeagueMatch(
  init: LeagueMatchInit,
  inputs: readonly LeagueInput[],
): LeagueMatchProgress {
  let p = startLeagueMatch(init);
  for (const input of inputs) p = applyPlayerInput(p, input);
  if (p.outcome === null) throw new LeagueInputError("INCOMPLETE_INPUT", inputs.length);
  return p;
}

export function measureLeagueMatch(p: LeagueMatchProgress): LeagueMatchMeasure {
  if (p.outcome === null) throw new LeagueInputError("INCOMPLETE_INPUT", p.inputs.length);
  const members = p.frame.parties[0].members;
  const survivors = members.filter(member => member.currentHp! > 0);
  const hpRatio =
    survivors.length === 0
      ? new Fraction(0)
      : survivors
          .reduce(
            (sum, member) => sum.add(new Fraction(member.currentHp!, member.maxHp!)),
            new Fraction(0),
          )
          .div(new Fraction(survivors.length));
  const input = {
    faintedNew: members.filter(member => member.currentHp === 0).length - p.startFainted,
    hpRatio: hpRatio.toJSON(),
    turns: p.frame.turn,
  };
  const q = p.outcome === "won" ? scoreMatch(input) : new Fraction(0);
  return {
    ...input,
    status: p.outcome,
    q: q.toJSON(),
    qApprox: Number(q.num) / Number(q.den),
    endHash: leagueHash(p.frame.parties),
    luck: { ...luckByProgress.get(p)! },
  };
}
