import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";
import { loadRuntimeGameDataJsonFixture as loadRuntimeGameDataJson } from "../testing/runtime-rom-data.fixture";
import {
  BATTLE_END_CONFIRM_MESSAGE,
  chooseBattleBagItem,
  chooseBattleCommand,
  choosePartySlot,
  choosePlayerMove,
  formatWildVictoryRewardMessage,
  isForcedPartySwitch,
  popBattleMessage,
} from "./battle-logic";
import { createSampleBattleState } from "./battle-sample-state";
import type { BattlePokemon, BattleScreenState } from "./battle-types";
import { getExperienceForLevel } from "./experience";
import { sharesPartyExperience } from "@poke-lounge/battle/round-settings";

const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));

test.before(async function callback() {
  await loadRuntimeGameDataJson(async function callback(input) {
    const requestPath =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;
    return new Response(
      fs.readFileSync(path.join(webRoot, "public", requestPath.replace(/^\//, "")), "utf8"),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
});

test.after(function callback() {
  return resetRuntimeGameDataJsonStateForTest();
});

test("야생 전투 경험치와 돈 보상은 한 문구로 안내한다", function testCase() {
  assert.equal(
    formatWildVictoryRewardMessage("브케인", 500, 120),
    "브케인은 경험치 500과 ₽ 120을 얻었다!",
  );
  assert.equal(formatWildVictoryRewardMessage("피카츄", 500, 0), "피카츄는 500 경험치를 얻었다!");
});

test("야생 전투 경험치와 레벨은 보상 문구가 표시될 때 적용한다", function testCase() {
  const initialState = createSampleBattleState();
  const playerPokemon = {
    ...clonePokemon(initialState.player.pokemon),
    level: 10,
    experience: getExperienceForLevel(11, initialState.player.pokemon.growthRate) - 1,
    speed: 999,
    moves: initialState.player.pokemon.moves.map(function mapItem(move, index) {
      return index === 0 ? { ...move, accuracy: 100, power: 999 } : move;
    }),
  };
  const opponentPokemon = {
    ...clonePokemon(initialState.opponent.pokemon),
    baseExpYield: 100,
    currentHp: 1,
    status: "normal" as const,
  };
  const battleState: BattleScreenState = {
    ...initialState,
    battleKind: "wild",
    phase: "move-select",
    messageQueue: [],
    player: {
      ...initialState.player,
      pokemon: playerPokemon,
      party: initialState.player.party.map(function mapItem(slot) {
        return slot.slotIndex === initialState.player.activePartySlotIndex
          ? { ...slot, pokemon: playerPokemon }
          : slot;
      }),
    },
    opponent: {
      ...initialState.opponent,
      pokemon: opponentPokemon,
      party: initialState.opponent.party.map(function mapItem(slot) {
        return slot.slotIndex === initialState.opponent.activePartySlotIndex
          ? { ...slot, pokemon: opponentPokemon }
          : slot;
      }),
    },
  };

  let resolvedState = choosePlayerMove(battleState, 0, { random: () => 0.5 });
  const rewardMessage = resolvedState.pendingExperienceReward?.message;
  const rewardedLevel = resolvedState.pendingExperienceReward?.pokemon.level ?? 10;

  assert.ok(rewardMessage);
  assert.equal(resolvedState.player.pokemon.level, 10);
  assert.ok(rewardedLevel > 10);

  while (resolvedState.messageQueue[0] !== rewardMessage) {
    assert.equal(resolvedState.player.pokemon.level, 10);
    resolvedState = popBattleMessage(resolvedState);
  }

  assert.equal(resolvedState.player.pokemon.level, rewardedLevel);
  assert.equal(resolvedState.pendingExperienceReward, null);
});

test("90초 모드만 빈 슬롯을 제외한 팀 전원에게 경험치를 나누지 않고 지급한다", function testCase() {
  for (const duration of [90_000, 180_000, 300_000]) {
    const state = createSampleBattleState();
    state.battleKind = "wild";
    state.phase = "move-select";
    state.sharePartyExperience = sharesPartyExperience(duration);
    state.messageQueue = [];
    const active = { ...clonePokemon(state.player.pokemon), speed: 999 };
    active.moves[0] = { ...active.moves[0], power: 999, accuracy: 100 };
    const reserve = clonePokemon(active);
    reserve.experience = getExperienceForLevel(reserve.level + 1, reserve.growthRate) - 1;
    const fainted = { ...clonePokemon(reserve), currentHp: 0, status: "fainted" as const };
    state.player = {
      ...state.player,
      pokemon: active,
      activePartySlotIndex: 0,
      party: [
        { slotIndex: 0, pokemon: active },
        { slotIndex: 2, pokemon: reserve },
        { slotIndex: 4, pokemon: fainted },
        { slotIndex: 5, pokemon: null },
      ],
    };
    const enemy = { ...state.opponent.pokemon, currentHp: 1, baseExpYield: 100 };
    state.opponent = {
      ...state.opponent,
      pokemon: enemy,
      activePartySlotIndex: 0,
      party: [{ slotIndex: 0, pokemon: enemy }],
    };
    let result = choosePlayerMove(state, 0, { random: () => 0.5 });
    const gained = result.result?.experienceGained;
    assert.ok(gained && gained > 0);
    assert.equal(result.player.party[1].pokemon?.experience, reserve.experience);
    while (result.messageQueue.length) result = popBattleMessage(result);
    for (const slot of result.player.party) {
      if (!slot.pokemon) continue;
      const before = state.player.party.find(
        candidate => candidate.slotIndex === slot.slotIndex,
      )!.pokemon!;
      assert.equal(
        slot.pokemon.experience - before.experience,
        duration === 90_000 || slot.slotIndex === 0 ? gained : 0,
      );
    }
    assert.equal(result.player.party[2].pokemon?.currentHp, 0);
    assert.equal(result.player.party[2].pokemon?.status, "fainted");
    assert.equal(result.player.party[3].pokemon, null);
    assert.equal(result.player.party[1].pokemon!.level > reserve.level, duration === 90_000);
  }
});

test("포획 판정은 애니메이션용 볼 종류와 실제 흔들림 횟수를 보존한다", function testCase() {
  const initialState = createSampleBattleState();
  const bagState: BattleScreenState = {
    ...initialState,
    battleKind: "wild",
    phase: "bag-select",
    messageQueue: [],
  };

  const caughtState = chooseBattleBagItem(bagState, "pokeball", {
    itemCount: 1,
    captureRandom16: () => 0,
  });
  const escapedState = chooseBattleBagItem(bagState, "pokeball", {
    itemCount: 1,
    captureRandom16: () => 65_535,
  });

  assert.deepEqual(caughtState.captureAttempt, {
    ballItemId: "pokeball",
    caught: true,
    shakes: 4,
  });
  assert.equal(caughtState.messageQueue[0], "몬스터볼을 던졌다!");
  assert.deepEqual(escapedState.captureAttempt, {
    ballItemId: "pokeball",
    caught: false,
    shakes: 0,
  });
});

test("도망·포획·가방 뒤 상대 공격은 공격 메시지에만 타격 대상을 남긴다", function testCase() {
  const failedRunState = createOpponentAttackBattleState("command");
  const failedRun = chooseBattleCommand(failedRunState, "run", {
    randomByte: () => 255,
  });
  const failedCaptureState = createOpponentAttackBattleState("bag-select");
  const failedCapture = chooseBattleBagItem(failedCaptureState, "pokeball", {
    itemCount: 1,
    captureRandom16: () => 65_535,
  });
  const bagState = createOpponentAttackBattleState("bag-select");
  bagState.player.pokemon = {
    ...bagState.player.pokemon,
    currentHp: Math.max(1, bagState.player.pokemon.maxHp - 10),
  };
  bagState.player.party[0] = { slotIndex: 0, pokemon: bagState.player.pokemon };
  const afterBagUse = chooseBattleBagItem(bagState, "potion", { itemCount: 1 });

  [failedRun, failedCapture, afterBagUse].forEach(function visitItem(state) {
    const attackMessageIndex = state.messageQueue.findIndex(function findItemIndex(message) {
      return message === "브케인의 검증공격!";
    });

    assert.ok(attackMessageIndex >= 0);
    assert.ok(
      state.messageHpSnapshots?.slice(0, attackMessageIndex).every(function testItem(snapshot) {
        return snapshot.attackHitTarget === null;
      }),
    );
    assert.equal(state.messageHpSnapshots?.[attackMessageIndex]?.attackHitTarget, "player");
  });
});

test("잔류 피해 메시지에는 타격 효과음 대상이 기록되지 않는다", function testCase() {
  const state = createOpponentAttackBattleState("command");
  state.opponent.pokemon = {
    ...state.opponent.pokemon,
    moves: [],
  };
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
  state.player.pokemon = {
    ...state.player.pokemon,
    currentHp: Math.max(2, Math.floor(state.player.pokemon.maxHp / 2)),
    status: "poisoned",
  };
  state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };

  const failedRun = chooseBattleCommand(state, "run", { randomByte: () => 255 });

  assert.equal(failedRun.messageQueue.includes("치코리타는 독 데미지를 입었다!"), true);
  assert.ok(
    failedRun.messageHpSnapshots?.every(function testItem(snapshot) {
      return snapshot.attackHitTarget === null;
    }),
  );
});

test("기술 우선도가 같으면 스피드가 빠른 포켓몬이 먼저 행동한다", function testCase() {
  const fasterPlayerState = createSpeedOrderBattleState({
    playerSpeed: 100,
    opponentSpeed: 10,
  });
  const fasterOpponentState = createSpeedOrderBattleState({
    playerSpeed: 10,
    opponentSpeed: 100,
  });

  const playerFirstResult = choosePlayerMove(fasterPlayerState, 0, {
    random: () => 0.99,
  });
  const opponentFirstResult = choosePlayerMove(fasterOpponentState, 0, {
    random: () => 0.99,
  });

  assert.equal(playerFirstResult.messageQueue[0], "치코리타의 몸통박치기!");
  assert.deepEqual(playerFirstResult.messageHpSnapshots?.[0], {
    playerCurrentHp: fasterPlayerState.player.pokemon.currentHp,
    playerStatus: fasterPlayerState.player.pokemon.status,
    opponentCurrentHp: playerFirstResult.opponent.pokemon.currentHp,
    opponentStatus: playerFirstResult.opponent.pokemon.status,
    attackHitTarget: "opponent",
  });
  assert.deepEqual(playerFirstResult.messageHpSnapshots?.[1], {
    playerCurrentHp: playerFirstResult.player.pokemon.currentHp,
    playerStatus: playerFirstResult.player.pokemon.status,
    opponentCurrentHp: playerFirstResult.opponent.pokemon.currentHp,
    opponentStatus: playerFirstResult.opponent.pokemon.status,
    attackHitTarget: "player",
  });
  assert.equal(opponentFirstResult.messageQueue[0], "브케인의 몸통박치기!");
  assert.deepEqual(opponentFirstResult.messageHpSnapshots?.[0], {
    playerCurrentHp: opponentFirstResult.player.pokemon.currentHp,
    playerStatus: opponentFirstResult.player.pokemon.status,
    opponentCurrentHp: fasterOpponentState.opponent.pokemon.currentHp,
    opponentStatus: fasterOpponentState.opponent.pokemon.status,
    attackHitTarget: "player",
  });
  assert.deepEqual(opponentFirstResult.messageHpSnapshots?.[1], {
    playerCurrentHp: opponentFirstResult.player.pokemon.currentHp,
    playerStatus: opponentFirstResult.player.pokemon.status,
    opponentCurrentHp: opponentFirstResult.opponent.pokemon.currentHp,
    opponentStatus: opponentFirstResult.opponent.pokemon.status,
    attackHitTarget: "opponent",
  });

  const afterFirstMessage = popBattleMessage(opponentFirstResult);
  assert.equal(afterFirstMessage.messageQueue[0], "치코리타의 몸통박치기!");
  assert.deepEqual(
    afterFirstMessage.messageHpSnapshots?.[0],
    opponentFirstResult.messageHpSnapshots?.[1],
  );
});

test("ROM 기술 우선도는 스피드보다 먼저 적용한다", function testCase() {
  const state = createSpeedOrderBattleState({ playerSpeed: 10, opponentSpeed: 100 });
  const playerPokemon = {
    ...state.player.pokemon,
    moves: [{ ...state.player.pokemon.moves[0]!, priority: 1 }],
  };
  state.player.pokemon = playerPokemon;
  state.player.party[0] = { slotIndex: 0, pokemon: playerPokemon };

  const resolved = choosePlayerMove(state, 0, { random: () => 0.99 });

  assert.equal(resolved.messageQueue[0], "치코리타의 몸통박치기!");
});

test("ROM 부가 효과 확률을 그대로 적용한다", function testCase() {
  const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 10 });
  const playerPokemon = {
    ...state.player.pokemon,
    moves: [
      {
        ...state.player.pokemon.moves[0]!,
        effectCode: 6,
        effectChance: 30,
      },
    ],
  };
  state.player.pokemon = playerPokemon;
  state.player.party[0] = { slotIndex: 0, pokemon: playerPokemon };

  const resolved = choosePlayerMove(state, 0, { random: () => 0.2 });

  assert.equal(resolved.opponent.pokemon.status, "paralyzed");
});

test("고정 피해 기술은 타입 면역만 유지하고 배율·급소·난수를 우회한다", function testCase() {
  const cases = [
    { id: 82, name: "용의분노", effectCode: 41, typeId: 16, defenderTypeId: 8, damage: 40 },
    { id: 49, name: "소닉붐", effectCode: 130, typeId: 0, defenderTypeId: 5, damage: 20 },
    { id: 49, name: "소닉붐", effectCode: 130, typeId: 0, defenderTypeId: 7, damage: 0 },
  ];

  for (const fixedDamageMove of cases) {
    const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 1 });
    state.player.pokemon.moves = [
      {
        ...state.player.pokemon.moves[0]!,
        id: fixedDamageMove.id,
        name: fixedDamageMove.name,
        category: "special",
        effectCode: fixedDamageMove.effectCode,
        typeId: fixedDamageMove.typeId,
      },
    ];
    state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
    state.opponent.pokemon = {
      ...state.opponent.pokemon,
      typeIds: [fixedDamageMove.defenderTypeId],
      moves: [],
    };
    state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
    let randomCalls = 0;

    const resolved = choosePlayerMove(state, 0, {
      random: () => {
        randomCalls += 1;
        return 0;
      },
    });

    assert.equal(
      resolved.opponent.pokemon.currentHp,
      state.opponent.pokemon.currentHp - fixedDamageMove.damage,
    );
    assert.equal(randomCalls, 1);
    assert.deepEqual(resolved.messageQueue, [
      `치코리타의 ${fixedDamageMove.name}!`,
      ...(fixedDamageMove.damage === 0 ? ["효과가 없는 것 같다..."] : []),
    ]);
  }
});

test("웅크리기는 상대를 공격하지 않고 사용자의 방어를 올린다", function testCase() {
  const initialState = createSampleBattleState();
  const defenseCurl = {
    ...initialState.player.pokemon.moves[0],
    id: 111,
    name: "웅크리기",
    category: "status" as const,
    effectCode: 156,
    power: 0,
    accuracy: 0,
  };
  const state: BattleScreenState = {
    ...initialState,
    phase: "move-select",
    messageQueue: [],
    player: {
      ...initialState.player,
      pokemon: {
        ...initialState.player.pokemon,
        moves: [defenseCurl],
      },
    },
    opponent: {
      ...initialState.opponent,
      pokemon: {
        ...initialState.opponent.pokemon,
        moves: [],
      },
    },
  };

  const resolved = choosePlayerMove(state, 0, { random: () => 0.5 });

  assert.equal(resolved.player.pokemon.statStages.defense, 1);
  assert.equal(resolved.opponent.pokemon.statStages.defense, 0);
  assert.equal(resolved.opponent.pokemon.currentHp, state.opponent.pokemon.currentHp);
  assert.equal(resolved.messageQueue.includes("치코리타의 방어가 올랐다!"), true);
  assert.ok(
    resolved.messageHpSnapshots?.every(function testItem(snapshot) {
      return snapshot.attackHitTarget === null;
    }),
  );
});

test("미지원 상태 기술만 남으면 무효 공격 대신 발버둥을 사용한다", function testCase() {
  const initialState = createSampleBattleState();
  const unsupportedMove = {
    ...initialState.player.pokemon.moves[0],
    id: 97,
    name: "고속이동",
    category: "status" as const,
    effectCode: 52,
    power: 0,
    accuracy: 0,
    competitiveEffectSupport: "unsupported-primary" as const,
  };
  const state: BattleScreenState = {
    ...initialState,
    phase: "command",
    messageQueue: [],
    player: {
      ...initialState.player,
      pokemon: {
        ...initialState.player.pokemon,
        moves: [unsupportedMove],
      },
    },
    opponent: {
      ...initialState.opponent,
      pokemon: {
        ...initialState.opponent.pokemon,
        moves: [],
      },
    },
  };

  const resolved = chooseBattleCommand(state, "fight", { random: () => 0.5 });

  assert.equal(resolved.messageQueue[0], "치코리타의 발버둥!");
  assert.ok(resolved.opponent.pokemon.currentHp < state.opponent.pokemon.currentHp);
});

test("선두가 쓰러지고 생존한 벤치가 있으면 패배 대신 강제 교체로 진행한다", function testCase() {
  const state = choosePlayerMove(createTwoPokemonBattleState(), 0, {
    random: () => 0.5,
  });

  assert.equal(state.phase, "party-select");
  assert.equal(isForcedPartySwitch(state), true);
  assert.equal(state.turn, 2);
  assert.equal(state.result, null);
  assert.equal(state.player.pokemon.status, "fainted");
  assert.equal(state.player.pokemon.currentHp, 0);
  assert.equal(state.player.party[0]?.pokemon?.status, "fainted");
  assert.equal(
    state.messageQueue.some(function testItem(message) {
      return message === "패배했다!";
    }),
    false,
  );
  assert.equal(state.messageQueue.includes(BATTLE_END_CONFIRM_MESSAGE), false);
  assert.equal(state.messageQueue.at(-1), "교체할 포켓몬을 선택해 주세요.");
});

test("강제 교체는 상대의 추가 공격이나 턴 증가 없이 명령 선택으로 돌아간다", function testCase() {
  const faintState = drainBattleMessages(
    choosePlayerMove(createTwoPokemonBattleState(), 0, {
      random: () => 0.5,
    }),
  );
  const turnBeforeSwitch = faintState.turn;
  const opponentPpBeforeSwitch = faintState.opponent.pokemon.moves[0]?.pp;
  const reserveHpBeforeSwitch = faintState.player.party[1]?.pokemon?.currentHp;
  const switchedState = choosePartySlot(faintState, 1);

  assert.equal(switchedState.phase, "resolving");
  assert.equal(isForcedPartySwitch(switchedState), false);
  assert.equal(switchedState.player.activePartySlotIndex, 1);
  assert.equal(switchedState.player.pokemon.name, "브케인");
  assert.equal(switchedState.turn, turnBeforeSwitch);
  assert.equal(switchedState.opponent.pokemon.moves[0]?.pp, opponentPpBeforeSwitch);
  assert.equal(switchedState.player.pokemon.currentHp, reserveHpBeforeSwitch);
  assert.deepEqual(switchedState.messageQueue, ["브케인, 부탁해!"]);
  assert.equal(popBattleMessage(switchedState).phase, "command");
});

test("교체할 수 있는 포켓몬이 없을 때만 전투 패배로 종료한다", function testCase() {
  const state = createTwoPokemonBattleState();
  state.player.party[1] = { slotIndex: 1, pokemon: null };

  const defeatedState = choosePlayerMove(state, 0, {
    random: () => 0.5,
  });

  assert.equal(defeatedState.phase, "ended");
  assert.equal(defeatedState.result?.winnerPlayerId, state.opponent.playerId);
  assert.equal(defeatedState.result?.reason, "faint");
  assert.equal(defeatedState.messageQueue.includes("패배했다!"), true);
  assert.equal(defeatedState.messageQueue.includes(BATTLE_END_CONFIRM_MESSAGE), true);
});

test("전투 중 자발적 교체는 가능하고 상대 턴을 한 번 소모한다", function testCase() {
  const initialState = createTwoPokemonBattleState({ reserveHp: 999 });
  initialState.phase = "command";
  initialState.player.pokemon = {
    ...initialState.player.pokemon,
    currentHp: initialState.player.pokemon.maxHp,
    status: "normal",
  };
  initialState.player.party[0] = {
    slotIndex: 0,
    pokemon: initialState.player.pokemon,
  };
  const partyState = chooseBattleCommand(initialState, "pokemon");
  const opponentPpBeforeSwitch = partyState.opponent.pokemon.moves[0]?.pp;
  const reserveHpBeforeSwitch = partyState.player.party[1]?.pokemon?.currentHp ?? 0;
  const switchedState = choosePartySlot(partyState, 1);

  assert.equal(partyState.phase, "party-select");
  assert.equal(isForcedPartySwitch(partyState), false);
  assert.equal(switchedState.player.activePartySlotIndex, 1);
  assert.equal(switchedState.turn, initialState.turn + 1);
  assert.equal(switchedState.opponent.pokemon.moves[0]?.pp, (opponentPpBeforeSwitch ?? 0) - 1);
  assert.ok(switchedState.player.pokemon.currentHp < reserveHpBeforeSwitch);
  assert.equal(switchedState.result, null);
});

test("턴 종료 독 피해로 선두가 쓰러져도 생존한 벤치로 교체한다", function testCase() {
  const state = createTwoPokemonBattleState();
  state.player.pokemon = {
    ...state.player.pokemon,
    currentHp: 1,
    speed: 100,
    status: "poisoned",
  };
  state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
  state.opponent.pokemon = {
    ...state.opponent.pokemon,
    currentHp: state.opponent.pokemon.maxHp,
    moves: [],
    speed: 1,
  };
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };

  const faintState = choosePlayerMove(state, 0, { random: () => 0.5 });

  assert.equal(faintState.phase, "party-select");
  assert.equal(isForcedPartySwitch(faintState), true);
  assert.equal(faintState.player.pokemon.status, "fainted");
  assert.equal(faintState.messageQueue.includes("치코리타는 독 데미지를 입었다!"), true);
  assert.equal(faintState.result, null);
});

