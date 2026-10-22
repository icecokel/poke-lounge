import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPokeLoungeCompetitiveTransitionMetadata1794614400000 implements MigrationInterface {
  name = 'AddPokeLoungeCompetitiveTransitionMetadata1794614400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      ADD COLUMN "terminal_event_id" uuid,
      ADD COLUMN "terminal_room_revision" bigint,
      ADD CONSTRAINT "CHK_poke_lounge_competitive_match_terminal_metadata_pair"
        CHECK (
          ("terminal_event_id" IS NULL AND "terminal_room_revision" IS NULL)
          OR
          ("terminal_event_id" IS NOT NULL AND "terminal_room_revision" IS NOT NULL)
        )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_poke_lounge_competitive_match_terminal_event"
      ON "poke_lounge_competitive_match" ("terminal_event_id")
      WHERE "terminal_event_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_competitive_match_terminal_recovery"
      ON "poke_lounge_competitive_match" ("room_id", "terminal_room_revision")
      WHERE "terminal_event_id" IS NOT NULL
        AND "terminal_room_revision" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_poke_lounge_competitive_match_terminal_recovery"
    `);
    await queryRunner.query(`
      DROP INDEX "UQ_poke_lounge_competitive_match_terminal_event"
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      DROP CONSTRAINT "CHK_poke_lounge_competitive_match_terminal_metadata_pair",
      DROP COLUMN "terminal_room_revision",
      DROP COLUMN "terminal_event_id"
    `);
  }
}
