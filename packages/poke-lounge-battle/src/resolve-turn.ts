import { getCompetitiveActionPlayerIds, type CanonicalCompetitiveAction } from "./actions";
import {
  applyBattleStatStageDelta,
  BATTLE_STAT_STAGE_KEYS,
  calculateBattleStageModifiedStat,
  normalizeBattleStatStages,
  type BattleStatStageKey,
} from "./battle-stat-stages";
import {
  createCanonicalIdRecord,
  hashCanonicalState,
  type CanonicalBattleState,
  type CanonicalCombatantState,
  type CanonicalIdRecord,
  type CanonicalPlayerState,
  type CanonicalTerminalResult,
} from "./canonical-state";
import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "./competitive-catalog.generated";
import { canUseCompetitiveStruggle, isCompetitiveMoveSelectable } from "./competitive-party";
import { calculateGen4Damage, checkGen4Accuracy, getGen4FixedDamage } from "./gen4-battle-math";
import { calculateGen4TypeEffectiveness } from "./gen4-type-chart";
import type { SeededRandom } from "./prng";
import {
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_VERSION,
  COMPETITIVE_STRUGGLE_MOVE_ID,
} from "./competitive-ruleset-config";
import { type CompetitiveResolvedMoveDefinition } from "./ruleset-contract";
import { getCompetitiveMoveDefinition } from "./ruleset";

export interface ResolvedTurnV2 {
  turn: number;
  state: CanonicalBattleState;
  stateHash: string;
  terminal: CanonicalTerminalResult | null;
}

function randomValue(random: SeededRandom): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("SeededRandom.next() must return a value in [0, 1)");
  }
  return value;
}

function sortedParticipantIds(state: CanonicalBattleState): readonly [string, string] {
  if (state.rulesetVersion !== COMPETITIVE_RULESET_VERSION) {
    throw new Error("Unsupported competitive ruleset version");
  }
  if (
    !Number.isSafeInteger(state.turn) ||
    state.turn < 0 ||
    state.turn >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Battle turn must be a safe nonnegative integer below Number.MAX_SAFE_INTEGER");
  }

  const ids = [...state.participantIds].sort();
  if (ids.length !== 2 || ids[0] === ids[1] || !ids[0] || !ids[1]) {
    throw new Error("Canonical battle state requires exactly two participants");
  }

  const statePlayerIds = Object.keys(state.playersById).sort();
  if (
    statePlayerIds.length !== 2 ||
    statePlayerIds.some(function testItem(id, index) {
      return id !== ids[index];
    })
  ) {
    throw new Error("Canonical battle state requires exactly two participant players");
  }

  return [ids[0], ids[1]];
}

function validateCombatant(combatant: CanonicalCombatantState): void {
  const species = COMPETITIVE_SPECIES_CATALOG[combatant.speciesId];
  if (
    !species ||
    !Number.isSafeInteger(combatant.slotIndex) ||
    combatant.slotIndex < 0 ||
    combatant.slotIndex >= COMPETITIVE_RULESET_V2.partySize.maximum ||
    !Number.isSafeInteger(combatant.level) ||
    combatant.level < 1 ||
    combatant.level > 100 ||
    !Number.isSafeInteger(combatant.maxHp) ||
    combatant.maxHp < 1 ||
    !Number.isSafeInteger(combatant.currentHp) ||
    combatant.currentHp < 0 ||
    combatant.currentHp > combatant.maxHp ||
    ![
      combatant.attack,
      combatant.defense,
      combatant.specialAttack,
      combatant.specialDefense,
      combatant.speed,
    ].every(function testItem(stat) {
      return Number.isSafeInteger(stat) && stat >= 1;
    }) ||
    combatant.typeIds.length !== species.typeIds.length ||
    combatant.typeIds.some(function testItem(typeId, index) {
      return typeId !== species.typeIds[index];
    }) ||
    combatant.moves.length < 1 ||
    combatant.moves.length > COMPETITIVE_RULESET_V2.moveCountMaximum ||
    !hasMatchingStatusAndHp(combatant)
  ) {
    throw new Error("Invalid canonical combatant state");
  }

  const normalizedStages = normalizeBattleStatStages(combatant.statStages);
  if (
    BATTLE_STAT_STAGE_KEYS.some(function testItem(key) {
      return normalizedStages[key] !== combatant.statStages[key];
    })
  ) {
    throw new Error("Invalid canonical combatant stat stages");
  }

  const moveIds = new Set<number>();
  for (const move of combatant.moves) {
    const definition = COMPETITIVE_MOVE_CATALOG[move.moveId];
    if (
      !definition ||
      moveIds.has(move.moveId) ||
      !Number.isSafeInteger(move.pp) ||
      move.pp < 0 ||
      move.pp > definition.maxPp
    ) {
      throw new Error("Invalid canonical move state");
    }
    moveIds.add(move.moveId);
  }
}

