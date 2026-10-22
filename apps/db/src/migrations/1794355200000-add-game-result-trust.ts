import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGameResultTrust1794355200000 implements MigrationInterface {
  name = 'AddGameResultTrust1794355200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_history"
        ADD COLUMN "resultTrust" varchar(32),
        ADD COLUMN "sourceKey" varchar(512),
        ADD CONSTRAINT "CHK_game_history_result_trust"
          CHECK (
            "resultTrust" IS NULL
            OR "resultTrust" IN ('client-asserted', 'verified-room')
          )
    `);
    await queryRunner.query(`
      UPDATE "game_history"
      SET "resultTrust" = 'client-asserted'
      WHERE "gameType"::text = 'POKE_LOUNGE'
        AND "resultTrust" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_game_history_source_key"
      ON "game_history" ("sourceKey")
      WHERE "sourceKey" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_game_history_verified_ranking"
      ON "game_history"
        ("gameType", "resultTrust", "userId", score DESC, "createdAt" ASC, id ASC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "game_history"
          WHERE "resultTrust" IS NOT NULL OR "sourceKey" IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Cannot remove game result trust columns while trust or source identity data exists';
        END IF;
      END $$
    `);
    await queryRunner.query(`DROP INDEX "IDX_game_history_verified_ranking"`);
    await queryRunner.query(`DROP INDEX "UQ_game_history_source_key"`);
    await queryRunner.query(`
      ALTER TABLE "game_history"
        DROP CONSTRAINT "CHK_game_history_result_trust",
        DROP COLUMN "sourceKey",
        DROP COLUMN "resultTrust"
    `);
  }
}