test("양쪽 기술 PP가 모두 0이면 발버둥으로 턴을 계속한다", function testCase() {
  const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 1 });
  state.player.pokemon.moves = state.player.pokemon.moves.map(function mapItem(move) {
    return { ...move, pp: 0 };
  });
  state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
  state.opponent.pokemon.moves = state.opponent.pokemon.moves.map(function mapItem(move) {
    return { ...move, pp: 0 };
  });
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
  state.phase = "command";

  const resolvedState = chooseBattleCommand(state, "fight", { random: () => 0.5 });

  assert.notEqual(resolvedState.phase, "move-select");
  assert.equal(resolvedState.selectedMoveId, 165);
  assert.equal(resolvedState.messageQueue.includes("치코리타의 발버둥!"), true);
  assert.equal(resolvedState.messageQueue.includes("브케인의 발버둥!"), true);
  assert.equal(resolvedState.player.pokemon.moves[0]?.pp, 0);
  assert.equal(resolvedState.opponent.pokemon.moves[0]?.pp, 0);
  assert.equal(resolvedState.messageQueue.includes("치코리타는 반동 데미지를 입었다!"), true);
  assert.ok(resolvedState.player.pokemon.currentHp < state.player.pokemon.currentHp);
  assert.ok(resolvedState.opponent.pokemon.currentHp < state.opponent.pokemon.currentHp);
});

