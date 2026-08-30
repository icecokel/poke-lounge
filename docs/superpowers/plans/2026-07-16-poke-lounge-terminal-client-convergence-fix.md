# Poke Lounge Terminal Client Convergence Fix Implementation Plan

> **For agentic workers:** Execute Tasks 0~6 in order with TDD. Keep API, Web, and targeted 5-browser ownership separate until the contract tests are green. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every browser observes the completed authority match before the same committed room snapshot advances it to the next assignment, so the loser can leave the old battle, the winner can confirm the result and enter the next battle, and all five clients converge on the same revision without a false-positive test.

**Architecture:** PostgreSQL commits the terminal match projection, stable terminal event metadata, room revision, next authority assignment, and applicable receipts in one transaction. Normal action completion resolves both action receipts; leave/forfeit resolves only an existing pending action receipt, if any, and stores/replays its room-command receipt without inventing another action receipt. New terminal REST action projections and stored receipts carry the same event ID/revision as the completed projection in the post-commit composite room snapshot. `competitiveTransitions` contains completed assignments while the existing optional `competitive` field contains only the current assignment. The Web transport keeps bounded terminal and current-assignment caches plus independent room/terminal cursors, caches transitions even without listeners, and applies each terminal before advancing its terminal cursor. BattleScene consumes only its same-match terminal transition, hands the completed old launch key to WorldScene, and WorldScene alone completes that key and launches the next assignment exactly once. Reconnect uses the terminal cursor as `afterRevision` and durable terminal metadata to recover missed transitions. Targeted Playwright gates read each browser's real store, active scene, BattleScene state, and active authoritative projection instead of copying REST state into tester reports.

**Tech Stack:** Next.js 15, React 19, Phaser, NestJS 11, TypeORM, PostgreSQL, Socket.IO, Jest, Node test runner, Playwright, pnpm 9.12.0.

## Completion Status (2026-07-16)

Tasks 0~6의 구현·릴리스 검증과 별도 clean committed contract gate는 complete다. 의도한 생성 OpenAPI와 Web type 파일이 commit된 clean 상태에서 `pnpm check:api-contract`가 PASS했다. `HXN3RA` remains the preserved RED/S1 client-convergence evidence, not a release PASS. The implemented boundary is a single committed composite room snapshot: completed old assignments are carried in `competitiveTransitions`, and the optional `competitive` field carries only the current assignment.

| Task | Status   | Completion evidence                                                                                                                         |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Complete | HXN3RA's backend/DB commit and client S1 failure were preserved as RED cases.                                                               |
| 1    | Complete | Nullable terminal event metadata, additive action/room contract, migration, OpenAPI, and generated Web types were added.                    |
| 2    | Complete | Terminal metadata, receipt replay, bracket advance, current assignment, and bounded `afterRevision` recovery are transactionally projected. |
| 3    | Complete | Web terminal/current caches and room/terminal cursors are separate; terminal-first replay and recovery are covered.                         |
| 4    | Complete | BattleScene consumes only its old terminal, then WorldScene completes that old launch key and launches the next assignment once.            |
| 5    | Complete | Context-derived C3T/C4T replaces the former REST-copy false positive and retains Firefox reload/reconnect plus forced-switch evidence.      |
| 6    | Complete | Targeted-18, three distinct release runs, and clean committed `pnpm check:api-contract` passed.                                             |

### Final Verification Facts

- `terminal-convergence-targeted-18`: 5/5 tester PASS; 30 actions (15 move, 15 switch); C3T 10 and C4T 5 records; forced switch 1 client / 15 DB; network error 0.
- `terminal-convergence-release-01`: 5/5 tester PASS; 34 actions (19 move, 15 switch); C3T 10 and C4T 5 records; forced switch 1 client / 15 DB; network error 0.
- `terminal-convergence-release-02`: 5/5 tester PASS; 32 actions (17 move, 15 switch); C3T 10 and C4T 5 records; forced switch 1 client / 15 DB; network error 0.
- `terminal-convergence-release-03`: 5/5 tester PASS; 34 actions (19 move, 15 switch); C3T 10 and C4T 5 records; forced switch 1 client / 15 DB; network error 0.
- Every listed run used workers 1/retries 0, had 5 seats and 5 distinct accounts, recorded 0 tournament history rows, and passed C0~C5, Firefox reload, and same-page reconnect. The three release runs used distinct run IDs, fresh DB/API/Web/dist lifecycles, and separate artifacts. Per-artifact scans found 0 connection URL/userinfo, password value, DB username, bearer token, ID token, session, or raw Socket payload.
- **Clean committed contract gate:** `git diff --exit-code -- apps/api/openapi.json apps/web/src/types/api.d.ts` exited 0, and `pnpm check:api-contract` passed.

## Problem and HXN3RA Evidence

The `2026-07-16-user-requested-five-player` run advanced the server correctly but left the first-match clients in incompatible UI states:

- Room `HXN3RA` committed the first terminal at revision 50, completed the seed 4 versus seed 5 match, and created the round 2 seed 1 versus seed 5 assignment.
- Tester 4, the seed 4 loser and first final-turn submitter, remained in the old first-match BattleScene with `result = null` and `상대의 선택을 기다리는 중...`.
- Tester 5, the seed 5 winner and second final-turn submitter, rendered `승리했습니다.` for the old match but authoritative confirm returned early while `phase === "ended"`, so the player could not return to WorldScene or enter the next assignment.
- The first action request returned a pending projection. The second action resolved the turn, completed the first match, and advanced the room to the next assignment.
- The committed Socket snapshot exposed the next `competitive` assignment. The old BattleScene rejected that projection because its match ID differed from the old authoritative match.
- The existing C3/C4/C5 report copied one REST `terminalRoom` or `nextRoom` into all five tester checkpoints. Its browser convergence check compared only the canonical bracket in each store; it did not verify active scene, battle result/message, or the active competitive match. The reported PASS was therefore a false positive.

This is an S1 release blocker because seed 5 is required for the next active match but cannot leave the previous result screen.

## Goals

