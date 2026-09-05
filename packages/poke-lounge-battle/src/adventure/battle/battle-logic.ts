import type {
  BattleCaptureAttempt,
  BattleCommand,
  BattleMessageHpSnapshot,
  BattleMove,
  BattlePokemon,
  BattleScreenState,
} from "./battle-types";
import { applyInventoryItemEffect } from "../items/inventory-item-effects";
import { getRuntimeGameItem } from "../items/runtime-items";
import { BATTLE_PARTY_SLOT_COUNT, syncActivePartyPokemon } from "./battle-party";
import { calculateWildBattlePokeDollarReward, formatBattlePokeDollars } from "./battle-rewards";
import { resolveGen4CaptureAttempt } from "./capture-logic";
import { applyExperienceGain, calculateWildBattleExpGain } from "./experience";
import { calculateGen4Damage, checkGen4Accuracy, getGen4FixedDamage } from "../../gen4-battle-math";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";
import { calculateGen4TypeEffectiveness } from "../../gen4-type-chart";
import { formatTypeEffectivenessMessage } from "./gen4-type-chart";
import {
  applyBattleStatStageDelta,
  calculateBattleStageModifiedStat,
  normalizeBattleStatStages,
  type BattleStatStageKey,
} from "../../battle-stat-stages";

export const BATTLE_END_CONFIRM_MESSAGE = "전투가 종료되었다. 확인을 누르면 필드로 돌아간다.";
export const BATTLE_RUN_FAILED_MESSAGE = "도망칠 수 없었다!";
export const ULTRA_BALL_BONUS = 2;