test("상대 발버둥은 도주·포획 실패와 가방 사용 뒤에도 반동과 승패를 적용한다", function testCase() {
  const createState = (phase: "command" | "bag-select") => {
    const state = createOpponentAttackBattleState(phase);
    state.opponent.pokemon = {
      ...state.opponent.pokemon,
      currentHp: 1,
      moves: state.opponent.pokemon.moves.map(function mapItem(move) {
        return { ...move, pp: 0 };
      }),
    };
    state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
    state.player.pokemon = {
      ...state.player.pokemon,
      currentHp: state.player.pokemon.maxHp - 10,
    };
    state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
    return state;
  };
  const resolvedStates = [
    chooseBattleCommand(createState("command"), "run", { randomByte: () => 255 }),
    chooseBattleBagItem(createState("bag-select"), "pokeball", {
      itemCount: 1,
      captureRandom16: () => 65_535,
    }),
    chooseBattleBagItem(createState("bag-select"), "potion", { itemCount: 1 }),
  ];

  for (const state of resolvedStates) {
    assert.equal(state.opponent.pokemon.status, "fainted");
    assert.equal(state.result?.winnerPlayerId, state.player.playerId);
    assert.equal(
      state.messageQueue.some(function testItem(message) {
        return message.includes("반동 데미지");
      }),
      true,
    );
  }
});

