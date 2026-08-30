# Task 5 CI Migration Report

## Status

`DONE_WITH_CONCERNS`

## Evidence

GitHub Actions run `29105454358` applied migrations to a fresh PostgreSQL database. `CreateResumeRagTables1760000000000` succeeded, then `AddPokeLoungeGameType1793664000000` failed with PostgreSQL error `42704`: `type "game_history_gametype_enum" does not exist`. The API integration and E2E stage was skipped after that migration failure.

The migration previously executed only:

```sql
ALTER TYPE "game_history_gametype_enum" ADD VALUE IF NOT EXISTS 'POKE_LOUNGE'
```

No earlier repository migration creates the TypeORM enum. The current `GameType` source of truth contains exactly `SKY_DROP` and `POKE_LOUNGE`.

## Change

`AddPokeLoungeGameType1793664000000` now executes a PostgreSQL `DO` block:

- When `to_regtype('game_history_gametype_enum')` is `NULL`, it creates `game_history_gametype_enum` with `SKY_DROP` and `POKE_LOUNGE`.
- When the enum already exists, it only runs `ADD VALUE IF NOT EXISTS 'POKE_LOUNGE'`.

This retains the historical migration identifier for databases that already recorded it. It does not enable `synchronize`, connect to an implicit database, drop objects, rewrite enum-backed tables, or recreate production schema.

## Test Evidence

The query-runner capture spec was written before the migration change. It failed against the previous SQL because neither the missing-enum creation branch nor the existing-enum branch existed. After the change, both focused cases pass without a database connection:

```text
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

The final local non-DB verification also passed:

```text
pnpm test:api: 37 suites, 219 tests passed
pnpm --filter @vscoke/api lint: passed
pnpm build:api: passed
git diff --check: passed
```

## Remaining Concern

No local PostgreSQL connection, migration execution, integration test, or E2E test was run, by request. The actual PostgreSQL parser and fresh-database migration sequence must rerun in GitHub Actions before this result can be considered fully verified.

## Task 7: Production Legacy Core Baseline

GitHub Actions run `29106614573` passed the enum migration, then failed in `CreateGamePokeLoungeState1793750400000` with PostgreSQL error `42P01` because its foreign key references the absent `user` table. The historical `user` and `game_history` schema was created outside tracked migrations.

The temporary test-only baseline is replaced by `src/migrations/1759999999999-create-legacy-core-schema.ts`, so production and fresh PostgreSQL CI execute the same chain. The test datasource now registers only the production migration glob, and both datasources keep `synchronize: false`.

The baseline applies a strict policy:

- If `public.user`, `public.game_history`, and `public.game_history_gametype_enum` are all absent, create the canonical historical schema with enum label `SKY_DROP` only.
- If all are present, validate the exact columns, PostgreSQL types, nullability, PKs, game-history FK, known default forms, and enum labels before doing nothing.
- The accepted enum states are exactly `SKY_DROP` or `SKY_DROP, POKE_LOUNGE`, covering production databases where the later enum migration is already recorded.
- If objects are partial or mismatched, raise an exception without drop, alter, or repair.
- `down` raises an irreversible exception instead of deleting possibly adopted production data.

`AddPokeLoungeGameType1793664000000` remains the owner of adding `POKE_LOUNGE` after a fresh baseline.

The SQL contract and datasource tests were written first and failed because the production baseline did not exist and the test datasource still registered the test-only migration. After implementation, the focused verification passed:

```text
Focused production baseline/data-source tests: 3 suites, 22 tests passed
```

The guarded integration spec creates a random `_test` database on the `TEST_DATABASE_URL` server and covers fresh create, exact evolved-schema adopt, partial reject, mismatch reject, data preservation, and irreversible rollback. Local execution is unavailable because `TEST_DATABASE_URL` is unset and the installed Docker client has no running daemon; GitHub Actions PostgreSQL must execute this spec and the full production migration chain.

Final local verification:

```text
pnpm test:api: 38 suites, 222 tests passed
pnpm --filter @vscoke/api lint: passed
pnpm build:api: passed
built production baseline artifact: confirmed
git diff --check: passed
```

An additional `tsc --noEmit -p apps/api/tsconfig.json` attempt remains red on pre-existing test fixture typing errors in auth, game, espresso, Poke Lounge, API contract, app, and Wordle specs. It reported no error in the new baseline migration or integration spec; the repository's supported API build succeeds because `tsconfig.build.json` excludes specs and test files.

The deploy workflow intentionally remains unchanged and does not run migrations automatically. `docs/deployment-and-env.md` and `docs/operations-runbook.md` record backup, schema/ledger inspection, manual maintenance execution, and mismatch stop conditions for production onboarding.

## Task 7 Review Hardening

The baseline validation now treats a missing required default as `false` instead of allowing PostgreSQL `bool_and` to ignore its `NULL` comparison result. Every creation target and reference is explicitly pinned to `public`; the migration does not mutate the caller's search path or leak session state into later migrations in the same transaction.

Adoption additionally requires validated, non-deferrable, not-deferred primary/foreign keys, `MATCH SIMPLE` for the user foreign key, and one exact valid non-unique `userId` index without a predicate, expression, included column, or extra key column. Constraint and index names remain unrestricted.

The disposable PostgreSQL suite now covers missing and invalid defaults, `tenant, public` search path isolation, PK/FK semantic mismatches, missing/unique/partial/expression/multi-column indexes, and renamed valid constraints/indexes. A TypeORM `MigrationExecutor` scenario seeds a newer ledger row, executes only the older pending baseline, verifies the baseline ledger row, and checks that legacy data is preserved. The production onboarding warning about missing/out-of-order ledger rows remains unchanged.

Local non-DB verification before PostgreSQL CI:

```text
pnpm test:api: 38 suites, 222 tests passed
pnpm --filter @vscoke/api lint: passed
pnpm build:api: passed
git diff --check: passed
```
