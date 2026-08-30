import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPokeLoungeGameType1793664000000 implements MigrationInterface {
  name = 'AddPokeLoungeGameType1793664000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        DO $$
        BEGIN
          IF pg_catalog.to_regtype('public.game_history_gametype_enum') IS NULL THEN
            CREATE TYPE public.game_history_gametype_enum AS ENUM ('SKY_DROP', 'POKE_LOUNGE');
          ELSE
            ALTER TYPE public.game_history_gametype_enum ADD VALUE IF NOT EXISTS 'POKE_LOUNGE';
          END IF;
        END $$;
      `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN RAISE NOTICE 'POKE_LOUNGE enum value is retained because PostgreSQL enum value removal requires table/type rewrite and can lose existing game history rows.'; END $$;`,
    );
  }
}
