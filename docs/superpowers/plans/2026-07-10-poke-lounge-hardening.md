# Poke Lounge Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Poke Lounge persistence, multiplayer state, transport, and competitive results durable, recoverable, and safe to operate while keeping the route blocked from public release until asset rights are cleared.

**Architecture:** The browser hydrates a versioned, validated local-player snapshot before it may autosave. A PostgreSQL TypeORM repository replaces the API-process room map and persists revisioned room snapshots plus idempotent mutation receipts. Socket.IO delivers committed revisioned snapshots; REST remains the initial snapshot and reconnect-recovery path. Exactly two authenticated seats submit only their own actions while the API advances the shared deterministic battle engine; solo and other casual modes remain explicitly client-asserted and unranked.

**Tech Stack:** Next.js 15, React 19, NestJS 11, TypeORM, PostgreSQL, Socket.IO, Jest, Supertest, Playwright, pnpm 9.12.0.

## Global Constraints

- Work only in the VSCoke monorepo: web code is `apps/web`, API code is `apps/api`, and database access stays in the API.
- Do not use Redis; PostgreSQL is the only durable room-state, TTL, revision, and idempotency store.
- `network=local` remains development preview only; `network=server` is the only production multiplayer path.
- A Poke Lounge public release remains blocked until every deployed asset has an approved provenance record matching its SHA-256 and a human release owner signs `docs/poke-lounge-release-gate.md`.
- Never treat a client-reported competitive winner, score, elapsed time, session ID, or local state as proof.
- Solo submissions are `client-asserted`, may be stored and shared, and must not appear in public Poke Lounge rankings.
- Preserve existing Poke Lounge game behavior during the WorldScene split; use focused E2E tests as the behavioral contract.
- New filenames use kebab-case. Generate OpenAPI and web API types from the local API contract before final verification.

## Planned File Structure