function validatePlayer(playerId: string, player: CanonicalPlayerState): void {
  const slots = new Set(
    player.team.map(function mapItem(member) {
      return member.slotIndex;
    }),
  );
  if (
    player.playerId !== playerId ||
    !Number.isSafeInteger(player.activeSlotIndex) ||
    player.activeSlotIndex < 0 ||
    player.activeSlotIndex >= COMPETITIVE_RULESET_V2.partySize.maximum ||
    player.team.length < COMPETITIVE_RULESET_V2.partySize.minimum ||
    player.team.length > COMPETITIVE_RULESET_V2.partySize.maximum ||
    slots.size !== player.team.length ||
    !slots.has(player.activeSlotIndex)
  ) {
    throw new Error("Invalid canonical player state");
  }
  player.team.forEach(validateCombatant);
}

function cloneState(
  state: CanonicalBattleState,
  participantIds: readonly [string, string],
): CanonicalBattleState {
  const playersById = createCanonicalIdRecord<CanonicalPlayerState>(
    participantIds.map(function mapItem(playerId) {
      const player = state.playersById[playerId]!;
      return [
        playerId,
        {
          playerId,
          activeSlotIndex: player.activeSlotIndex,
          team: player.team.map(function mapItem(member) {
            return {
              ...member,
              typeIds: [...member.typeIds] as [number] | [number, number],
              statStages: { ...member.statStages },
              moves: member.moves.map(function mapItem(move) {
                return { ...move };
              }),
            };
          }),
        },
      ];
    }),
  );

  return {
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    turn: state.turn,
    participantIds,
    playersById,
    terminal: state.terminal
      ? {
          ...state.terminal,
          scoreByPlayerId: createCanonicalIdRecord(Object.entries(state.terminal.scoreByPlayerId)),
        }
      : null,
  };
}

function activeCombatant(state: CanonicalBattleState, playerId: string): CanonicalCombatantState {
  const player = state.playersById[playerId]!;
  const active = player.team.find(function findItem(member) {
    return member.slotIndex === player.activeSlotIndex;
  });
  if (!active) {
    throw new Error("Canonical player active slot is missing");
  }
  return active;
}

function rejectUnsupportedAction(action: never): never {
  const runtimeKind = (action as { kind?: unknown }).kind;
  throw new Error(`Unsupported competitive action kind: ${String(runtimeKind)}`);
}

