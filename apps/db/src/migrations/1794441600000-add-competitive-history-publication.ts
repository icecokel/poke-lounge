import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompetitiveHistoryPublication1794441600000 implements MigrationInterface {
  name = 'AddCompetitiveHistoryPublication1794441600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      ADD COLUMN "history_publication" jsonb
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "poke_lounge_competitive_match"
          WHERE "history_publication" IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Cannot remove competitive history publication while audit data exists';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "poke_lounge_competitive_match"
      DROP COLUMN "history_publication"
    `);
  }
}