- Deliver one committed room snapshot containing both the completed old projection and the current next assignment.
- Persist a stable terminal event ID and terminal room revision on the completed match.
- Return the same terminal metadata in terminal REST action responses and durable action receipt replay.
- Recover transitions missed during disconnect by using `afterRevision`.
- Keep current assignment, recent terminal projections, room revision, and terminal revision as separate client state.
- Apply unseen terminal transitions before terminal-cursor advancement without letting REST terminal responses replace the current assignment.
- Deduplicate terminal transitions by event ID across REST recovery, Socket replay, and command retries.
- Show both players the old match result, let result confirmation cleanly leave BattleScene, and launch the winner's next assignment once from WorldScene.
- Detect HXN3RA's old-waiting and ended-confirm failures with context-specific C3T/C4T gates.
- Preserve exactly two-player ranked verified history with server scores 100/50.
- Preserve multi-player `tournament-unranked` behavior with `game_history = 0`.

## Non-Goals

- Do not change battle rules, PRNG, damage, move selection, forced-switch rules, seeding, bye order, or tournament scoring.
- Do not add simultaneous authority matches; the server continues to activate one match at a time.
- Do not make multi-player tournament results eligible for public ranking.
- Do not change solo, local preview, casual result transport, matchmaking, lobby UX, or multi-instance Socket fan-out.
- Do not treat client-reported terminal data as authoritative.
- Do not treat Playwright mobile emulation as physical iOS Safari or human game-feel validation.
- Do not change the existing asset provenance release gate.
- Do not persist the terminal cursor across a full page reload; a reload starts from the fresh initial-snapshot baseline.

## Decided Contract

### Composite room snapshot

Every public room snapshot has these independent fields:

```ts
type CompetitiveTerminalTransition = {
  terminalEventId: string;
  terminalRoomRevision: number;
  projection: CompetitiveActionProjection; // completed old assignment
};

type CompetitiveActionProjection = {
  // existing action projection fields
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
};

type PokeLoungePublicRoomState = {
  revision: number;
  competitiveTransitions: CompetitiveTerminalTransition[];
  competitive?: CompetitiveActionProjection; // current next assignment only; omitted when absent
  // existing room, round, participant, tournament, and standings fields
};
```

Contract rules:

1. Every new terminal `CompetitiveActionProjection`, terminal REST response, receipt, and transition projection has non-null `terminalEventId` and `terminalRoomRevision`. Pending and active projections have both fields null. A legacy completed REST receipt may omit them or contain null only for backward parsing; it is not a valid new terminal event.
2. `CompetitiveTerminalTransition` wraps the completed projection. Its outer event ID/revision must equal the projection metadata so REST and Socket delivery deduplicate on the same event ID.
3. When `afterRevision` is provided, `competitiveTransitions` contains at most eight completed projections in `(afterRevision, currentRevision]`, ordered oldest to newest by `(terminalRoomRevision, terminalEventId)`. The controller forwards it through `PokeLoungeRoomService.getRoom` or `authorizeSubscription` into the repository/projection query and the gateway subscribe flow.
4. An initial GET or subscription without `afterRevision` returns `competitiveTransitions: []` and only the current assignment. This prevents historical terminal replay on first load.
5. `competitive` represents only the current assignment after the transaction. It preserves the existing optional/omitted contract when no assignment exists; it never becomes `null` and never substitutes for a completed projection.
6. A normal action terminal transaction writes the terminal state, event metadata, next assignment, room revision, and both action receipts atomically.
7. The API publishes exactly one composite snapshot after commit. It does not publish a terminal-only room followed by a conflicting same-revision next room.
8. A retried command returns the stored receipt and event metadata without generating another event ID, revision, transition, history row, or Socket publication.
9. An active participant leave/forfeit uses the same terminal-finalization helper and composite publication. It terminal-resolves only the existing pending action receipt count `0..1`, stores/replays the leave room-command receipt, and never creates a missing action receipt.
10. Two-player `ranked-head-to-head` terminal remains verified and writes winner 100 / loser 50 history rows once.
11. `tournament-unranked` terminal advances the bracket but writes no `game_history` rows.

### Client processing order

`serverRoom` owns these independent values:

- `currentAssignmentProjection`, preserving the current optional assignment;
- `recentTerminalProjections`, keyed by both event ID and match ID and bounded to the newest eight;
- `lastAppliedRoomRevision`, for the canonical room/tournament state;
- `lastAppliedTerminalRevision`, advanced only after terminal consumption succeeds.

For each accepted snapshot, the Web transport performs this sequence:

1. Validate room identity, revision, transition shape, completed projection, and current assignment.
2. Sort transitions by terminal revision and event ID.
3. Merge every unseen transition into the bounded terminal cache even when no `COMPETITIVE_STATE` listener exists.
4. Emit/apply each unseen same-room terminal transition and only then advance `lastAppliedTerminalRevision` for that transition.
5. Install and emit the current `competitive` assignment when present; omitted leaves the current assignment absent.
6. Emit the tournament projection and advance `lastAppliedRoomRevision` after room-state application succeeds.

When a new `COMPETITIVE_STATE` listener subscribes, replay cached terminals oldest to newest and then replay the current assignment. A duplicate snapshot adds no duplicate terminal cache entry. A room snapshot at revision R may advance `lastAppliedRoomRevision` while an older active match still awaits its completion transition, but it must not advance `lastAppliedTerminalRevision` past that unapplied transition. Mismatch recovery sends the terminal cursor as `afterRevision`, consumes each page of at most eight transitions in order, and advances the terminal cursor only after successful handling.

For a fresh session, initialize both revision baselines from the initial room snapshot's current revision; its omitted `afterRevision` response contains no historical transitions. A Socket reconnect in the same page keeps the in-memory terminal cursor. A full page reload creates a fresh baseline and does not restore a persisted cursor.

An out-of-order lower room projection cannot replace newer room/current state, but any unseen valid terminal transition is still considered against the terminal cursor. An identical replay is harmless because terminal event IDs are deduplicated. A malformed transition starts existing REST recovery without advancing the terminal cursor. A new terminal REST action response merges only into `recentTerminalProjections`; it never replaces `currentAssignmentProjection`. A legacy completed receipt with absent/null metadata is backward-readable but never enters the terminal cache or event dedup; it triggers recovery/current-room convergence instead. Socket-first, REST-first, and new receipt replay all use the same event ID dedup path.

