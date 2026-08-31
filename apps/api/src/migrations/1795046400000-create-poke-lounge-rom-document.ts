import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeRomDocument1795046400000 implements MigrationInterface {
  name = 'CreatePokeLoungeRomDocument1795046400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_rom_document" (
        "document_key" varchar(32) PRIMARY KEY,
        "schema_version" smallint NOT NULL,
        "rom_sha1" char(40) NOT NULL,
        "content_sha256" char(64) NOT NULL,
        "payload" jsonb NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_poke_lounge_rom_document_schema_version"
          CHECK ("schema_version" > 0),
        CONSTRAINT "CHK_poke_lounge_rom_document_rom_sha1"
          CHECK ("rom_sha1" ~ '^[0-9a-f]{40}$'),
        CONSTRAINT "CHK_poke_lounge_rom_document_content_sha256"
          CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_poke_lounge_rom_document_payload"
          CHECK (jsonb_typeof("payload") = 'object')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_rom_document"`);
  }
}
