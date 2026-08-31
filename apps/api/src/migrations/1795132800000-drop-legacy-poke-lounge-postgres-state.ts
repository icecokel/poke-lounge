import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegacyPokeLoungePostgresState1795132800000 implements MigrationInterface {
  name = 'DropLegacyPokeLoungePostgresState1795132800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        missing_table text;
      BEGIN
        SELECT table_name
        INTO missing_table
        FROM (VALUES
          ('game_poke_lounge_state'),
          ('poke_lounge_room'),
          ('poke_lounge_room_command'),
          ('poke_lounge_competitive_seat'),
          ('poke_lounge_competitive_match'),
          ('poke_lounge_competitive_action')
        ) AS expected(table_name)
        WHERE pg_catalog.to_regclass(
          pg_catalog.format('public.%I', table_name)
        ) IS NULL
        LIMIT 1;

        IF missing_table IS NOT NULL THEN
          RAISE EXCEPTION 'Expected legacy Poke Lounge table is missing: %', missing_table;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      LOCK TABLE
        "game_poke_lounge_state",
        "poke_lounge_room",
        "poke_lounge_room_command",
        "poke_lounge_competitive_seat",
        "poke_lounge_competitive_match",
        "poke_lounge_competitive_action"
      IN ACCESS EXCLUSIVE MODE
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        nonempty_table text;
      BEGIN
        SELECT table_name
        INTO nonempty_table
        FROM (
          SELECT 'poke_lounge_competitive_action' AS table_name
          WHERE EXISTS (
            SELECT 1 FROM "poke_lounge_competitive_action" LIMIT 1
          )
          UNION ALL
          SELECT 'poke_lounge_competitive_match'
          WHERE EXISTS (
            SELECT 1 FROM "poke_lounge_competitive_match" LIMIT 1
          )
          UNION ALL
          SELECT 'poke_lounge_competitive_seat'
          WHERE EXISTS (
            SELECT 1 FROM "poke_lounge_competitive_seat" LIMIT 1
          )
          UNION ALL
          SELECT 'poke_lounge_room_command'
          WHERE EXISTS (
            SELECT 1 FROM "poke_lounge_room_command" LIMIT 1
          )
          UNION ALL
          SELECT 'poke_lounge_room'
          WHERE EXISTS (
            SELECT 1 FROM "poke_lounge_room" LIMIT 1
          )
          UNION ALL
          SELECT 'game_poke_lounge_state'
          WHERE EXISTS (
            SELECT 1 FROM "game_poke_lounge_state" LIMIT 1
          )
        ) AS nonempty
        LIMIT 1;

        IF nonempty_table IS NOT NULL THEN
          RAISE EXCEPTION 'Refusing to drop non-empty legacy Poke Lounge table: %', nonempty_table;
        END IF;
      END $$;
    `);
    await queryRunner.query(`DROP TABLE "poke_lounge_competitive_action"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_competitive_match"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_competitive_seat"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_room_command"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_room"`);
    await queryRunner.query(`DROP TABLE "game_poke_lounge_state"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        RAISE EXCEPTION 'Legacy Poke Lounge PostgreSQL state cleanup is irreversible';
      END $$;
    `);
  }
}
