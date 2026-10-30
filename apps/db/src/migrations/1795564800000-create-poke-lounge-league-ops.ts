import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeLeagueOps1795564800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_season_plan" (
        "season_id" integer NOT NULL,
        "starter_species_ids" smallint[] NOT NULL,
        "starter_level" smallint NOT NULL DEFAULT 10,
        "note" varchar(200) NULL,
        "created_by" varchar(64) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_league_season_plan" PRIMARY KEY ("season_id"),
        CONSTRAINT "CHK_poke_lounge_league_season_plan_id" CHECK ("season_id" >= 2),
        CONSTRAINT "CHK_poke_lounge_league_season_plan_starters" CHECK (
          cardinality("starter_species_ids") BETWEEN 3 AND 6
          AND 1 <= ALL ("starter_species_ids") AND 493 >= ALL ("starter_species_ids")),
        CONSTRAINT "CHK_poke_lounge_league_season_plan_level" CHECK ("starter_level" BETWEEN 1 AND 100)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_audit" (
        "id" bigint GENERATED ALWAYS AS IDENTITY,
        "at" timestamptz NOT NULL DEFAULT now(),
        "operator" varchar(64) NOT NULL,
        "action" varchar(32) NOT NULL,          -- record_void | attempt_void | nickname_reset | hall_fix | season_plan | season_manual
        "season_id" integer NULL,
        "user_id" uuid NULL,
        "attempt_id" uuid NULL,
        "reason" varchar(500) NOT NULL,
        "before" jsonb NULL,                    -- 바꾸기 전 행(복구용)
        CONSTRAINT "PK_poke_lounge_league_audit" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_league_audit_season" ON "poke_lounge_league_audit" ("season_id", "at")
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_league_season"
        ADD COLUMN "starter_source" varchar(8) NOT NULL DEFAULT 'env',
        ADD COLUMN "starter_seed" bigint NULL,
        ADD CONSTRAINT "CHK_poke_lounge_league_season_starter_source" CHECK (
          "starter_source" IN ('env', 'plan', 'pool') AND (("starter_source" = 'pool') = ("starter_seed" IS NOT NULL)))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_season"
      DROP CONSTRAINT "CHK_poke_lounge_league_season_starter_source",
      DROP COLUMN "starter_seed", DROP COLUMN "starter_source"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_audit"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_season_plan"`);
  }
}