const STRUGGLE_MOVE: BattleMove = {
  id: 165,
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

const BATTLE_EFFECT_ITEM_IDS = [
  "potion",
  "superPotion",
  "antidote",
  "hyperPotion",
  "revive",
] as const;

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

  if (command === "run") {
    if (state.battleKind !== "wild") {
      return {
        ...state,
        messageQueue: ["도망칠 수 없다!"],
        result: null,
        usedInventoryItemId: null,
      };
    }

    const runAttempt = resolveRunAttempt({
      playerSpeed: state.player.pokemon.speed,
      opponentSpeed: state.opponent.pokemon.speed,
      runAttemptCount: state.runAttemptCount,
      randomByte: options.randomByte?.(),
    });

    if (!runAttempt.escaped) {
      return resolveFailedRunTurn(state, runAttempt.nextRunAttemptCount);
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

  const itemCount = normalizeInventoryCount(options.itemCount ?? 0);

  if (itemId === "pokeball") {
    return chooseCaptureBallItem(state, itemCount, options, {
      itemId: "pokeball",
      displayName: battleItemDisplayName("pokeball"),
      ballBonus: 1,
    });
  }

  if (itemId === "ultraBall") {
    return chooseCaptureBallItem(state, itemCount, options, {
      itemId: "ultraBall",
      displayName: battleItemDisplayName("ultraBall"),
      ballBonus: ULTRA_BALL_BONUS,
    });
  }

  if (!isBattleEffectItemId(itemId)) {
    return {
      ...state,
      messageQueue: ["지금은 쓸 수 없다."],
      result: null,
      usedInventoryItemId: null,
    };
  }

  if (itemCount <= 0) {
    return {
      ...state,
      messageQueue: [`${battleItemDisplayName(itemId)}이 없다!`],
      result: null,
      usedInventoryItemId: null,
    };
  }

  const effect = applyInventoryItemEffect(itemId, state.player.pokemon);

  if (!effect.ok) {
    return {
      ...state,
      messageQueue: [effect.message],
      result: null,
      usedInventoryItemId: null,
    };
  }

  return resolveOpponentTurnAfterPlayerMessages(
    {
      ...state,
      player: syncActivePartyPokemon(state.player, effect.pokemon),
    },
    effect.messages,
    itemId,
  );
}

function chooseCaptureBallItem(
  state: BattleScreenState,
  itemCount: number,
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

  if (itemCount <= 0) {
    return {
      ...state,
      messageQueue: [`${ball.displayName}이 없다!`],
      result: null,
      usedInventoryItemId: null,
    };
  }

  const captureAttempt = resolveGen4CaptureAttempt({
    maxHp: state.opponent.pokemon.maxHp,
    currentHp: state.opponent.pokemon.currentHp,
    catchRate: state.opponent.pokemon.catchRate,
    ballBonus: ball.ballBonus,
    random16: options.captureRandom16,
  });

  if (captureAttempt.caught) {
    const rewardPokeDollars = calculateWildBattlePokeDollarReward({
      baseExpYield: state.opponent.pokemon.baseExpYield,
      defeatedLevel: state.opponent.pokemon.level,
      outcome: "capture",
    });

    return {
      ...state,
      phase: "ended",
      selectedMoveId: null,
      messageQueue: appendBattleEndConfirmMessage([
        `${ball.displayName}을 던졌다!`,
        `${state.opponent.pokemon.name}을 잡았다!`,
        ...(rewardPokeDollars > 0
          ? [`${formatBattlePokeDollars(rewardPokeDollars)}을 얻었다!`]
          : []),
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
        capturedPokemon: state.opponent.pokemon,
        rewardPokeDollars,
      },
    };
  }

  return resolveFailedCaptureTurn(state, ball, {
    ballItemId: ball.itemId,
    caught: false,
    shakes: captureAttempt.shakes,
  });
}

export function isForcedPartySwitch(state: BattleScreenState): boolean {
  return state.phase === "party-select" && !canPokemonBattle(state.player.pokemon);
}

export function choosePartySlot(state: BattleScreenState, slotIndex: number): BattleScreenState {
  if (state.phase !== "party-select") {
    return state;
  }

  if (!isValidBattlePartySlotIndex(slotIndex)) {
    return blockPartySwitch(state, "교체할 수 없다.");
  }

  const partySlot = state.player.party.find(function findItem(slot) {
    return slot.slotIndex === slotIndex;
  });
  const pokemon = partySlot?.pokemon;

  if (!pokemon) {
    return blockPartySwitch(state, "빈 슬롯이다.");
  }

  if (!canPokemonBattle(pokemon)) {
    return blockPartySwitch(state, "쓰러진 포켓몬은 나올 수 없다.");
  }

  if (slotIndex === state.player.activePartySlotIndex) {
    return blockPartySwitch(state, "이미 나와 있다.");
  }

  const shouldSkipOpponentTurn = isForcedPartySwitch(state);
  const switchedState: BattleScreenState = {
    ...state,
    phase: "resolving",
    selectedMoveId: null,
    player: {
      ...state.player,
      pokemon,
      activePartySlotIndex: slotIndex,
      party: state.player.party.map(function mapItem(slot) {
        return slot.slotIndex === slotIndex ? { ...slot, pokemon } : slot;
      }),
    },
    messageQueue: [`${pokemon.name}, 부탁해!`],
    usedInventoryItemId: null,
    result: null,
  };

  return shouldSkipOpponentTurn
    ? switchedState
    : resolveOpponentTurnAfterPlayerMessages(switchedState, switchedState.messageQueue, null);
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

  const random = options.random ?? Math.random;
  const selectedMove = state.player.pokemon.moves[moveIndex];
  const playerMove =
    selectedMove && isBattleMoveSelectable(selectedMove)
      ? selectedMove
      : resolveStruggle(state.player.pokemon.moves);

  if (!playerMove) {
    return {
      ...state,
      messageQueue: ["그 기술은 사용할 수 없다."],
    };
  }

  const opponentMove = randomUsableMove(state.opponent.pokemon.moves, random);
  const actions = orderTurnActions(
    state.player.pokemon,
    playerMove,
    state.opponent.pokemon,
    opponentMove,
    random,
  );
  let playerPokemon = state.player.pokemon;
  let opponentPokemon = state.opponent.pokemon;
  const messageQueue: string[] = [];
  const messageHpSnapshots: BattleMessageHpSnapshot[] = [];

  for (const action of actions) {
    if (action.side === "player") {
      if (isFullyParalyzed(playerPokemon, random)) {
        messageQueue.push(`${withTopicParticle(playerPokemon.name)} 몸이 저려서 움직일 수 없다!`);
        appendBattleMessageHpSnapshots(messageHpSnapshots, 1, playerPokemon, opponentPokemon);
        continue;
      }

      const actionMessageStartIndex = messageQueue.length;
      playerPokemon = {
        ...playerPokemon,
        moves: spendMovePp(playerPokemon.moves, action.move.id),
      };
      messageQueue.push(`${playerPokemon.name}의 ${action.move.name}!`);
      const moveOutcome = resolveMoveOutcome(playerPokemon, opponentPokemon, action.move, random);
      messageQueue.push(...moveOutcome.messages);
      playerPokemon = moveOutcome.attacker;
      opponentPokemon = applyDamage(moveOutcome.defender, moveOutcome.damage);
      appendBattleMessageHpSnapshots(
        messageHpSnapshots,
        messageQueue.length - actionMessageStartIndex,
        playerPokemon,
        opponentPokemon,
        moveOutcome.damage > 0 ? "opponent" : null,
      );

      if (playerPokemon.status === "fainted" && opponentPokemon.status === "fainted") {
        const hasPlayerReplacement = state.player.party.some(function testItem(slot) {
          return (
            slot.slotIndex !== state.player.activePartySlotIndex &&
            slot.pokemon !== null &&
            canPokemonBattle(slot.pokemon)
          );
        });
        const faintState = hasPlayerReplacement
          ? createEndOfTurnFaintState({
              state,
              playerPokemon,
              opponentPokemon,
              messageQueue,
              selectedMoveId: playerMove.id,
              turn: state.turn + 1,
              usedInventoryItemId: null,
            })!
          : createPlayerFaintState({
              state,
              playerPokemon,
              opponentPokemon,
              messageQueue,
              selectedMoveId: playerMove.id,
              turn: state.turn + 1,
              usedInventoryItemId: null,
            });

        return withBattleMessageHpSnapshots(faintState, messageHpSnapshots);
      }

      if (playerPokemon.status === "fainted") {
        return withBattleMessageHpSnapshots(
          createPlayerFaintState({
            state,
            playerPokemon,
            opponentPokemon,
            messageQueue,
            selectedMoveId: playerMove.id,
            turn: state.turn + 1,
            usedInventoryItemId: null,
          }),
          messageHpSnapshots,
        );
      }

      if (opponentPokemon.status === "fainted") {
        return withBattleMessageHpSnapshots(
          createOpponentFaintState({
            state,
            playerPokemon,
            opponentPokemon,
            messageQueue,
            selectedMoveId: playerMove.id,
            turn: state.turn + 1,
            usedInventoryItemId: null,
          }),
          messageHpSnapshots,
        );
      }

      continue;
    }

    if (isFullyParalyzed(opponentPokemon, random)) {
      messageQueue.push(`${withTopicParticle(opponentPokemon.name)} 몸이 저려서 움직일 수 없다!`);
      appendBattleMessageHpSnapshots(messageHpSnapshots, 1, playerPokemon, opponentPokemon);
      continue;
    }

    const actionMessageStartIndex = messageQueue.length;
    opponentPokemon = {
      ...opponentPokemon,
      moves: spendMovePp(opponentPokemon.moves, action.move.id),
    };
    messageQueue.push(`${opponentPokemon.name}의 ${action.move.name}!`);
    const moveOutcome = resolveMoveOutcome(opponentPokemon, playerPokemon, action.move, random);
    messageQueue.push(...moveOutcome.messages);
    opponentPokemon = moveOutcome.attacker;
    playerPokemon = applyDamage(moveOutcome.defender, moveOutcome.damage);
    appendBattleMessageHpSnapshots(
      messageHpSnapshots,
      messageQueue.length - actionMessageStartIndex,
      playerPokemon,
      opponentPokemon,
      moveOutcome.damage > 0 ? "player" : null,
    );

    if (playerPokemon.status === "fainted" && opponentPokemon.status === "fainted") {
      return withBattleMessageHpSnapshots(
        createEndOfTurnFaintState({
          state,
          playerPokemon,
          opponentPokemon,
          messageQueue,
          selectedMoveId: playerMove.id,
          turn: state.turn + 1,
          usedInventoryItemId: null,
        })!,
        messageHpSnapshots,
      );
    }

    if (opponentPokemon.status === "fainted") {
      return withBattleMessageHpSnapshots(
        createOpponentFaintState({
          state,
          playerPokemon,
          opponentPokemon,
          messageQueue,
          selectedMoveId: playerMove.id,
          turn: state.turn + 1,
          usedInventoryItemId: null,
        }),
        messageHpSnapshots,
      );
    }

    if (playerPokemon.status === "fainted") {
      return withBattleMessageHpSnapshots(
        createPlayerFaintState({
          state,
          playerPokemon,
          opponentPokemon,
          messageQueue,
          selectedMoveId: playerMove.id,
          turn: state.turn + 1,
          usedInventoryItemId: null,
        }),
        messageHpSnapshots,
      );
    }
  }

  const endOfTurn = resolveEndOfTurnEffects({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: playerMove.id,
    turn: state.turn + 1,
    usedInventoryItemId: null,
  });

  if (endOfTurn.faintState) {
    return withBattleMessageHpSnapshots(endOfTurn.faintState, messageHpSnapshots);
  }

  return withBattleMessageHpSnapshots(
    {
      ...state,
      phase: "resolving",
      selectedMoveId: playerMove.id,
      turn: state.turn + 1,
      player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
      opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
      messageQueue: endOfTurn.messageQueue,
      usedInventoryItemId: null,
    },
    messageHpSnapshots,
  );
}

function resolveFailedRunTurn(
  state: BattleScreenState,
  runAttemptCount: number,
): BattleScreenState {
  const opponentMove = randomUsableMove(state.opponent.pokemon.moves);
  const messageHpSnapshots: BattleMessageHpSnapshot[] = [];

  if (!opponentMove) {
    const messageQueue = [BATTLE_RUN_FAILED_MESSAGE];
    appendBattleMessageHpSnapshots(
      messageHpSnapshots,
      messageQueue.length,
      state.player.pokemon,
      state.opponent.pokemon,
    );
    const endOfTurn = resolveEndOfTurnEffects({
      state,
      playerPokemon: state.player.pokemon,
      opponentPokemon: state.opponent.pokemon,
      messageQueue,
      selectedMoveId: null,
      turn: state.turn + 1,
      usedInventoryItemId: null,
      runAttemptCount,
    });

    if (endOfTurn.faintState) {
      return withBattleMessageHpSnapshots(endOfTurn.faintState, messageHpSnapshots);
    }

    return withBattleMessageHpSnapshots(
      {
        ...state,
        phase: "resolving",
        turn: state.turn + 1,
        runAttemptCount,
        selectedMoveId: null,
        player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
        opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
        messageQueue: endOfTurn.messageQueue,
        usedInventoryItemId: null,
        result: null,
      },
      messageHpSnapshots,
    );
  }

  let playerPokemon = state.player.pokemon;
  let opponentPokemon = {
    ...state.opponent.pokemon,
    moves: spendMovePp(state.opponent.pokemon.moves, opponentMove.id),
  };
  const messageQueue = [BATTLE_RUN_FAILED_MESSAGE];
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    messageQueue.length,
    playerPokemon,
    opponentPokemon,
  );
  const actionMessageStartIndex = messageQueue.length;
  messageQueue.push(`${opponentPokemon.name}의 ${opponentMove.name}!`);
  const moveOutcome = isFullyParalyzed(opponentPokemon)
    ? {
        damage: 0,
        attacker: opponentPokemon,
        defender: playerPokemon,
        messages: [`${withTopicParticle(opponentPokemon.name)} 몸이 저려서 움직일 수 없다!`],
      }
    : resolveMoveOutcome(opponentPokemon, playerPokemon, opponentMove);

  messageQueue.push(...moveOutcome.messages);
  opponentPokemon = moveOutcome.attacker;
  playerPokemon = applyDamage(moveOutcome.defender, moveOutcome.damage);
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    messageQueue.length - actionMessageStartIndex,
    playerPokemon,
    opponentPokemon,
    moveOutcome.damage > 0 ? "player" : null,
  );

  const immediateFaintState = createEndOfTurnFaintState({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    runAttemptCount,
    usedInventoryItemId: null,
  });
  if (immediateFaintState) {
    return withBattleMessageHpSnapshots(immediateFaintState, messageHpSnapshots);
  }

  const endOfTurn = resolveEndOfTurnEffects({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    usedInventoryItemId: null,
    runAttemptCount,
  });

  if (endOfTurn.faintState) {
    return withBattleMessageHpSnapshots(endOfTurn.faintState, messageHpSnapshots);
  }

  return withBattleMessageHpSnapshots(
    {
      ...state,
      phase: "resolving",
      selectedMoveId: null,
      turn: state.turn + 1,
      runAttemptCount,
      player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
      opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
      messageQueue: endOfTurn.messageQueue,
      usedInventoryItemId: null,
      result: null,
    },
    messageHpSnapshots,
  );
}

function resolveFailedCaptureTurn(
  state: BattleScreenState,
  ball: CaptureBallConfig,
  captureAttempt: BattleCaptureAttempt,
): BattleScreenState {
  const opponentMove = randomUsableMove(state.opponent.pokemon.moves);
  const captureMessages = [
    `${ball.displayName}을 던졌다!`,
    `${state.opponent.pokemon.name}이 볼에서 나왔다!`,
  ];
  const messageHpSnapshots: BattleMessageHpSnapshot[] = [];
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    captureMessages.length,
    state.player.pokemon,
    state.opponent.pokemon,
  );

  if (!opponentMove) {
    const endOfTurn = resolveEndOfTurnEffects({
      state,
      playerPokemon: state.player.pokemon,
      opponentPokemon: state.opponent.pokemon,
      messageQueue: captureMessages,
      selectedMoveId: null,
      turn: state.turn + 1,
      usedInventoryItemId: ball.itemId,
    });

    if (endOfTurn.faintState) {
      return withBattleMessageHpSnapshots(
        { ...endOfTurn.faintState, captureAttempt },
        messageHpSnapshots,
      );
    }

    return withBattleMessageHpSnapshots(
      {
        ...state,
        phase: "resolving",
        selectedMoveId: null,
        turn: state.turn + 1,
        player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
        opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
        messageQueue: endOfTurn.messageQueue,
        usedInventoryItemId: ball.itemId,
        captureAttempt,
        result: null,
      },
      messageHpSnapshots,
    );
  }

  let opponentPokemon = {
    ...state.opponent.pokemon,
    moves: spendMovePp(state.opponent.pokemon.moves, opponentMove.id),
  };
  let playerPokemon = state.player.pokemon;
  const messageQueue = [...captureMessages];
  const actionMessageStartIndex = messageQueue.length;
  messageQueue.push(`${opponentPokemon.name}의 ${opponentMove.name}!`);
  const moveOutcome = isFullyParalyzed(opponentPokemon)
    ? {
        damage: 0,
        attacker: opponentPokemon,
        defender: playerPokemon,
        messages: [`${withTopicParticle(opponentPokemon.name)} 몸이 저려서 움직일 수 없다!`],
      }
    : resolveMoveOutcome(opponentPokemon, playerPokemon, opponentMove);

  messageQueue.push(...moveOutcome.messages);
  opponentPokemon = moveOutcome.attacker;
  playerPokemon = applyDamage(moveOutcome.defender, moveOutcome.damage);
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    messageQueue.length - actionMessageStartIndex,
    playerPokemon,
    opponentPokemon,
    moveOutcome.damage > 0 ? "player" : null,
  );

  const immediateFaintState = createEndOfTurnFaintState({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    usedInventoryItemId: ball.itemId,
  });
  if (immediateFaintState) {
    return withBattleMessageHpSnapshots(
      {
        ...immediateFaintState,
        captureAttempt,
      },
      messageHpSnapshots,
    );
  }

  const endOfTurn = resolveEndOfTurnEffects({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    usedInventoryItemId: ball.itemId,
  });

  if (endOfTurn.faintState) {
    return withBattleMessageHpSnapshots(
      { ...endOfTurn.faintState, captureAttempt },
      messageHpSnapshots,
    );
  }

  return withBattleMessageHpSnapshots(
    {
      ...state,
      phase: "resolving",
      selectedMoveId: null,
      turn: state.turn + 1,
      player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
      opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
      messageQueue: endOfTurn.messageQueue,
      usedInventoryItemId: ball.itemId,
      captureAttempt,
      result: null,
    },
    messageHpSnapshots,
  );
}