test("턴 종료 양쪽이 동시에 쓰러지면 두 벤치 교체 상태를 모두 반영한다", function testCase() {
  const state = createTwoPokemonBattleState();
  const opponentReserve = {
    ...clonePokemon(state.opponent.pokemon),
    name: "리아코",
    status: "normal" as const,
    currentHp: state.opponent.pokemon.maxHp,
  };
  state.phase = "move-select";
  state.player.pokemon = {
    ...state.player.pokemon,
    status: "poisoned",
    currentHp: 1,
    speed: 999,
  };
  state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
  state.opponent.pokemon = {
    ...state.opponent.pokemon,
    status: "poisoned",
    currentHp: 1,
    moves: [],
  };
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
  state.opponent.party[1] = { slotIndex: 1, pokemon: opponentReserve };
  state.player.pokemon.moves = state.player.pokemon.moves.map(function mapItem(move) {
    return {
      ...move,
      category: "status" as const,
      effectCode: 999,
      power: 0,
    };
  });

  const resolvedState = choosePlayerMove(state, 0, { random: () => 0.5 });

  assert.equal(resolvedState.phase, "party-select");
  assert.equal(resolvedState.player.pokemon.status, "fainted");
  assert.equal(resolvedState.opponent.activePartySlotIndex, 1);
  assert.equal(resolvedState.opponent.party[1]?.pokemon?.name, "리아코");
  assert.equal(resolvedState.opponent.pokemon.status, "normal");
});

