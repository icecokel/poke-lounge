import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedAnimationEvent } from "@poke-lounge/battle/battle-presentation";
import {
  createAuthoritativeEffectSequence,
  createLocalEffectSequence,
} from "./battle-effect-sequence";
import { createSampleBattleState } from "./battle-sample-state";
import type { BattleScreenState, BattleMessageHpSnapshot } from "./battle-types";
import type { CompetitiveProjection } from "../network/local-preview-room";
import { loadPublicRuntimeGameDataFixture } from "../testing/runtime-rom-data.fixture";
import { resetRuntimeGameDataJsonStateForTest } from "../data/game-data-json";

test.before(loadPublicRuntimeGameDataFixture);
test.after(resetRuntimeGameDataJsonStateForTest);

function fixture() {
  const state = createSampleBattleState();
  const event: ResolvedAnimationEvent = {
    kind: "move",
    actorPlayerId: state.player.playerId,
    targetPlayerId: state.opponent.playerId,
    actorSlotIndex: state.player.activePartySlotIndex,
    targetSlotIndex: state.opponent.activePartySlotIndex,
    moveId: 85,
    status: "normal",
    hit: true,
    damage: 6,
    actorHp: 30,
    targetHp: 12,
    actorStatus: "normal",
    targetStatus: "normal",
  };
  const projection = {
    playerIds: [state.player.playerId, state.opponent.playerId],
    currentTurn: 3,
    currentState: { lastTurnPresentation: { turn: 2, events: [event] } },
  } as CompetitiveProjection;
  return { state, event, projection };
}
function hpSnapshot(state: BattleScreenState): BattleMessageHpSnapshot {
  return {
    playerCurrentHp: state.player.pokemon.currentHp,
    opponentCurrentHp: state.opponent.pokemon.currentHp,
    playerStatus: "normal",
    opponentStatus: "normal",
    attackHitTarget: null,
  };
}

test("서버 기술 연출은 공격 방향과 해당 시점 HP를 보존한다", () => {
  const { state, event, projection } = fixture();
  const before = JSON.stringify(projection);
  assert.deepEqual(createAuthoritativeEffectSequence(projection, state), [
    {
      cue: {
        kind: "move",
        source: "player",
        target: "opponent",
        moveId: 85,
        status: "normal",
        hit: true,
        damage: 6,
      },
      targets: { player: { hp: 30, status: "normal" }, opponent: { hp: 12, status: "normal" } },
    },
  ]);
  assert.equal(JSON.stringify(projection), before);
  event.actorPlayerId = state.opponent.playerId;
  event.targetPlayerId = state.player.playerId;
  event.actorSlotIndex = state.opponent.activePartySlotIndex;
  event.targetSlotIndex = state.player.activePartySlotIndex;
  const incoming = createAuthoritativeEffectSequence(projection, state)[0]!;
  assert.equal(incoming.cue.source, "opponent");
  assert.equal(incoming.cue.target, "player");
  assert.equal(incoming.targets?.player?.hp, 12);
});

test("관전자 시점이 반대여도 공격자·피격 대상이 뒤바뀌지 않는다", () => {
  const { state, projection } = fixture();
  const reversed = { ...state, player: state.opponent, opponent: state.player };
  const effect = createAuthoritativeEffectSequence(projection, reversed)[0]!;
  assert.equal(effect.cue.source, "opponent");
  assert.equal(effect.cue.target, "player");
});

test("지난 슬롯·이전 턴·연출 없는 구버전 응답은 새 포켓몬에 재생하지 않는다", () => {
  const { state, event, projection } = fixture();
  const oldSlot = event.actorSlotIndex;
  event.actorSlotIndex = (oldSlot + 1) % 6;
  assert.deepEqual(createAuthoritativeEffectSequence(projection, state), []);
  event.actorSlotIndex = oldSlot;
  projection.currentTurn = 4;
  assert.deepEqual(createAuthoritativeEffectSequence(projection, state), []);
  delete projection.currentState.lastTurnPresentation;
  assert.deepEqual(createAuthoritativeEffectSequence(projection, state), []);
});

