import {
  getGen4PokemonOutsideBattle,
  advanceGen4Battle,
  createGen4Battle,
  readGen4Battle,
  defaultGen4Action,
  validateGen4Action,
} from "./engine";
import { normalizeGen4Traits } from "./traits";
import { GEN4_ROM_MOVE_NAMES } from "./rom-catalog.generated";
import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
import type { Gen4Action, Gen4Frame, Gen4Member, Gen4Party, Gen4Step } from "./types";
import type {
  BattleScreenState,
  BattleParticipant,
  BattlePokemon,
  BattleMessageHpSnapshot,
} from "../adventure/battle/battle-types";

export function toGen4Party(p: BattleParticipant): Gen4Party {
  return {
    activeSlotIndex: p.activePartySlotIndex,
    members: p.party.flatMap(slot =>
      slot.pokemon
        ? [
            {
              ...slot.pokemon,
              ...normalizeGen4Traits(slot.pokemon.speciesId, slot.pokemon),
              slotIndex: slot.slotIndex,
              moves: slot.pokemon.moves.map(m => ({ moveId: m.id, pp: m.pp, maxPp: m.maxPp })),
            },
          ]
        : [],
    ),
  };
}
export function initializeGen4Adventure(
  state: BattleScreenState,
  random: () => number = Math.random,
): BattleScreenState {
  const f = createGen4Battle([toGen4Party(state.player), toGen4Party(state.opponent)], random, {
    wild: state.battleKind === "wild",
  });
  const next = applyFrame(state, f);
  const entrance = f.steps.filter(step => !step.text.endsWith(", 부탁해!"));
  return {
    ...next,
    mechanicsVersion: 3,
    phase: "intro",
    messageQueue: [...state.messageQueue, ...entrance.map(s => s.text)],
    messageHpSnapshots: undefined,
    participatedPartySlots: [next.player.activePartySlotIndex],
  };
}
export function ensureGen4Adventure(
  state: BattleScreenState,
  random: () => number = Math.random,
): BattleScreenState {
  if (state.gen4Session) return state;
  const f = createGen4Battle([toGen4Party(state.player), toGen4Party(state.opponent)], random, {
    wild: state.battleKind === "wild",
  });
  return {
    ...applyFrame(state, f),
    phase: state.phase,
    messageQueue: state.messageQueue,
    messageHpSnapshots: state.messageHpSnapshots,
  };
}
export function resolveGen4Adventure(
  state: BattleScreenState,
  action: Gen4Action,
  random: () => number = Math.random,
): { state: BattleScreenState; ended: boolean; winner: 0 | 1 | null; escapedBy?: 0 | 1 } {
  const current = ensureGen4Adventure(state, random);
  const request = current.gen4Requests![0];
  validateGen4Action(request, action);
  const opponent = current.gen4Requests![1];
  let enemy = defaultGen4Action(opponent);
  if (opponent.kind === "move" && !opponent.recharge && opponent.forcedMoveId === null) {
    const choices = opponent.moves.filter(m => !m.disabled && m.pp > 0);
    const index = Math.min(
      choices.length - 1,
      Math.floor(Math.max(0, Math.min(0.999999, random())) * choices.length),
    );
    if (choices[index]) enemy = { kind: "move", moveId: choices[index].moveId };
  }
  let f = advanceGen4Battle(current.gen4Session!, [action, enemy]);
  const steps = [...f.steps];
  // Opponent-only switches (including U-turn) resume the paused turn, not an extra enemy attack.
  for (
    let guard = 0;
    guard < 6 && !f.ended && f.requests[0].kind === "wait" && f.requests[1].kind === "switch";
    guard++
  ) {
    f = advanceGen4Battle(f.session, [undefined, defaultGen4Action(f.requests[1])]);
    steps.push(...f.steps);
  }
  f = { ...f, steps };
  return {
    state: applyFrame(current, f),
    ended: f.ended,
    winner: f.winner,
    ...(f.escapedBy !== undefined ? { escapedBy: f.escapedBy } : {}),
  };
}
export function refreshGen4Adventure(state: BattleScreenState): BattleScreenState {
  return state.gen4Session ? applyFrame(state, readGen4Battle(state.gen4Session)) : state;
}
function updatePokemon(old: BattlePokemon, member: Gen4Member): BattlePokemon {
  return {
    ...old,
    ...normalizeGen4Traits(old.speciesId, member),
    currentHp: member.currentHp!,
    maxHp: member.maxHp!,
    status: member.status!,
    attack: member.attack!,
    defense: member.defense!,
    specialAttack: member.specialAttack!,
    specialDefense: member.specialDefense!,
    speed: member.speed!,
    statStages: member.statStages!,
    moves: member.moves.map(m => {
      const existing = old.moves.find(move => move.id === m.moveId);
      const record = COMPETITIVE_MOVE_CATALOG[m.moveId]!;
      return {
        ...(existing ?? {
          id: m.moveId,
          name: GEN4_ROM_MOVE_NAMES[m.moveId] ?? "기술",
          type: "",
          typeId: record.typeId,
          category: record.category,
          effectCode: record.effectCode,
          effectChance: record.effectChance,
          priority: record.priority,
          accuracy: record.accuracy,
          power: record.power,
        }),
        competitiveEffectSupport: undefined,
        pp: m.pp,
        maxPp: m.maxPp ?? record.maxPp,
      };
    }),
  };
}
function updateParticipant(old: BattleParticipant, party: Gen4Party): BattleParticipant {
  const slots = old.party.map(slot => {
    const member = party.members.find(m => m.slotIndex === slot.slotIndex);
    return {
      ...slot,
      pokemon: slot.pokemon && member ? updatePokemon(slot.pokemon, member) : slot.pokemon,
    };
  });
  return {
    ...old,
    party: slots,
    activePartySlotIndex: party.activeSlotIndex,
    pokemon: slots.find(s => s.slotIndex === party.activeSlotIndex)!.pokemon!,
  };
}
function applyFrame(state: BattleScreenState, f: Gen4Frame): BattleScreenState {
  const player = updateParticipant(state.player, f.parties[0]),
    opponent = updateParticipant(state.opponent, f.parties[1]);
  const required = f.requests[0];
  return {
    ...state,
    mechanicsVersion: 3,
    gen4Session: f.session,
    gen4Requests: f.requests,
    gen4Turn: f.turn,
    turn: Math.max(state.turn, state.turn + (f.turn - (state.gen4Turn ?? f.turn))),
    player,
    opponent,
    participatedPartySlots: [
      ...new Set([...(state.participatedPartySlots ?? []), player.activePartySlotIndex]),
    ],
    phase: f.ended
      ? "ended"
      : required.kind === "switch"
        ? "party-select"
        : f.steps.length
          ? "resolving"
          : "command",
    messageQueue: f.steps.map(s => s.text),
    messageHpSnapshots: f.steps.map(toHpSnapshot),
    pendingBattleItemId: null,
    usedInventoryItemId: null,
    result: null,
  };
}
export function toHpSnapshot(step: Gen4Step): BattleMessageHpSnapshot {
  const source = step.actorSide === 0 ? "player" : "opponent",
    target = step.targetSide === 0 ? "player" : "opponent";
  return {
    playerPartySlotIndex: step.playerSlotIndex,
    opponentPartySlotIndex: step.opponentSlotIndex,
    playerCurrentHp: step.playerHp,
    opponentCurrentHp: step.opponentHp,
    playerStatus: step.playerStatus,
    opponentStatus: step.opponentStatus,
    attackHitTarget: step.kind === "move" && step.hit && step.damage > 0 ? target : null,
    ...(step.kind === "message"
      ? {}
      : {
          animation: {
            kind: step.kind,
            source,
            target,
            moveId: step.moveId,
            status:
              step.kind === "move"
                ? "normal"
                : step.targetSide === 0
                  ? step.playerStatus
                  : step.opponentStatus,
            hit: step.hit,
            damage: step.damage,
          },
        }),
  };
}

export function restoreGen4FieldPokemon(
  state: BattleScreenState,
  side: 0 | 1,
  slotIndex?: number,
): BattlePokemon {
  const participant = side === 0 ? state.player : state.opponent;
  const original =
    slotIndex === undefined
      ? participant.pokemon
      : participant.party.find(p => p.slotIndex === slotIndex)?.pokemon;
  if (!original) throw Error("Missing battle party slot");
  if (!state.gen4Session) return original;
  const saved = getGen4PokemonOutsideBattle(state.gen4Session, side, slotIndex);
  if (original.speciesId !== saved.speciesId || original.level !== saved.level) return original;
  // Rewards, evolution and learned moves are applied after the simulator's final frame.
  // Never roll them back while stripping temporary battle-only move transformations.
  return {
    ...original,
    moves: updatePokemon(original, saved).moves,
    statStages: saved.statStages!,
  };
}
