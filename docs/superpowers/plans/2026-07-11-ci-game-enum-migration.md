# CI Game Enum Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production migration chain create or strictly adopt the historical user/game schema before adding the Poke Lounge enum value.

**Architecture:** A production baseline earlier than every tracked migration creates the historical core only when all three objects are absent, or validates and adopts the exact known schema when all are present. The test datasource runs the same production chain, while the later enum migration remains responsible for adding `POKE_LOUNGE`.

**Tech Stack:** NestJS, TypeORM migrations, PostgreSQL SQL, Jest, TypeScript

## Global Constraints

- Work only in `/Users/smlee/vscoke/worktrees/fix/poke-lounge-test-migration`.
- Do not enable `synchronize`, use an implicit database, or repair/drop existing production schema objects.
- Preserve `GameType` values exactly: `SKY_DROP`, `POKE_LOUNGE`.
- Commit Task 7 exactly as `fix(api):운영 레거시 스키마 기준선 추가`.
- Record the CI rerun risk in `.superpowers/sdd/task-5-ci-migration-report.md`.

---

### Task 1: Cover the migration SQL contract

**Files:**

- Create: `apps/api/src/migrations/1793664000000-add-poke-lounge-game-type.spec.ts`
- Modify: `apps/api/src/migrations/1793664000000-add-poke-lounge-game-type.ts`
- Create: `.superpowers/sdd/task-5-ci-migration-report.md`

**Interfaces:**

- Consumes: `AddPokeLoungeGameType1793664000000.up(queryRunner: QueryRunner): Promise<void>`.
- Produces: a single captured SQL statement containing an absent-enum creation branch and an existing-enum additive branch.

- [x] **Step 1: Write the failing migration SQL spec**

```ts
expect(query).toMatch(
  /CREATE TYPE "game_history_gametype_enum" AS ENUM \('SKY_DROP', 'POKE_LOUNGE'\)/,
);
expect(query).toMatch(
  /ELSE\s+ALTER TYPE "game_history_gametype_enum" ADD VALUE IF NOT EXISTS 'POKE_LOUNGE'/,
);
```

- [x] **Step 2: Run the focused spec and verify it fails**

Run: `pnpm --filter @vscoke/api test -- 1793664000000-add-poke-lounge-game-type.spec.ts --runInBand`

Expected: FAIL because the current migration only sends `ALTER TYPE` and lacks the absent-enum branch.

- [x] **Step 3: Implement the minimal compatible migration SQL**

```sql
DO $$
BEGIN
  IF NOT EXISTS (...) THEN
    CREATE TYPE "game_history_gametype_enum" AS ENUM ('SKY_DROP', 'POKE_LOUNGE');
  ELSE
    ALTER TYPE "game_history_gametype_enum" ADD VALUE IF NOT EXISTS 'POKE_LOUNGE';
  END IF;
END $$;
```

- [x] **Step 4: Run focused and full API verification without a database**

Run: `pnpm --filter @vscoke/api test -- 1793664000000-add-poke-lounge-game-type.spec.ts --runInBand`, `pnpm test:api`, `pnpm --filter @vscoke/api lint`, `pnpm build:api`, and `git diff --check`.

Expected: all commands exit 0; no command uses `migration:run:test` or an E2E database connection.

- [x] **Step 5: Write the CI report and commit**

```bash
git add apps/api/src/migrations/1793664000000-add-poke-lounge-game-type.ts \
  apps/api/src/migrations/1793664000000-add-poke-lounge-game-type.spec.ts \
  docs/superpowers/plans/2026-07-11-ci-game-enum-migration.md \
  .superpowers/sdd/task-5-ci-migration-report.md
git commit -m "fix(api):신규 DB 게임 enum 마이그레이션 보강"
```

### Task 2: Bootstrap test-only legacy core schema

**Files:**

- Create: `apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.ts`
- Create: `apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.spec.ts`
- Modify: `apps/api/src/test-data-source.ts`
- Modify: `apps/api/src/test-data-source.spec.ts`
- Modify: `apps/api/src/data-source.spec.ts`
- Modify: `.superpowers/sdd/task-5-ci-migration-report.md`

**Interfaces:**

- Consumes: `User`, `GameHistory`, and `GameType` entity contracts plus `createTestDataSourceOptions()`.
- Produces: a test-only migration path ordered before `src/migrations`, creating the historical `user` table, `game_history_gametype_enum` with `SKY_DROP`, and `game_history` with its user foreign key and query indexes.