| Path                                                                                                              | Responsibility                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `docs/poke-lounge-release-gate.md`                                                                                | Human-signoff release checklist, provenance status, and blocked-route policy.                                 |
| `docs/poke-lounge-asset-provenance.json`                                                                          | Machine-readable public asset path, SHA-256, source, rights status, attribution, reviewer, and approval date. |
| `scripts/poke-lounge/check-asset-provenance.mjs`                                                                  | Fails when a public Poke Lounge asset has no approved manifest row or hash match.                             |
| `apps/web/src/services/poke-lounge-state-service.ts`                                                              | Typed GET hydration and PUT persistence client.                                                               |
| `apps/web/src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot.ts`                             | Versioned snapshot parser, sanitizer, and builder.                                                            |
| `apps/web/src/components/poke-lounge/runtime/game/state/gameStateStore.ts`                                        | Atomic validated local-player hydration API.                                                                  |
| `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`                                                        | Hydration gate that starts the game page and autosave only after GET completes safely.                        |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-{hud,interactions,tournament,encounters}.ts` | Focused WorldScene collaborators with no gameplay-policy changes.                                             |
| `apps/api/src/poke-lounge/entities/poke-lounge-room.entity.ts`                                                    | Revisioned JSONB room aggregate and TTL timestamp.                                                            |
| `apps/api/src/poke-lounge/entities/poke-lounge-room-command.entity.ts`                                            | Idempotent mutation receipt keyed by room, actor, and client command ID.                                      |
| `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`                                                         | Transactional PostgreSQL room load/save/prune abstraction.                                                    |
| `apps/api/src/poke-lounge/poke-lounge-room-events.service.ts`                                                     | Emits only committed room snapshots to transports.                                                            |
| `apps/api/src/poke-lounge/poke-lounge.gateway.ts`                                                                 | Socket.IO room subscription and revisioned snapshot transport.                                                |
| `packages/poke-lounge-battle/`                                                                                    | Shared canonical state, PRNG, action types, and deterministic turn resolver.                                  |
| `apps/api/src/poke-lounge/competitive/`                                                                           | Authenticated seat binding, durable action receipts, server state advancement, and terminal publication.      |
| `apps/api/src/migrations/1794096000000-create-poke-lounge-room-storage.ts`                                        | PostgreSQL room and command tables, constraints, indexes, and expiry index.                                   |

## Execution Status

| Task                                | Status                        | Actual result                                                                                                                                        |
| ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Provenance/release gate          | Complete                      | Machine-checkable manifest exists; public release intentionally remains `BLOCKED`.                                                                   |
| 2. Hydration before autosave        | Complete                      | Authenticated GET hydration precedes the game runtime and PUT; versioned `sessionStorage` is the local fallback.                                     |
| 3. Ranking containment              | Complete                      | Client-asserted Poke Lounge rows are unranked; verified-room rows alone feed ranking.                                                                |
| 4. WorldScene decomposition         | Complete                      | HUD, interactions, tournament, and encounters are collaborator modules behind the scene orchestrator.                                                |
| 5. PostgreSQL room durability       | Complete                      | Room revisions, TTL and idempotent command receipts are transactional and durable.                                                                   |
| 6. Socket transport/REST recovery   | Complete                      | `/poke-lounge` emits committed snapshots; REST handles initial and outage/conflict recovery.                                                         |
| 7. Competitive authority            | Complete with design revision | The shipped model uses two authenticated seats and durable own-action submission to a shared deterministic server engine, not a client proof replay. |
| 8. Final documentation/verification | Complete                      | Current docs, report, stale-claim audit, links, formatting, unit tests and contract diff were verified; provenance remains intentionally blocked.    |

Current implementation details and constraints are reflected in the source code, [Poke Lounge Game Concept](../../poke-lounge-game-concept.md), and [Poke Lounge Release Gate](../../poke-lounge-release-gate.md). The original unchecked steps below are retained as the execution plan, not as current-state assertions; this status table supersedes planned details that changed during implementation.

---

### Task 1: Record Current State, Provenance, and the Release Gate

**Files:**

- Create: `docs/poke-lounge-release-gate.md`
- Create: `docs/poke-lounge-asset-provenance.json`
- Create: `scripts/poke-lounge/check-asset-provenance.mjs`
- Modify: `docs/vscoke-monorepo-concept.md`
- Modify: `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`
- Test: `scripts/poke-lounge/check-asset-provenance.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `.superpowers/sdd/ip-audit-report.md` as the evidence source; its `Status: DONE_WITH_CONCERNS` is authoritative until a replacement audit is committed.
- Produces: `AssetProvenanceRow = { publicPath: string; sha256: string; source: string; rightsStatus: "approved" | "blocked"; attribution: string | null; reviewer: string | null; approvedAt: string | null }` and `pnpm check:poke-lounge-provenance`.

- [ ] **Step 1: Write the failing provenance checker tests**

```js
import assert from "node:assert/strict";
import { validateManifest } from "./check-asset-provenance.mjs";

assert.throws(
  () =>
    validateManifest([
      { publicPath: "assets/poke-lounge/audio/sfx/button-confirm.mp3", rightsStatus: "blocked" },
    ]),
  /must be approved/,
);
assert.throws(() => validateManifest([]), /missing manifest row/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/poke-lounge/check-asset-provenance.test.mjs`

Expected: FAIL because `check-asset-provenance.mjs` does not exist.

- [ ] **Step 3: Implement the release evidence and checker**

Create `docs/poke-lounge-release-gate.md` with the audit date, the eight explicitly source-derived MP3 paths, all currently unknown sprite/map/data paths, and this required decision:

```md
## Release Decision

Status: BLOCKED

The `/[locale]/game/poke-lounge` route and every Poke Lounge public asset remain ineligible for public deployment. A release owner may change this status only after `pnpm check:poke-lounge-provenance` passes and signs the approval table below.
```

