import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeAuth1795305600000 implements MigrationInterface {
  name = 'CreatePokeLoungeAuth1795305600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_user" (
        "id" uuid NOT NULL,
        "display_name" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_user" PRIMARY KEY ("id")
      )
    `);
    // One row per external login. Provider ids are stable numeric ids, never usernames.
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_user_identity" (
        "provider" varchar(16) NOT NULL,
        "provider_user_id" varchar(32) NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_user_identity" PRIMARY KEY ("provider", "provider_user_id"),
        CONSTRAINT "CHK_poke_lounge_user_identity_provider" CHECK ("provider" IN ('discord', 'github')),
        CONSTRAINT "CHK_poke_lounge_user_identity_id" CHECK ("provider_user_id" ~ '^[0-9]{1,32}$'),
        CONSTRAINT "FK_poke_lounge_user_identity_user" FOREIGN KEY ("user_id")
          REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_poke_lounge_user_identity_user" ON "poke_lounge_user_identity" ("user_id")`,
    );
    // Only a SHA-256 of the session cookie is stored.
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_auth_session" (
        "token_hash" char(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "PK_poke_lounge_auth_session" PRIMARY KEY ("token_hash"),
        CONSTRAINT "CHK_poke_lounge_auth_session_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "FK_poke_lounge_auth_session_user" FOREIGN KEY ("user_id")
          REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_poke_lounge_auth_session_user" ON "poke_lounge_auth_session" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_poke_lounge_auth_session_expires" ON "poke_lounge_auth_session" ("expires_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_auth_session"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_user_identity"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_user"`);
  }
}
