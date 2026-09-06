import assert from "node:assert/strict";
import test from "node:test";
import {
  MOVE_ANIMATION_CATALOG as catalog,
  getEffectActorMotion,
  getEffectParticles,
  getBattleEffectTiming,
  getMoveAnimationProfile,
  type BattleAnimationCue,
} from "./move-animation-model";
const cue = (id: number, hit = true): BattleAnimationCue => ({
  kind: "move",
  source: "player",
  target: "opponent",
  moveId: id,
  status: "normal",
  hit,
  damage: hit ? 10 : 0,
});
const origin = { x: 60, y: 122 },
  target = { x: 190, y: 70 };

test("470개 기술과 원본 상태 파티클이 실제 아틀라스 좌표로 연결된다", () => {
  assert.equal(catalog.source.parsedScripts, 551);
  assert.equal(Object.keys(catalog.moves).length, 470);
  assert.equal(catalog.source.particleResources, 486);
  assert.ok(catalog.statuses.poisoned!.emit.some(e => e.resource === "27:7"));
  assert.ok(catalog.statuses.burned!.emit.some(e => e.resource === "27:2"));
  assert.ok(catalog.statuses.paralyzed!.emit.some(e => e.resource === "115:1"));
  for (const profile of [...Object.values(catalog.moves), ...Object.values(catalog.statuses)])
    for (const binding of profile.emit) {
      const emitter = catalog.emitters[binding.resource];
      assert.ok(emitter);
      for (const id of emitter.frames) {
        const f = catalog.frames[id]!;
        assert.ok(f);
        assert.ok(
          f.x >= 0 &&
            f.y >= 0 &&
            f.width > 0 &&
            f.height > 0 &&
            f.x + f.width <= 1024 &&
            f.y + f.height <= 1024,
        );
      }
    }
  assert.notDeepEqual(catalog.moves[52]!.emit, catalog.moves[55]!.emit);
  assert.notDeepEqual(catalog.moves[55]!.emit, catalog.moves[85]!.emit);
});

test("기술 전체 프레임은 결정적이고 파티클 예산을 초과하지 않는다", () => {
  for (let id = 1; id <= 470; id++)
    for (const progress of [0, 0.2, 0.45, 0.65, 0.9, 1]) {
      const effect = { key: 1, cue: cue(id), progress };
      const particles = getEffectParticles(effect, origin, target);
      assert.deepEqual(getEffectParticles(effect, origin, target), particles);
      assert.ok(particles.length <= 56);
      for (const p of particles)
        for (const key of ["x", "y", "width", "height", "alpha", "rotation"] as const)
          assert.ok(Number.isFinite(p[key]), `${id}:${key}`);
      assert.ok(getEffectParticles(effect, origin, target, true).length <= 8);
    }
  assert.equal(getMoveAnimationProfile(cue(99999)), catalog.fallback);
});

test("공중날기·구멍파기·다이빙은 숨김 이후 원위치와 불투명도를 복구한다", () => {
  for (const id of [19, 91, 291, 340, 467]) {
    const effect = { key: 1, cue: cue(id), progress: 0.3 };
    assert.equal(getEffectActorMotion(effect, "player", origin, target).alpha, 0);
    const ended = getEffectActorMotion({ ...effect, progress: 1 }, "player", origin, target);
    assert.deepEqual(ended, { x: 0, y: 0, alpha: 1, scale: 1, rotation: 0, tint: null });
    assert.equal(getEffectActorMotion(effect, "player", origin, target, true).alpha, 1);
    const incoming = {
      ...effect,
      cue: { ...effect.cue, source: "opponent" as const, target: "player" as const },
    };
    assert.equal(getEffectActorMotion(incoming, "opponent", target, origin).alpha, 0);
  }
  assert.ok(
    getEffectActorMotion({ key: 1, cue: cue(19), progress: 0.12 }, "player", origin, target).y < 0,
  );
  assert.ok(
    getEffectActorMotion({ key: 1, cue: cue(91), progress: 0.12 }, "player", origin, target).y > 0,
  );
});

test("빗나감·상태이상에는 공격 대상 피격 흔들림이 없다", () => {
  const missed = { key: 1, cue: cue(33, false), progress: 0.48 };
  assert.equal(getEffectActorMotion(missed, "opponent", target, origin).x, 0);
  assert.equal(getEffectParticles(missed, origin, target).length, 0);
  for (const status of ["poisoned", "burned", "paralyzed"] as const) {
    const e = {
      key: 1,
      cue: { ...cue(0), kind: "status" as const, target: "player" as const, status, hit: false },
      progress: 0.3,
    };
    assert.equal(getEffectActorMotion(e, "opponent", target, origin).x, 0);
    assert.ok(getEffectParticles(e, origin, target).length > 0);
  }
  assert.equal(getBattleEffectTiming(cue(19)).durationMs, 1800);
});