Create one manifest row for every file under the public Poke Lounge asset roots listed by the audit. Set each currently unresolved record to `"rightsStatus": "blocked"`, `reviewer: null`, and `approvedAt: null`; never invent a source or approval. Implement `validateManifest(rows, publicFiles)` to require one row per file, nonempty SHA-256/source, `rightsStatus === "approved"`, matching SHA-256, and nonempty attribution when the row declares it required. Add this script to root `package.json`:

```json
"check:poke-lounge-provenance": "node scripts/poke-lounge/check-asset-provenance.mjs"
```

Update the monorepo concept and the phase-roadmap completion log to state that Phase 3 is a technical MVP, not a release approval, and that the provenance check is a release gate.

- [ ] **Step 4: Run the gate and tests**

Run: `node scripts/poke-lounge/check-asset-provenance.test.mjs && pnpm check:poke-lounge-provenance`

Expected: unit test PASS; provenance command FAIL with the documented blocked assets until cleared replacements and approvals exist. Record this expected blocked result in `docs/poke-lounge-release-gate.md`; do not mask it with `|| true` in release CI.

- [ ] **Step 5: Commit the documentation and gate**

```bash
git add docs/poke-lounge-release-gate.md docs/poke-lounge-asset-provenance.json scripts/poke-lounge/check-asset-provenance.mjs scripts/poke-lounge/check-asset-provenance.test.mjs docs/vscoke-monorepo-concept.md docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md package.json
git commit -m "docs(poke-lounge):출시 차단 기준 기록"
```

### Task 2: Hydrate a Valid Versioned Snapshot Before Autosave

**Files:**

- Modify: `apps/web/src/services/poke-lounge-state-service.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/state/gameStateStore.ts`
- Modify: `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`
- Modify: `apps/web/tests/e2e/poke-lounge-autosave.spec.ts`
- Test: `apps/web/tests/e2e/poke-lounge-state-hydration.spec.ts`

**Interfaces:**

- Consumes: `GET /game/poke-lounge/state` and existing `PUT /game/poke-lounge/state`.
- Produces:

```ts
export type LoadPokeLoungeStateResult =
  | { success: true; snapshot: PokeLoungeSaveSnapshot | null }
  | { success: false; requiresAuth?: boolean; unavailable: true; message: string };

export function parsePokeLoungeSaveSnapshot(value: unknown): PokeLoungeSaveSnapshot | null;
export function sanitizeLocalPlayersSaveState(value: unknown): LocalPlayersSaveState | null;
// GameStateStore
hydrateLocalPlayers(localPlayers: LocalPlayersSaveState): void;
```

- [ ] **Step 1: Write failing hydration tests**

```ts
test("unknown version and malformed player values are ignored", () => {
  expect(parsePokeLoungeSaveSnapshot({ version: 999, game: "poke-lounge", state: {} })).toBeNull();
  expect(sanitizeLocalPlayersSaveState({ currentPlayerId: 3, playersById: [] })).toBeNull();
});

test("authenticated GET completes before the first PUT", async () => {
  const calls: string[] = [];
  // Deferred GET returns a valid snapshot containing player-remote.
  // Assert calls is ["GET"] until its resolver is released, then ["GET", "PUT"].
});
```

- [ ] **Step 2: Run the focused tests to verify red**

Run: `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-autosave.spec.ts tests/e2e/poke-lounge-state-hydration.spec.ts --project=chromium`

Expected: FAIL because the parser, GET result, and hydration ordering do not exist.

- [ ] **Step 3: Implement parse, sanitize, and ordering**

Accept only `version === POKE_LOUNGE_SAVE_SNAPSHOT_VERSION`, `game === "poke-lounge"`, a string `currentPlayerId`, and a string-keyed `playersById` record. Strip `remotePlayers`, `session`, `round`, and `tournament`; validate every persisted player/party/inventory numeric field with the same finite-integer bounds used by the store; reject the whole snapshot when its current player is absent. `hydrateLocalPlayers` must call the store's existing local-player update path so listeners and local storage receive one atomic notification.