function resolveOpponentTurnAfterPlayerMessages(
  state: BattleScreenState,
  startingMessages: string[],
  usedInventoryItemId: string | null,
): BattleScreenState {
  const opponentMove = randomUsableMove(state.opponent.pokemon.moves);
  const messageHpSnapshots: BattleMessageHpSnapshot[] = [];
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    startingMessages.length,
    state.player.pokemon,
    state.opponent.pokemon,
  );

  if (!opponentMove) {
    const endOfTurn = resolveEndOfTurnEffects({
      state,
      playerPokemon: state.player.pokemon,
      opponentPokemon: state.opponent.pokemon,
      messageQueue: startingMessages,
      selectedMoveId: null,
      turn: state.turn + 1,
      usedInventoryItemId,
    });

    if (endOfTurn.faintState) {
      return withBattleMessageHpSnapshots(endOfTurn.faintState, messageHpSnapshots);
    }

    return withBattleMessageHpSnapshots(
      {
        ...state,
        phase: "resolving",
        selectedMoveId: null,
        turn: state.turn + 1,
        player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
        opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
        messageQueue: endOfTurn.messageQueue,
        usedInventoryItemId,
        result: null,
      },
      messageHpSnapshots,
    );
  }

  let opponentPokemon = {
    ...state.opponent.pokemon,
    moves: spendMovePp(state.opponent.pokemon.moves, opponentMove.id),
  };
  let playerPokemon = state.player.pokemon;
  const messageQueue = [...startingMessages];
  const actionMessageStartIndex = messageQueue.length;
  messageQueue.push(`${opponentPokemon.name}의 ${opponentMove.name}!`);
  const moveOutcome = isFullyParalyzed(opponentPokemon)
    ? {
        damage: 0,
        attacker: opponentPokemon,
        defender: playerPokemon,
        messages: [`${withTopicParticle(opponentPokemon.name)} 몸이 저려서 움직일 수 없다!`],
      }
    : resolveMoveOutcome(opponentPokemon, playerPokemon, opponentMove);

  messageQueue.push(...moveOutcome.messages);
  opponentPokemon = moveOutcome.attacker;
  playerPokemon = applyDamage(moveOutcome.defender, moveOutcome.damage);
  appendBattleMessageHpSnapshots(
    messageHpSnapshots,
    messageQueue.length - actionMessageStartIndex,
    playerPokemon,
    opponentPokemon,
    moveOutcome.damage > 0 ? "player" : null,
  );

  const immediateFaintState = createEndOfTurnFaintState({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    usedInventoryItemId,
  });
  if (immediateFaintState) {
    return withBattleMessageHpSnapshots(immediateFaintState, messageHpSnapshots);
  }

  const endOfTurn = resolveEndOfTurnEffects({
    state,
    playerPokemon,
    opponentPokemon,
    messageQueue,
    selectedMoveId: null,
    turn: state.turn + 1,
    usedInventoryItemId,
  });

  if (endOfTurn.faintState) {
    return withBattleMessageHpSnapshots(endOfTurn.faintState, messageHpSnapshots);
  }

  return withBattleMessageHpSnapshots(
    {
      ...state,
      phase: "resolving",
      selectedMoveId: null,
      turn: state.turn + 1,
      player: syncActivePartyPokemon(state.player, endOfTurn.playerPokemon),
      opponent: syncActivePartyPokemon(state.opponent, endOfTurn.opponentPokemon),
      messageQueue: endOfTurn.messageQueue,
      usedInventoryItemId,
      result: null,
    },
    messageHpSnapshots,
  );
}

