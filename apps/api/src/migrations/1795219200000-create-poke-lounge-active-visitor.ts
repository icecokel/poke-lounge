import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeActiveVisitor1795219200000 implements MigrationInterface {
  name = 'CreatePokeLoungeActiveVisitor1795219200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Production backfill can create this table before the feature is deployed.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "poke_lounge_active_visitor" (
        "activity_date" date NOT NULL,
        "visitor_hash" char(64) NOT NULL,
        CONSTRAINT "PK_poke_lounge_active_visitor" PRIMARY KEY ("activity_date", "visitor_hash"),
        CONSTRAINT "CHK_poke_lounge_active_visitor_hash" CHECK ("visitor_hash" ~ '^[0-9a-f]{64}$')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_active_visitor"`);
  }
}