Implement `loadPokeLoungeState(token, dependencies)` with `apiClient.get` and normalize an empty/404 state to `{ success: true, snapshot: null }`. In `PokeLoungeGame`, await that call before creating `startPokeLoungeAutosave`; hydrate before starting the game runtime so `getDefaultGameStateStore()` is initialized from server state. On an unavailable GET, render the existing game without autosave and expose a retry action; this prevents an old local snapshot from overwriting an unreachable newer server copy. On unauthenticated sessions, start solo normally and never issue GET or PUT.

- [ ] **Step 4: Run green tests and type checks**

Run: `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-autosave.spec.ts tests/e2e/poke-lounge-state-hydration.spec.ts --project=chromium && pnpm type:check:web && pnpm lint:web`

Expected: PASS.

- [ ] **Step 5: Commit the hydration boundary**

```bash
git add apps/web/src/services/poke-lounge-state-service.ts apps/web/src/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot.ts apps/web/src/components/poke-lounge/runtime/game/state/gameStateStore.ts apps/web/src/components/poke-lounge/poke-lounge-game.tsx apps/web/tests/e2e/poke-lounge-autosave.spec.ts apps/web/tests/e2e/poke-lounge-state-hydration.spec.ts
git commit -m "fix(poke-lounge):저장 상태 복원 순서 보장"
```

### Task 3: Contain Unverified Poke Lounge Rankings

**Files:**

- Modify: `apps/api/src/game/game-score-policy.ts`
- Modify: `apps/api/src/game/game.service.ts`
- Modify: `apps/api/src/game/game.controller.ts`
- Modify: `apps/api/src/game/game.service.spec.ts`
- Modify: `apps/api/src/game/game.controller.spec.ts`
- Modify: `apps/web/src/services/score-service.ts`

**Interfaces:**

- Produces:

```ts
export type GameSubmissionTrust = "client-asserted" | "verified-room";
export const isPublicRankingEligible = (gameType: GameType, trust: GameSubmissionTrust): boolean =>
  gameType !== GameType.POKE_LOUNGE || trust === "verified-room";
```

- [ ] **Step 1: Add failing ranking-policy tests**

```ts
expect(isPublicRankingEligible(GameType.POKE_LOUNGE, "client-asserted")).toBe(false);
await expect(service.getRanking(GameType.POKE_LOUNGE)).resolves.toEqual([]);
```

- [ ] **Step 2: Run red API tests**

Run: `pnpm --filter @vscoke/api test -- game/game-score-policy.spec.ts game/game.service.spec.ts game/game.controller.spec.ts --runInBand`

Expected: FAIL because Poke Lounge submissions currently use the same client-asserted ranking path as other games.

- [ ] **Step 3: Implement temporary containment**

Keep `POKE_LOUNGE` result storage and sharing available, but tag every existing Poke Lounge result as `client-asserted` in the service boundary and exclude it from the Poke Lounge ranking query. Return an empty ranking with a documented `unverified` status rather than mixing it with future verified standings. Do not infer trust from a browser field. Keep `GAME_SCORE_POLICIES[GameType.POKE_LOUNGE]` as a plausibility limit only; its score/time limits are not proof.

- [ ] **Step 4: Run green API checks**

Run: `pnpm --filter @vscoke/api test -- game/game-score-policy.spec.ts game/game.service.spec.ts game/game.controller.spec.ts --runInBand && pnpm build:api`

Expected: PASS.

- [ ] **Step 5: Commit containment**

```bash
git add apps/api/src/game/game-score-policy.ts apps/api/src/game/game.service.ts apps/api/src/game/game.controller.ts apps/api/src/game/game.service.spec.ts apps/api/src/game/game.controller.spec.ts apps/web/src/services/score-service.ts
git commit -m "fix(poke-lounge):미검증 랭킹 노출 차단"
```

### Task 4: Decompose WorldScene Without Changing Behavior

