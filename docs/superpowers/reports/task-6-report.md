# Task 6 Report: Socket.IO Room Sync With REST Recovery

Date: 2026-07-11
Status: DONE_WITH_CONCERNS

## Implemented

- Added the Nest Socket.IO `/poke-lounge` namespace and a committed-room event
  service wired to the Task 5 post-transaction publisher boundary.
- `room.subscribe` validates a normalized room code, bounded participant/session
  identity, and safe revision cursor, then authorizes against the durable private
  participant session before joining `room:<roomCode>`.
- Gateway payloads contain only public room snapshots. Subscription failures use
  one generic response and cursor regression removes the socket from its previous
  Poke Lounge room before requiring a fresh session.
- Replaced unconditional 750 ms polling with one socket per live room identity,
  reconnect subscription plus one immediate REST recovery, and bounded
  exponential recovery while disconnected or subscription-failed (250 ms to
  5 seconds).
- All REST and Socket.IO snapshots pass through one revision gate. Lower
  revisions and wrong-room snapshots are ignored.
- REST mutations use UUID idempotency keys and `If-Match-Revision`. A network
  failure retries the exact request once with the same body/key/revision. HTTP
  409 snapshots are gated but the command is not automatically replayed.
- Transport disconnect does not leave the durable room. Explicit `dispose()`
  disconnects the socket, removes listeners, and sends the existing REST leave.
- The socket factory override is available only through the `e2e=1` browser test
  seam; it is not part of `ServerRoomOptions` runtime API.
- Added optional `afterRevision` validation/documentation to the REST GET cursor.

## Focused E2E Failures Found And Fixed

The first inherited focused run completed with 16 passing and 2 failing cases.

1. A stale-conflict test expected a POST that started before a newer socket
   snapshot to already contain the newer revision. The test ordering was wrong.
   It now proves the in-flight command keeps its authored revision, the delayed
   lower 409 snapshot cannot roll state back, no automatic replay occurs, and the
   next caller-authored command uses the accepted socket revision.
2. A legacy test expected a second REST join from a repeated `room.connect()`.
   Task 6 requires one live socket/connect per identity. `connect()` is now
   idempotent and the test asserts no extra join or socket is created.

The earlier implementation also automatically replayed revision-conflicted
commands. This violated the Task 6 preflight rule that a 409 requires caller
reconciliation. The replay path was removed; only network failures retry.

## Dependency And Lockfile Review

- API runtime: `@nestjs/platform-socket.io`, `@nestjs/websockets`.
- API dev test client and web runtime: `socket.io-client`.
- Regenerated with repository pnpm `9.12.0`, then restored the repository's
  Prettier YAML representation.
- Final lockfile diff is 271 additions and 6 replaced peer-resolution lines.
  The only unrelated prune candidate (`ts-loader`) was retained.
- `pnpm install --lockfile-only --frozen-lockfile` passed before the final
  representation-only Prettier pass.

## Verification

- `pnpm test:api`: PASS, 39 suites / 235 tests.
- `pnpm --filter @vscoke/api lint`: PASS.
- `pnpm type:check:web`: PASS.
- `pnpm lint:web`: PASS.
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`:
  PASS, 18 Chromium tests.
- `pnpm build`: PASS (web and API).
- `pnpm build:api`: PASS (explicit follow-up evidence).
- `git diff --check`: PASS.

## Remaining Verification Concern

`pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand`
was invoked but stopped before application/database initialization with
`TEST_DATABASE_URL is required for PostgreSQL tests`. This worktree has no
explicit disposable `_test` PostgreSQL URL, matching the Task 5 local safety
constraint. The Socket.IO PostgreSQL E2E cases remain pending an explicit test
database or the repository PostgreSQL 16 CI job; no fake repository fallback was
introduced.

## Review Hardening Follow-up

Commit target: `fix(poke-lounge):웹소켓 복구 경로 보강`

- Added `connect_error` handling to the same bounded recovery scheduler used for
  disconnect/subscription failures. The listener is removed during dispose, and
  browser coverage proves no recovery request is created after cleanup.
- Closed the gateway subscribe race by joining after the first private durable
  authorization, then re-authorizing/reloading the committed snapshot before the
  direct `room.snapshot`. A commit between snapshot N and `socket.join` is now
  observed either by the joined broadcast or the post-join reload. If the
  participant/session changes during that window, the gateway leaves the joined
  room and returns only the generic subscription error.
- Cursor regression now disconnects the stale socket, stops recovery, completes
  a best-effort REST leave with the old identity, clears the stored server
  identity, removes identity/room URL parameters, and emits a page-consumed
  fresh-session event. The game returns to room entry and creates a new identity
  only after an explicit create/join action; it never automatically subscribes
  the stale identity again.
- Mutation retry now classifies only a rejected `fetch` as an ambiguous transport
  failure. HTTP responses with invalid JSON or invalid room schema are surfaced
  without retrying the command.

### Follow-up Verification

- API focused unit: PASS, 5 suites / 50 tests.
- API gateway race unit: PASS, 12 tests.
- New targeted web transport E2E: PASS, 4 Chromium tests.
- Full multiplayer E2E: PASS, 21 Chromium tests.
- Full API unit: PASS.
- Web typecheck and full API/web lint: PASS.
- Full web/API build: PASS.
- PostgreSQL API E2E was retried and remains environment-blocked before app
  initialization because `TEST_DATABASE_URL` is not set.

## Second Review Hardening Follow-up

Commit target: `fix(poke-lounge):웹소켓 전환 지연 제거`

- Cursor regression now clears the local identity and emits the diagnostic and
  fresh-session events synchronously after disconnect. REST leave starts only as
  best-effort background cleanup through the already rejection-safe mutation
  queue, so a pending or rejected leave cannot delay room entry.
- Added pending-leave and repeated transport-rejection coverage. Both cases prove
  immediate fresh-session UI, no stale recovery timer, and no unhandled page
  rejection.
- Split response handling into explicit fetch transport, response-body read,
  JSON parse, and room-schema boundaries. Fetch rejection and body stream read
  rejection retry the exact command once; JSON syntax and schema errors do not
  retry.

### Second Follow-up Verification

- New transition/body-read focused E2E: PASS, 5 Chromium tests.
- Full multiplayer E2E: PASS, 23 Chromium tests.
- Full API unit, web typecheck, full API/web lint, and web/API build: PASS.
