import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeRoomStorage1794096000000 implements MigrationInterface {
  name = 'CreatePokeLoungeRoomStorage1794096000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_room" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_code" varchar(6) NOT NULL,
        "state" jsonb NOT NULL,
        "revision" bigint NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_poke_lounge_room_room_code" UNIQUE ("room_code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_room_expires_at"
      ON "poke_lounge_room" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_room_room_code_revision"
      ON "poke_lounge_room" ("room_code", "revision")
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_room_command" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "actor_player_id" varchar(128) NOT NULL,
        "idempotency_key" uuid NOT NULL,
        "request_hash" char(64) NOT NULL,
        "response_state" jsonb NOT NULL,
        "response_revision" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_poke_lounge_room_command_room_id"
          FOREIGN KEY ("room_id")
          REFERENCES "poke_lounge_room"("id")
          ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_room_command_room_actor_key"
          UNIQUE ("room_id", "actor_player_id", "idempotency_key"),
        CONSTRAINT "UQ_poke_lounge_room_command_actor_key"
          UNIQUE ("actor_player_id", "idempotency_key")
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "poke_lounge_room_command"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "poke_lounge_room"`);
  }
}