test("플레이어 발버둥으로 양쪽 마지막 포켓몬이 쓰러지면 반동 사용자가 패배한다", function testCase() {
  const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 1 });
  state.phase = "command";
  state.player.pokemon = {
    ...state.player.pokemon,
    currentHp: 1,
    moves: state.player.pokemon.moves.map(function mapItem(move) {
      return { ...move, pp: 0 };
    }),
  };
  state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
  state.opponent.pokemon = {
    ...state.opponent.pokemon,
    currentHp: 1,
    moves: state.opponent.pokemon.moves.map(function mapItem(move) {
      return { ...move, pp: 0 };
    }),
  };
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };

  const resolvedState = chooseBattleCommand(state, "fight", { random: () => 0.5 });

  assert.equal(resolvedState.player.pokemon.currentHp, 0);
  assert.equal(resolvedState.opponent.pokemon.currentHp, 0);
  assert.equal(resolvedState.result?.winnerPlayerId, state.opponent.playerId);
});

test("상대 선두가 쓰러져도 생존한 벤치가 있으면 교체하고 전투를 계속한다", function testCase() {
  const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 1 });
  const reservePokemon = {
    ...clonePokemon(state.opponent.pokemon),
    name: "리아코",
    currentHp: state.opponent.pokemon.maxHp,
    status: "normal" as const,
  };
  state.battleKind = "trainer";
  state.player.pokemon.moves[0] = {
    ...state.player.pokemon.moves[0],
    power: 999,
  };
  state.opponent.pokemon.currentHp = 1;
  state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };
  state.opponent.party[1] = { slotIndex: 1, pokemon: reservePokemon };

  const switchedState = choosePlayerMove(state, 0, { random: () => 0.5 });

  assert.equal(switchedState.phase, "resolving");
  assert.equal(switchedState.result, null);
  assert.equal(switchedState.opponent.activePartySlotIndex, 1);
  assert.equal(switchedState.opponent.pokemon.name, "리아코");
  assert.equal(switchedState.messageQueue.includes("승리했다!"), false);
  assert.equal(switchedState.messageQueue.includes(BATTLE_END_CONFIRM_MESSAGE), false);
  assert.equal(drainBattleMessages(switchedState).phase, "command");
});

