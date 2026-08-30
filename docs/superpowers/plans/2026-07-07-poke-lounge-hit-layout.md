# Poke Lounge Hit And Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포케라운지 전투 피격 연출과 4:3/모바일 overflow 검증을 추가한다.

**Architecture:** 전투 피격 연출은 `BattleScene`의 HP 동기화 흐름에 side별 render-only state를 붙인다. 레이아웃은 `poke-lounge.module.css`에서 캔버스와 모바일 컨트롤 영역의 계산값을 CSS 변수로 정리하고, E2E는 실제 DOM rect로 4:3과 뷰포트 범위를 검증한다.

**Tech Stack:** Next.js app router, CSS Modules, Phaser, Playwright E2E, TypeScript.

## Global Constraints

- 커밋 메시지는 `type(scope):요약` 형식, `:` 뒤 공백 없음, 한글 요약 포함.
- 새 파일명은 케밥 케이스.
- 4:3 고정 대상은 `#game-root` 캔버스다.
- 모바일 조작 UI는 캔버스 밖 별도 영역으로 유지하되 뷰포트 밖으로 넘지 않게 한다.
- 전투 로직 결과는 변경하지 않고 렌더링 피드백만 추가한다.

---

### Task 1: Battle Hit Animation

**Files:**

- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`

**Interfaces:**

- Produces: `hitAnimationPlaying`, `hitAnimationStartedCount`, `player.hitAnimationStartedCount`, `opponent.hitAnimationStartedCount` in the battle E2E snapshot.

- [ ] Add a failing E2E assertion that HP decrease increments hit animation counters.
- [ ] Add side별 피격 render state and trigger it when synced HP target decreases.
- [ ] Apply side별 shake/alpha feedback while drawing battle sprites.
- [ ] Run the targeted E2E test.

### Task 2: 4:3 And Mobile Bounds

**Files:**

- Modify: `apps/web/src/components/poke-lounge/poke-lounge.module.css`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`

**Interfaces:**

- Produces: DOM rect assertions for canvas ratio and mobile controls bounds.

- [ ] Add failing E2E assertions for 4:3 canvas ratio, no document overflow, and mobile controls within viewport on a short mobile viewport.
- [ ] Refactor mobile control sizing into CSS variables with short-height clamps.
- [ ] Keep `#game-root` 4:3 while reserving enough mobile controls height.
- [ ] Run the targeted E2E test.

### Task 3: Full Verification And Merge

**Files:**

- No new app files.

- [ ] Run focused Poke Lounge E2E.
- [ ] Run web typecheck/lint/build.
- [ ] Commit feature branch.
- [ ] Update `main`, merge with squash, push.
- [ ] Verify production URL after deployment.