### Scene flow

```text
old authority battle
  -> same-match terminal transition
  -> BattleScene renders victory/defeat
  -> confirm is handled before generic authoritative input
  -> clear old authoritative subscriptions/cache
  -> pass old matchId:assignmentRevision completion key to WorldScene create data
  -> return to WorldScene
  -> WorldScene calls complete(oldKey) only and evaluates current assignment
      -> winner/next participant: replay next assignment once -> next BattleScene
      -> loser/nonparticipant: remain in WorldScene
```

The launch cache is owned by WorldScene. BattleScene never performs a global launch-cache reset and never deletes the next assignment key. Focused tests assert that confirmation completes only the handed-off old key.

If the terminal transition is missing but the canonical bracket proves the BattleScene's match completed, BattleScene starts a bounded grace/recovery path. REST recovery requests missed transitions using the last safely applied revision. The completed bracket is a recovery trigger, not a replacement source for invented HP, score, or terminal authority.

## Planned File Map

| Path                                                                                            | Responsibility                                                                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/api/src/migrations/1794614400000-add-poke-lounge-competitive-transition-metadata.ts`      | Add nullable terminal event ID/revision columns and recovery index.                        |
| `apps/api/src/migrations/1794614400000-add-poke-lounge-competitive-transition-metadata.spec.ts` | Assert migration SQL, nullable legacy posture, indexes, and down behavior.                 |
| `apps/api/src/poke-lounge/entities/poke-lounge-competitive-match.entity.ts`                     | Persist terminal event metadata on completed matches.                                      |
| `apps/api/src/poke-lounge/competitive/competitive-match.types.ts`                               | Define durable terminal event metadata.                                                    |
| `apps/api/src/poke-lounge/competitive/competitive-action.types.ts`                              | Add nullable terminal event metadata to every action projection.                           |
| `apps/api/src/poke-lounge/competitive/competitive-action.entity.ts`                             | Persist the additive projection metadata in action-receipt JSON.                           |
| `apps/api/src/poke-lounge/competitive/competitive-action.entity.spec.ts`                        | Verify terminal receipt metadata and pending/active null compatibility.                    |
| `apps/api/src/poke-lounge/competitive/competitive-action.repository.ts`                         | Keep repository result/receipt replay projection types aligned.                            |
| `apps/api/src/poke-lounge/competitive/postgres-competitive-action.repository.ts`                | Commit terminal, room revision, next assignment, receipts, and metadata atomically.        |
| `apps/api/src/poke-lounge/competitive/postgres-competitive-action.repository.spec.ts`           | Cover action/leave races, receipt replay, rollback, and history policy.                    |
| `apps/api/src/poke-lounge/competitive/competitive-projection.service.ts`                        | Project completed and current assignments without mixing their roles.                      |
| `apps/api/src/poke-lounge/competitive/competitive-projection.service.spec.ts`                   | Assert terminal metadata consistency and initial/recovery transition windows.              |
| `apps/api/src/poke-lounge/competitive/competitive-match.service.ts`                             | Publish one post-commit composite snapshot.                                                |
| `apps/api/src/poke-lounge/competitive/competitive-match.service.spec.ts`                        | Verify one post-commit publication and leave/forfeit helper reuse.                         |
| `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`                                       | Thread optional `afterRevision` into room projection reads.                                |
| `apps/api/src/poke-lounge/postgres-poke-lounge-room.repository.ts`                              | Read durable missed transitions by room and `afterRevision`.                               |
| `apps/api/src/poke-lounge/postgres-poke-lounge-room.repository.spec.ts`                         | Assert exclusive/inclusive bounds, max eight, and stable ordering.                         |
| `apps/api/src/poke-lounge/poke-lounge-room.types.ts`                                            | Add `competitiveTransitions` to the public room contract.                                  |
| `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts`                                 | Document transition DTOs and current assignment separation.                                |
| `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.spec.ts`                            | Create DTO contract tests for room snapshots with and without terminal transitions.        |
| `apps/api/src/poke-lounge/dto/competitive-action-response.dto.ts`                               | Expose nullable terminal event ID/revision in REST action responses.                       |
| `apps/api/src/poke-lounge/dto/competitive-action-response.dto.spec.ts`                          | Create terminal non-null and pending/active null action-response contract tests.           |
| `apps/api/src/poke-lounge/poke-lounge-room.service.ts`                                          | Plumb `afterRevision` through GET/subscription authorization and compose bounded recovery. |
| `apps/api/src/poke-lounge/poke-lounge-room.service.spec.ts`                                     | Cover initial empty transitions and recovery-window forwarding.                            |
| `apps/api/src/poke-lounge/poke-lounge.controller.ts`                                            | Accept and forward the optional REST `afterRevision`.                                      |
| `apps/api/src/poke-lounge/poke-lounge.controller.spec.ts`                                       | Assert omitted and provided REST recovery query behavior.                                  |
| `apps/api/src/poke-lounge/poke-lounge.gateway.ts`                                               | Forward subscription `afterRevision` into authorization/replay.                            |
| `apps/api/src/poke-lounge/poke-lounge.gateway.spec.ts`                                          | Assert initial empty and bounded reconnect transition behavior.                            |
| `apps/api/test/poke-lounge-competitive.repository.integration-spec.ts`                          | Cover real PostgreSQL action/leave races, replay, and atomicity.                           |
| `apps/api/test/poke-lounge-room.e2e-spec.ts`                                                    | Cover REST/Socket recovery bounds and composite publication end to end.                    |
| `apps/api/openapi.json`                                                                         | Generated API contract.                                                                    |
| `apps/web/src/types/api.d.ts`                                                                   | Generated Web API types.                                                                   |
| `apps/web/src/components/poke-lounge/runtime/game/network/localPreviewRoom.ts`                  | Define internal terminal transition room events.                                           |
| `apps/web/src/components/poke-lounge/runtime/game/network/competitive-projection.ts`            | Parse action/transition metadata and omitted current assignment compatibly.                |
| `apps/web/src/components/poke-lounge/runtime/game/network/competitive-projection.test.ts`       | Cover metadata pairs, optional omission, and absent transition compatibility.              |
| `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`                        | Separate bounded terminal/current caches and independent room/terminal cursors.            |
| `apps/web/src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts`  | Cover listener replay, both delivery orders, duplicate, out-of-order, and recovery.        |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`                        | Apply same-match terminal, prioritize ended confirm, cleanup, and return to WorldScene.    |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch.ts`          | Keep old and next launch keys independent and replay the next assignment once.             |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch.test.ts`     | Assert World-owned old-key completion and exactly-once next launch.                        |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`                         | Own launch cache, complete handed-off old key, then launch current assignment.             |
| `apps/web/src/components/poke-lounge/runtime/game/battle/authoritative-battle-adapter.ts`       | Render terminal projection consistently for winner and loser.                              |
| `apps/web/package.json`                                                                         | Add `tsx` dev dependency and `test:poke-lounge-unit` script.                               |
| `pnpm-lock.yaml`                                                                                | Lock the Web `tsx` dev dependency.                                                         |
| `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`                                            | Focused mocked transition and scene lifecycle regression.                                  |
| `apps/web/tests/e2e/poke-lounge-five-player-tournament.spec.ts`                                 | Implement C3T/C4T per-context observables and role gates.                                  |
| `apps/web/scripts/playwright-integration-runner.mjs`                                            | Preserve DB environment isolation and targeted artifacts.                                  |
| `docs/vscoke-monorepo-concept.md`                                                               | Record the composite transition/current-assignment boundary.                               |

---

### Task 0: Freeze HXN3RA as RED Contracts

**Files:**

- Modify API repository/service specs listed in the file map.
- Modify `server-room-snapshot-replay.test.ts`.
- Modify focused multiplayer and 5-browser Playwright specs.
- Modify `apps/web/package.json` and `pnpm-lock.yaml` only to make the focused Node tests executable.

- [x] **Step 1: Establish the Web unit-test command**

Add `tsx` to `apps/web` devDependencies, update the lockfile with pnpm, and add `"test:poke-lounge-unit": "tsx --test"`. All Web Node-test commands in this plan use that script rather than assuming an undeclared `tsx` binary.

- [x] **Step 2: Add API RED cases**

Cover the final turn where player A submits first and receives pending, player B submits second, the match completes, the room advances, and one repository result contains:

```ts
expect(result.room).toMatchObject({
  revision: terminalRevision,
  competitiveTransitions: [
    {
      terminalEventId: expect.any(String),
      terminalRoomRevision: terminalRevision,
      projection: {
        matchId: oldMatchId,
        status: "completed",
        terminalEventId: expect.any(String),
        terminalRoomRevision: terminalRevision,
        terminal: expect.any(Object),
      },
    },
  ],
  competitive: { matchId: nextMatchId, status: "pending" },
});
```

Assert normal action completion makes the terminal REST response and both stored/replayed action receipts resolve to the same old completed projection and event metadata. For leave/forfeit, assert only an existing pending action receipt (`0..1`) is terminal-resolved, the leave room-command receipt is stored/replayed, and no absent action receipt is created. Pending/active REST responses contain null metadata. Duplicate submission replays the same event ID, and `tournament-unranked` keeps history count zero.

- [x] **Step 3: Add Web RED cases**

Feed one snapshot with old terminal transition plus next assignment. Assert terminal cache insertion works with no listener; a later listener replays terminals oldest to newest and current assignment last; duplicate event IDs/match IDs do not add cache entries; and `lastAppliedTerminalRevision` advances only after terminal handling. Assert REST-terminal-then-Socket and Socket-then-REST merge the event once without replacing the current assignment. Cover absent `competitiveTransitions` as `[]`, omitted `competitive` without coercing it to null, and staged-rollout legacy completed receipts with absent/null metadata as backward-readable but excluded from terminal cache/dedup while recovery converges from the current room.

Add scene cases for:

- loser waiting -> same-match defeat -> confirm -> WorldScene;
- winner waiting -> same-match victory -> confirm -> WorldScene -> next assignment exactly once;
- authoritative `phase === "ended"` confirm does not early-return before cleanup;
- next assignment never replaces the active old BattleScene before its terminal is consumed.

- [x] **Step 4: Add targeted Playwright RED assertions**

Implement `readTesterRuntimeState(page)` without adding production hooks. It reads the exposed store clone, active scene, battle snapshot, and, only while BattleScene is active, structurally reads its runtime `authoritativeProjection`.

Expected RED for HXN3RA behavior: Tester 4 is rejected for an old first-match waiting state, and Tester 5 is rejected because confirm does not enter the next match. C3T must record both seed 4 and seed 5 observing a terminal result for the exact old match ID before either confirm action; a direct WorldScene observation is not terminal proof.

**Verification:**

```bash
pnpm --filter @vscoke/api test -- \
  competitive/postgres-competitive-action.repository.spec.ts \
  competitive/competitive-match.service.spec.ts --runInBand