- [x] **Step 1: Write failing data-source and SQL-shape specs**

```ts
expect(testDataSource.options.migrations).toEqual([
  expect.stringContaining("test-migrations"),
  expect.stringContaining("migrations"),
]);
expect(productionDataSource.options.migrations).not.toEqual(
  expect.arrayContaining([expect.stringContaining("test-migrations")]),
);
```

- [x] **Step 2: Run focused specs and verify they fail**

Run: `pnpm --filter @vscoke/api test -- test-data-source.spec.ts 1759999999999-create-legacy-core-schema.spec.ts data-source.spec.ts --runInBand`

Expected: FAIL because no test bootstrap migration path or baseline migration exists.

- [x] **Step 3: Implement the test-only migration and ordered data-source path**

```ts
migrations: [
  join(__dirname, 'test-migrations', '*.{ts,js}'),
  join(__dirname, 'migrations', '*.{ts,js}'),
],
```

The migration creates only `user`, `game_history_gametype_enum` with `SKY_DROP`, and `game_history` with the entity columns, defaults, foreign key, and indexes.

- [x] **Step 4: Run non-DB API verification**

Run: focused specs, `pnpm test:api`, `pnpm --filter @vscoke/api lint`, `pnpm build:api`, and `git diff --check`.

Expected: all commands exit 0 without `migration:run:test` or an E2E database connection.

- [x] **Step 5: Append CI evidence and commit**

```bash
git add apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.ts \
  apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.spec.ts \
  apps/api/src/test-data-source.ts apps/api/src/test-data-source.spec.ts \
  apps/api/src/data-source.spec.ts docs/superpowers/plans/2026-07-11-ci-game-enum-migration.md
git add -f .superpowers/sdd/task-5-ci-migration-report.md
git commit -m "test(api):신규 DB 레거시 스키마 준비"
```

### Task 7: Promote the legacy core baseline to production

**Files:**

- Create: `apps/api/src/migrations/1759999999999-create-legacy-core-schema.ts`
- Create: `apps/api/src/migrations/1759999999999-create-legacy-core-schema.spec.ts`
- Create: `apps/api/test/legacy-core-baseline.integration-spec.ts`
- Delete: `apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.ts`
- Delete: `apps/api/src/test-migrations/1759999999999-create-legacy-core-schema.spec.ts`
- Modify: `apps/api/src/test-data-source.ts`
- Modify: `apps/api/src/test-data-source.spec.ts`
- Modify: `docs/deployment-and-env.md`
- Modify: `docs/operations-runbook.md`
- Modify: `.superpowers/sdd/task-5-ci-migration-report.md`

**Interfaces:**

- Produces: `CreateLegacyCoreSchema1759999999999`, loaded by both production and test datasources before `1760000000000`.
- Guarantees: all-absent create, exact all-present adopt, partial/mismatch rejection, no repair, irreversible `down`.

- [x] **Step 1: Add failing production SQL and datasource contract tests**
- [x] **Step 2: Verify RED for the missing production baseline and duplicated test migration glob**
- [x] **Step 3: Implement strict adopt-or-create and remove the test-only baseline registration**
- [x] **Step 4: Add guarded disposable PostgreSQL integration coverage for create, adopt, partial reject, mismatch reject, preservation, and irreversible down**
- [x] **Step 5: Document manual production onboarding and migration-ledger risk without changing deploy automation**
- [x] **Step 6: Run final API test, lint, build, and available PostgreSQL verification**
- [x] **Step 7: Commit with `fix(api):운영 레거시 스키마 기준선 추가`**

#### Task 7 Review Hardening

- [x] Make required default validation NULL-safe with `COALESCE(..., false)`.
- [x] Pin every baseline DDL target and reference to `public` without mutating the caller's search path.
- [x] Validate PK/FK validated, non-deferrable, not-deferred, and FK MATCH SIMPLE semantics without requiring canonical names.
- [x] Validate one exact valid, ready, live, non-unique, non-partial, non-expression `userId` index while allowing its name to differ.
- [x] Add PostgreSQL cases for missing/wrong defaults, tenant-first search path, constraint/index mismatches, and data preservation.
- [x] Add a TypeORM `MigrationExecutor` case for an older pending baseline with a newer existing ledger row.
- [ ] Run the PostgreSQL workflow and record the result.
- [ ] Commit with `fix(api):레거시 기준선 검증 강화`.