**Files:**

- Create: `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-hud.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-interactions.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-tournament.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-encounters.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- Modify: `apps/web/tests/e2e/poke-lounge.spec.ts`
- Modify: `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface WorldSceneHud {
  render(): void;
  destroy(): void;
  updateRound(nowMs: number): void;
}
export interface WorldSceneInteractions {
  handleInput(): boolean;
  destroy(): void;
  getE2eSnapshot(): Pick<WorldE2eSnapshot, "pokemonStatusPanel" | "pcBox" | "shortcutGuideOpen">;
}
export interface WorldSceneTournament {
  update(nowMs: number): void;
  applyReturnedResult(result: WorldTournamentBattleResult): void;
  destroy(): void;
}
export interface WorldSceneEncounters {
  afterMovement(): void;
  destroy(): void;
}
```

- [ ] **Step 1: Add behavioral contract tests before moving code**

```ts
test("world scene preserves shop, PC, shortcut, wild-battle, and tournament result probes", async ({
  page,
}) => {
  // Reuse the existing e2e query entry, assert each existing __POKE_LOUNGE_E2E__ field and result score.
});
```

- [ ] **Step 2: Run the current scene contract tests to establish red/green baseline**

Run: `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`

Expected: PASS before refactoring; save the command output with the task record.

- [ ] **Step 3: Extract collaborators in four behavior-preserving commits**

Move only these existing methods, retaining their constants and output text: HUD/party/status rendering to `world-scene-hud.ts`; NPC, shop, inventory, PC, nurse, shortcut, and dice controls to `world-scene-interactions.ts`; room tournament lifecycle and result panel flow to `world-scene-tournament.ts`; tile steps, encounter selection, wild-battle start, and battle intro to `world-scene-encounters.ts`. `WorldScene.create`, `update`, `shutdown`, room binding, movement snapshots, and `WorldE2eSnapshot` stay as the orchestration boundary. Give each collaborator explicit dependencies rather than exporting engine-private fields.

- [ ] **Step 4: Run behavior checks after each extraction**

Run: `pnpm type:check:web && pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`

Expected: PASS after each collaborator extraction; no screenshot, E2E probe, query parameter, score, input, or Korean UI copy changes.

- [ ] **Step 5: Commit the decomposition**

```bash
git add apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-hud.ts apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-interactions.ts apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-tournament.ts apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-encounters.ts apps/web/tests/e2e/poke-lounge.spec.ts apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts
git commit -m "refactor(poke-lounge):월드 씬 책임 분리"
```

### Task 5: Persist Rooms in PostgreSQL With Revisions, TTL, and Idempotency

**Files:**

- Create: `apps/api/src/poke-lounge/entities/poke-lounge-room.entity.ts`
- Create: `apps/api/src/poke-lounge/entities/poke-lounge-room-command.entity.ts`
- Create: `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`
- Create: `apps/api/src/migrations/1794096000000-create-poke-lounge-room-storage.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.types.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge.module.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge.controller.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.spec.ts`
- Modify: `apps/api/test/poke-lounge-room.e2e-spec.ts`

**Interfaces:**

```ts
export type PokeLoungeRoomSnapshot = PokeLoungeRoomState & {
  revision: number;
  expiresAtMs: number;
};
export interface PokeLoungeRoomRepository {
  create(room: PokeLoungeRoomSnapshot): Promise<PokeLoungeRoomSnapshot>;
  get(roomCode: string, nowMs: number): Promise<PokeLoungeRoomSnapshot | null>;
  mutate(input: {
    roomCode: string;
    actorPlayerId: string;
    idempotencyKey: string;
    expectedRevision: number;
    nowMs: number;
    apply: (room: PokeLoungeRoomSnapshot) => PokeLoungeRoomSnapshot;
  }): Promise<PokeLoungeRoomSnapshot>;
  purgeExpired(nowMs: number): Promise<number>;
}
```

- [ ] **Step 1: Write failing repository and API tests**

```ts
await expect(
  repository.mutate({
    roomCode: "ROOM01",
    actorPlayerId: "player-a",
    idempotencyKey: "cmd-1",
    expectedRevision: 0,
    nowMs: 1,
    apply,
  }),
).resolves.toMatchObject({ revision: 1 });
await expect(
  repository.mutate({
    roomCode: "ROOM01",
    actorPlayerId: "player-a",
    idempotencyKey: "cmd-1",
    expectedRevision: 0,
    nowMs: 2,
    apply,
  }),
).resolves.toMatchObject({ revision: 1 });
await expect(
  repository.mutate({
    roomCode: "ROOM01",
    actorPlayerId: "player-b",
    idempotencyKey: "cmd-2",
    expectedRevision: 0,
    nowMs: 2,
    apply,
  }),
).rejects.toThrow(/revision/);
```

- [ ] **Step 2: Run red backend tests**

Run: `pnpm --filter @vscoke/api test -- poke-lounge/poke-lounge-room.service.spec.ts --runInBand && pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand`

Expected: FAIL because rooms are held in `Map<string, PokeLoungeRoomState>` and responses have no revision.

- [ ] **Step 3: Add the TypeORM migration and repository**

Create `poke_lounge_room` with `room_code varchar(6) unique`, `state jsonb not null`, `revision bigint not null default 0`, `expires_at timestamptz not null`, `created_at timestamptz`, and `updated_at timestamptz`; add `(expires_at)` and `(room_code, revision)` indexes. Create `poke_lounge_room_command` with `room_id uuid`, `actor_player_id varchar(128)`, `idempotency_key uuid`, `request_hash char(64)`, `response_state jsonb`, `response_revision bigint`, and a unique `(room_id, actor_player_id, idempotency_key)` constraint. Do every mutation in one transaction: load row, return the stored receipt only when its hash matches, reject a changed payload under the same key, compare `expectedRevision`, save `revision + 1`, persist the receipt, then commit. Compute expiry from the existing waiting and finished TTL constants; `purgeExpired` deletes expired rows before create/read/mutate. Do not add Redis or an in-memory fallback.

- [ ] **Step 4: Change service/controller contracts**

Make all room methods async, delegate storage to the repository, and append `revision` and `expiresAtMs` to public responses. Require `X-Idempotency-Key` and `If-Match-Revision` for each mutating REST room endpoint; return HTTP 409 with the current snapshot on a revision mismatch. Keep session IDs redacted from responses. Call the room-event publisher only after the repository transaction commits.

- [ ] **Step 5: Run migration and green tests**

Run: `pnpm --filter @vscoke/api migration:run && pnpm --filter @vscoke/api test -- poke-lounge/poke-lounge-room.service.spec.ts --runInBand && pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand && pnpm build:api`

Expected: PASS; a process restart can reload a room, expired rows are removed, duplicate command IDs return the original revision, and stale revision writes receive 409.

- [ ] **Step 6: Commit durable rooms**

```bash
git add apps/api/src/poke-lounge apps/api/src/migrations/1794096000000-create-poke-lounge-room-storage.ts apps/api/test/poke-lounge-room.e2e-spec.ts
git commit -m "feat(poke-lounge):포스트그레스 방 저장소 추가"
```

### Task 6: Add WebSocket Transport With REST Recovery

**Files:**

- Create: `apps/api/src/poke-lounge/poke-lounge-room-events.service.ts`
- Create: `apps/api/src/poke-lounge/poke-lounge.gateway.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge.module.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`
- Modify: `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`
- Modify: `apps/api/test/poke-lounge-room.e2e-spec.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`

**Interfaces:**

```ts
export type PokeLoungeRoomTransportEvent =
  | { type: "room.snapshot"; room: PokeLoungeRoomSnapshot }
  | { type: "room.revision-conflict"; room: PokeLoungeRoomSnapshot };