test("독 기술은 기존 화상이나 마비 상태를 덮어쓰지 않는다", function testCase() {
  for (const status of ["burned", "paralyzed"] as const) {
    const state = createSpeedOrderBattleState({ playerSpeed: 100, opponentSpeed: 1 });
    state.player.pokemon.moves[0] = {
      ...state.player.pokemon.moves[0],
      category: "status",
      effectCode: 66,
      power: 0,
    };
    state.player.party[0] = { slotIndex: 0, pokemon: state.player.pokemon };
    state.opponent.pokemon.status = status;
    state.opponent.pokemon.moves = [];
    state.opponent.party[0] = { slotIndex: 0, pokemon: state.opponent.pokemon };

    const resolvedState = choosePlayerMove(state, 0, { random: () => 0.5 });

    assert.equal(resolvedState.opponent.pokemon.status, status);
    assert.equal(resolvedState.messageQueue.includes(`브케인은 이미 상태 이상이다!`), true);
  }
});

function createTwoPokemonBattleState({ reserveHp = 43 } = {}): BattleScreenState {
  const baseState = createSampleBattleState();
  const playerPokemon: BattlePokemon = {
    ...clonePokemon(baseState.player.pokemon),
    currentHp: 1,
    speed: 1,
    status: "normal",
  };
  const reservePokemon: BattlePokemon = {
    ...clonePokemon(baseState.opponent.pokemon),
    currentHp: reserveHp,
    maxHp: Math.max(reserveHp, baseState.opponent.pokemon.maxHp),
    status: "normal",
  };
  const opponentPokemon: BattlePokemon = {
    ...clonePokemon(baseState.opponent.pokemon),
    speed: 100,
    status: "normal",
    moves: [
      {
        ...baseState.opponent.pokemon.moves[0],
        accuracy: 100,
        pp: 10,
        maxPp: 10,
        power: 40,
      },
    ],
  };

  return {
    ...baseState,
    phase: "move-select",
    messageQueue: [],
    player: {
      ...baseState.player,
      pokemon: playerPokemon,
      activePartySlotIndex: 0,
      party: baseState.player.party.map(function mapItem(slot) {
        if (slot.slotIndex === 0) {
          return { ...slot, pokemon: playerPokemon };
        }

        if (slot.slotIndex === 1) {
          return { ...slot, pokemon: reservePokemon };
        }

        return slot;
      }),
    },
    opponent: {
      ...baseState.opponent,
      pokemon: opponentPokemon,
      party: baseState.opponent.party.map(function mapItem(slot) {
        return slot.slotIndex === 0 ? { ...slot, pokemon: opponentPokemon } : slot;
      }),
    },
    selectedMoveId: null,
    result: null,
  };
}

