import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestResumeCode1795824000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_user"
      ADD COLUMN "resume_code_hash" char(64) NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_poke_lounge_user_resume_code"
      ON "poke_lounge_user" ("resume_code_hash") WHERE "resume_code_hash" IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE "poke_lounge_guest_resume_failure" (
      "id" uuid PRIMARY KEY,
      "ip_hash" char(64) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_poke_lounge_guest_resume_failure_time"
      ON "poke_lounge_guest_resume_failure" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_poke_lounge_guest_resume_failure_ip"
      ON "poke_lounge_guest_resume_failure" ("ip_hash", "created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_guest_resume_failure"`);
    await queryRunner.query(
      `ALTER TABLE "poke_lounge_user" DROP COLUMN "resume_code_hash"`,
    );
  }
}