// Socket namespace: /poke-lounge
// client emit: room.subscribe { roomCode, playerId, sessionId, afterRevision }
// server emit: room.snapshot { room }
```

- [ ] **Step 1: Write failing socket/recovery tests**

```ts
test("a newer socket revision wins over an older REST response", async ({ page }) => {
  // Deliver revision 8 through room.snapshot, then a delayed GET revision 7.
  await expect(page.getByTestId("poke-lounge-result-score")).toHaveText("100");
  expect(await readAppliedRevision(page)).toBe(8);
});
```

- [ ] **Step 2: Run red transport tests**

Run: `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium && pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand`

Expected: FAIL because `serverRoom.ts` only schedules 750 ms GET polling and room responses carry no revision.

- [ ] **Step 3: Implement committed-snapshot transport**

Add Socket.IO dependencies to the API and web packages, implement `/poke-lounge` gateway subscription validation using the existing participant/session rules, and emit only snapshots published after a successful PostgreSQL transaction. In `serverRoom.ts`, create the socket once per room identity; maintain `lastAppliedRevision`; discard payloads whose revision is lower; request a REST snapshot with `afterRevision=lastAppliedRevision` when the socket reconnects, on revision conflict, and while disconnected. Use 5-second bounded exponential REST retries only during socket outage, stop polling after recovery/completion/close, and keep `GET /poke-lounge/rooms/:roomCode` as the no-socket recovery endpoint. Attach a UUID idempotency key and latest revision to every mutation; retry only the same key after a network failure.

- [ ] **Step 4: Run green transport checks**

Run: `pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand && pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium && pnpm type:check:web`

Expected: PASS; two pages receive the same committed revision, reconnect catches up through REST, and stale responses cannot roll state backward.

- [ ] **Step 5: Commit the transport**

```bash
git add apps/api/src/poke-lounge apps/api/test/poke-lounge-room.e2e-spec.ts apps/api/package.json apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(poke-lounge):웹소켓 방 동기화 추가"
```

### Task 7: Verify Competitive Results Server-Side and Define Solo Trust

**Status:** Complete with an implementation design revision. The client-proof replay proposal was replaced by incremental durable own-action submission so the server owns state throughout the match rather than validating a client-composed terminal log afterward.

**Implemented files:**

- `packages/poke-lounge-battle/`: shared canonical state, action types, PRNG and deterministic turn resolver
- `apps/api/src/poke-lounge/competitive/`: authenticated seat binding, action authorization, durable receipts, projection and terminal publication
- `apps/api/src/poke-lounge/entities/poke-lounge-competitive-{seat,match}.entity.ts`
- `apps/api/src/poke-lounge/competitive/competitive-action.entity.ts`
- `apps/api/src/game/verified-poke-lounge-history-writer.service.ts`
- `apps/api/src/migrations/1794182400000-create-poke-lounge-competitive-assignment.ts`
- `apps/api/src/migrations/1794268800000-create-poke-lounge-competitive-action.ts`
- `apps/api/src/migrations/1794355200000-add-game-result-trust.ts`
- `apps/api/src/migrations/1794441600000-add-competitive-history-publication.ts`
- `apps/web/src/components/poke-lounge/runtime/game/battle/authoritative-battle-adapter.ts`

**Actual contract:**

1. A competitive assignment is created only when exactly two connected participants bind two distinct authenticated accounts.
2. The server stores seed, ruleset version/hash, immutable player/account bindings, initial/current canonical state and current turn.
3. An account may submit only its bound player's current-turn action with the assignment revision and a client command UUID.
4. PostgreSQL receipts reject conflicting replay and preserve pending/resolved responses across process restart.
5. The shared deterministic engine advances state only after both legal actions exist. Client winner, score, elapsed time or terminal claims are not accepted.
6. Server terminal publishes winner 100 and loser 50 with `resultTrust = "verified-room"`, server-generated `sourceKey`, match publication mapping and resolved receipts in one transaction.
7. General Poke Lounge result submission remains `client-asserted`; only verified-room rows are ranking eligible.

Verification scope is recorded in this plan's task-level records. The separate public-release constraint remains in [Poke Lounge Release Gate](../../poke-lounge-release-gate.md).

### Task 8: Final Documentation, Contract Generation, and Complete Verification

**Files:**

- Modify: `docs/vscoke-monorepo-concept.md`
- Modify: `docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md`
- Modify: `docs/poke-lounge-release-gate.md`
- Modify: `apps/api/openapi.json`
- Modify: `apps/web/src/types/api.d.ts`
- Modify: `docs/game-score-policy.md`

**Interfaces:**

- Consumes: the versioned persistence API, revisioned REST/WebSocket room contract, authenticated competitive action protocol, shared deterministic engine, and `resultTrust` policy from Tasks 2-7.
- Produces: an accurate current-state record with commands run, known gaps, release state, API contract, and explicit ownership handoff.

- [ ] **Step 1: Write failing documentation assertions**

```bash
rg -q 'PostgreSQL.*revision.*idempotency' docs/vscoke-monorepo-concept.md
rg -q 'client-asserted' docs/game-score-policy.md
rg -q 'Status: BLOCKED' docs/poke-lounge-release-gate.md
```

- [ ] **Step 2: Run the assertions to verify red**

Run: `rg -q 'PostgreSQL.*revision.*idempotency' docs/vscoke-monorepo-concept.md && rg -q 'client-asserted' docs/game-score-policy.md && rg -q 'Status: BLOCKED' docs/poke-lounge-release-gate.md`

Expected: FAIL until the current-state documentation is updated.

- [ ] **Step 3: Generate contracts and record operational decisions**

Run `pnpm generate:types`, then document the exact REST headers, Socket.IO namespace/events, revision conflict response, reconnect sequence, PostgreSQL expiry behavior, competitive action rejection rules, and the solo `client-asserted` policy. Append the actual passing command output and remaining gaps to the roadmap. Keep the release status `BLOCKED` unless Task 1's provenance checker passes with real approvals; technical hardening alone does not change it.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm test:api
pnpm test:api:e2e
pnpm build:api
pnpm type:check:web
pnpm lint
pnpm build
pnpm check:api-contract
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-autosave.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-state-hydration.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium
pnpm check:poke-lounge-provenance
git diff --check
git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true
git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true
```

