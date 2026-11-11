import {
  withObjectParticle,
  withSubjectParticle,
  withTopicParticle,
} from "../../battle-message-text";
import {
  restoreGen4FieldPokemon,
  resolveGen4Adventure,
  ensureGen4Adventure,
} from "../../gen4/adventure";
import { getGen4EscapeInfo, canUseGen4ItemOnMember, validateGen4Action } from "../../gen4/engine";
import { GEN4_ROM_ITEMS } from "../../gen4/rom-catalog.generated";
import { STRUGGLE_MOVE_ID } from "../../competitive-ruleset-config";
import { awardGen4EffortValues } from "../../gen4/traits";
import {
  RUNTIME_ITEM_ROM_IDS,
  type RuntimeItemId,
  getRuntimeGameItem,
} from "../items/runtime-items";
import type { Gen4Action } from "../../gen4/types";
import type {
  BattleCommand,
  BattleMessageHpSnapshot,
  BattleMove,
  BattlePokemon,
  BattleScreenState,
} from "./battle-types";
import { syncActivePartyPokemon } from "./battle-party";
import { resolveGen4CaptureAttempt } from "./capture-logic";
import {
  applyExperienceGain,
  calculateWildBattleExpGain,
  getExperienceForLevel,
} from "./experience";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";

export const BATTLE_END_CONFIRM_MESSAGE = "전투가 종료되었다. 확인을 누르면 필드로 돌아간다.";
export const ULTRA_BALL_BONUS = 2;

const STRUGGLE_MOVE: BattleMove = {
  id: STRUGGLE_MOVE_ID,
  name: "발버둥",
  pp: 1,
  maxPp: 1,
  type: "없음",
  typeId: -1,
  category: "physical",
  effectCode: 254,
  accuracy: 0,
  power: 50,
};

export interface RunChanceInput {
  playerSpeed: number;
  opponentSpeed: number;
  runAttemptCount: number;
}

export interface RunAttemptInput extends RunChanceInput {
  randomByte?: number;
}

export interface RunAttemptResult {
  escaped: boolean;
  chanceByte: number;
  randomByte: number | null;
  nextRunAttemptCount: number;
}

export interface ChooseBattleCommandOptions {
  randomByte?: () => number;
  random?: () => number;
}

export interface ChooseBattleBagItemOptions {
  itemCount?: number;
  captureRandom16?: () => number;
  captureRateMultiplier?: number;
}

export interface ChoosePlayerMoveOptions {
  random?: () => number;
}

export function popBattleMessage(state: BattleScreenState): BattleScreenState {
  if (state.messageQueue.length === 0) {
    return state.phase === "intro" || state.phase === "resolving"
      ? { ...state, phase: state.result ? "ended" : "command" }
      : state;
  }

  const [, ...rest] = state.messageQueue;
  const [, ...restHpSnapshots] = state.messageHpSnapshots ?? [];

  return applyPendingBattleExperienceReward({
    ...state,
    messageQueue: rest,
    messageHpSnapshots: restHpSnapshots,
    phase:
      rest.length === 0 && (state.phase === "intro" || state.phase === "resolving")
        ? state.result
          ? "ended"
          : "command"
        : state.phase,
  });
}

export function applyPendingBattleExperienceReward(state: BattleScreenState): BattleScreenState {
  const reward = state.pendingExperienceReward;

  if (!reward || state.messageQueue[0] !== reward.message) {
    return state;
  }

  return {
    ...state,
    player: syncActivePartyPokemon(
      { ...state.player, party: reward.party ?? state.player.party },
      reward.pokemon,
    ),
    // Combat HP frames must not override level-up or evolution gains.
    messageHpSnapshots: undefined,
    pendingExperienceReward: null,
  };
}

