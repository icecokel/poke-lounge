import {
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_STRUGGLE_MOVE_ID,
  isCompetitiveMoveEffectSelectable,
} from "@poke-lounge/battle/competitive-ruleset-config";
import { getGen4FixedDamage } from "@poke-lounge/battle/gen4-battle-math";
import { getCompetitiveActionPlayerIds } from "@poke-lounge/battle/actions";
import type { CompetitiveAction, CompetitiveProjection } from "../network/local-preview-room";
import { getBattlePokemonAssets } from "./battle-pokemon-assets";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";
import { getExperienceForLevel } from "./experience";
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
} from "./battle-types";

type CompetitivePlayer = CompetitiveProjection["currentState"]["playersById"][string];
type CompetitivePokemon = CompetitivePlayer["team"][number];

export function isWaitingForOpponentReplacement(
  projection: CompetitiveProjection,
  ownPlayerId: string,
): boolean {
  return (
    !projection.terminal &&
    !projection.currentState.terminal &&
    projection.playerIds.includes(ownPlayerId) &&
    !getCompetitiveActionPlayerIds(projection.currentState).includes(ownPlayerId)
  );
}

export function isLegalAuthoritativeAction(
  projection: CompetitiveProjection,
  ownPlayerId: string,
  action: CompetitiveAction,
): boolean {
  const player = projection.currentState.playersById[ownPlayerId];
  if (!player || projection.terminal || isWaitingForOpponentReplacement(projection, ownPlayerId)) {
    return false;
  }

  if (action.kind === "move") {
    const activePokemon = player.team.find(function findItem(pokemon) {
      return pokemon.slotIndex === player.activeSlotIndex;
    });
    if (!activePokemon || activePokemon.currentHp === 0) {
      return false;
    }
    if (action.moveId === COMPETITIVE_STRUGGLE_MOVE_ID) {
      return canUseAuthoritativeStruggle(activePokemon.moves);
    }

    return Boolean(
      Number.isSafeInteger(action.moveId) &&
      activePokemon.moves.some(function testItem(move) {
        return (
          move.moveId === action.moveId &&
          move.pp > 0 &&
          isRuntimeCompetitiveMoveSelectable(move.moveId)
        );
      }),
    );
  }

  if (action.kind === "switch") {
    if (!Number.isSafeInteger(action.slotIndex)) {
      return false;
    }
    const slotIndex = action.slotIndex as number;
    const target = player.team.find(function findItem(pokemon) {
      return pokemon.slotIndex === slotIndex;
    });
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
  replacementMessage = "상대가 다음 포켓몬을 고르고 있습니다...",
): BattleScreenState {
  const ownPlayer = projection.currentState.playersById[ownPlayerId];
  const opponentId = projection.playerIds.find(function findItem(playerId) {
    return playerId !== ownPlayerId;
  });
  const opponent = opponentId ? projection.currentState.playersById[opponentId] : undefined;

  if (!ownPlayer || !opponent || !opponentId) {
    throw new Error("Competitive projection does not contain both battle participants");
  }

  const waitingForReplacement = isWaitingForOpponentReplacement(projection, ownPlayerId);
  const waiting = projection.submittedPlayerIds.includes(ownPlayerId) || waitingForReplacement;
  const replacing = ownPlayer.team.some(
    pokemon => pokemon.slotIndex === ownPlayer.activeSlotIndex && pokemon.currentHp === 0,
  );
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
    phase: result
      ? "ended"
      : waiting
        ? "resolving"
        : replacing
          ? "party-select"
          : (preservedSelectionPhase ?? "command"),
    roundIndex: projection.assignmentRevision,
    matchIndex: 0,
    turn: projection.currentTurn,
    runAttemptCount: 0,
    player: toBattleParticipant(ownPlayer, "Player"),
    opponent: toBattleParticipant(opponent, "Opponent"),
    messageQueue: result
      ? [result.winnerPlayerId === ownPlayerId ? "승리했습니다." : "패배했습니다."]
      : waiting
        ? [waitingForReplacement ? replacementMessage : waitingMessage]
        : [],
    selectedMoveId: null,
    tournamentMatchId: projection.matchId,
    result,
    ...(returnToWorld ? { returnToWorld } : {}),
  };
}

function toBattleParticipant(player: CompetitivePlayer, fallbackName: string): BattleParticipant {
  const party = Array.from({ length: 6 }, function callback(_, slotIndex): BattlePartySlot {
    return {
      slotIndex,
      pokemon: player.team.find(function findItem(candidate) {
        return candidate.slotIndex === slotIndex;
      })
        ? toBattlePokemon(
            player.team.find(function findItem(candidate) {
              return candidate.slotIndex === slotIndex;
            })!,
          )
        : null,
    };
  });
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
    catchRate: species.catchRate,
    baseExpYield: species.baseExpYield,
    growthRate: species.growthRate,
    experience: getExperienceForLevel(pokemon.level, species.growthRate),
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
    type: view.typeName,
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
  return moves.every(function testItem(move) {
    return move.pp === 0 || !isRuntimeCompetitiveMoveSelectable(move.moveId);
  });
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
  if (!isCompetitiveMoveEffectSelectable(move)) {
    return { competitiveEffectSupport: "unsupported-primary" };
  }

  const supportedEffectCodes: readonly number[] = [
    0,
    ...COMPETITIVE_RULESET_V2.supportedPrimaryStatusEffectCodes,
    ...COMPETITIVE_RULESET_V2.supportedSecondaryEffectCodes,
    ...COMPETITIVE_RULESET_V2.priorityEffectCodes,
  ];
  if (
    supportedEffectCodes.includes(move.effectCode) ||
    getGen4FixedDamage(move.effectCode) !== null
  ) {
    return {};
  }
  return {
    competitiveEffectSupport: "unsupported-secondary",
  };
}
