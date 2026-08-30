# Poke Lounge Remaining Work Implementation Plan

> Historical implementation plan. Its REST polling and possible memory-only room statements describe the 2026-07-07 scope and are superseded by the current architecture in [Poke Lounge Game Concept](../../poke-lounge-game-concept.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining Poke Lounge work in VSCoke after the initial port, API result integration, and server-room MVP, using the latest source Poke Lounge documents as the governing scope.

**Architecture:** Keep Poke Lounge as a browser-only Phaser island under `apps/web`, with VSCoke API ownership in `apps/api`. Runtime tunable game data moves toward `apps/web/public/game-data/*.json`, while TypeScript remains responsible for validation, normalization, and scene wiring. Server multiplayer stays REST polling for this plan; WebSocket is not introduced here.

**Tech Stack:** VSCoke pnpm monorepo, Next.js 15 App Router, React 19, Phaser 3.90, NestJS 11, TypeScript, Playwright, Jest/Supertest API tests.

---

## Governing Documents

- Source Poke Lounge README: `/Users/smlee/Documents/poke-lounge/README.md`
- Source current implementation guide: `/Users/smlee/Documents/poke-lounge/docs/implementation-guide.md`
- Source game data JSON policy: `/Users/smlee/Documents/poke-lounge/docs/game-data-json-policy.md`
- Source testing guide: `/Users/smlee/Documents/poke-lounge/docs/testing-guide.md`
- Source Next.js porting guide: `/Users/smlee/Documents/poke-lounge/docs/nextjs-feature-porting-guide.md`
- Target monorepo concept: `docs/vscoke-monorepo-concept.md`
- Existing VSCoke port plan: `docs/superpowers/plans/2026-07-06-poke-lounge-port.md`
- Existing VSCoke roadmap and completion log: `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`

## Current State

- Branch: `feature/poke-lounge`
- Poke Lounge route exists at `/:locale/game/poke-lounge`.
- Poke Lounge game result submission exists through VSCoke `POKE_LOUNGE` score API.
- Server-managed room MVP exists in `apps/api/src/poke-lounge` and `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`.
- Current uncommitted work already touches:
  - `apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts`
  - `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
  - `apps/web/src/components/poke-lounge/runtime/game/world/wildEncounterTables.ts`
  - `apps/web/tests/e2e/poke-lounge.spec.ts`
- The source docs added explicit rules for wild encounter tables, battle Pokemon sprite mapping, and level-up move tables.

## Team Operating Rule

- Orchestrator: keeps the phase gate, assigns one task at a time, and decides whether the next phase may start.
- Worker: implements the current task only and leaves a focused diff.
- Reviewer: reviews the worker diff, test evidence, and source-document fit before the orchestrator opens the next task.
- No phase starts until the previous phase has a passing gate and a short completion note in this document or in `2026-07-06-poke-lounge-three-phase-roadmap.md`.

## Phase Gates

1. **Phase 1: Source Document Compliance Lock**
   - Close the current opponent ratio and wild encounter structure work.
   - No backend or JSON migration work starts until this passes.

2. **Phase 2: Game Data JSON Migration**
   - Move the documented TypeScript data candidates into validated JSON one class at a time.
   - Order: level-up moves, wild battle initial move sets, battle Pokemon asset manifest.

3. **Phase 3: Backend-Managed Multiplayer Hardening**
   - Keep REST polling, but harden contract shape, party snapshots, ready/lobby UX, and non-mock frontend API behavior.

4. **Phase 4: Final Acceptance, Screenshots, And Docs**
   - Run final focused and broad checks, capture key screenshots, and update the roadmap with verified remaining gaps.

---

## File Map

### Existing Files To Modify

- `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`: append completion notes and known gaps after each phase.
- `apps/web/tests/e2e/poke-lounge.spec.ts`: keep source-document compliance checks and add JSON migration acceptance checks.
- `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`: extend server-room coverage after API contract hardening.
- `apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts`: replace hard-coded asset table with validated manifest fallback.
- `apps/web/src/components/poke-lounge/runtime/game/battle/wildBattleFactory.ts`: replace hard-coded wild move sets with validated data.
- `apps/web/src/components/poke-lounge/runtime/game/battle/levelUpMoves.ts`: replace hard-coded level-up table with validated data.
- `apps/web/src/components/poke-lounge/runtime/game/gamePageStartup.ts`: load validated game-data JSON before creating the Phaser game.
- `apps/web/src/components/poke-lounge/runtime/game/scenes/BootScene.ts`: ensure preloaded battle Pokemon assets come from the validated manifest.
- `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`: consume hardened server room contract and party snapshot updates.
- `apps/web/src/components/poke-lounge/runtime/game/network/roomEntryScreen.ts`: expose server room create/join/ready flow without relying only on query parameters.
- `apps/api/src/poke-lounge/poke-lounge.controller.ts`: replace interface-only bodies with DTO classes and Swagger response metadata.
- `apps/api/src/poke-lounge/poke-lounge-room.service.ts`: add party snapshot state and server-side room cleanup rules.
- `apps/api/src/poke-lounge/poke-lounge-room.types.ts`: add party snapshot and explicit response types.
- `apps/api/src/poke-lounge/poke-lounge-room.service.spec.ts`: add party snapshot, cleanup, and contract edge cases.
- `apps/api/test/poke-lounge-room.e2e-spec.ts`: verify REST contract responses through Nest.

### New Files To Create

- `apps/web/public/game-data/level-up-move-table.json`
- `apps/web/public/game-data/wild-battle-move-sets.json`
- `apps/web/public/game-data/battle-pokemon-assets.json`
- `apps/web/src/components/poke-lounge/runtime/game/data/game-data-json.ts`
- `apps/api/src/poke-lounge/dto/create-poke-lounge-room.dto.ts`
- `apps/api/src/poke-lounge/dto/join-poke-lounge-room.dto.ts`
- `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts`
- `apps/api/src/poke-lounge/dto/set-poke-lounge-ready.dto.ts`
- `apps/api/src/poke-lounge/dto/submit-poke-lounge-match-result.dto.ts`
- `apps/api/src/poke-lounge/dto/update-poke-lounge-party-snapshot.dto.ts`

---

## Task 1: Source Document Compliance Lock

**Goal:** Finish the currently open frontend compliance patch for opponent Pokemon ratio and wild random encounter behavior.

**Files:**

- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/world/wildEncounterTables.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`

- [ ] **Step 1: Confirm the active diff is only the compliance patch**

Run:

```bash
git status --short --branch
git diff -- apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts apps/web/src/components/poke-lounge/runtime/game/world/wildEncounterTables.ts apps/web/tests/e2e/poke-lounge.spec.ts
```

Expected:

- Branch is `feature/poke-lounge`.
- Diff only concerns battle Pokemon asset dimensions/pathing, wild encounter table rate selection, world encounter rolling, and focused E2E assertions.

- [ ] **Step 2: Keep source-document assertions in E2E**

The focused E2E file must contain these checks:

```ts
test("브케인 상대 스프라이트는 160x80 front sheet를 사용한다", () => {
  const assets = getBattlePokemonAssets(155);

  expect(readPublicPngDimensions(assets.front.path)).toEqual({
    width: 160,
    height: 80,
  });
});

test("야생 조우 설정은 지역별 encounter rate와 slot을 함께 선택한다", () => {
  const config = selectWildEncounterConfig(
    {
      version: 1,
      defaultTableId: "default",
      tables: [
        {
          id: "default",
          mapKeys: ["town"],
          encounterRate: 0.05,
          slots: [{ speciesId: 10, name: "캐터피", minLevel: 3, maxLevel: 5, weight: 1 }],
        },
        {
          id: "rare-field",
          mapKeys: ["town"],
          areaIds: ["rare-field"],
          encounterRate: 0.42,
          slots: [{ speciesId: 16, name: "구구", minLevel: 7, maxLevel: 9, weight: 3 }],
        },
      ],
    },
    "town",
    "rare-field",
  );

  expect(config).toEqual({
    encounterRate: 0.42,
    slots: [{ speciesId: 16, name: "구구", minLevel: 7, maxLevel: 9, weight: 3 }],
  });
});
```

- [ ] **Step 3: Run focused browser verification**

Run:

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
```

Expected: all tests in `poke-lounge.spec.ts` pass.

- [ ] **Step 4: Run frontend quality gate**

Run:

```bash
pnpm type:check:web
pnpm lint:web
git diff --check
```

Expected: each command exits `0`.

- [ ] **Step 5: Record Phase 1 completion**

Append a `2026-07-07 Source Document Compliance` note to `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md` with:

- source docs read
- commands passed
- remaining gaps moved into Phase 2 and Phase 3

- [ ] **Step 6: Commit Phase 1**

```bash
git add apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts \
  apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts \
  apps/web/src/components/poke-lounge/runtime/game/world/wildEncounterTables.ts \
  apps/web/tests/e2e/poke-lounge.spec.ts \
  docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md
git commit -m "fix(poke-lounge):야생 조우와 상대 비율 정합성 수정"
```

---

## Task 2: Game Data JSON Migration

**Goal:** Follow the source JSON policy by moving the documented TypeScript data candidates into `public/game-data` with validation and safe defaults.

**Order:** level-up move table -> wild battle initial move sets -> battle Pokemon asset manifest.

### Task 2.1: Level-Up Move Table JSON

**Files:**

- Create: `apps/web/public/game-data/level-up-move-table.json`
- Create: `apps/web/src/components/poke-lounge/runtime/game/data/game-data-json.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/gamePageStartup.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/levelUpMoves.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`

- [ ] **Step 1: Create JSON data from the source documented table**

Create `apps/web/public/game-data/level-up-move-table.json`:

```json
{
  "version": 1,
  "species": {
    "1": [
      { "level": 3, "moveId": 45 },
      { "level": 7, "moveId": 73 },
      { "level": 9, "moveId": 22 },
      { "level": 13, "moveId": 77 },
      { "level": 13, "moveId": 79 }
    ],
    "2": [
      { "level": 3, "moveId": 45 },
      { "level": 7, "moveId": 73 },
      { "level": 9, "moveId": 22 },
      { "level": 13, "moveId": 77 },
      { "level": 13, "moveId": 79 }
    ],
    "3": [
      { "level": 3, "moveId": 45 },
      { "level": 7, "moveId": 73 },
      { "level": 9, "moveId": 22 },
      { "level": 13, "moveId": 77 },
      { "level": 13, "moveId": 79 }
    ],
    "4": [
      { "level": 7, "moveId": 52 },
      { "level": 10, "moveId": 108 }
    ],
    "5": [
      { "level": 7, "moveId": 52 },
      { "level": 10, "moveId": 108 }
    ],
    "6": [
      { "level": 7, "moveId": 52 },
      { "level": 10, "moveId": 108 }
    ],
    "7": [
      { "level": 7, "moveId": 145 },
      { "level": 10, "moveId": 55 }
    ],
    "8": [
      { "level": 7, "moveId": 145 },
      { "level": 10, "moveId": 55 }
    ],
    "9": [
      { "level": 7, "moveId": 145 },
      { "level": 10, "moveId": 55 }
    ],
    "10": [
      { "level": 1, "moveId": 33 },
      { "level": 1, "moveId": 81 }
    ],
    "16": [
      { "level": 5, "moveId": 28 },
      { "level": 9, "moveId": 16 },
      { "level": 13, "moveId": 98 }
    ],
    "19": [
      { "level": 4, "moveId": 98 },
      { "level": 7, "moveId": 39 },
      { "level": 13, "moveId": 116 }
    ],
    "152": [
      { "level": 6, "moveId": 75 },
      { "level": 9, "moveId": 77 },
      { "level": 12, "moveId": 235 },
      { "level": 17, "moveId": 115 },
      { "level": 20, "moveId": 345 }
    ],
    "155": [
      { "level": 6, "moveId": 108 },
      { "level": 10, "moveId": 52 },
      { "level": 13, "moveId": 98 },
      { "level": 19, "moveId": 172 }
    ],
    "158": [
      { "level": 6, "moveId": 55 },
      { "level": 8, "moveId": 99 },
      { "level": 13, "moveId": 44 },
      { "level": 15, "moveId": 184 }
    ]
  }
}
```

- [ ] **Step 2: Add a reusable JSON validator**

Create `apps/web/src/components/poke-lounge/runtime/game/data/game-data-json.ts` with pure validators for:

- object record checks
- positive integer `speciesId`
- positive integer `level`
- positive integer `moveId`
- sorted, de-duplicated move learn rows
- fallback to existing TypeScript defaults when data is missing or malformed

- [ ] **Step 3: Route `levelUpMoves.ts` through validated data**

Keep exported functions stable:

- `applyLevelUpBattleMoves`
- `applyLevelUpPlayerMoves`
- `createPlayerPokemonMoveFromRom`
- `MAX_POKEMON_MOVE_COUNT`

The module may keep the current hard-coded table as `DEFAULT_LEVEL_UP_MOVE_TABLE`, but runtime selection must prefer validated JSON data loaded during game startup.

- [ ] **Step 4: Add acceptance coverage**

Add a focused assertion to `apps/web/tests/e2e/poke-lounge.spec.ts` that verifies:

- species `155` learns move `172` at level `19`
- duplicate move ids are not learned twice
- move list remains capped at `4`

- [ ] **Step 5: Run Phase 2.1 checks**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm type:check:web
pnpm lint:web
git diff --check
```

Expected: all commands exit `0`.

### Task 2.2: Wild Battle Initial Move Sets JSON

**Files:**

- Create: `apps/web/public/game-data/wild-battle-move-sets.json`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/wildBattleFactory.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`

- [ ] **Step 1: Move `SPECIES_MOVE_SETS` into JSON**

Create `apps/web/public/game-data/wild-battle-move-sets.json`:

```json
{
  "version": 1,
  "species": {
    "1": [33, 45, 22],
    "2": [33, 45, 22],
    "3": [33, 45, 22],
    "4": [10, 45, 52],
    "5": [10, 45, 52],
    "6": [10, 45, 52],
    "7": [33, 39, 55],
    "8": [33, 39, 55],
    "9": [33, 39, 55],
    "10": [33, 81],
    "16": [33, 28, 16],
    "19": [33, 39, 98],
    "152": [33, 45],
    "155": [52, 43],
    "158": [10, 43]
  }
}
```

- [ ] **Step 2: Validate and normalize move sets**

Rules:

- species id must be a positive integer
- move id must be a positive integer
- each species gets at most 4 moves
- duplicate move ids are removed in original order
- malformed JSON falls back to the existing TypeScript defaults

- [ ] **Step 3: Keep battle factory behavior unchanged**

`createWildBattleState` must still:

- use ROM personal records for stats, catch rate, base EXP, growth rate, and types
- use ROM move records for move details
- create opponent id `wild`
- display `야생 ${encounter.name}`

- [ ] **Step 4: Run checks**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm type:check:web
pnpm lint:web
git diff --check
```

### Task 2.3: Battle Pokemon Asset Manifest JSON

**Files:**

- Create: `apps/web/public/game-data/battle-pokemon-assets.json`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/battlePokemonAssets.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/BootScene.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`

- [ ] **Step 1: Create the asset manifest**

Create `apps/web/public/game-data/battle-pokemon-assets.json` with entries for species `152`, `155`, and `158` plus the extracted range metadata for `1..10`, `16`, and `19`.

- [ ] **Step 2: Validate asset records**

Rules:

- `speciesId` must be a positive integer
- `front.path` and `back.path` must begin with `/assets/`
- `front.width`, `front.height`, `back.width`, `back.height` must be positive integers
- registered species preload through `toBattlePokemonPreloadAssets()`
- unregistered species still throws in `getBattlePokemonAssets()`

- [ ] **Step 3: Preserve the documented Cyndaquil ratio**

Keep this invariant:

```ts
expect(getBattlePokemonAssets(155).front).toEqual(
  expect.objectContaining({
    path: "/assets/pokemon/front/155.png",
    width: 160,
    height: 80,
  }),
);
```

- [ ] **Step 4: Run checks**

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm type:check:web
pnpm lint:web
git diff --check
```

- [ ] **Step 5: Commit Phase 2**

```bash
git add apps/web/public/game-data \
  apps/web/src/components/poke-lounge/runtime/game/data \
  apps/web/src/components/poke-lounge/runtime/game/battle \
  apps/web/src/components/poke-lounge/runtime/game/scenes/BootScene.ts \
  apps/web/tests/e2e/poke-lounge.spec.ts
git commit -m "refactor(poke-lounge):게임 데이터 JSON 이관"
```

---

## Task 3: Backend-Managed Multiplayer Hardening

**Goal:** Make the existing server-room MVP clearer, typed, and closer to the source multiplayer requirements without adding WebSocket or persistent room storage.

### Task 3.1: DTO And Swagger Contract

**Files:**

- Create: `apps/api/src/poke-lounge/dto/create-poke-lounge-room.dto.ts`
- Create: `apps/api/src/poke-lounge/dto/join-poke-lounge-room.dto.ts`
- Create: `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts`
- Create: `apps/api/src/poke-lounge/dto/set-poke-lounge-ready.dto.ts`
- Create: `apps/api/src/poke-lounge/dto/submit-poke-lounge-match-result.dto.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge.controller.ts`
- Modify: `apps/api/test/poke-lounge-room.e2e-spec.ts`

- [ ] **Step 1: Replace interface-only request bodies with DTO classes**

Each DTO class must use `@ApiProperty` or `@ApiPropertyOptional` so `/api-json` exposes the Poke Lounge room contract.

- [ ] **Step 2: Add explicit response metadata**

Controller methods must annotate room responses with `PokeLoungeRoomResponseDto`.

- [ ] **Step 3: Verify API contract**

```bash
pnpm test:api
pnpm test:api:e2e
pnpm build:api
```

Expected: all commands exit `0`.

### Task 3.2: Party Snapshot Server State

**Files:**

- Create: `apps/api/src/poke-lounge/dto/update-poke-lounge-party-snapshot.dto.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.types.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge.controller.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.spec.ts`
- Modify: `apps/api/test/poke-lounge-room.e2e-spec.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`

- [ ] **Step 1: Add server-side party snapshot shape**

Add a minimal server-owned snapshot:

```ts
export interface PokeLoungePartySnapshot {
  playerId: string;
  displayName?: string;
  representativePokemon?: {
    speciesId: number;
    name: string;
    level: number;
    currentHp: number;
    maxHp: number;
  };
  updatedAtMs: number;
}
```

- [ ] **Step 2: Store snapshots by participant**

`PokeLoungeRoomState` must expose:

```ts
partySnapshots: Record<string, PokeLoungePartySnapshot>;
```

- [ ] **Step 3: Add update endpoint**

Use:

```text
POST /poke-lounge/rooms/:roomCode/party-snapshot
```

Rules:

- only an existing participant can update its own snapshot
- spectators cannot update tournament party snapshots
- malformed `speciesId`, `level`, or HP values return `400`
- snapshots are included in `GET /poke-lounge/rooms/:roomCode`

- [ ] **Step 4: Send snapshots from web server room adapter**

`serverRoom.ts` must submit a snapshot on `connect(initialSnapshot)` and whenever the existing room protocol emits a local party update.

- [ ] **Step 5: Run checks**

```bash
pnpm --filter @vscoke/api test -- poke-lounge/poke-lounge-room.service.spec.ts --runInBand
pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium
pnpm type:check:web
pnpm lint
git diff --check
```

### Task 3.3: Server Room Entry UX

**Files:**

- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/roomEntryScreen.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/roomEntry.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/multiplayerRoomFactory.ts`
- Modify: `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`

- [ ] **Step 1: Add server room create and join controls**

Room entry must support:

- solo
- local preview room
- server room create
- server room join by room code

- [ ] **Step 2: Preserve query deep links**

These URLs must continue to work:

```text
/ko-KR/game/poke-lounge?network=server&create=1&e2e=1
/ko-KR/game/poke-lounge?network=server&room=SRV001&e2e=1
/ko-KR/game/poke-lounge?network=local&room=ABC123&e2e=1
```

- [ ] **Step 3: Add E2E coverage**

`poke-lounge-multiplayer.spec.ts` must verify:

- server create changes URL to `network=server&room=<code>`
- server join uses a typed room code input
- two browser contexts keep distinct `sessionId` and `playerId`
- rejected server result does not produce a local final result

- [ ] **Step 4: Run no-mock fallback scan**

```bash
python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/components/poke-lounge/runtime/game/network
```

Expected: no runtime mock fallback path is reported.

- [ ] **Step 5: Commit Phase 3**

```bash
git add apps/api/src/poke-lounge apps/api/test/poke-lounge-room.e2e-spec.ts \
  apps/web/src/components/poke-lounge/runtime/game/network \
  apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts
git commit -m "feat(poke-lounge):서버 멀티 계약 보강"
```

---

## Task 4: Final Acceptance, Screenshots, And Docs

**Goal:** Prove the feature still works end to end and leave a compact, current record instead of accumulating dated reports.

**Files:**

- Modify: `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`
- Modify: this file if a phase gate result changes accepted scope

- [x] **Step 1: Run full focused verification**

```bash
pnpm test:api
pnpm test:api:e2e
pnpm build:api
pnpm type:check:web
pnpm lint
pnpm build:web
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium
python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/components/poke-lounge/runtime/game/network
git diff --check
```

- [x] **Step 2: Check forbidden assets**

```bash
git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true
git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true
git ls-files 'apps/web/public/assets/rom-*'
```

Expected: no output.

- [x] **Step 3: Capture browser screenshots**

Use Playwright to capture:

- starter selection
- world scene desktop
- battle scene with wild opponent
- final result submit overlay
- server room final result
- mobile canvas framing

Screenshots must stay under ignored test output paths and must not be committed.

- [x] **Step 4: Update the roadmap completion log**

Append:

- commands run
- screenshot paths
- known gaps that remain after this plan
- whether server room state remains memory-only
- whether WebSocket remains out of scope

- [x] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md \
  docs/superpowers/plans/2026-07-07-poke-lounge-remaining-work-plan.md
git commit -m "docs(poke-lounge):남은 작업 계획 정리"
```

---

## Final Acceptance Criteria

- Source document compliance checks for wild encounter rate selection and battle Pokemon sprite dimensions pass.
- Poke Lounge tunable gameplay data documented as next migration target is either JSON-backed or explicitly preserved as TypeScript default fallback behind JSON validation.
- `/ko-KR/game/poke-lounge` supports starter selection, solo world, wild battle, result submit, and server room entry.
- `network=server` room state is managed by `apps/api`, not by client-host authority.
- Server room API is visible in Swagger/OpenAPI through DTO classes.
- Frontend server-room adapter has no mock fallback in runtime code.
- API, web typecheck, lint, build, focused E2E, and diff checks pass.
- No ROM originals, raw extraction directories, generated reports, or E2E artifacts are tracked.
- No curated runtime asset is exposed under `apps/web/public/assets/rom-*`.