export function chooseBattleCommand(
  state: BattleScreenState,
  command: BattleCommand,
  options: ChooseBattleCommandOptions = {},
): BattleScreenState {
  if (state.phase !== "command") {
    return state;
  }

  if (!canPokemonBattle(state.player.pokemon)) return requirePlayerReplacement(state);

  const req = state.gen4Requests?.[0];
  const escape = state.gen4Session ? getGen4EscapeInfo(state.gen4Session) : null;
  if (req && (req.recharge || req.forcedMoveId !== null))
    return resolveGen4Action(state, { kind: "continue" }, options.random);
  if (
    command === "run" &&
    (escape?.trapped ?? req?.trapped) &&
    !(escape?.guaranteed ?? hasGuaranteedGen4Escape(state.player.pokemon))
  )
    return { ...state, messageQueue: ["도망칠 수 없다!"] };
  if (command === "pokemon" && req?.trapped) return { ...state, messageQueue: ["교체할 수 없다!"] };
  if (command === "run") {
    if (state.battleKind !== "wild") {
      return {
        ...state,
        messageQueue: ["도망칠 수 없다!"],
        result: null,
        usedInventoryItemId: null,
      };
    }

    const runAttempt = (
      state.gen4Session
        ? getGen4EscapeInfo(state.gen4Session).guaranteed
        : hasGuaranteedGen4Escape(state.player.pokemon)
    )
      ? {
          escaped: true,
          nextRunAttemptCount: state.runAttemptCount,
          chanceByte: 256,
          randomByte: null,
        }
      : resolveRunAttempt({
          playerSpeed: state.player.pokemon.speed,
          opponentSpeed: state.opponent.pokemon.speed,
          runAttemptCount: state.runAttemptCount,
          randomByte: options.randomByte?.(),
        });

    if (!runAttempt.escaped) {
      const next = resolveGen4Action(state, { kind: "wait" }, options.random);
      return {
        ...next,
        runAttemptCount: runAttempt.nextRunAttemptCount,
        messageQueue: ["도망칠 수 없었다!", ...next.messageQueue],
        messageHpSnapshots: [
          createBattleMessageHpSnapshot(state.player.pokemon, state.opponent.pokemon),
          ...(next.messageHpSnapshots ?? []),
        ],
      };
    }

    return {
      ...state,
      phase: "ended",
      runAttemptCount: runAttempt.nextRunAttemptCount,
      messageQueue: appendBattleEndConfirmMessage(["무사히 도망쳤다!"]),
      usedInventoryItemId: null,
      result: {
        winnerPlayerId: state.player.playerId,
        loserPlayerId: state.opponent.playerId,
        reason: "run",
      },
    };
  }

  if (command === "bag") {
    return {
      ...state,
      phase: "bag-select",
      selectedMoveId: null,
      messageQueue: [],
      result: null,
      usedInventoryItemId: null,
    };
  }

  if (command === "pokemon") {
    return {
      ...state,
      phase: "party-select",
      selectedMoveId: null,
      messageQueue: [],
      result: null,
      usedInventoryItemId: null,
    };
  }

  if (command !== "fight") {
    return {
      ...state,
      messageQueue: ["아직 사용할 수 없다."],
      usedInventoryItemId: null,
    };
  }

  const moveSelectState: BattleScreenState = {
    ...state,
    phase: "move-select",
    messageQueue: [],
    usedInventoryItemId: null,
  };

  return resolveStruggle(state.player.pokemon.moves)
    ? choosePlayerMove(moveSelectState, 0, { random: options.random })
    : moveSelectState;
}

export function chooseBattleBagItem(
  state: BattleScreenState,
  itemId: string,
  options: ChooseBattleBagItemOptions = {},
): BattleScreenState {
  if (state.phase !== "bag-select") {
    return state;
  }

  if (!canPokemonBattle(state.player.pokemon)) return requirePlayerReplacement(state);
  const itemCount = normalizeInventoryCount(options.itemCount ?? 0);
  if (itemId !== "pokeball" && itemId !== "ultraBall") {
    const romId = RUNTIME_ITEM_ROM_IDS[itemId as RuntimeItemId];
    if (itemCount <= 0)
      return { ...state, messageQueue: ["아이템이 없다!"], usedInventoryItemId: null };
    if (
      !romId ||
      !state.player.party.some(slot => slot.pokemon && canUseGen4ItemOnMember(romId, slot.pokemon))
    )
      return { ...state, messageQueue: ["효과가 없다."], usedInventoryItemId: null };
    return {
      ...state,
      phase: "party-select",
      pendingBattleItemId: itemId,
      messageQueue: [],
      usedInventoryItemId: null,
    };
  }

  // 몬스터볼은 의도적으로 무제한이라 보유 수량(itemCount)을 확인하지 않는다.
  return chooseCaptureBallItem(state, options, {
    itemId,
    displayName: battleItemDisplayName(itemId),
    ballBonus: itemId === "ultraBall" ? ULTRA_BALL_BONUS : 1,
  });
}