function createOpponentAttackBattleState(
  phase: Extract<BattleScreenState["phase"], "command" | "bag-select">,
): BattleScreenState {
  const state = createSampleBattleState();
  const playerPokemon = {
    ...clonePokemon(state.player.pokemon),
    speed: 1,
    status: "normal" as const,
  };
  const opponentPokemon = {
    ...clonePokemon(state.opponent.pokemon),
    speed: 999,
    status: "normal" as const,
    moves: state.opponent.pokemon.moves.slice(0, 1).map(function mapItem(move) {
      return {
        ...move,
        accuracy: 100,
        name: "검증공격",
        power: 80,
        pp: 10,
        maxPp: 10,
      };
    }),
  };

  return {
    ...state,
    battleKind: "wild",
    phase,
    messageQueue: [],
    player: {
      ...state.player,
      pokemon: playerPokemon,
      party: state.player.party.map(function mapItem(slot) {
        return slot.slotIndex === state.player.activePartySlotIndex
          ? { ...slot, pokemon: playerPokemon }
          : slot;
      }),
    },
    opponent: {
      ...state.opponent,
      pokemon: opponentPokemon,
      party: state.opponent.party.map(function mapItem(slot) {
        return slot.slotIndex === state.opponent.activePartySlotIndex
          ? { ...slot, pokemon: opponentPokemon }
          : slot;
      }),
    },
  };
}