function blockPartySwitch(state: BattleScreenState, message: string): BattleScreenState {
  return {
    ...state,
    phase: "party-select",
    selectedMoveId: null,
    messageQueue: [message],
    usedInventoryItemId: null,
    result: null,
  };
}

function appendBattleEndConfirmMessage(messages: string[]): string[] {
  return [...messages, BATTLE_END_CONFIRM_MESSAGE];
}

function withTopicParticle(name: string): string {
  return `${name}${getTopicParticle(name)}`;
}

export function formatWildVictoryRewardMessage(
  pokemonName: string,
  experienceGained: number,
  rewardPokeDollars: number,
): string {
  const subject = withTopicParticle(pokemonName);
  const normalizedExperience = Math.max(0, Math.floor(experienceGained));

  if (rewardPokeDollars <= 0) {
    return `${subject} ${normalizedExperience} 경험치를 얻었다!`;
  }

  return `${subject} 경험치 ${normalizedExperience}과 ${formatBattlePokeDollars(rewardPokeDollars)}을 얻었다!`;
}

function getTopicParticle(name: string): "은" | "는" {
  const lastCharacter = name[name.length - 1];

  if (!lastCharacter) {
    return "는";
  }

  const hangulOffset = lastCharacter.charCodeAt(0) - 0xac00;

  if (hangulOffset < 0 || hangulOffset > 11171) {
    return "는";
  }

  return hangulOffset % 28 === 0 ? "는" : "은";
}

