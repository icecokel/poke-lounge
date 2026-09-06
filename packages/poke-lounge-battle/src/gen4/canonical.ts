import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
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
import type { Gen4Action, Gen4Frame, Gen4Party } from "./types";
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
export function validateGen4CompetitiveAction(input: {
  state: CanonicalBattleState;
  playerId: string;
  action: CanonicalCompetitiveAction;
}): void {
  if (input.state.terminal) throw Error("Cannot act after battle has ended");
  const index = input.state.participantIds.indexOf(input.playerId);
  if (index < 0) throw Error("Unknown battle participant");
  validateGen4Action(currentFrame(input.state).requests[index]!, input.action);
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
    validateGen4Action(req, action);
    return action;
  }) as [Gen4Action | undefined, Gen4Action | undefined];
  let after = advanceGen4Battle(before.session, actions);
  if (after.ended && after.winner === null) {
    const rematch = parties(input.state).map(p => ({
      ...p,
      members: p.members.map(m => ({
        ...m,
        currentHp: m.maxHp,
        status: "normal" as const,
        statusTurns: 0,
        statStages: createDefaultBattleStatStages(),
        moves: m.moves.map(move => ({ ...move, pp: COMPETITIVE_MOVE_CATALOG[move.moveId]!.maxPp })),
      })),
    })) as [Gen4Party, Gen4Party];
    after = createGen4Battle(rematch, () => input.random.next());
  }
  const state = applyFrame(input.state, after, input.state.turn + 1);
  return {
    turn: input.state.turn,
    state,
    stateHash: hashCanonicalState(state),
    terminal: state.terminal,
  };
}
function applyFrame(
  previous: CanonicalBattleState,
  frame: Gen4Frame,
  revision: number,
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
      reason: "faint",
      scoreByPlayerId: createCanonicalIdRecord([
        [winner, 100],
        [loser, 50],
      ]),
    };
  }
  const events: ResolvedAnimationEvent[] = frame.steps
    .filter(s => s.kind !== "message")
    .slice(0, 64)
    .map(s => ({
      kind: s.kind as "move" | "status",
      actorPlayerId: ids[s.actorSide],
      targetPlayerId: ids[s.targetSide],
      actorSlotIndex: s.actorSlotIndex,
      targetSlotIndex: s.targetSlotIndex,
      moveId: s.moveId,
      status: s.kind === "move" ? "normal" : s.targetSide === 0 ? s.playerStatus : s.opponentStatus,
      hit: s.hit,
      damage: s.damage,
      actorHp: s.actorSide === 0 ? s.playerHp : s.opponentHp,
      targetHp: s.targetSide === 0 ? s.playerHp : s.opponentHp,
      actorStatus: s.actorSide === 0 ? s.playerStatus : s.opponentStatus,
      targetStatus: s.targetSide === 0 ? s.playerStatus : s.opponentStatus,
    }));
  return {
    ...previous,
    rulesetVersion: 3,
    playersById: players,
    turn: revision,
    gen4Turn: frame.turn,
    gen4Session: frame.session,
    terminal,
    ...(revision > 0 ? { lastTurnPresentation: { turn: revision - 1, events } } : {}),
  };
}