function validateAction(
  state: CanonicalBattleState,
  playerId: string,
  action: CanonicalCompetitiveAction,
): void {
  const player = state.playersById[playerId]!;
  const active = activeCombatant(state, playerId);
  if (!getCompetitiveActionPlayerIds(state).includes(playerId)) {
    throw new Error("Wait for the opponent to replace its fainted combatant");
  }

  switch (action.kind) {
    case "move": {
      if (active.currentHp === 0) {
        throw new Error("Cannot use a move while the active combatant is fainted");
      }
      if (action.moveId === COMPETITIVE_STRUGGLE_MOVE_ID) {
        if (!canUseCompetitiveStruggle(active.moves)) {
          throw new Error("Cannot struggle while the active combatant has a selectable move");
        }
        return;
      }
      if (!Number.isSafeInteger(action.moveId) || action.moveId < 1 || action.moveId > 470) {
        throw new Error("Cannot use an invalid move");
      }

      const move = active.moves.find(function findItem(candidate) {
        return candidate.moveId === action.moveId;
      });
      if (!move || !isCompetitiveMoveSelectable(action.moveId)) {
        throw new Error("Cannot use an invalid or unsupported move");
      }
      if (move.pp === 0) {
        throw new Error("Cannot use a move with zero PP");
      }
      return;
    }
    case "switch": {
      if (
        !Number.isSafeInteger(action.slotIndex) ||
        action.slotIndex < 0 ||
        action.slotIndex >= COMPETITIVE_RULESET_V2.partySize.maximum
      ) {
        throw new Error("Switch slot is out of range");
      }
      if (action.slotIndex === player.activeSlotIndex) {
        throw new Error("Cannot switch to the active slot");
      }
      const target = player.team.find(function findItem(member) {
        return member.slotIndex === action.slotIndex;
      });
      if (!target || target.currentHp === 0) {
        throw new Error("Cannot switch to a missing or fainted slot");
      }
      return;
    }
    default:
      return rejectUnsupportedAction(action);
  }
}

function opponentId(participantIds: readonly [string, string], playerId: string): string {
  return participantIds[0] === playerId ? participantIds[1] : participantIds[0];
}

function terminalForFaint(
  participantIds: readonly [string, string],
  winnerPlayerId: string,
  loserPlayerId: string,
): CanonicalTerminalResult {
  const scoreByPlayerId = createCanonicalIdRecord<50 | 100>(
    participantIds.map(function mapItem(playerId) {
      return [
        playerId,
        playerId === winnerPlayerId
          ? COMPETITIVE_RULESET_V2.scores.win
          : COMPETITIVE_RULESET_V2.scores.loss,
      ];
    }),
  );
  return {
    winnerPlayerId,
    loserPlayerId,
    reason: "faint",
    scoreByPlayerId,
  };
}

function setTerminalIfTeamFainted(
  state: CanonicalBattleState,
  participantIds: readonly [string, string],
  loserPlayerId: string,
): boolean {
  if (
    state.playersById[loserPlayerId]!.team.some(function testItem(member) {
      return member.currentHp > 0;
    })
  ) {
    return false;
  }
  state.terminal = terminalForFaint(
    participantIds,
    opponentId(participantIds, loserPlayerId),
    loserPlayerId,
  );
  return true;
}

function applyDamage(combatant: CanonicalCombatantState, damage: number): void {
  combatant.currentHp = Math.max(0, combatant.currentHp - damage);
  if (combatant.currentHp === 0) {
    combatant.status = "fainted";
  }
}

