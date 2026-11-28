import type { MigrationInterface, QueryRunner } from 'typeorm';

/** League nicknames are 2–12 characters; "월" is the single one-character exception. */
export class AllowSingleWolNickname1795910400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_profile"
      DROP CONSTRAINT "CHK_poke_lounge_league_profile_length"`);
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_profile"
      ADD CONSTRAINT "CHK_poke_lounge_league_profile_length"
      CHECK (char_length("nickname") BETWEEN 2 AND 12 OR "nickname" = '월')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_profile"
      DROP CONSTRAINT "CHK_poke_lounge_league_profile_length"`);
    await queryRunner.query(`ALTER TABLE "poke_lounge_league_profile"
      ADD CONSTRAINT "CHK_poke_lounge_league_profile_length"
      CHECK (char_length("nickname") BETWEEN 2 AND 12)`);
  }
}