function chooseCaptureBallItem(
  state: BattleScreenState,
  options: ChooseBattleBagItemOptions,
  ball: CaptureBallConfig,
): BattleScreenState {
  if (state.battleKind !== "wild") {
    return {
      ...state,
      messageQueue: ["트레이너전에서는 사용할 수 없다."],
      result: null,
      usedInventoryItemId: null,
    };
  }

  const captureAttempt = resolveGen4CaptureAttempt({
    maxHp: state.opponent.pokemon.maxHp,
    currentHp: state.opponent.pokemon.currentHp,
    catchRate: Math.min(
      255,
      Math.max(
        1,
        Math.round(
          state.opponent.pokemon.catchRate * Math.max(0, options.captureRateMultiplier ?? 1),
        ),
      ),
    ),
    ballBonus: ball.ballBonus,
    statusBonus: ["asleep", "frozen"].includes(state.opponent.pokemon.status)
      ? 2
      : ["poisoned", "badlyPoisoned", "paralyzed", "burned"].includes(state.opponent.pokemon.status)
        ? 1.5
        : 1,
    random16: options.captureRandom16,
  });

  if (captureAttempt.caught) {
    return {
      ...state,
      phase: "ended",
      selectedMoveId: null,
      messageQueue: appendBattleEndConfirmMessage([
        `${withObjectParticle(ball.displayName)} 던졌다!`,
        `${withObjectParticle(state.opponent.pokemon.name)} 잡았다!`,
      ]),
      usedInventoryItemId: ball.itemId,
      captureAttempt: {
        ballItemId: ball.itemId,
        caught: true,
        shakes: captureAttempt.shakes,
      },
      result: {
        winnerPlayerId: state.player.playerId,
        loserPlayerId: state.opponent.playerId,
        reason: "capture",
        capturedPokemon: restoreGen4FieldPokemon(state, 1),
      },
    };
  }

  const resolved = resolveGen4Action(state, { kind: "wait" });
  return {
    ...resolved,
    usedInventoryItemId: ball.itemId,
    captureAttempt: { ballItemId: ball.itemId, caught: false, shakes: captureAttempt.shakes },
    messageQueue: [
      `${withObjectParticle(ball.displayName)} 던졌다!`,
      "아쉽다! 포켓몬이 볼에서 빠져나왔다!",
      ...resolved.messageQueue,
    ],
    messageHpSnapshots: [
      createBattleMessageHpSnapshot(state.player.pokemon, state.opponent.pokemon),
      createBattleMessageHpSnapshot(state.player.pokemon, state.opponent.pokemon),
      ...(resolved.messageHpSnapshots ?? []),
    ],
  };
}

function requirePlayerReplacement(state: BattleScreenState): BattleScreenState {
  return createPlayerFaintState({
    state,
    playerPokemon: state.player.pokemon,
    opponentPokemon: state.opponent.pokemon,
    messageQueue: [],
    selectedMoveId: null,
    turn: state.turn,
    usedInventoryItemId: null,
  });
}

export function isForcedPartySwitch(state: BattleScreenState): boolean {
  return (
    state.phase === "party-select" &&
    !state.pendingBattleItemId &&
    (state.gen4Requests?.[0].kind === "switch" || !canPokemonBattle(state.player.pokemon))
  );
}

export function choosePartySlot(state: BattleScreenState, slotIndex: number): BattleScreenState {
  if (state.phase !== "party-select") {
    return state;
  }

  if (state.pendingBattleItemId) {
    const itemId = state.pendingBattleItemId;
    const pokemon = state.player.party.find(slot => slot.slotIndex === slotIndex)?.pokemon;
    const romId = RUNTIME_ITEM_ROM_IDS[itemId as RuntimeItemId];
    if (!pokemon || !romId || !canUseGen4ItemOnMember(romId, pokemon))
      return { ...state, messageQueue: ["효과가 없다."] };
    const resolved = resolveGen4Action(state, { kind: "item", itemId: romId, slotIndex });
    return { ...resolved, usedInventoryItemId: resolved.pendingBattleItemId ? null : itemId };
  }
  return resolveGen4Action(state, { kind: "switch", slotIndex });
}

