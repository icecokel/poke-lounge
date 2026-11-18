import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeagueGuests1795737600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_user"
      ADD COLUMN "is_guest" boolean NOT NULL DEFAULT false`);
    // Only the last hour is retained; the shared budget survives API restarts.
    await queryRunner.query(`CREATE TABLE "poke_lounge_guest_creation" (
      "id" uuid PRIMARY KEY,
      "ip_hash" char(64) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_poke_lounge_guest_creation_time"
      ON "poke_lounge_guest_creation" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_poke_lounge_guest_creation_ip"
      ON "poke_lounge_guest_creation" ("ip_hash", "created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_guest_creation"`);
    await queryRunner.query(
      `ALTER TABLE "poke_lounge_user" DROP COLUMN "is_guest"`,
    );
  }
}
