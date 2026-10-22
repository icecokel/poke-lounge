import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportPokeLoungeTournamentMatches1794528000000 implements MigrationInterface {
  name = 'SupportPokeLoungeTournamentMatches1794528000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      DROP CONSTRAINT "UQ_poke_lounge_competitive_match_room",
      DROP CONSTRAINT "UQ_poke_lounge_competitive_match_room_match"
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      ADD COLUMN "bracket_match_id" varchar(128),
      ADD COLUMN "kind" varchar(32)
    `);
    await queryRunner.query(`
      UPDATE "poke_lounge_competitive_match" AS match
      SET
        "bracket_match_id" = 'game-round-' ||
          COALESCE(NULLIF(room."state" -> 'round' ->> 'index', '')::integer, 1) ||
          '-bracket-1-match-1',
        "kind" = 'ranked-head-to-head'
      FROM "poke_lounge_room" AS room
      WHERE room."id" = match."room_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      ALTER COLUMN "bracket_match_id" SET NOT NULL,
      ALTER COLUMN "kind" SET NOT NULL,
      ADD CONSTRAINT "CHK_poke_lounge_competitive_match_kind"
        CHECK ("kind" IN ('ranked-head-to-head', 'tournament-unranked')),
      ADD CONSTRAINT "UQ_poke_lounge_competitive_match_room_bracket"
        UNIQUE ("room_id", "bracket_match_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_poke_lounge_competitive_match_active_room"
      ON "poke_lounge_competitive_match" ("room_id")
      WHERE "status" IN ('pending', 'active')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "poke_lounge_competitive_match"
          WHERE "kind" = 'tournament-unranked'
        ) OR EXISTS (
          SELECT "room_id"
          FROM "poke_lounge_competitive_match"
          GROUP BY "room_id"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot remove tournament match support while tournament data exists';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_poke_lounge_competitive_match_active_room"
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      DROP CONSTRAINT "UQ_poke_lounge_competitive_match_room_bracket",
      DROP CONSTRAINT "CHK_poke_lounge_competitive_match_kind",
      DROP COLUMN "bracket_match_id",
      DROP COLUMN "kind",
      ADD CONSTRAINT "UQ_poke_lounge_competitive_match_room" UNIQUE ("room_id"),
      ADD CONSTRAINT "UQ_poke_lounge_competitive_match_room_match"
        UNIQUE ("room_id", "match_id")
    `);
  }
}
