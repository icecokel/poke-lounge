import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGamePokeLoungeState1793750400000 implements MigrationInterface {
  name = 'CreateGamePokeLoungeState1793750400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "game_poke_lounge_state" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "state" jsonb NOT NULL,
        "clientUpdatedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_game_poke_lounge_state_userId" UNIQUE ("userId"),
        CONSTRAINT "FK_game_poke_lounge_state_userId"
          FOREIGN KEY ("userId")
          REFERENCES "user"("id")
          ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "game_poke_lounge_state"`);
  }
}