function executeMove(
  state: CanonicalBattleState,
  participantIds: readonly [string, string],
  actorPlayerId: string,
  action: Extract<CanonicalCompetitiveAction, { kind: "move" }>,
  random: SeededRandom,
): void {
  const attacker = activeCombatant(state, actorPlayerId);
  if (attacker.currentHp === 0) {
    return;
  }

  const isStruggle = action.moveId === COMPETITIVE_STRUGGLE_MOVE_ID;
  const moveState = isStruggle
    ? null
    : attacker.moves.find(function findItem(move) {
        return move.moveId === action.moveId;
      })!;
  const move = getCompetitiveMoveDefinition(action.moveId)!;
  if (moveState) {
    moveState.pp -= 1;
  }

  if (
    attacker.status === "paralyzed" &&
    randomValue(random) < COMPETITIVE_RULESET_V2.paralysisNoActionChance
  ) {
    return;
  }

  const targetPlayerId = opponentId(participantIds, actorPlayerId);
  const defender = activeCombatant(state, targetPlayerId);
  if (
    move.accuracy !== 0 &&
    !checkGen4Accuracy({
      accuracy: move.accuracy,
      accuracyStage: attacker.statStages.accuracy,
      evasionStage: defender.statStages.evasion,
      roll: 1 + Math.floor(randomValue(random) * 100),
    })
  ) {
    return;
  }

  const effectiveness = calculateGen4TypeEffectiveness(move.typeId, defender.typeIds);
  const fixedDamage = getGen4FixedDamage(move.effectCode);
  const isDamaging = move.category !== "status" && move.power > 0 && effectiveness > 0;
  let damage = 0;
  if (isDamaging) {
    if (fixedDamage !== null) {
      damage = fixedDamage;
    } else {
      const critical = randomValue(random) < COMPETITIVE_RULESET_V2.criticalHitChance;
      const range = COMPETITIVE_RULESET_V2.damageRangePercent;
      const randomFactor =
        range.minimum + Math.floor(randomValue(random) * (range.maximum - range.minimum + 1));
      damage = calculateMoveDamage(attacker, defender, move, critical, randomFactor, effectiveness);
    }
    applyDamage(defender, damage);
    const defenderTeamFainted = setTerminalIfTeamFainted(state, participantIds, targetPlayerId);
    if (isStruggle) {
      applyDamage(
        attacker,
        Math.max(
          1,
          Math.floor(attacker.maxHp / COMPETITIVE_RULESET_V2.struggle.recoilMaxHpDivisor),
        ),
      );
      if (!defenderTeamFainted) {
        setTerminalIfTeamFainted(state, participantIds, actorPlayerId);
      }
    }
    if (defenderTeamFainted) {
      return;
    }
  }

  applySupportedMoveEffect(attacker, defender, move, damage, random);

  if (isStruggle && !isDamaging) {
    applyDamage(
      attacker,
      Math.max(1, Math.floor(attacker.maxHp / COMPETITIVE_RULESET_V2.struggle.recoilMaxHpDivisor)),
    );
    setTerminalIfTeamFainted(state, participantIds, actorPlayerId);
  }
}

function calculateMoveDamage(
  attacker: CanonicalCombatantState,
  defender: CanonicalCombatantState,
  move: CompetitiveResolvedMoveDefinition,
  critical: boolean,
  randomFactor: number,
  effectiveness: number,
): number {
  const rawAttack =
    move.category === "special"
      ? calculateBattleStageModifiedStat(attacker.specialAttack, attacker.statStages.specialAttack)
      : calculateBattleStageModifiedStat(attacker.attack, attacker.statStages.attack);
  const attack =
    move.category === "physical" && attacker.status === "burned"
      ? Math.max(1, Math.floor(rawAttack / COMPETITIVE_RULESET_V2.burnPhysicalAttackDivisor))
      : rawAttack;
  const defense =
    move.category === "special"
      ? calculateBattleStageModifiedStat(
          defender.specialDefense,
          defender.statStages.specialDefense,
        )
      : calculateBattleStageModifiedStat(defender.defense, defender.statStages.defense);

  return calculateGen4Damage({
    level: attacker.level,
    power: move.power,
    attack,
    defense,
    moveTypeId: move.typeId,
    attackerTypeIds: attacker.typeIds,
    typeEffectiveness: effectiveness,
    randomFactor,
    critical,
    category: move.category,
  });
}

function applySupportedMoveEffect(
  attacker: CanonicalCombatantState,
  defender: CanonicalCombatantState,
  move: CompetitiveResolvedMoveDefinition,
  damage: number,
  random: SeededRandom,
): void {
  if (defender.currentHp === 0) {
    return;
  }
  if (move.effectCode === 66) {
    applyStatus(defender, "poisoned");
    return;
  }
  if (move.effectCode === 67) {
    applyStatus(defender, "paralyzed");
    return;
  }
  if (move.effectCode === 4 && damage > 0) {
    if (randomValue(random) < move.effectChance / 100) {
      applyStatus(defender, "burned");
    }
    return;
  }
  if (move.effectCode === 6 && damage > 0) {
    if (randomValue(random) < move.effectChance / 100) {
      applyStatus(defender, "paralyzed");
    }
    return;
  }

  const stageEffect = getStatStageEffect(move.effectCode);
  if (stageEffect) {
    const target = stageEffect.target === "attacker" ? attacker : defender;
    target.statStages = applyBattleStatStageDelta(
      target.statStages,
      stageEffect.key,
      stageEffect.delta,
    );
  }
}