function applyWildVictoryExperience(
  playerPokemon: BattlePokemon,
  defeatedPokemon: BattlePokemon,
): { pokemon: BattlePokemon; experienceGained: number; levelsGained: number } {
  const experienceGained = calculateWildBattleExpGain({
    baseExpYield: defeatedPokemon.baseExpYield,
    defeatedLevel: defeatedPokemon.level,
  });
  const experienceResult = applyExperienceGain({
    currentExperience: playerPokemon.experience,
    currentLevel: playerPokemon.level,
    growthRate: playerPokemon.growthRate,
    gainedExperience: experienceGained,
  });

  if (experienceResult.level === playerPokemon.level) {
    return {
      pokemon: {
        ...playerPokemon,
        experience: experienceResult.experience,
      },
      experienceGained,
      levelsGained: experienceResult.levelsGained,
    };
  }

  const nextStats = calculateGen4BattleStats(
    playerPokemon.baseStats,
    experienceResult.level,
    playerPokemon.individualValues,
  );
  const maxHpIncrease = Math.max(0, nextStats.maxHp - playerPokemon.maxHp);

  return {
    pokemon: {
      ...playerPokemon,
      level: experienceResult.level,
      experience: experienceResult.experience,
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

function isBattleEffectItemId(itemId: string): itemId is (typeof BATTLE_EFFECT_ITEM_IDS)[number] {
  return (BATTLE_EFFECT_ITEM_IDS as readonly string[]).includes(itemId);
}

interface CaptureBallConfig {
  itemId: "pokeball" | "ultraBall";
  displayName: string;
  ballBonus: number;
}

function isValidBattlePartySlotIndex(slotIndex: number): boolean {
  return (
    Number.isFinite(slotIndex) &&
    Number.isInteger(slotIndex) &&
    slotIndex >= 0 &&
    slotIndex < BATTLE_PARTY_SLOT_COUNT
  );
}

type TurnAction = { side: "player"; move: BattleMove } | { side: "opponent"; move: BattleMove };

function orderTurnActions(
  player: BattlePokemon,
  playerMove: BattleMove,
  opponent: BattlePokemon,
  opponentMove: BattleMove | null,
  random: () => number = Math.random,
): TurnAction[] {
  const playerAction: TurnAction = { side: "player", move: playerMove };

  if (!opponentMove) {
    return [playerAction];
  }

  const opponentAction: TurnAction = { side: "opponent", move: opponentMove };
  const playerPriority = getMovePriority(playerMove);
  const opponentPriority = getMovePriority(opponentMove);

  if (opponentPriority !== playerPriority) {
    return opponentPriority > playerPriority
      ? [opponentAction, playerAction]
      : [playerAction, opponentAction];
  }

  const playerSpeed = calculateEffectiveBattleSpeed(player);
  const opponentSpeed = calculateEffectiveBattleSpeed(opponent);

  if (opponentSpeed !== playerSpeed) {
    return opponentSpeed > playerSpeed
      ? [opponentAction, playerAction]
      : [playerAction, opponentAction];
  }

  return randomUnit(random) < 0.5 ? [playerAction, opponentAction] : [opponentAction, playerAction];
}

function randomUsableMove(
  moves: BattleMove[],
  random: () => number = Math.random,
): BattleMove | null {
  const usableMoves = moves.filter(isBattleMoveSelectable);

  if (usableMoves.length === 0) {
    return resolveStruggle(moves);
  }

  return usableMoves[Math.floor(randomUnit(random) * usableMoves.length)] ?? usableMoves[0];
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

function spendMovePp(moves: BattleMove[], moveId: number): BattleMove[] {
  return moves.map(function mapItem(move) {
    return move.id === moveId ? { ...move, pp: Math.max(0, move.pp - 1) } : move;
  });
}

function appendBattleMessageHpSnapshots(
  snapshots: BattleMessageHpSnapshot[],
  messageCount: number,
  playerPokemon: BattlePokemon,
  opponentPokemon: BattlePokemon,
  attackHitTarget: BattleMessageHpSnapshot["attackHitTarget"] = null,
): void {
  for (let index = 0; index < messageCount; index += 1) {
    snapshots.push(
      createBattleMessageHpSnapshot(
        playerPokemon,
        opponentPokemon,
        index === 0 ? attackHitTarget : null,
      ),
    );
  }
}

function withBattleMessageHpSnapshots(
  state: BattleScreenState,
  snapshots: BattleMessageHpSnapshot[],
): BattleScreenState {
  const messageHpSnapshots = snapshots.slice(0, state.messageQueue.length);
  const finalSnapshot = createBattleMessageHpSnapshot(state.player.pokemon, state.opponent.pokemon);

  while (messageHpSnapshots.length < state.messageQueue.length) {
    messageHpSnapshots.push(finalSnapshot);
  }

  return {
    ...state,
    messageHpSnapshots,
  };
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

interface MoveOutcome {
  damage: number;
  attacker: BattlePokemon;
  defender: BattlePokemon;
  messages: string[];
}

function resolveMoveOutcome(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  random: () => number = Math.random,
): MoveOutcome {
  if (!moveHits(attacker, defender, move, random)) {
    return {
      damage: 0,
      attacker,
      defender,
      messages: [`${attacker.name}의 공격은 빗나갔다!`],
    };
  }

  const fixedDamage = getGen4FixedDamage(move.effectCode);
  const typeEffectiveness = calculateGen4TypeEffectiveness(move.typeId, defender.typeIds);

  if (fixedDamage !== null) {
    return {
      damage: typeEffectiveness === 0 ? 0 : fixedDamage,
      attacker,
      defender,
      messages:
        typeEffectiveness === 0
          ? [formatTypeEffectivenessMessage(typeEffectiveness)].filter(isString)
          : [],
    };
  }

  const critical = move.category === "status" || move.power <= 0 ? false : rollCriticalHit(random);
  const damage = damageForMove(attacker, defender, move, {
    critical,
    randomFactor:
      move.category === "status" || move.power <= 0 ? 100 : rollDamageRandomFactor(random),
    typeEffectiveness,
  });
  const effectOutcome = resolveMoveEffect(attacker, defender, move, {
    random,
    damage,
  });
  const typeMessage =
    move.category !== "status" && move.power > 0
      ? formatTypeEffectivenessMessage(typeEffectiveness)
      : null;
  const struggleRecoil =
    move.id === STRUGGLE_MOVE.id && damage > 0
      ? Math.max(1, Math.floor(effectOutcome.attacker.maxHp / 4))
      : 0;
  const resolvedAttacker =
    struggleRecoil > 0
      ? applyDamage(effectOutcome.attacker, struggleRecoil)
      : effectOutcome.attacker;
  const messages = [
    ...(critical && damage > 0 ? ["급소에 맞았다!"] : []),
    ...[typeMessage].filter(isString),
    ...effectOutcome.messages,
    ...(struggleRecoil > 0
      ? [`${withTopicParticle(resolvedAttacker.name)} 반동 데미지를 입었다!`]
      : []),
  ];

  return {
    damage,
    attacker: resolvedAttacker,
    defender: effectOutcome.defender,
    messages,
  };
}

function damageForMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  modifiers: { critical: boolean; randomFactor: number; typeEffectiveness: number },
): number {
  const attackerStages = normalizeBattleStatStages(attacker.statStages);
  const defenderStages = normalizeBattleStatStages(defender.statStages);
  const rawOffensiveStat =
    move.category === "special"
      ? calculateBattleStageModifiedStat(attacker.specialAttack, attackerStages.specialAttack)
      : calculateBattleStageModifiedStat(attacker.attack, attackerStages.attack);
  const offensiveStat =
    move.category === "physical" && attacker.status === "burned"
      ? Math.max(1, Math.floor(rawOffensiveStat / 2))
      : rawOffensiveStat;
  const defensiveStat =
    move.category === "special"
      ? calculateBattleStageModifiedStat(defender.specialDefense, defenderStages.specialDefense)
      : calculateBattleStageModifiedStat(defender.defense, defenderStages.defense);

  return calculateGen4Damage({
    level: attacker.level,
    power: move.power,
    attack: offensiveStat,
    defense: defensiveStat,
    moveTypeId: move.typeId,
    attackerTypeIds: attacker.typeIds,
    typeEffectiveness: modifiers.typeEffectiveness,
    randomFactor: modifiers.randomFactor,
    critical: modifiers.critical,
    category: move.category,
  });
}

function moveHits(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  random: () => number = Math.random,
): boolean {
  const attackerStages = normalizeBattleStatStages(attacker.statStages);
  const defenderStages = normalizeBattleStatStages(defender.statStages);

  return checkGen4Accuracy({
    accuracy: move.accuracy,
    accuracyStage: attackerStages.accuracy,
    evasionStage: defenderStages.evasion,
    roll: rollAccuracy(random),
  });
}

interface MoveEffectOutcome {
  attacker: BattlePokemon;
  defender: BattlePokemon;
  messages: string[];
}

function resolveMoveEffect(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  options: { random: () => number; damage: number },
): MoveEffectOutcome {
  if (move.effectCode === 66) {
    return applyPoisonEffect(attacker, defender);
  }

  if (move.effectCode === 67) {
    return applyParalysisEffect(attacker, defender);
  }

  if (
    move.effectCode === 4 &&
    options.damage > 0 &&
    randomUnit(options.random) < (move.effectChance ?? 10) / 100
  ) {
    return applyBurnEffect(attacker, defender);
  }

  if (
    move.effectCode === 6 &&
    options.damage > 0 &&
    randomUnit(options.random) < (move.effectChance ?? 10) / 100
  ) {
    return applyParalysisEffect(attacker, defender);
  }

  const statStageEffect = getStatStageEffect(move.effectCode);

  if (statStageEffect) {
    return applyStatStageEffect(attacker, defender, statStageEffect);
  }

  return { attacker, defender, messages: [] };
}

function applyPoisonEffect(attacker: BattlePokemon, defender: BattlePokemon): MoveEffectOutcome {
  if (defender.status === "fainted") {
    return { attacker, defender, messages: [] };
  }

  if (defender.status !== "normal") {
    return {
      attacker,
      defender,
      messages: [
        defender.status === "poisoned"
          ? `${withTopicParticle(defender.name)} 이미 독에 걸려 있다!`
          : `${withTopicParticle(defender.name)} 이미 상태 이상이다!`,
      ],
    };
  }

  return {
    attacker,
    defender: {
      ...defender,
      status: "poisoned",
    },
    messages: [`${withTopicParticle(defender.name)} 독에 걸렸다!`],
  };
}

function applyBurnEffect(attacker: BattlePokemon, defender: BattlePokemon): MoveEffectOutcome {
  if (defender.status === "fainted") {
    return { attacker, defender, messages: [] };
  }

  if (defender.status !== "normal") {
    return {
      attacker,
      defender,
      messages: [`${withTopicParticle(defender.name)} 이미 상태 이상이다!`],
    };
  }

  return {
    attacker,
    defender: {
      ...defender,
      status: "burned",
    },
    messages: [`${withTopicParticle(defender.name)} 화상을 입었다!`],
  };
}

function applyParalysisEffect(attacker: BattlePokemon, defender: BattlePokemon): MoveEffectOutcome {
  if (defender.status === "fainted") {
    return { attacker, defender, messages: [] };
  }

  if (defender.status !== "normal") {
    return {
      attacker,
      defender,
      messages: [`${withTopicParticle(defender.name)} 이미 상태 이상이다!`],
    };
  }

  return {
    attacker,
    defender: {
      ...defender,
      status: "paralyzed",
    },
    messages: [`${withTopicParticle(defender.name)} 마비되어 기술이 나오기 어려워졌다!`],
  };
}

function getStatStageEffect(effectCode: number): {
  key: BattleStatStageKey;
  delta: number;
  label: string;
  target: "attacker" | "defender";
} | null {
  switch (effectCode) {
    case 18:
      return { key: "attack", delta: -1, label: "공격", target: "defender" };
    case 19:
      return { key: "defense", delta: -1, label: "방어", target: "defender" };
    case 20:
      return { key: "speed", delta: -1, label: "스피드", target: "defender" };
    case 23:
      return { key: "accuracy", delta: -1, label: "명중률", target: "defender" };
    case 60:
      return { key: "speed", delta: -2, label: "스피드", target: "defender" };
    case 156:
      return { key: "defense", delta: 1, label: "방어", target: "attacker" };
    default:
      return null;
  }
}

function applyStatStageEffect(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  effect: {
    key: BattleStatStageKey;
    delta: number;
    label: string;
    target: "attacker" | "defender";
  },
): MoveEffectOutcome {
  const target = effect.target === "attacker" ? attacker : defender;
  const currentStages = normalizeBattleStatStages(target.statStages);
  const nextStages = applyBattleStatStageDelta(currentStages, effect.key, effect.delta);

  if (nextStages[effect.key] === currentStages[effect.key]) {
    return {
      attacker,
      defender,
      messages: [
        `${target.name}의 ${effect.label}은 더 이상 ${effect.delta > 0 ? "오르지" : "떨어지지"} 않는다!`,
      ],
    };
  }

  const updatedTarget = {
    ...target,
    statStages: nextStages,
  };

  return {
    attacker: effect.target === "attacker" ? updatedTarget : attacker,
    defender: effect.target === "defender" ? updatedTarget : defender,
    messages: [
      effect.delta > 0
        ? `${target.name}의 ${withSubjectParticle(effect.label)} 올랐다!`
        : effect.delta <= -2
          ? `${target.name}의 ${withSubjectParticle(effect.label)} 크게 떨어졌다!`
          : `${target.name}의 ${withSubjectParticle(effect.label)} 떨어졌다!`,
    ],
  };
}

function withSubjectParticle(value: string): string {
  return `${value}${getTopicParticle(value) === "은" ? "이" : "가"}`;
}

function applyEndOfTurnEffects(
  playerPokemon: BattlePokemon,
  opponentPokemon: BattlePokemon,
): { playerPokemon: BattlePokemon; opponentPokemon: BattlePokemon; messages: string[] } {
  let nextPlayerPokemon = playerPokemon;
  let nextOpponentPokemon = opponentPokemon;
  const messages: string[] = [];
  const playerPoison = applyPoisonResidualDamage(nextPlayerPokemon);
  nextPlayerPokemon = playerPoison.pokemon;
  messages.push(...playerPoison.messages);
  const playerBurn = applyBurnResidualDamage(nextPlayerPokemon);
  nextPlayerPokemon = playerBurn.pokemon;
  messages.push(...playerBurn.messages);

  const opponentPoison = applyPoisonResidualDamage(nextOpponentPokemon);
  nextOpponentPokemon = opponentPoison.pokemon;
  messages.push(...opponentPoison.messages);
  const opponentBurn = applyBurnResidualDamage(nextOpponentPokemon);
  nextOpponentPokemon = opponentBurn.pokemon;
  messages.push(...opponentBurn.messages);

  return {
    playerPokemon: nextPlayerPokemon,
    opponentPokemon: nextOpponentPokemon,
    messages,
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

interface EndOfTurnResolution {
  playerPokemon: BattlePokemon;
  opponentPokemon: BattlePokemon;
  messageQueue: string[];
  faintState: BattleScreenState | null;
}

function resolveEndOfTurnEffects(input: EndOfTurnResolutionInput): EndOfTurnResolution {
  const endOfTurn = applyEndOfTurnEffects(input.playerPokemon, input.opponentPokemon);
  const messageQueue = [...input.messageQueue, ...endOfTurn.messages];
  const faintState = createEndOfTurnFaintState({
    ...input,
    playerPokemon: endOfTurn.playerPokemon,
    opponentPokemon: endOfTurn.opponentPokemon,
    messageQueue,
  });

  return {
    playerPokemon: endOfTurn.playerPokemon,
    opponentPokemon: endOfTurn.opponentPokemon,
    messageQueue,
    faintState,
  };
}

function createEndOfTurnFaintState(input: EndOfTurnResolutionInput): BattleScreenState | null {
  if (input.opponentPokemon.status === "fainted" && input.playerPokemon.status === "fainted") {
    const opponentFaintState = createOpponentFaintState(input);

    if (!opponentFaintState.result) {
      return createPlayerFaintState({
        ...input,
        state: opponentFaintState,
        messageQueue: opponentFaintState.messageQueue,
        opponentPokemon: opponentFaintState.opponent.pokemon,
      });
    }
  }

  if (input.opponentPokemon.status === "fainted") {
    return createOpponentFaintState(input);
  }

  if (input.playerPokemon.status === "fainted") {
    return createPlayerFaintState(input);
  }

  return null;
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
        `${opponent.displayName}가 ${replacement.pokemon.name}을 내보냈다!`,
      ],
      result: null,
    };
  }

  const wildVictoryExperience =
    input.state.battleKind === "wild"
      ? applyWildVictoryExperience(input.playerPokemon, input.opponentPokemon)
      : null;
  const wildVictoryRewardPokeDollars =
    input.state.battleKind === "wild"
      ? calculateWildBattlePokeDollarReward({
          baseExpYield: input.opponentPokemon.baseExpYield,
          defeatedLevel: input.opponentPokemon.level,
          outcome: "faint",
        })
      : 0;
  const resolvedPlayerPokemon = wildVictoryExperience?.pokemon ?? input.playerPokemon;
  const partyExperience =
    wildVictoryExperience && input.state.sharePartyExperience
      ? player.party.map(slot => ({
          ...slot,
          pokemon: !slot.pokemon
            ? null
            : slot.slotIndex === player.activePartySlotIndex
              ? resolvedPlayerPokemon
              : applyWildVictoryExperience(slot.pokemon, input.opponentPokemon).pokemon,
        }))
      : undefined;
  const wildVictoryRewardMessage = wildVictoryExperience
    ? partyExperience
      ? `팀 전원이 각각 ${wildVictoryExperience.experienceGained} 경험치를 얻었다!${wildVictoryRewardPokeDollars > 0 ? `\n${formatBattlePokeDollars(wildVictoryRewardPokeDollars)}을 얻었다!` : ""}`
      : formatWildVictoryRewardMessage(
          resolvedPlayerPokemon.name,
          wildVictoryExperience.experienceGained,
          wildVictoryRewardPokeDollars,
        )
    : "";
  const victoryMessages = wildVictoryExperience
    ? [
        ...faintMessages,
        wildVictoryRewardMessage,
        ...(wildVictoryExperience.levelsGained > 0
          ? [
              `${withTopicParticle(resolvedPlayerPokemon.name)} Lv.${resolvedPlayerPokemon.level}이 되었다!`,
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
            rewardPokeDollars: wildVictoryRewardPokeDollars,
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

function applyPoisonResidualDamage(pokemon: BattlePokemon): {
  pokemon: BattlePokemon;
  messages: string[];
} {
  if (pokemon.status !== "poisoned" || pokemon.currentHp <= 0) {
    return { pokemon, messages: [] };
  }

  const damage = Math.max(1, Math.floor(pokemon.maxHp / 8));
  const nextPokemon = applyDamage(pokemon, damage);

  return {
    pokemon: nextPokemon,
    messages: [`${withTopicParticle(pokemon.name)} 독 데미지를 입었다!`],
  };
}

function applyBurnResidualDamage(pokemon: BattlePokemon): {
  pokemon: BattlePokemon;
  messages: string[];
} {
  if (pokemon.status !== "burned" || pokemon.currentHp <= 0) {
    return { pokemon, messages: [] };
  }

  const damage = Math.max(1, Math.floor(pokemon.maxHp / 8));
  const nextPokemon = applyDamage(pokemon, damage);

  return {
    pokemon: nextPokemon,
    messages: [`${withTopicParticle(pokemon.name)} 화상 데미지를 입었다!`],
  };
}

function calculateEffectiveBattleSpeed(pokemon: BattlePokemon): number {
  const stages = normalizeBattleStatStages(pokemon.statStages);
  const stagedSpeed = calculateBattleStageModifiedStat(pokemon.speed, stages.speed);

  return pokemon.status === "paralyzed" ? Math.max(1, Math.floor(stagedSpeed / 4)) : stagedSpeed;
}

function isFullyParalyzed(pokemon: BattlePokemon, random: () => number = Math.random): boolean {
  return pokemon.status === "paralyzed" && randomUnit(random) < 0.25;
}

function getMovePriority(move: BattleMove): number {
  return move.priority ?? (move.effectCode === 103 ? 1 : 0);
}

function rollCriticalHit(random: () => number): boolean {
  return randomUnit(random) < 1 / 16;
}

function rollDamageRandomFactor(random: () => number): number {
  return 85 + Math.floor(randomUnit(random) * 16);
}

function rollAccuracy(random: () => number): number {
  return 1 + Math.floor(randomUnit(random) * 100);
}

function randomUnit(random: () => number): number {
  const value = random();

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.999999, value));
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function applyDamage(pokemon: BattlePokemon, damage: number): BattlePokemon {
  const currentHp = Math.max(0, pokemon.currentHp - damage);

  return {
    ...pokemon,
    currentHp,
    status: currentHp === 0 ? "fainted" : pokemon.status,
  };
}
