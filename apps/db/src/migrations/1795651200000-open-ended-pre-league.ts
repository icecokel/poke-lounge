import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpenEndedPreLeague1795651200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_season"
      ADD COLUMN "open_ended" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`UPDATE "poke_lounge_league_season" SET "open_ended" = true
      WHERE "id" = 1 AND "settled_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "poke_lounge_league_season" DROP COLUMN "open_ended"`,
    );
  }
}
