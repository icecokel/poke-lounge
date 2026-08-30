# Poke Lounge Final Review Fix Report

Date: 2026-07-07
Branch: `feature/poke-lounge`

## Change Summary

- Removed participant `sessionId` from public server room responses and Swagger response DTOs.
- Required participant-owned session credentials for server room write APIs:
  - `existing participant rejoin`: `playerId` + original `sessionId`
  - `create/join`: non-empty client-generated `sessionId`; predictable server fallback removed
  - `ready`: `playerId` + `sessionId`
  - `leave`: `playerId` + `sessionId`
  - `party-snapshot`: `playerId` + `sessionId`
  - `match result`: `reportingPlayerId` + `reportingSessionId`
- Updated the web server-room adapter to keep the private `sessionId` in local identity storage and send it only as a write credential.
- Added server-room result ID reverse mapping so local player IDs are submitted as server participant IDs.
- Added class-validator decorators to Poke Lounge request DTOs and applied the production `ValidationPipe` to API e2e coverage.
- Added a production cleanup handle so React unmount destroys the Phaser game and disposes server rooms without relying on dev/E2E globals.
- Added in-memory server room cleanup via stale-room pruning, a process room cap, and waiting-room party snapshot deletion on leave.
- Moved tracked runtime assets from `apps/web/public/assets/rom-*` to curated `apps/web/public/assets/poke-lounge/...` paths.
- Updated runtime references, public manifests, and source metadata so old public `rom-*` URLs are not referenced.
- Added final forbidden asset checks for `apps/web/public/assets/rom-*`.

## Verification Commands

- PASS: `pnpm test:api -- poke-lounge` - 27 suites, 140 tests.
- PASS: `pnpm test:api:e2e -- poke-lounge` - 4 suites, 20 tests.
- PASS: post-review hardening rerun `pnpm test:api -- poke-lounge` - 27 suites, 141 tests.
- PASS: post-review hardening rerun `pnpm test:api:e2e -- poke-lounge` - 4 suites, 20 tests.
- PASS: final critical review rerun `pnpm test:api -- poke-lounge` - 27 suites, 142 tests.
- PASS: final critical review rerun `pnpm test:api:e2e -- poke-lounge` - 4 suites, 20 tests.
- PASS: validation pipe fix rerun `pnpm test:api:e2e -- poke-lounge` - 4 suites, 20 tests.
- PASS: validation pipe fix rerun `pnpm test:api -- poke-lounge` - 27 suites, 142 tests.
- PASS: validation pipe fix rerun `pnpm build:api`
- PASS: cleanup fix rerun `pnpm type:check:web`
- PASS: cleanup fix rerun `pnpm lint`
- PASS: cleanup fix rerun `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium` - 7 tests.
- PASS: room cleanup fix rerun `pnpm --filter @vscoke/api test -- poke-lounge-room.service` - 1 suite, 22 tests.
- PASS: room cleanup fix rerun `pnpm --filter @vscoke/api test:e2e -- poke-lounge-room` - 1 suite, 11 tests.
- PASS: final critical review rerun `pnpm type:check:web`
- PASS: final critical review rerun `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium` - 6 tests.
- PASS: `pnpm type:check:web`
- PASS: `pnpm lint`
- PASS: `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium` - 5 tests.
- PASS: `rg -n 'rom-(extraction|dump|screens|textures|player)' apps/web/src apps/web/public docs/superpowers/plans/2026-07-07-poke-lounge-remaining-work-plan.md docs/superpowers/plans/2026-07-06-poke-lounge-three-phase-roadmap.md` - no matches.
- PASS: `git ls-files 'apps/web/public/assets/rom-*'` - no output.
- PASS: `git diff --check`

## Remaining Risk

- Server room state remains in memory only; cleanup now bounds stale state, but this does not add durable room persistence.
- Remote players now use public `playerId` as the multiplayer snapshot key because server-owned `sessionId` is no longer public.

## 2026-07-07 TTL Prune Follow-up

- Fixed `PokeLoungeRoomService` so every `findRoom` caller prunes with the normalized current time even when the request omits `nowMs`.
- Added an optional injected clock to preserve deterministic unit tests without changing existing room-code constructor usage.
- Added regression coverage for stale waiting/completed rooms on omitted-`nowMs` lookup paths.

### Verification

- PASS: `pnpm --filter @vscoke/api test -- poke-lounge-room.service` - 1 suite, 24 tests.
- PASS: `pnpm --filter @vscoke/api test:e2e -- poke-lounge-room --runInBand` - 1 suite, 11 tests.
- Fixed e2e clock control by letting `resetForTest` inject a deterministic `nowFactory`, while production room lookups now always prune with the normalized current time.
