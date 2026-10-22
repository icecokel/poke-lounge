import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGamePokeLoungeStateRevision1794700800000 implements MigrationInterface {
  name = 'AddGamePokeLoungeStateRevision1794700800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_poke_lounge_state"
      ADD COLUMN "revision" integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT "CHK_game_poke_lounge_state_revision"
        CHECK ("revision" >= 0)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_poke_lounge_state"
      DROP CONSTRAINT "CHK_game_poke_lounge_state_revision",
      DROP COLUMN "revision"
    `);
  }
}