test("명중 다음의 화상 지속 피해는 별도 연출과 HP로 순서를 유지한다", () => {
  const { state, event, projection } = fixture();
  const tick: ResolvedAnimationEvent = {
    ...event,
    kind: "status",
    moveId: 0,
    status: "burned",
    hit: false,
    damage: 2,
    actorPlayerId: event.targetPlayerId,
    actorSlotIndex: event.targetSlotIndex,
    actorHp: 10,
    targetHp: 10,
    actorStatus: "burned",
    targetStatus: "burned",
  };
  projection.currentState.lastTurnPresentation!.events.push(tick);
  const effects = createAuthoritativeEffectSequence(projection, state);
  assert.deepEqual(
    effects.map(effect => effect.cue.kind),
    ["move", "status"],
  );
  assert.equal(effects[0]?.targets?.opponent?.hp, 12);
  assert.equal(effects[1]?.targets?.opponent?.hp, 10);
  assert.equal(effects[1]?.cue.source, "opponent");
  assert.equal(effects[1]?.cue.target, "opponent");
});

test("로컬 기술과 새 상태이상은 순서대로 재생하고 같은 메시지 갱신은 중복하지 않는다", () => {
  const { state } = fixture();
  const snapshot = hpSnapshot(state);
  snapshot.opponentStatus = "poisoned";
  snapshot.animation = {
    kind: "move",
    source: "player",
    target: "opponent",
    moveId: 92,
    status: "normal",
    hit: true,
    damage: 0,
  };
  const next = { ...state, messageHpSnapshots: [snapshot] };
  const effects = createLocalEffectSequence(state, next, { player: "normal", opponent: "normal" });
  assert.deepEqual(
    effects.map(effect => effect.cue.kind),
    ["move", "status"],
  );
  assert.equal(effects[1]?.cue.status, "poisoned");
  assert.equal(effects[1]?.cue.damage, 0);
  assert.deepEqual(
    createLocalEffectSequence(next, next, { player: "normal", opponent: "normal" }),
    [],
  );
  assert.equal(
    createLocalEffectSequence(state, next, { player: "normal", opponent: "poisoned" }).length,
    1,
  );
});

test("로컬 회복·일반 메시지는 공격 연출을 발생시키지 않는다", () => {
  const { state } = fixture();
  const next = { ...state, messageHpSnapshots: [hpSnapshot(state)] };
  assert.deepEqual(
    createLocalEffectSequence(state, next, { player: "normal", opponent: "normal" }),
    [],
  );
  assert.deepEqual(
    createLocalEffectSequence(
      state,
      { ...next, messageHpSnapshots: [] },
      { player: "normal", opponent: "normal" },
    ),
    [],
  );
});

test("구멍파기의 ANIM_TARGET_MISC 먼지는 투사체가 아니라 공격자의 잠복 위치에 남는다", async () => {
  const { getEffectParticles, getMoveAnimationProfile } = await import("./move-animation-model");
  const cue = {
    kind: "move" as const,
    source: "player" as const,
    target: "opponent" as const,
    moveId: 91,
    status: "normal" as const,
    hit: true,
    damage: 10,
  };
  const profile = getMoveAnimationProfile(cue);
  const dustBindings = new Set(
    profile.emit.flatMap((binding, index) => (binding.target === 17 ? [index] : [])),
  );
  assert.ok(dustBindings.size > 0);
  const origin = { x: 30, y: 150 },
    target = { x: 230, y: 40 };
  const dust = getEffectParticles({ key: 1, cue, progress: 0.15 }, origin, target).filter(
    particle => dustBindings.has(Number(particle.id.split(":")[0])),
  );
  assert.ok(dust.length > 0);
  for (const particle of dust)
    assert.ok(Math.abs(particle.x - origin.x) < 40, `${particle.id}: ${particle.x}`);
});
