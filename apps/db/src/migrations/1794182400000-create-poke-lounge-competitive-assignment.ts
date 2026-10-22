import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeCompetitiveAssignment1794182400000 implements MigrationInterface {
  name = 'CreatePokeLoungeCompetitiveAssignment1794182400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_competitive_seat" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "session_id" varchar(256) NOT NULL,
        "player_id" varchar(128) NOT NULL,
        "account_id" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_poke_lounge_competitive_seat_room_id"
          FOREIGN KEY ("room_id") REFERENCES "poke_lounge_room"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_competitive_seat_room_session"
          UNIQUE ("room_id", "session_id"),
        CONSTRAINT "UQ_poke_lounge_competitive_seat_room_player"
          UNIQUE ("room_id", "player_id"),
        CONSTRAINT "UQ_poke_lounge_competitive_seat_room_account"
          UNIQUE ("room_id", "account_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_competitive_match" (
        "match_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "room_code" varchar(6) NOT NULL,
        "assignment_revision" bigint NOT NULL,
        "player_accounts" jsonb NOT NULL,
        "ruleset_version" integer NOT NULL,
        "ruleset_hash" char(64) NOT NULL,
        "server_seed" char(64) NOT NULL,
        "initial_state" jsonb NOT NULL,
        "initial_state_hash" char(64) NOT NULL,
        "current_state" jsonb NOT NULL,
        "current_state_hash" char(64) NOT NULL,
        "current_turn" integer NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "terminal_result" jsonb,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_poke_lounge_competitive_match_room_id"
          FOREIGN KEY ("room_id") REFERENCES "poke_lounge_room"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_competitive_match_room" UNIQUE ("room_id"),
        CONSTRAINT "UQ_poke_lounge_competitive_match_room_match"
          UNIQUE ("room_id", "match_id"),
        CONSTRAINT "CHK_poke_lounge_competitive_match_status"
          CHECK ("status" IN ('pending', 'active', 'completed')),
        CONSTRAINT "CHK_poke_lounge_competitive_match_turn"
          CHECK ("current_turn" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_competitive_match_status"
      ON "poke_lounge_competitive_match" ("status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "poke_lounge_competitive_match"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "poke_lounge_competitive_seat"`,
    );
  }
}