Expected: all engineering commands PASS. `pnpm check:poke-lounge-provenance` remains an intentional release blocker until every unresolved asset has a real approved provenance record; do not claim release readiness while it fails.

- [ ] **Step 5: Commit the final record**

```bash
git add docs/vscoke-monorepo-concept.md docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md docs/poke-lounge-release-gate.md docs/game-score-policy.md apps/api/openapi.json apps/web/src/types/api.d.ts
git commit -m "docs(poke-lounge):하드닝 완료 기준 기록"
```

## Self-Review

- Fixed-order coverage: Task 1 documents current state/provenance and retains the release block; Task 2 hydrates before PUT; Task 3 contains rankings; Task 4 preserves WorldScene behavior; Task 5 adds PostgreSQL persistence with TTL/revision/idempotency; Task 6 adds WebSocket with REST recovery; Task 7 proves competitive results and declares solo trust; Task 8 closes documentation and verification.
- Placeholder scan: no TBD, TODO, or deferred implementation steps are used. The only intentionally failing command is the explicitly documented provenance release gate for unresolved assets.
- Type consistency: `PokeLoungeRoomSnapshot.revision` is the monotonic value used by repository mutations, REST conflicts, socket events, and browser stale-response rejection. `resultTrust` has exactly two values, and only `verified-room` is ranking eligible for `POKE_LOUNGE`.

## Final Record

Implementation was completed directly on `codex/feat/poke-lounge-hardening`; the release gate remains a separate blocked owner/legal decision.
