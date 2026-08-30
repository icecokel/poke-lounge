import {
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_STRUGGLE_MOVE_ID,
  isCompetitiveMoveEffectSelectable,
} from "@poke-lounge/battle";
import type { CompetitiveAction, CompetitiveProjection } from "../network/localPreviewRoom";
import { getBattlePokemonAssets } from "./battlePokemonAssets";
import { getGen4TypeName } from "./battleRomData";
import { calculateGen4BattleStats } from "./gen4PokemonStats";
import { createMaxIndividualValues } from "./individual-values";
import {
  getRuntimePokemonMoveDetails,
  getRuntimePokemonSpeciesSummary,
} from "../data/game-data-json";
import type {
  BattleMove,
  BattleParticipant,
  BattlePartySlot,
  BattlePokemon,
  BattleScreenState,
} from "./battleTypes";

type CompetitivePlayer = CompetitiveProjection["currentState"]["playersById"][string];
type CompetitivePokemon = CompetitivePlayer["team"][number];

export function isLegalAuthoritativeAction(
  projection: CompetitiveProjection,
  ownPlayerId: string,
  action: CompetitiveAction,
): boolean {
  const player = projection.currentState.playersById[ownPlayerId];
  if (!player || projection.terminal) {
    return false;
  }

  if (action.kind === "move") {
    const activePokemon = player.team.find(pokemon => pokemon.slotIndex === player.activeSlotIndex);
    if (!activePokemon || activePokemon.currentHp === 0) {
      return false;
    }
    if (action.moveId === COMPETITIVE_STRUGGLE_MOVE_ID) {
      return canUseAuthoritativeStruggle(activePokemon.moves);
    }

    return Boolean(
      Number.isSafeInteger(action.moveId) &&
      activePokemon.moves.some(
        move =>
          move.moveId === action.moveId &&
          move.pp > 0 &&
          isRuntimeCompetitiveMoveSelectable(move.moveId),
      ),
    );
  }

  if (action.kind === "switch") {
    if (!Number.isSafeInteger(action.slotIndex)) {
      return false;
    }
    const slotIndex = action.slotIndex as number;
    const target = player.team.find(pokemon => pokemon.slotIndex === slotIndex);
    return slotIndex !== player.activeSlotIndex && Boolean(target && target.currentHp > 0);
  }

  return false;
}

export function toAuthoritativeBattleState(
  projection: CompetitiveProjection,
  ownPlayerId: string,
  returnToWorld?: BattleScreenState["returnToWorld"],
  waitingMessage = "상대의 선택을 기다리는 중...",
  previousState?: BattleScreenState,
): BattleScreenState {
  const ownPlayer = projection.currentState.playersById[ownPlayerId];
  const opponentId = projection.playerIds.find(playerId => playerId !== ownPlayerId);
  const opponent = opponentId ? projection.currentState.playersById[opponentId] : undefined;

  if (!ownPlayer || !opponent || !opponentId) {
    throw new Error("Competitive projection does not contain both battle participants");
  }

  const waiting = projection.submittedPlayerIds.includes(ownPlayerId);
  const terminal = projection.terminal ?? projection.currentState.terminal;
  const result = terminal
    ? {
        winnerPlayerId: terminal.winnerPlayerId,
        loserPlayerId: terminal.loserPlayerId,
        reason: terminal.reason,
      }
    : null;
  const preservedSelectionPhase =
    !result &&
    !waiting &&
    previousState?.tournamentMatchId === projection.matchId &&
    previousState.roundIndex === projection.assignmentRevision &&
    previousState.turn === projection.currentTurn &&
    (previousState.phase === "move-select" || previousState.phase === "party-select")
      ? previousState.phase
      : null;

  return {
    battleKind: "trainer",
    phase: result ? "ended" : waiting ? "resolving" : (preservedSelectionPhase ?? "command"),
    roundIndex: projection.assignmentRevision,
    matchIndex: 0,
    turn: projection.currentTurn,
    runAttemptCount: 0,
    player: toBattleParticipant(ownPlayer, "Player"),
    opponent: toBattleParticipant(opponent, "Opponent"),
    messageQueue: result
      ? [result.winnerPlayerId === ownPlayerId ? "승리했습니다." : "패배했습니다."]
      : waiting
        ? [waitingMessage]
        : [],
    selectedMoveId: null,
    tournamentMatchId: projection.matchId,
    result,
    ...(returnToWorld ? { returnToWorld } : {}),
  };
}

