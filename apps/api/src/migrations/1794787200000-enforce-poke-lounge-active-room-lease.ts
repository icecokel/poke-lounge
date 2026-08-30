import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforcePokeLoungeActiveRoomLease1794787200000 implements MigrationInterface {
  name = 'EnforcePokeLoungeActiveRoomLease1794787200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "poke_lounge_room"
      SET "expires_at" = "updated_at" + CASE "state" ->> 'status'
        WHEN 'waiting' THEN INTERVAL '30 minutes'
        WHEN 'round-started' THEN INTERVAL '2 hours'
        WHEN 'tournament' THEN INTERVAL '2 hours'
        WHEN 'completed' THEN INTERVAL '10 minutes'
        WHEN 'closed' THEN INTERVAL '10 minutes'
      END
      WHERE ("state" ->> 'status') IN (
        'waiting',
        'round-started',
        'tournament',
        'completed',
        'closed'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "poke_lounge_room"
      SET "expires_at" = TIMESTAMPTZ '9999-12-31 23:59:59.999+00'
      WHERE ("state" ->> 'status') IN ('round-started', 'tournament')
    `);
  }
}