export function calculateRunChanceByte({
  playerSpeed,
  opponentSpeed,
  runAttemptCount,
}: RunChanceInput): number {
  const normalizedPlayerSpeed = Math.max(0, Math.floor(playerSpeed));
  const normalizedOpponentSpeed = Math.max(0, Math.floor(opponentSpeed));

  if (normalizedOpponentSpeed === 0 || normalizedPlayerSpeed >= normalizedOpponentSpeed) {
    return 256;
  }

  const attemptCount = normalizeRunAttemptCount(runAttemptCount);
  const runValue =
    Math.floor((normalizedPlayerSpeed * 128) / normalizedOpponentSpeed) + attemptCount * 30;

  return runValue & 0xff;
}

export function resolveRunAttempt({
  playerSpeed,
  opponentSpeed,
  runAttemptCount,
  randomByte,
}: RunAttemptInput): RunAttemptResult {
  const attemptCount = normalizeRunAttemptCount(runAttemptCount);
  const chanceByte = calculateRunChanceByte({
    playerSpeed,
    opponentSpeed,
    runAttemptCount: attemptCount,
  });
  const nextRunAttemptCount = attemptCount + 1;

  if (chanceByte >= 256) {
    return {
      escaped: true,
      chanceByte,
      randomByte: null,
      nextRunAttemptCount,
    };
  }

  const normalizedRandomByte = normalizeRunRandomByte(randomByte ?? Math.random() * 256);

  return {
    escaped: chanceByte > normalizedRandomByte,
    chanceByte,
    randomByte: normalizedRandomByte,
    nextRunAttemptCount,
  };
}

export function choosePlayerMove(
  state: BattleScreenState,
  moveIndex: number,
  options: ChoosePlayerMoveOptions = {},
): BattleScreenState {
  if (state.phase !== "move-select") {
    return state;
  }

  if (!canPokemonBattle(state.player.pokemon)) return requirePlayerReplacement(state);
  const request = state.gen4Requests?.[0];
  if (request?.recharge || request?.forcedMoveId != null)
    return resolveGen4Action(state, { kind: "continue" }, options.random);
  const move = state.player.pokemon.moves[moveIndex];
  const available = request?.moves.filter(m => !m.disabled && m.pp > 0) ?? [];
  return resolveGen4Action(
    state,
    {
      kind: "move",
      moveId:
        available.length === 1 && available[0]!.moveId === STRUGGLE_MOVE_ID
          ? "struggle"
          : (move?.id ?? "struggle"),
    },
    options.random,
  );
}

function appendBattleEndConfirmMessage(messages: string[]): string[] {
  return [...messages, BATTLE_END_CONFIRM_MESSAGE];
}

export function formatWildVictoryRewardMessage(
  pokemonName: string,
  experienceGained: number,
): string {
  const subject = withTopicParticle(pokemonName);
  const normalizedExperience = Math.max(0, Math.floor(experienceGained));
  return `${subject} ${normalizedExperience} 경험치를 얻었다!`;
}

function applyWildVictoryExperience(
  playerPokemon: BattlePokemon,
  defeatedPokemon: BattlePokemon,
  ratio = 1,
): { pokemon: BattlePokemon; experienceGained: number; levelsGained: number } {
  const experienceGained = Math.floor(
    calculateWildBattleExpGain({
      baseExpYield: defeatedPokemon.baseExpYield,
      defeatedLevel: defeatedPokemon.level,
    }) * ratio,
  );
  const experienceResult = applyExperienceGain({
    currentExperience: playerPokemon.experience,
    currentLevel: playerPokemon.level,
    growthRate: playerPokemon.growthRate,
    gainedExperience: experienceGained,
  });
  // 레벨은 100에서 멈추므로 누적 경험치도 토너먼트 정산과 같이 Lv.100 기준치에서 멈춘다.
  const maximumExperience = getExperienceForLevel(100, playerPokemon.growthRate);
  const experience =
    maximumExperience > 0
      ? Math.min(experienceResult.experience, maximumExperience)
      : experienceResult.experience;

  if (experienceResult.level === playerPokemon.level) {
    return {
      pokemon: {
        ...playerPokemon,
        experience,
      },
      experienceGained,
      levelsGained: experienceResult.levelsGained,
    };
  }

  const nextStats = calculateGen4BattleStats(
    playerPokemon.baseStats,
    experienceResult.level,
    playerPokemon.individualValues,
    playerPokemon.effortValues,
    playerPokemon.natureId,
  );
  const maxHpIncrease = Math.max(0, nextStats.maxHp - playerPokemon.maxHp);

  return {
    pokemon: {
      ...playerPokemon,
      level: experienceResult.level,
      experience,
      maxHp: nextStats.maxHp,
      currentHp:
        playerPokemon.currentHp === 0
          ? 0
          : Math.min(nextStats.maxHp, playerPokemon.currentHp + maxHpIncrease),
      attack: nextStats.attack,
      defense: nextStats.defense,
      specialAttack: nextStats.specialAttack,
      specialDefense: nextStats.specialDefense,
      speed: nextStats.speed,
    },
    experienceGained,
    levelsGained: experienceResult.levelsGained,
  };
}