pnpm --filter @vscoke/web test:poke-lounge-unit -- \
  src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts

pnpm --filter @vscoke/web e2e -- \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium --grep "terminal transition"
```

**Gate:** New assertions fail for the documented missing contract while unrelated existing tests remain green. Do not implement production changes before this RED evidence is recorded.

### Task 1: Add API Migration and Composite Contract

**Files:** API migration, match/action-receipt entities, action and room types, both response DTOs/specs, OpenAPI, generated Web API types, and Web parser tests from the file map.

- [x] **Step 1: Add nullable terminal metadata**

Add `terminal_event_id` and `terminal_room_revision` to the competitive match table. Existing rows remain valid with both values null. Require both-or-neither for newly persisted metadata, a unique non-null event ID, and a partial `(room_id, terminal_room_revision)` recovery index.

- [x] **Step 2: Extend the action projection and receipt additively**

Add nullable `terminalEventId` and `terminalRoomRevision` to `CompetitiveActionProjection` and `CompetitiveActionResponseDto`. Every newly created terminal projection requires both non-null; pending and active projections require both null. Persist and replay exactly that projection shape in new action-receipt JSON. Permit absent/null metadata only when parsing a legacy completed REST receipt, mark it ineligible for transition cache/dedup, and cover the staged-rollout path. The transition wrapper's metadata must equal its projection metadata.

- [x] **Step 3: Define the public composite snapshot**

Add `competitiveTransitions` while retaining the existing optional/omitted `competitive` as the current assignment. Do not introduce `competitive: null`. Parse absent transition arrays as `[]` during the compatibility window and test omitted current-assignment compatibility. Validate completed status, metadata equality, terminal consistency, event ID, revision bounds, room ownership, maximum length eight, and deterministic ordering.

- [x] **Step 4: Generate the contract reproducibly**

Regenerate OpenAPI and Web types twice. Capture SHA-256 for `apps/api/openapi.json` and `apps/web/src/types/api.d.ts` after the first generation, require identical hashes after the second, and inspect the generated diff for only the planned additive metadata/transition fields. Verify ranked score/history DTOs are unchanged. Do not use `check:api-contract` against an intentionally dirty generated contract; reserve it for the clean committed contract/CI gate in Task 6.

**Verification:**

```bash
pnpm --filter @vscoke/api test -- \
  1794614400000-add-poke-lounge-competitive-transition-metadata.spec.ts \
  poke-lounge/dto/poke-lounge-room-response.dto.spec.ts \
  poke-lounge/dto/competitive-action-response.dto.spec.ts \
  poke-lounge/competitive/competitive-action.entity.spec.ts --runInBand
