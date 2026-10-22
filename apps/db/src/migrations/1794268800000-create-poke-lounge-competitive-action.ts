import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeCompetitiveAction1794268800000 implements MigrationInterface {
  name = 'CreatePokeLoungeCompetitiveAction1794268800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_competitive_action" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "match_id" uuid NOT NULL,
        "room_id" uuid NOT NULL,
        "turn" integer NOT NULL,
        "actor_player_id" varchar(128) NOT NULL,
        "actor_account_id" varchar(255) NOT NULL,
        "client_command_id" uuid NOT NULL,
        "action" jsonb NOT NULL,
        "canonical_action" text NOT NULL,
        "request_hash" char(64) NOT NULL,
        "status" varchar(16) NOT NULL,
        "response" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "resolved_at" timestamptz,
        CONSTRAINT "FK_poke_lounge_competitive_action_match_id"
          FOREIGN KEY ("match_id") REFERENCES "poke_lounge_competitive_match"("match_id") ON DELETE CASCADE,
        CONSTRAINT "FK_poke_lounge_competitive_action_room_id"
          FOREIGN KEY ("room_id") REFERENCES "poke_lounge_room"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_competitive_action_turn_actor"
          UNIQUE ("match_id", "turn", "actor_player_id"),
        CONSTRAINT "UQ_poke_lounge_competitive_action_actor_command"
          UNIQUE ("match_id", "actor_player_id", "client_command_id"),
        CONSTRAINT "CHK_poke_lounge_competitive_action_status"
          CHECK ("status" IN ('pending', 'resolved')),
        CONSTRAINT "CHK_poke_lounge_competitive_action_turn"
          CHECK ("turn" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_competitive_action_match_turn"
      ON "poke_lounge_competitive_action" ("match_id", "turn")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "poke_lounge_competitive_action"`,
    );
  }
}