function normalizeRunAttemptCount(runAttemptCount: number): number {
  return Math.max(0, Math.floor(runAttemptCount));
}

function normalizeRunRandomByte(randomByte: number): number {
  const integer = Number.isFinite(randomByte) ? Math.floor(randomByte) : 0;

  return ((integer % 256) + 256) % 256;
}

function normalizeInventoryCount(count: number): number {
  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.max(0, Math.floor(count));
}

function battleItemDisplayName(itemId: string): string {
  return getRuntimeGameItem(itemId)?.name ?? "아이템";
}

interface CaptureBallConfig {
  itemId: "pokeball" | "ultraBall";
  displayName: string;
  ballBonus: number;
}

function resolveStruggle(moves: BattleMove[]): BattleMove | null {
  return moves.length > 0 &&
    moves.every(function testItem(move) {
      return !isBattleMoveSelectable(move);
    })
    ? STRUGGLE_MOVE
    : null;
}

export function isBattleMoveSelectable(move: BattleMove): boolean {
  return move.pp > 0 && move.competitiveEffectSupport !== "unsupported-primary";
}

function createBattleMessageHpSnapshot(
  playerPokemon: BattlePokemon,
  opponentPokemon: BattlePokemon,
  attackHitTarget: BattleMessageHpSnapshot["attackHitTarget"] = null,
): BattleMessageHpSnapshot {
  return {
    playerCurrentHp: playerPokemon.currentHp,
    playerStatus: playerPokemon.status,
    opponentCurrentHp: opponentPokemon.currentHp,
    opponentStatus: opponentPokemon.status,
    attackHitTarget,
  };
}

interface EndOfTurnResolutionInput {
  state: BattleScreenState;
  playerPokemon: BattlePokemon;
  opponentPokemon: BattlePokemon;
  messageQueue: string[];
  selectedMoveId: number | null;
  turn: number;
  usedInventoryItemId: string | null;
  runAttemptCount?: number;
}