pnpm generate:types
shasum -a 256 apps/api/openapi.json apps/web/src/types/api.d.ts > /tmp/poke-lounge-contract.sha256
pnpm generate:types
shasum -a 256 apps/api/openapi.json apps/web/src/types/api.d.ts | diff -u /tmp/poke-lounge-contract.sha256 -
git diff -- apps/api/openapi.json apps/web/src/types/api.d.ts
pnpm build:api
```

**Gate:** Migration and contract tests pass; the second generation is byte-stable; production dist contains no E2E bootstrap/token/`__e2e` strings; generated contract diff contains only the planned additive action metadata and room transition fields.

### Task 2: Make Terminal, Next Assignment, Receipts, and Recovery Atomic

**Files:** PostgreSQL action/room repositories, shared match finalization, room service/controller/gateway, event publisher, and their unit/integration/E2E specs.

- [x] **Step 1: Generate metadata once inside the terminal transaction**

When the second action resolves a terminal turn, allocate one event ID, advance the room revision once, store terminal metadata on the completed match, create the next assignment, resolve both action receipts with the completed projection metadata, and preserve verified history behavior in the same transaction. Return the same completed projection in the terminal REST action response.

- [x] **Step 2: Return and publish one composite snapshot**

Build the post-commit snapshot with the old completed projection in `competitiveTransitions` and the next assignment in `competitive`. Publish once after commit. A transaction rollback publishes nothing.

- [x] **Step 3: Implement durable `afterRevision` recovery**

Plumb optional `afterRevision` through controller -> `PokeLoungeRoomService.getRoom` / `authorizeSubscription` -> room repository/projection query and through gateway subscription authorization. Without it, return `competitiveTransitions: []`. With it, query at most eight completed match rows in `(afterRevision, currentRevision]`, order them by terminal revision and event ID, and include them before the current assignment in REST/Socket recovery snapshots. A command replay and reconnect replay reuse the original event ID.

- [x] **Step 4: Unify action completion and active-participant leave/forfeit**

Extract one transaction-scoped terminal-finalization/idempotency helper for action-driven completion and active participant leave/forfeit. Both paths allocate or reuse one event ID/revision, advance the bracket once, create at most one next assignment, write history once according to policy, and publish one composite snapshot only after commit. Normal action completion resolves two action receipts. Leave/forfeit terminal-resolves only an already existing pending action receipt (`0..1`) and stores/replays its room-command receipt; explicitly test that it never creates a nonexistent action receipt.

- [x] **Step 5: Preserve score/history policy**

Assert exactly two-player `ranked-head-to-head` writes two verified histories with 100/50 once. Assert every 3~6-player `tournament-unranked` terminal writes zero histories while still creating transitions and the next assignment.

**Verification:**

```bash
pnpm --filter @vscoke/api test -- \
  competitive/postgres-competitive-action.repository.spec.ts \
  competitive/competitive-match.service.spec.ts \
  poke-lounge/postgres-poke-lounge-room.repository.spec.ts \
  poke-lounge/poke-lounge-room.service.spec.ts \
  poke-lounge/poke-lounge.controller.spec.ts \
  poke-lounge/poke-lounge.gateway.spec.ts --runInBand

TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @vscoke/api test:e2e -- \
  --runInBand poke-lounge-competitive.repository.integration-spec.ts \
  poke-lounge-room.e2e-spec.ts
```

The real PostgreSQL suite must include action-versus-leave/forfeit races, repeated leave/forfeit commands, repeated action commands, and reconnect recovery. Assert one terminal event/revision, one bracket advance, at most one next assignment, one composite publication, stable receipt replay, and the expected history count.

**Gate:** Transaction rollback, action and leave/forfeit command replay/races, bounded reconnect, ranked history, tournament history-zero, and single-publication cases all pass against real PostgreSQL.

### Task 3: Apply Terminal Transitions Before Current Assignment on Web

**Files:** `localPreviewRoom.ts`, `competitive-projection.ts`, `serverRoom.ts`, snapshot replay tests, and focused mocked multiplayer tests.

- [x] **Step 1: Split caches**

Maintain `currentAssignmentProjection` separately from `recentTerminalProjections`. Key the terminal cache by event ID and match ID, bound it to the newest eight projections, and cache valid transitions even when no listener is registered. A duplicate snapshot adds no duplicate cache entry, and a current next assignment never overwrites an unseen completed transition.

- [x] **Step 2: Replay listeners in terminal-first order**

When a new `COMPETITIVE_STATE` listener registers, replay cached terminals oldest to newest and then the current assignment. Live snapshot delivery follows the same sequence. Listener absence affects only immediate notification, never cache insertion.

- [x] **Step 3: Split room and terminal cursors**

Maintain `lastAppliedRoomRevision` independently from `lastAppliedTerminalRevision`. Initialize a fresh session from the initial room snapshot current revision. Keep the in-memory cursor across Socket reconnect, but treat full page reload as a new fresh baseline with no persisted cursor restoration. Room state may reach revision R while an active old match is still missing its completion transition, but this must not advance the terminal cursor. Advance the terminal cursor only after transition application succeeds. Use it as `afterRevision` for mismatch recovery and process each bounded page in order.

- [x] **Step 4: Keep REST terminal responses terminal-only**

Parse new terminal REST action responses through the same event ID dedup path and merge them only into `recentTerminalProjections`. Never write a terminal REST response into `currentAssignmentProjection`. A legacy completed receipt with absent/null metadata is readable but bypasses cache/dedup and starts recovery/current-room convergence. Test both delivery orders, new and legacy stored-receipt replay, duplicate same-revision snapshots, and lower room revisions.

- [x] **Step 5: Add completed-bracket grace recovery**

When the store bracket proves the active BattleScene's match completed but its event ID has not arrived, start bounded recovery using `lastAppliedTerminalRevision`. Do not synthesize terminal HP, winner, loser, score, or reason from client state. A malformed or mismatched transition leaves the terminal cursor unchanged and retries bounded recovery.

**Verification:**

```bash
pnpm --filter @vscoke/web test:poke-lounge-unit -- \
  src/components/poke-lounge/runtime/game/network/competitive-projection.test.ts \
  src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts \
  src/components/poke-lounge/runtime/game/state/game-state-store.test.ts