function createSpeedOrderBattleState({
  playerSpeed,
  opponentSpeed,
}: {
  playerSpeed: number;
  opponentSpeed: number;
}): BattleScreenState {
  const baseState = createSampleBattleState();
  const tackle = {
    ...baseState.player.pokemon.moves[0],
    id: 33,
    name: "몸통박치기",
    effectCode: 0,
    category: "physical" as const,
    power: 1,
    accuracy: 100,
    pp: 35,
    maxPp: 35,
  };
  const playerPokemon = {
    ...clonePokemon(baseState.player.pokemon),
    speed: playerSpeed,
    moves: [{ ...tackle }],
  };
  const opponentPokemon = {
    ...clonePokemon(baseState.opponent.pokemon),
    speed: opponentSpeed,
    moves: [{ ...tackle }],
  };

  return {
    ...baseState,
    phase: "move-select",
    messageQueue: [],
    player: {
      ...baseState.player,
      pokemon: playerPokemon,
      party: baseState.player.party.map(function mapItem(slot) {
        return slot.slotIndex === baseState.player.activePartySlotIndex
          ? { ...slot, pokemon: playerPokemon }
          : slot;
      }),
    },
    opponent: {
      ...baseState.opponent,
      pokemon: opponentPokemon,
      party: baseState.opponent.party.map(function mapItem(slot) {
        return slot.slotIndex === baseState.opponent.activePartySlotIndex
          ? { ...slot, pokemon: opponentPokemon }
          : slot;
      }),
    },
    selectedMoveId: null,
    result: null,
  };
}

function clonePokemon(pokemon: BattlePokemon): BattlePokemon {
  return {
    ...pokemon,
    baseStats: { ...pokemon.baseStats },
    individualValues: { ...pokemon.individualValues },
    statStages: { ...pokemon.statStages },
    frontSprite: { ...pokemon.frontSprite },
    backSprite: { ...pokemon.backSprite },
    moves: pokemon.moves.map(function mapItem(move) {
      return { ...move };
    }),
  };
}

function drainBattleMessages(state: BattleScreenState): BattleScreenState {
  let nextState = state;

  while (nextState.messageQueue.length > 0) {
    nextState = popBattleMessage(nextState);
  }

  return nextState;
}