function createOpponentFaintState(input: EndOfTurnResolutionInput): BattleScreenState {
  const runAttemptPatch =
    input.runAttemptCount === undefined ? {} : { runAttemptCount: input.runAttemptCount };
  const player = syncActivePartyPokemon(input.state.player, input.playerPokemon);
  const opponent = syncActivePartyPokemon(input.state.opponent, input.opponentPokemon);
  const faintMessages = [...input.messageQueue, "상대 포켓몬은 쓰러졌다!"];
  const replacement = opponent.party.find(function findItem(slot) {
    return (
      slot.slotIndex !== opponent.activePartySlotIndex &&
      slot.pokemon !== null &&
      canPokemonBattle(slot.pokemon)
    );
  });

  if (replacement?.pokemon) {
    return {
      ...input.state,
      ...runAttemptPatch,
      phase: "resolving",
      selectedMoveId: input.selectedMoveId,
      turn: input.turn,
      player,
      opponent: {
        ...opponent,
        pokemon: replacement.pokemon,
        activePartySlotIndex: replacement.slotIndex,
      },
      usedInventoryItemId: input.usedInventoryItemId,
      messageQueue: [
        ...faintMessages,
        `${withSubjectParticle(opponent.displayName)} ${withObjectParticle(replacement.pokemon.name)} 내보냈다!`,
      ],
      result: null,
    };
  }

  const experienceMultiplier = input.state.experienceMultiplier ?? 1;
  const wildVictoryExperience =
    input.state.battleKind === "wild"
      ? applyWildVictoryExperience(
          input.playerPokemon,
          input.opponentPokemon,
          input.playerPokemon.currentHp <= 0 ? 0 : experienceMultiplier,
        )
      : null;
  const resolvedPlayerPokemon = wildVictoryExperience?.pokemon ?? input.playerPokemon;
  const partyExperienceRatio =
    input.state.partyExperienceRatio ?? (input.state.sharePartyExperience ? 1 : 0);
  const partyExperience =
    wildVictoryExperience && partyExperienceRatio > 0
      ? player.party.map(slot => ({
          ...slot,
          pokemon: !slot.pokemon
            ? null
            : slot.pokemon.currentHp <= 0
              ? slot.pokemon
              : slot.slotIndex === player.activePartySlotIndex
                ? resolvedPlayerPokemon
                : applyWildVictoryExperience(
                    slot.pokemon,
                    input.opponentPokemon,
                    partyExperienceRatio * experienceMultiplier,
                  ).pokemon,
        }))
      : undefined;
  const sharedExperienceGained = wildVictoryExperience
    ? Math.floor(
        calculateWildBattleExpGain({
          baseExpYield: input.opponentPokemon.baseExpYield,
          defeatedLevel: input.opponentPokemon.level,
        }) *
          (partyExperienceRatio * experienceMultiplier),
      )
    : 0;
  const wildVictoryRewardMessage = wildVictoryExperience
    ? partyExperience
      ? `${partyExperienceRatio === 1 ? `팀 전원이 각각 ${wildVictoryExperience.experienceGained} 경험치를 얻었다!` : `${resolvedPlayerPokemon.name}: ${wildVictoryExperience.experienceGained} 경험치 · 나머지 팀원: 각각 ${sharedExperienceGained} 경험치를 얻었다!`}`
      : formatWildVictoryRewardMessage(
          resolvedPlayerPokemon.name,
          wildVictoryExperience.experienceGained,
        )
    : "";
  const victoryMessages = wildVictoryExperience
    ? [
        ...faintMessages,
        wildVictoryRewardMessage,
        ...(wildVictoryExperience.levelsGained > 0
          ? [
              `${withTopicParticle(resolvedPlayerPokemon.name)} Lv.${withSubjectParticle(resolvedPlayerPokemon.level)} 되었다!`,
            ]
          : []),
        "승리했다!",
      ]
    : [...faintMessages, "승리했다!"];

  return {
    ...input.state,
    ...runAttemptPatch,
    phase: "ended",
    selectedMoveId: input.selectedMoveId,
    turn: input.turn,
    player,
    opponent,
    usedInventoryItemId: input.usedInventoryItemId,
    messageQueue: appendBattleEndConfirmMessage(victoryMessages),
    pendingExperienceReward: wildVictoryExperience
      ? {
          message: wildVictoryRewardMessage,
          pokemon: resolvedPlayerPokemon,
          ...(partyExperience ? { party: partyExperience } : {}),
        }
      : null,
    result: {
      winnerPlayerId: input.state.player.playerId,
      loserPlayerId: input.state.opponent.playerId,
      reason: "faint",
      ...(wildVictoryExperience
        ? {
            experienceGained: wildVictoryExperience.experienceGained,
            levelsGained: wildVictoryExperience.levelsGained,
          }
        : {}),
    },
  };
}