pnpm --filter @vscoke/web e2e -- \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium --grep "terminal transition|reconnect|out-of-order"
```

**Gate:** Cache insertion is listener-independent; listener replay is terminal-oldest-first then current; REST terminal never replaces current assignment; event ID dedup is deterministic in both delivery orders; and the terminal cursor never advances past an unapplied transition.

### Task 4: Complete the BattleScene-to-World-to-Next-Battle Lifecycle

**Files:** `BattleScene.ts`, `competitive-battle-launch.ts`, `WorldScene.ts`, authoritative adapter, and their focused tests.

- [x] **Step 1: Apply only same-match terminal transitions**

BattleScene accepts the completed transition whose match ID and assignment revision match its authoritative projection. A next-assignment projection cannot mutate the old battle.

- [x] **Step 2: Prioritize ended confirmation**

Handle authoritative victory/defeat confirmation before ordinary authoritative action selection. Confirmation clears old room subscriptions, input-pending state, and scene-local projection, then passes the exact old `matchId:assignmentRevision` completion key through WorldScene create data/handoff. BattleScene does not mutate the launch cache.

- [x] **Step 3: Complete only the handed-off old launch key**

WorldScene owns the launch cache and calls `complete(oldKey)` after the handoff. It must not globally reset the cache or delete the next assignment key. Add an assertion that the old key is removed while an already-cached or subsequently received next key remains intact.

- [x] **Step 4: Replay the next assignment once**

WorldScene reads the current assignment after cleanup. Seed 5 receives the round 2 seed 1 versus seed 5 assignment once; seed 4 remains in WorldScene. Replayed snapshots and duplicate transition events cannot launch a duplicate BattleScene.

- [x] **Step 5: Preserve non-authority battle behavior**

Wild, solo, casual, and existing PvP result confirmation continue to use their current flows.

**Verification:**

```bash
pnpm --filter @vscoke/web test:poke-lounge-unit -- \
  src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch.test.ts \
  src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts

pnpm --filter @vscoke/web e2e -- \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium --grep "loser result|winner confirm|next assignment"

pnpm --filter @vscoke/web type:check
```

**Gate:** Tester 4's modeled flow reaches loser result then WorldScene; Tester 5 reaches winner result, confirms, completes only the old launch key in WorldScene, preserves the next key, and enters only the new match.

### Task 5: Replace False-Positive C3/C4 with Targeted C3T/C4T

**Files:** 5-browser spec, integration runner artifact handling, and CI collection gate. The existing test-only API bootstrap/assertion surface is not a default modification target.

- [x] **Step 1: Read each context independently**

`readTesterRuntimeState(page)` returns:

```ts
type TesterRuntimeState = {
  currentPlayerId: string;
  revision: number | null;
  round: number | null;
  activeMatchId: string | null;
  activeMatchTransport: string | null;
  canonicalBracket: unknown;
  activeScene: string | null;
  battle: BattleE2eSnapshot | null;
  competitive: {
    matchId: string;
    bracketMatchId: string;
    currentTurn: number;
    status: string;
    terminal: unknown;
    submittedPlayerIds: string[];
  } | null;
};
```

Never pass a REST room into `recordCheckpoint` as proof of a browser state.

For the Firefox full-page reload checkpoint, expect a new fresh-session terminal baseline from that reload's initial room snapshot current revision. Do not require restoration of the pre-reload in-memory terminal cursor. Ordinary Socket reconnect checkpoints continue to require the same page's cursor to be retained.

- [x] **Step 2: Add C3T terminal UI gate**

Sample each context from the first terminal commit for up to 15 seconds:

- seed 4 must expose the exact old match ID and loser terminal/result state, and C3T must record that observation before confirm;
- after its store reaches the next revision, old `result = null` plus `상대의 선택을 기다리는 중...` is an immediate FAIL;
- seed 5 must expose the same exact old match ID and winner terminal/result state, and C3T must record that observation before confirm;
- a direct transition to WorldScene without the per-seed old-match terminal observation is a FAIL, not a shortcut PASS;
- only after both old-match observations are persisted, press each role's real confirm control, including the Mobile WebKit control, and record both post-confirm states.

- [x] **Step 3: Add C4T next assignment gate**

Within 15 seconds:

- all stores equal the REST/DB next revision, round, active match ID, and canonical bracket;
- seed 1 and seed 5 are in BattleScene with the next competitive match ID, bracket match ID, turn, and status;
- seed 2 and seed 3 remain in WorldScene and do not treat the later round 2 match as active yet;
- seed 4 is in WorldScene, or its loser result is confirmed and then reaches WorldScene;
- no active BattleScene exposes the old first-match waiting state.

- [x] **Step 4: Preserve forced-switch and security evidence without a default bootstrap change**

Use the current context hook and structural scene read for client observables; they are sufficient for the planned C3T/C4T evidence. Keep the existing test-only assertion endpoint unchanged for action-kind counts, forced-switch turns, and DB evidence. Modify the test-only API bootstrap/assertion surface only if a failing RED test proves a required observable is unavailable, and then limit the change to that read-only observable. Playwright receives no `DB_*`, `TEST_DATABASE_URL`, database URL, username, or password. Artifact/log redaction remains mandatory.

- [x] **Step 5: Derive PASS from context observations**

Write `client-terminal-convergence.json` with pre-terminal, old-match terminal-observed, post-confirm, and C4T snapshots per tester. The seed 4 and seed 5 terminal-observed records must contain the same exact old match ID and their respective loser/winner result before confirm. Tester reports and summary use only those observations. Any missing old-match terminal record or role mismatch fails the tester and the overall run even if REST, DB, bracket, or later WorldScene state is correct.

**Verification:**

```bash
node --test apps/web/scripts/playwright-integration-environment.test.mjs

PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 pnpm --dir apps/web exec playwright test \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts \
  --project=poke-lounge-five-browser-integration --list

TEST_DATABASE_URL="$TEST_DATABASE_URL" \
POKE_LOUNGE_E2E_RUN_ID="terminal-convergence-targeted-01" \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
```

**Gate:** Exactly one integration test is collected; workers 1 and retries 0; C0~C2, forced switch, Firefox reload with a fresh initial-snapshot baseline, same-page Socket reconnect cursor retention, per-role old-match C3T evidence before confirm, C4T, DB assertions, and error checks all pass from actual context evidence.

### Task 6: Documentation and Final Regression

**Files:** hardening report, monorepo concept, this plan status, and generated run artifacts.

- [x] **Step 1: Correct the historical result**

Record HXN3RA as backend/DB PASS but client convergence FAIL/S1. Do not retain it as a release PASS.

- [x] **Step 2: Run static and focused gates**

```bash
pnpm test:poke-lounge-battle
pnpm test:api
pnpm --filter @vscoke/web test:poke-lounge-unit
pnpm --filter @vscoke/api lint
pnpm --filter @vscoke/web type:check
pnpm --filter @vscoke/web lint
pnpm build:api
pnpm build:web
node scripts/check-api-production-dist.mjs
git diff --check
```

- [ ] **Step 3: Run the clean committed contract/CI gate — pending local commit**

After the intended OpenAPI and generated Web type changes are committed and those two files are clean, run `check:api-contract`. Do not use it earlier as an implementation-time generation check.

```bash
git diff --exit-code -- apps/api/openapi.json apps/web/src/types/api.d.ts
pnpm check:api-contract
```

**Status:** pending local commit. This gate was not executed in the dirty worktree; run it after the intended OpenAPI and generated Web type changes are committed and clean.

- [x] **Step 4: Run three fresh cold 5-browser gates**

Use three distinct run IDs, fresh room codes, DB reset, API process, Web process, and Next dist directories. Each run uses workers 1 and retries 0.

```bash
for run in terminal-convergence-release-01 terminal-convergence-release-02 terminal-convergence-release-03
do
  TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  POKE_LOUNGE_E2E_RUN_ID="$run" \
  pnpm --filter @vscoke/web e2e:integration -- \
    tests/e2e/poke-lounge-five-player-tournament.spec.ts
