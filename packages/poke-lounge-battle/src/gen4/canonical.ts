import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
import {
  COMPETITIVE_MAX_DRAW_REMATCHES,
  COMPETITIVE_RULESET_V2,
} from "../competitive-ruleset-config";
import { Fraction } from "../league/fraction";
import { createDefaultBattleStatStages } from "../battle-stat-stages";
import {
  createCanonicalIdRecord,
  hashCanonicalState,
  type CanonicalBattleState,
  type CanonicalPlayerState,
  type CanonicalTerminalResult,
} from "../canonical-state";
import type { CanonicalCompetitiveAction } from "../actions";
import type { SeededRandom } from "../prng";
import {
  createGen4Battle,
  readGen4Battle,
  advanceGen4Battle,
  validateGen4Action,
  defaultGen4Action,
} from "./engine";
import { normalizeGen4Traits } from "./traits";
import { GEN4_ROM_SPECIES } from "./rom-catalog.generated";
import type { Gen4Action, Gen4ActionRequest, Gen4Frame, Gen4Party } from "./types";
import type { ResolvedAnimationEvent } from "../battle-presentation";

function parties(state: CanonicalBattleState): [Gen4Party, Gen4Party] {
  const result = state.participantIds.map(id => {
    const p = state.playersById[id]!;
    return {
      activeSlotIndex: p.activeSlotIndex,
      members: p.team.map(m => ({
        ...m,
        name: GEN4_ROM_SPECIES[m.speciesId]?.name ?? "포켓몬",
        moves: m.moves.map(move => ({ ...move })),
      })),
    };
  });
  return [result[0]!, result[1]!];
}
export function initializeGen4Canonical(
  state: CanonicalBattleState,
  random: SeededRandom,
): CanonicalBattleState {
  return applyFrame(
    state,
    createGen4Battle(parties(state), () => random.next()),
    state.turn,
  );
}
function currentFrame(state: CanonicalBattleState, random?: SeededRandom): Gen4Frame {
  return state.gen4Session
    ? readGen4Battle(state.gen4Session)
    : createGen4Battle(parties(state), random ? () => random.next() : () => 0.5);
}
export function getGen4CompetitiveActionRequest(
  state: CanonicalBattleState,
  playerId: string,
): Gen4ActionRequest {
  const index = state.participantIds.indexOf(playerId);
  if (index < 0) throw Error("Unknown battle participant");
  return currentFrame(state).requests[index]!;
}
function isChoiceRejected(error: unknown): boolean {
  return error instanceof Error && /^\[(?:Unavailable|Invalid) choice\]/.test(error.message);
}
/** The submitted action is not legal for the current request; the battle state itself is fine. */
export class Gen4CompetitiveActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Gen4CompetitiveActionRejectedError";
  }
}
export function validateGen4CompetitiveAction(input: {
  state: CanonicalBattleState;
  playerId: string;
  action: CanonicalCompetitiveAction;
}): void {
  if (input.state.terminal)
    throw new Gen4CompetitiveActionRejectedError("Cannot act after battle has ended");
  const index = input.state.participantIds.indexOf(input.playerId);
  if (index < 0) throw new Gen4CompetitiveActionRejectedError("Unknown battle participant");
  // Restoring the session is outside the try: a failure there is an engine fault, not a bad action.
  const request = getGen4CompetitiveActionRequest(input.state, input.playerId);
  try {
    validateGen4Action(request, input.action);
  } catch (error) {
    throw new Gen4CompetitiveActionRejectedError(
      error instanceof Error ? error.message : "Illegal battle action",
    );
  }
}
export function resolveGen4CompetitiveTurn(input: {
  state: CanonicalBattleState;
  actionsByPlayerId: Readonly<Record<string, CanonicalCompetitiveAction>>;
  random: SeededRandom;
}) {
  if (input.state.terminal) throw Error("Cannot resolve an ended battle");
  if (Object.keys(input.actionsByPlayerId).some(id => !input.state.participantIds.includes(id)))
    throw Error("Unknown battle action actor");
  if (
    !Number.isSafeInteger(input.state.turn) ||
    input.state.turn < 0 ||
    input.state.turn >= Number.MAX_SAFE_INTEGER
  )
    throw Error("Invalid turn revision");
  const before = currentFrame(input.state, input.random);
  const actions = input.state.participantIds.map((id, index) => {
    const req = before.requests[index]!;
    if (req.kind === "wait" || req.kind === "ended") {
      if (input.actionsByPlayerId[id]) throw Error("Waiting player cannot consume another action");
      return undefined;
    }
    const action = input.actionsByPlayerId[id] ?? defaultGen4Action(req);
    if (!action) throw Error("Missing legal battle action");
    try {
      validateGen4Action(req, action);
    } catch (error) {
      // A stored room may contain a choice accepted before hidden constraints were exposed.
      const fallback = defaultGen4Action(req);
      if (!fallback) throw error;
      return fallback;
    }
    return action;
  }) as [Gen4Action | undefined, Gen4Action | undefined];
  let after: Gen4Frame;
  try {
    after = advanceGen4Battle(before.session, actions);
  } catch (error) {
    if (!isChoiceRejected(error)) throw error;
    for (const index of [0, 1] as const) {
      if (!actions[index]) continue;
      const single: [Gen4Action | undefined, Gen4Action | undefined] = [undefined, undefined];
      single[index] = actions[index];
      try {
        advanceGen4Battle(before.session, single);
      } catch (rejection) {
        if (!isChoiceRejected(rejection)) throw rejection;
        const fallback = defaultGen4Action(before.requests[index]!);
        if (!fallback) throw rejection;
        actions[index] = fallback;
      }
    }
    // Every attempt restores the original snapshot, including its RNG and unspent choices.
    after = advanceGen4Battle(before.session, actions);
  }
  let rewardState = input.state;
  let terminalReason: CanonicalTerminalResult["reason"] = "faint";
  if (after.ended && after.winner === null) {
    if ((input.state.gen4RematchCount ?? 0) >= COMPETITIVE_MAX_DRAW_REMATCHES) {
      after = { ...after, winner: drawWinner(input.state, after) };
      terminalReason = "timeout";
    } else {
      rewardState = {
        ...input.state,
        gen4RematchCount: (input.state.gen4RematchCount ?? 0) + 1,
        tournamentRewards: recordTournamentKnockouts(input.state, after),
      };
      // Ended frames export baseMoveSlots, stripping Transform and Mimic before the rematch.
      const rematch = after.parties.map(p => ({
        ...p,
        members: p.members.map(m => ({
          ...m,
          currentHp: m.maxHp,
          status: "normal" as const,
          statusTurns: 0,
          statStages: createDefaultBattleStatStages(),
          moves: m.moves.map(move => ({
            ...move,
            pp: move.maxPp ?? COMPETITIVE_MOVE_CATALOG[move.moveId]!.maxPp,
          })),
        })),
      })) as [Gen4Party, Gen4Party];
      const restarted = createGen4Battle(rematch, () => input.random.next());
      after = { ...restarted, steps: [...after.steps, ...restarted.steps] };
    }
  }
  const state = applyFrame(rewardState, after, input.state.turn + 1, terminalReason);
  return {
    turn: input.state.turn,
    state,
    stateHash: hashCanonicalState(state),
    terminal: state.terminal,
  };
}
function drawWinner(state: CanonicalBattleState, frame: Gen4Frame): 0 | 1 {
  const remaining = frame.parties.map(party => {
    const alive = party.members.filter(member => member.currentHp! > 0);
    return {
      count: alive.length,
      hp: alive.reduce(
        (sum, member) => sum.add(new Fraction(member.currentHp!, member.maxHp!)),
        new Fraction(0),
      ),
    };
  });
  const hp = remaining[0]!.hp.compare(remaining[1]!.hp);
  if (hp !== 0) return hp > 0 ? 0 : 1;
  const count = remaining[0]!.count - remaining[1]!.count;
  if (count !== 0) return count > 0 ? 0 : 1;
  const [first, second] = state.participantIds.map(id => state.playersById[id]!.seed);
  // Old room snapshots have no bracket seed; their canonical participant order breaks the tie.
  return (first ?? Number.MAX_SAFE_INTEGER) <= (second ?? Number.MAX_SAFE_INTEGER) ? 0 : 1;
}
function applyFrame(
  previous: CanonicalBattleState,
  frame: Gen4Frame,
  revision: number,
  terminalReason: CanonicalTerminalResult["reason"] = "faint",
): CanonicalBattleState {
  const ids = previous.participantIds;
  const players = createCanonicalIdRecord<CanonicalPlayerState>(
    ids.map((id, index) => {
      const party = frame.parties[index]!,
        old = previous.playersById[id]!;
      return [
        id,
        {
          ...old,
          activeSlotIndex: party.activeSlotIndex,
          actionRequest: frame.requests[index]!,
          team: party.members.map(m => {
            const base = old.team.find(p => p.slotIndex === m.slotIndex)!;
            return {
              ...base,
              ...(base.individualValues ? { individualValues: { ...base.individualValues } } : {}),
              ...normalizeGen4Traits(m.speciesId, m),
              currentHp: m.currentHp!,
              maxHp: m.maxHp!,
              status: m.status!,
              statStages: m.statStages!,
              moves: m.moves.map(move => ({ moveId: move.moveId, pp: move.pp })),
            };
          }),
        },
      ];
    }),
  );
  let terminal: CanonicalTerminalResult | null = null;
  if (frame.ended && frame.winner !== null) {
    const winner = ids[frame.winner],
      loser = ids[frame.winner === 0 ? 1 : 0];
    terminal = {
      winnerPlayerId: winner,
      loserPlayerId: loser,
      reason: terminalReason,
      scoreByPlayerId: createCanonicalIdRecord([
        [winner, COMPETITIVE_RULESET_V2.scores.win],
        [loser, COMPETITIVE_RULESET_V2.scores.loss],
      ]),
    };
  }
  const events: ResolvedAnimationEvent[] = frame.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.kind !== "message")
    .slice(0, 64)
    .map(({ step: s, index }) => {
      const effectMessages: string[] = [];
      if (s.kind === "move" && COMPETITIVE_MOVE_CATALOG[s.moveId]?.category === "status") {
        for (const next of frame.steps.slice(index + 1)) {
          if (next.kind !== "message" || effectMessages.length === 2) break;
          effectMessages.push(next.text);
        }
      }
      const effectMessage = effectMessages.join(" ").slice(0, 160);
      return {
        kind: s.kind as "move" | "status",
        actorPlayerId: ids[s.actorSide],
        targetPlayerId: ids[s.targetSide],
        actorSlotIndex: s.actorSlotIndex,
        targetSlotIndex: s.targetSlotIndex,
        moveId: s.moveId,
        status:
          s.kind === "move" ? "normal" : s.targetSide === 0 ? s.playerStatus : s.opponentStatus,
        hit: s.hit,
        damage: s.damage,
        actorHp: s.actorSide === 0 ? s.playerHp : s.opponentHp,
        targetHp: s.targetSide === 0 ? s.playerHp : s.opponentHp,
        actorStatus: s.actorSide === 0 ? s.playerStatus : s.opponentStatus,
        targetStatus: s.targetSide === 0 ? s.playerStatus : s.opponentStatus,
        ...(effectMessage ? { effectMessage } : {}),
      };
    });
  return {
    ...previous,
    tournamentRewards: recordTournamentKnockouts(previous, frame),
    rulesetVersion: 3,
    playersById: players,
    turn: revision,
    gen4Turn: frame.turn,
    gen4Session: frame.session,
    terminal,
    ...(revision > 0 ? { lastTurnPresentation: { turn: revision - 1, events } } : {}),
  };
}

function recordTournamentKnockouts(previous: CanonicalBattleState, frame: Gen4Frame) {
  const rewards: NonNullable<CanonicalBattleState["tournamentRewards"]> = Object.assign(
    Object.create(null),
    structuredClone(previous.tournamentRewards ?? {}),
  );
  previous.participantIds.forEach((id, side) => {
    const entry = (rewards[id] ??= { defeatedSlots: [], participatedSlots: [] });
    const own = previous.playersById[id]!;
    entry.participatedSlots = [
      ...new Set([
        ...entry.participatedSlots,
        own.activeSlotIndex,
        frame.parties[side]!.activeSlotIndex,
        ...frame.steps.map(step => (side === 0 ? step.playerSlotIndex : step.opponentSlotIndex)),
      ]),
    ];
    const enemy = previous.playersById[previous.participantIds[side === 0 ? 1 : 0]]!;
    for (const member of frame.parties[side === 0 ? 1 : 0].members) {
      if (
        member.currentHp === 0 &&
        enemy.team.some(old => old.slotIndex === member.slotIndex && old.currentHp > 0) &&
        !entry.defeatedSlots.includes(member.slotIndex)
      )
        entry.defeatedSlots.push(member.slotIndex);
    }
  });
  return rewards;
}