function applyStatus(
  defender: CanonicalCombatantState,
  status: "poisoned" | "burned" | "paralyzed",
): void {
  if (defender.status === "normal") {
    defender.status = status;
  }
}

function getStatStageEffect(
  effectCode: number,
): { key: BattleStatStageKey; delta: number; target: "attacker" | "defender" } | null {
  switch (effectCode) {
    case 18:
      return { key: "attack", delta: -1, target: "defender" };
    case 19:
      return { key: "defense", delta: -1, target: "defender" };
    case 20:
      return { key: "speed", delta: -1, target: "defender" };
    case 23:
      return { key: "accuracy", delta: -1, target: "defender" };
    case 60:
      return { key: "speed", delta: -2, target: "defender" };
    case 156:
      return { key: "defense", delta: 1, target: "attacker" };
    default:
      return null;
  }
}

function orderedMoveActors(
  state: CanonicalBattleState,
  participantIds: readonly [string, string],
  actionsByPlayerId: Readonly<Record<string, CanonicalCompetitiveAction>>,
  random: SeededRandom,
): string[] {
  const actors = participantIds.filter(function filterItem(playerId) {
    return actionsByPlayerId[playerId]?.kind === "move";
  });
  if (actors.length < 2) {
    return actors;
  }

  const firstMove = getMoveForAction(actionsByPlayerId[actors[0]!]!);
  const secondMove = getMoveForAction(actionsByPlayerId[actors[1]!]!);
  const priorityDifference = getMovePriority(firstMove) - getMovePriority(secondMove);
  if (priorityDifference !== 0) {
    return priorityDifference > 0 ? actors : [actors[1]!, actors[0]!];
  }

  const firstSpeed = calculateEffectiveSpeed(activeCombatant(state, actors[0]!));
  const secondSpeed = calculateEffectiveSpeed(activeCombatant(state, actors[1]!));
  if (firstSpeed === secondSpeed) {
    return randomValue(random) < 0.5 ? actors : [actors[1]!, actors[0]!];
  }
  return firstSpeed > secondSpeed ? actors : [actors[1]!, actors[0]!];
}

function getMoveForAction(action: CanonicalCompetitiveAction): CompetitiveResolvedMoveDefinition {
  if (action.kind !== "move") {
    throw new Error("Move ordering requires a move action");
  }
  const move = getCompetitiveMoveDefinition(action.moveId);
  if (!move) {
    throw new Error("Move ordering requires a catalog move");
  }
  return move;
}

function getMovePriority(move: CompetitiveResolvedMoveDefinition): number {
  return move.priority;
}

function calculateEffectiveSpeed(combatant: CanonicalCombatantState): number {
  const stagedSpeed = calculateBattleStageModifiedStat(combatant.speed, combatant.statStages.speed);
  return combatant.status === "paralyzed" ? Math.max(1, Math.floor(stagedSpeed / 4)) : stagedSpeed;
}

function applyResidualDamage(
  state: CanonicalBattleState,
  participantIds: readonly [string, string],
): void {
  for (const playerId of participantIds) {
    const combatant = activeCombatant(state, playerId);
    const divisor =
      combatant.status === "poisoned"
        ? COMPETITIVE_RULESET_V2.poisonDamageDivisor
        : combatant.status === "burned"
          ? COMPETITIVE_RULESET_V2.burnDamageDivisor
          : null;
    if (divisor === null || combatant.currentHp === 0) {
      continue;
    }

    applyDamage(combatant, Math.max(1, Math.floor(combatant.maxHp / divisor)));
    if (setTerminalIfTeamFainted(state, participantIds, playerId)) {
      return;
    }
  }
}