function createPlayerFaintState(input: EndOfTurnResolutionInput): BattleScreenState {
  const runAttemptPatch =
    input.runAttemptCount === undefined ? {} : { runAttemptCount: input.runAttemptCount };
  const player = syncActivePartyPokemon(input.state.player, input.playerPokemon);
  const opponent = syncActivePartyPokemon(input.state.opponent, input.opponentPokemon);
  const faintMessages = [
    ...input.messageQueue,
    `${withTopicParticle(input.playerPokemon.name)} 쓰러졌다!`,
  ];
  const hasAvailableReplacement = player.party.some(function testItem(slot) {
    return (
      slot.slotIndex !== player.activePartySlotIndex &&
      slot.pokemon !== null &&
      canPokemonBattle(slot.pokemon)
    );
  });

  if (hasAvailableReplacement) {
    return {
      ...input.state,
      ...runAttemptPatch,
      phase: "party-select",
      selectedMoveId: input.selectedMoveId,
      turn: input.turn,
      player,
      opponent,
      usedInventoryItemId: input.usedInventoryItemId,
      messageQueue: [...faintMessages, "교체할 포켓몬을 선택해 주세요."],
      result: null,
    };
  }

  return {
    ...input.state,
    ...runAttemptPatch,
    phase: "ended",
    selectedMoveId: input.selectedMoveId,
    turn: input.turn,
    player,
    opponent,
    usedInventoryItemId: input.usedInventoryItemId,
    messageQueue: appendBattleEndConfirmMessage([...faintMessages, "패배했다!"]),
    result: {
      winnerPlayerId: input.state.opponent.playerId,
      loserPlayerId: input.state.player.playerId,
      reason: "faint",
    },
  };
}

export function canPokemonBattle(pokemon: BattlePokemon): boolean {
  return pokemon.status !== "fainted" && pokemon.currentHp > 0;
}

/** 모든 모험 전투는 4세대 실행기로 처리한다. 세션이 없는 상태는 첫 행동에서 세션을 만든다. */
function resolveGen4Action(
  input: BattleScreenState,
  action: Gen4Action,
  random: () => number = Math.random,
): BattleScreenState {
  const ready = ensureGen4Adventure(input, random);
  try {
    validateGen4Action(ready.gen4Requests![0], action);
  } catch {
    return { ...input, messageQueue: ["지금은 그 행동을 할 수 없다."], usedInventoryItemId: null };
  }
  const resolved = resolveGen4Adventure(ready, action, random);
  let state = resolved.state;
  if (!resolved.ended) return state;
  if (resolved.escapedBy !== undefined)
    return {
      ...state,
      phase: "ended",
      messageQueue: appendBattleEndConfirmMessage(state.messageQueue),
      result: {
        winnerPlayerId: state.player.playerId,
        loserPlayerId: state.opponent.playerId,
        reason: "run",
      },
    };
  if (resolved.winner === null) {
    // The HGSS non-link draw path is the player's blackout/loss, not a free rematch.
    return createPlayerFaintState({
      state,
      playerPokemon: state.player.pokemon,
      opponentPokemon: state.opponent.pokemon,
      messageQueue: state.messageQueue,
      selectedMoveId: null,
      turn: state.turn,
      usedInventoryItemId: null,
    });
  }
  if (resolved.winner === 0 && state.battleKind === "wild") {
    const party = state.player.party.map(slot => ({
      ...slot,
      pokemon:
        slot.pokemon &&
        slot.pokemon.currentHp > 0 &&
        state.participatedPartySlots?.includes(slot.slotIndex)
          ? {
              ...slot.pokemon,
              effortValues: awardGen4EffortValues(
                slot.pokemon.effortValues,
                state.opponent.pokemon.speciesId,
              ),
            }
          : slot.pokemon,
    }));
    state = {
      ...state,
      player: syncActivePartyPokemon(
        { ...state.player, party },
        party.find(s => s.slotIndex === state.player.activePartySlotIndex)!.pokemon!,
      ),
    };
  }
  const params = {
    state,
    playerPokemon: state.player.pokemon,
    opponentPokemon: state.opponent.pokemon,
    messageQueue: state.messageQueue,
    selectedMoveId:
      action.kind === "move"
        ? action.moveId === "struggle"
          ? STRUGGLE_MOVE_ID
          : action.moveId
        : null,
    turn: state.turn,
    usedInventoryItemId: null,
  };
  const end =
    resolved.winner === 0 ? createOpponentFaintState(params) : createPlayerFaintState(params);
  return {
    ...end,
    messageHpSnapshots: [
      ...(state.messageHpSnapshots ?? []),
      ...Array.from(
        { length: Math.max(0, end.messageQueue.length - state.messageQueue.length) },
        () => createBattleMessageHpSnapshot(state.player.pokemon, state.opponent.pokemon),
      ),
    ],
  };
}

function hasGuaranteedGen4Escape(pokemon: BattlePokemon): boolean {
  return pokemon.abilityId === 50 || GEN4_ROM_ITEMS[pokemon.heldItemId ?? 0]?.holdEffect === 63;
}
