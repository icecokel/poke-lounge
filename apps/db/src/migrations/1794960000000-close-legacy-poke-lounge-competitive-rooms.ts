import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CloseLegacyPokeLoungeCompetitiveRooms1794960000000 implements MigrationInterface {
  name = 'CloseLegacyPokeLoungeCompetitiveRooms1794960000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "poke_lounge_room"
      SET "state" = jsonb_set(
        "state",
        '{partySnapshots}',
        '{}'::jsonb,
        true
      )
    `);
    await queryRunner.query(`
      UPDATE "poke_lounge_room"
      SET
        "state" = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set("state", '{status}', '"closed"'::jsonb),
                  '{closeReason}',
                  '"legacy-room-restart-required"'::jsonb
                ),
                '{round,phase}',
                '"completed"'::jsonb
              ),
              '{round,endsAtMs}',
              'null'::jsonb
            ),
            '{tournament,activeMatchId}',
            'null'::jsonb
          ),
          '{tournament,activeMatchAuthority}',
          'null'::jsonb
        ),
        "revision" = "revision" + 1,
        "expires_at" = now() + interval '10 minutes',
        "updated_at" = now()
      WHERE "state" ->> 'status' IN ('waiting', 'round-started', 'tournament')
    `);
    await queryRunner.query(`
      DELETE FROM "poke_lounge_competitive_match"
      WHERE "ruleset_version" = 1
        AND "status" IN ('pending', 'active')
    `);
  }

  down(): Promise<void> {
    // Legacy ephemeral room state cannot be reconstructed safely.
    return Promise.resolve();
  }
}