function toBattleParticipant(player: CompetitivePlayer, fallbackName: string): BattleParticipant {
  const party = Array.from({ length: 6 }, (_, slotIndex): BattlePartySlot => ({
    slotIndex,
    pokemon: player.team.find(candidate => candidate.slotIndex === slotIndex)
      ? toBattlePokemon(player.team.find(candidate => candidate.slotIndex === slotIndex)!)
      : null,
  }));
  const activePokemon = party[player.activeSlotIndex]?.pokemon;

  if (!activePokemon) {
    throw new Error(`Competitive ${fallbackName} has no active Pokemon`);
  }

  return {
    playerId: player.playerId,
    displayName: fallbackName,
    pokemon: activePokemon,
    party,
    activePartySlotIndex: player.activeSlotIndex,
  };
}

function toBattlePokemon(pokemon: CompetitivePokemon): BattlePokemon {
  const speciesId = pokemon.speciesId;
  const species = getRuntimePokemonSpeciesSummary(speciesId);
  if (!species) {
    throw new Error(`Competitive species ${speciesId} is missing from runtime game data`);
  }
  const assets = getBattlePokemonAssets(speciesId);
  const individualValues = createMaxIndividualValues();
  const displayStats = calculateGen4BattleStats(
    {
      hp: species.baseStats.hp,
      attack: species.baseStats.attack,
      defense: species.baseStats.defense,
      speed: species.baseStats.speed,
      special_attack: species.baseStats.specialAttack,
      special_defense: species.baseStats.specialDefense,
    },
    pokemon.level,
    individualValues,
  );

  return {
    speciesId,
    name: species.name,
    level: pokemon.level,
    catchRate: 0,
    baseExpYield: 0,
    growthRate: 1_000_000,
    experience: 0,
    baseStats: {
      hp: species.baseStats.hp,
      attack: species.baseStats.attack,
      defense: species.baseStats.defense,
      speed: species.baseStats.speed,
      special_attack: species.baseStats.specialAttack,
      special_defense: species.baseStats.specialDefense,
    },
    individualValues,
    maxHp: pokemon.maxHp,
    currentHp: pokemon.currentHp,
    attack: displayStats.attack,
    defense: displayStats.defense,
    specialAttack: displayStats.specialAttack,
    specialDefense: displayStats.specialDefense,
    speed: displayStats.speed,
    statStages: { ...pokemon.statStages },
    typeIds: species.typeIds,
    status: pokemon.status,
    frontSprite: assets.front,
    backSprite: assets.back,
    moves: pokemon.moves.map(toBattleMove),
  };
}

function toBattleMove(move: CompetitivePokemon["moves"][number]): BattleMove {
  const moveId = move.moveId;
  const view = getRuntimePokemonMoveDetails(moveId);
  if (!view) {
    throw new Error(`Competitive move ${moveId} is missing from runtime game data`);
  }

  return {
    id: moveId,
    name: view.name,
    pp: move.pp,
    maxPp: view.pp,
    type: getGen4TypeName(view.typeId),
    typeId: view.typeId,
    category: view.category,
    effectCode: view.effectCode,
    effectChance: view.effectChance,
    priority: view.priority,
    accuracy: view.accuracy,
    power: view.power,
    ...getCompetitiveEffectSupport(view),
  };
}

export function canUseAuthoritativeStruggle(
  moves: readonly { moveId: number; pp: number }[],
): boolean {
  return moves.every(move => move.pp === 0 || !isRuntimeCompetitiveMoveSelectable(move.moveId));
}

function isRuntimeCompetitiveMoveSelectable(moveId: number): boolean {
  const move = getRuntimePokemonMoveDetails(moveId);
  if (!move) {
    throw new Error(`Competitive move ${moveId} is missing from runtime game data`);
  }
  return isCompetitiveMoveEffectSelectable(move);
}

function getCompetitiveEffectSupport(
  move: NonNullable<ReturnType<typeof getRuntimePokemonMoveDetails>>,
): Pick<BattleMove, "competitiveEffectSupport"> {
  const supportedEffectCodes: readonly number[] = [
    0,
    ...COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes,
    ...COMPETITIVE_RULESET_V2.supportedSecondaryEffectCodes,
    ...COMPETITIVE_RULESET_V2.priorityEffectCodes,
  ];
  if (supportedEffectCodes.includes(move.effectCode)) {
    return {};
  }
  return {
    competitiveEffectSupport:
      move.category === "status" ? "unsupported-primary" : "unsupported-secondary",
  };
}