done
```

- [x] **Step 5: Audit artifacts**

Each run must contain five tester reports, five screenshots, environment/matrix, DB assertions, Socket revisions, network errors, forced-switch evidence, and client terminal convergence evidence. Search file artifacts for database URLs/passwords, bearer tokens, ID tokens, and sessions.

**Gate:** All three runs pass C3T/C4T with no retry, HTTP 5xx, page error, network error, token leak, cursor regression, duplicate next launch, ranked score regression, or tournament history row. The separate clean committed contract gate above remains pending local commit.

## Migration, Legacy, and Compatibility

- Migration columns are nullable so pre-existing completed matches remain readable. Null metadata means no historical transition replay is available for that legacy match.
- New API projections always expose `competitiveTransitions`; Web parsing accepts an absent field as `[]` during staged rollout. Initial GET/subscription without `afterRevision` also deliberately returns `[]`.
- `CompetitiveActionProjection` adds nullable metadata fields. Pending/active projections use null; newly completed terminal projections use non-null values. Only legacy completed REST receipts may have absent/null metadata for backward reading; they are excluded from transition cache/dedup and converge through recovery/current room.
- Preserve `competitive` as optional/omitted when there is no current assignment. Web parsing accepts omission and does not require or synthesize null.
- Deploy migration first, then a Web client that accepts absent transition arrays, omitted current assignments, and nullable action metadata, then enable the API composite field. Verify the old current-assignment-only response remains parseable during the rollout window.
- Migration `down` drops only the new index and metadata columns. It cannot recreate transition replay metadata already discarded by rollback; record that operational consequence.
- Existing room JSONB version 2 bracket data, match IDs, action receipts, ranked history rows, and `game_history` schema remain unchanged.
- Production bootstrap, auth guard, and ranking filters do not gain E2E identities or assertion endpoints.

## Idempotency, Ordering, Reconnect, and Security

- `terminalEventId` is allocated once inside the terminal transaction and stored on the match. Receipt replay reuses it.
- `(roomId, terminalEventId)` is logically unique; duplicate event delivery is a no-op on both server projection and client rendering.
- Every new transition wrapper, terminal REST action projection, and stored receipt carries the same non-null event ID/revision. Pending/active projections carry null metadata; legacy completed receipts with absent/null metadata cannot become transition events.
- Action completion and active-participant leave/forfeit share one finalization helper, so races cannot allocate two terminal events or next assignments. Action completion resolves two action receipts; leave/forfeit resolves only an existing pending action receipt (`0..1`) plus its room-command receipt and creates no missing action receipt.
- Terminal transitions are ordered by terminal room revision then event ID and bounded to eight per response. Lower room revisions never replace a newer current assignment.
- `lastAppliedRoomRevision` advances with safe room state independently. `lastAppliedTerminalRevision` advances only after each terminal transition succeeds.
- A fresh session baselines `lastAppliedTerminalRevision` from its initial room snapshot current revision. Same-page Socket reconnect retains it; full page reload persistence is out of scope and starts a new baseline.
- Reconnect and mismatch recovery supply `lastAppliedTerminalRevision` as `afterRevision`; the API returns the next ordered window in `(afterRevision, currentRevision]` before the current assignment.
- The bounded terminal cache stores unseen valid events without listeners and replays them oldest first before current assignment. REST terminal responses merge only into that cache.
- A malformed or mismatched transition does not advance the terminal cursor. It triggers bounded REST recovery.
- Terminal projections contain public player/match state only. They do not expose account IDs, action request hashes, tokens, sessions, database values, or server seed.
- The API alone resolves terminal state, winner, loser, and ranked 100/50 history. Browser result fields remain display data, not authority.
- The Playwright process continues to use only the test-only assertion endpoint for DB evidence; DB credentials remain limited to migration/API children.

## Completion Criteria

- API publishes one post-commit composite snapshot with old terminal transition and current next assignment.
- Terminal metadata, room revision, next assignment, applicable receipts, and ranked histories commit or roll back together. Normal action completion resolves both action receipts; leave/forfeit resolves an existing pending action receipt (`0..1`) plus its room-command receipt and never creates an absent action receipt.
- Every new terminal REST response, stored/replayed receipt, and Socket transition exposes one identical non-null event ID/revision; pending/active projections expose null metadata. Legacy completed REST receipts with absent/null metadata remain readable but never enter terminal cache/dedup and converge through recovery/current room.
- Missed transitions recover through `afterRevision`; duplicate/replayed transitions render once.
- Initial GET/subscription returns no historical transitions; recovery returns at most eight ordered transitions from the requested exclusive revision through the current inclusive revision.
- `competitive` remains optional/omitted when no current assignment exists.
- Current assignment and the newest eight terminal projections remain separate; listener replay emits terminal oldest-first then current, regardless of listener timing.
- Room and terminal cursors remain independent, and terminal REST responses never replace the current assignment.
- Fresh sessions baseline terminal revision from the initial current room revision; same-page Socket reconnect retains the cursor, while Firefox/full-page reload starts a fresh baseline without persisted restoration.
- Both first-match players receive a same-match terminal result.
- Seed 4 confirms loss and remains in WorldScene.
- Seed 5 confirms victory and enters the seed 1 versus seed 5 next match exactly once.
- BattleScene hands off the exact old launch key; WorldScene completes only that key and never resets/deletes the next assignment key.
- Seeds 2 and 3 remain in WorldScene while the first round 2 match is active.
- No client reaches the next revision while displaying the old first-match waiting state.
- C3T/C4T read and record actual context store, scene, battle, and competitive states.
- C3T records seed 4 loser and seed 5 winner terminal/result evidence for the exact old match before either confirm; WorldScene alone cannot satisfy C3T.
- Exactly two-player ranked terminal still writes verified 100/50 histories once.
- Five-player tournament terminal writes `game_history = 0`.
- Three fresh 5-browser runs pass with workers 1, retries 0, five accounts/seats, forced switches, Firefox reload, zero 5xx/page/network errors, and complete redacted artifacts.
- API/Web lint, typecheck, build, focused unit/integration/E2E, OpenAPI contract, production dist scan, formatting, and `git diff --check` pass.

## Risks and Mitigations

| Risk                                                                     | Mitigation                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Same revision carries conflicting terminal-only and next-only snapshots  | Publish one composite snapshot after commit; never split the canonical room state.                       |
| First submitter never receives terminal HTTP response                    | Deliver the completed old projection through durable `competitiveTransitions`.                           |
| Next assignment overwrites old terminal in the browser                   | Process and acknowledge unseen transitions before replacing the current cache or cursor.                 |
| Duplicate Socket/REST recovery renders a result or launches battle twice | Persist stable event IDs and deduplicate terminal rendering and assignment launch keys.                  |
| REST terminal response overwrites the next assignment                    | Merge REST terminal projections only into the bounded terminal cache.                                    |
| Disconnect occurs between terminal commit and client receipt             | Query terminal metadata newer than `afterRevision` on reconnect.                                         |
| Room cursor skips an unapplied old terminal                              | Track room and terminal cursors separately; advance terminal cursor only after consumption.              |
| Listener attaches after the terminal snapshot                            | Cache transitions without listeners and replay terminal oldest-first before current assignment.          |
| Action completion races leave/forfeit                                    | Share one transactional finalization/idempotency helper and assert one event in real PostgreSQL.         |
| BattleScene consumes another match's transition                          | Require room, match ID, assignment revision, completed status, and terminal consistency.                 |
| Winner remains on ended screen                                           | Prioritize ended confirm, cleanup old authoritative state, then return to WorldScene.                    |
| Old-battle cleanup deletes the next launch key                           | Let WorldScene complete only the handed-off old key; forbid global launch-cache reset.                   |
| Bracket-only tests pass while UI is stale                                | C3T/C4T assert role-specific scene, result/message, and reflective active projection in each context.    |
| Legacy rows lack event metadata                                          | Keep columns nullable and document that only newly completed matches support transition replay.          |
| Ranked or tournament score policy regresses                              | Assert ranked verified 100/50 once and tournament history zero in unit, PostgreSQL, and 5-browser gates. |
| Test DB secrets leak into Web/Playwright artifacts                       | Preserve environment isolation assertions, test-only HTTP DB evidence, and artifact redaction scans.     |

## Recommended Commit Boundaries

1. `test(poke-lounge):터미널 수렴 회귀 추가`
2. `feat(api):경쟁 종료 전환 메타데이터 추가`
3. `fix(api):경쟁 종료 스냅샷 원자성 보장`
4. `fix(web):경쟁 전환 적용 순서 보장`
5. `fix(web):전투 종료 후 다음 대진 연결`
6. `test(poke-lounge):5인 클라이언트 수렴 검증`
7. `docs(poke-lounge):터미널 수렴 결과 기록`

Before each commit, stage only the task's files and verify the task Gate. Before local squash merge, update the work branch with current `main`, rerun Task 6, and use one final Korean commit message that follows the repository's `type(scope):요약` rule.