function hasMatchingStatusAndHp(combatant: CanonicalCombatantState): boolean {
  if (combatant.currentHp === 0) {
    return combatant.status === "fainted";
  }
  return ["normal", "poisoned", "burned", "paralyzed"].includes(combatant.status);
}

export function validateCompetitiveAction(input: {
  state: CanonicalBattleState;
  playerId: string;
  action: CanonicalCompetitiveAction;
}): void {
  if (input.state.terminal) {
    throw new Error("Cannot submit an action after a terminal result");
  }

  const participantIds = sortedParticipantIds(input.state);
  for (const playerId of participantIds) {
    validatePlayer(playerId, input.state.playersById[playerId]!);
  }
  if (!participantIds.includes(input.playerId)) {
    throw new Error("Competitive action actor is not a participant");
  }

  validateAction(input.state, input.playerId, input.action);
}

export function resolveTurn(input: {
  state: CanonicalBattleState;
  actionsByPlayerId: CanonicalIdRecord<CanonicalCompetitiveAction>;
  random: SeededRandom;
}): ResolvedTurnV2 {
  const stateWithSafeRecords: CanonicalBattleState = {
    ...input.state,
    playersById: createCanonicalIdRecord(Object.entries(input.state.playersById)),
    terminal: input.state.terminal
      ? {
          ...input.state.terminal,
          scoreByPlayerId: createCanonicalIdRecord(
            Object.entries(input.state.terminal.scoreByPlayerId),
          ),
        }
      : null,
  };
  const actionsByPlayerId = createCanonicalIdRecord(Object.entries(input.actionsByPlayerId));

  if (stateWithSafeRecords.terminal) {
    throw new Error("Cannot resolve actions after a terminal result");
  }

  const participantIds = sortedParticipantIds(stateWithSafeRecords);
  for (const playerId of participantIds) {
    validatePlayer(playerId, stateWithSafeRecords.playersById[playerId]!);
  }

  const actionPlayerIds = Object.keys(actionsByPlayerId).sort();
  if (
    actionPlayerIds.length > 2 ||
    actionPlayerIds.some(function testItem(playerId) {
      return !participantIds.includes(playerId);
    })
  ) {
    throw new Error("A turn accepts at most one action from each participant");
  }
  for (const playerId of actionPlayerIds) {
    validateAction(stateWithSafeRecords, playerId, actionsByPlayerId[playerId]!);
  }

  const state = cloneState(stateWithSafeRecords, participantIds);
  const replacing = participantIds.filter(
    playerId => activeCombatant(state, playerId).currentHp === 0,
  );
  // A replacement is its own input phase; timeout chooses the first healthy reserve.
  for (const playerId of replacing) {
    if (!actionsByPlayerId[playerId]) {
      const target = state.playersById[playerId]!.team.find(member => member.currentHp > 0);
      if (!target) throw new Error("Fainted team is missing a terminal result");
      state.playersById[playerId]!.activeSlotIndex = target.slotIndex;
    }
  }
  for (const playerId of actionPlayerIds) {
    const action = actionsByPlayerId[playerId]!;
    if (action.kind === "switch") {
      state.playersById[playerId]!.activeSlotIndex = action.slotIndex;
    }
  }

  const moveActors = orderedMoveActors(state, participantIds, actionsByPlayerId, input.random);
  for (const actorPlayerId of moveActors) {
    if (state.terminal) {
      break;
    }
    executeMove(
      state,
      participantIds,
      actorPlayerId,
      actionsByPlayerId[actorPlayerId] as Extract<CanonicalCompetitiveAction, { kind: "move" }>,
      input.random,
    );
  }

  if (!state.terminal && replacing.length === 0) {
    applyResidualDamage(state, participantIds);
  }

  const resolvedTurn = state.turn;
  state.turn += 1;
  return {
    turn: resolvedTurn,
    state,
    stateHash: hashCanonicalState(state),
    terminal: state.terminal,
  };
}
