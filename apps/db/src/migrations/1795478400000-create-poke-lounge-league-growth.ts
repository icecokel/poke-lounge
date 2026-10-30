import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeLeagueGrowth1795478400000 implements MigrationInterface {
  name = 'CreatePokeLoungeLeagueGrowth1795478400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE TABLE "poke_lounge_league_profile" (
  "user_id" uuid NOT NULL,
  "nickname" varchar(12) NOT NULL,
  "nickname_key" varchar(12) NOT NULL,         -- ASCII만 소문자로 바꾼 비교 키(8절)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_poke_lounge_league_profile" PRIMARY KEY ("user_id"),
  CONSTRAINT "FK_poke_lounge_league_profile_user" FOREIGN KEY ("user_id") REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE,
  CONSTRAINT "UQ_poke_lounge_league_profile_nickname" UNIQUE ("nickname_key"),
  CONSTRAINT "CHK_poke_lounge_league_profile_length" CHECK (char_length("nickname") BETWEEN 2 AND 12)
);

CREATE TABLE "poke_lounge_league_badge_battle" (
  "id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "badge_index" smallint NOT NULL,
  "request_key" uuid NOT NULL,
  "status" varchar(10) NOT NULL,               -- pending | won | lost | void | abandoned
  "fail_reason" varchar(24) NULL,              -- lost | draw | turn_limit | rejected_limit | engine_retired | replaced
  "engine_version" varchar(96) NOT NULL,
  "seed" jsonb NOT NULL,                       -- [u16 x4]
  "claim" jsonb NOT NULL,                      -- 받아들인 PartyClaim
  "composition" jsonb NOT NULL,
  "challenger_party" jsonb NOT NULL,           -- 완전 회복·아이템 0·레벨 상한 없음(OQ11, D2)
  "npc_party" jsonb NOT NULL,                  -- 시즌 badge_npcs[badge_index], 원작 아이템 유지
  "carry_hash" char(16) NOT NULL,
  "rejected_submissions" smallint NOT NULL DEFAULT 0,
  "lead_slot" smallint NULL,
  "inputs" jsonb NULL,
  "inputs_hash" char(64) NULL,
  "measure" jsonb NULL,                        -- LeagueMatchMeasure + 내부 _response
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz NULL,
  CONSTRAINT "PK_poke_lounge_league_badge_battle" PRIMARY KEY ("id"),
  CONSTRAINT "FK_poke_lounge_league_badge_battle_run" FOREIGN KEY ("run_id") REFERENCES "poke_lounge_league_run" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_poke_lounge_league_badge_battle_user" FOREIGN KEY ("user_id") REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE,
  CONSTRAINT "UQ_poke_lounge_league_badge_battle_request" UNIQUE ("run_id", "request_key"),
  CONSTRAINT "CHK_poke_lounge_league_badge_battle_index" CHECK ("badge_index" BETWEEN 0 AND 7),
  CONSTRAINT "CHK_poke_lounge_league_badge_battle_status" CHECK ("status" IN ('pending', 'won', 'lost', 'void', 'abandoned')),
  CONSTRAINT "CHK_poke_lounge_league_badge_battle_hash" CHECK ("carry_hash" ~ '^[0-9a-f]{16}$'),
  CONSTRAINT "CHK_poke_lounge_league_badge_battle_done" CHECK (("status" = 'pending') = ("finished_at" IS NULL))
);
CREATE UNIQUE INDEX "UQ_poke_lounge_league_badge_battle_pending"
  ON "poke_lounge_league_badge_battle" ("run_id") WHERE "status" = 'pending';

CREATE TABLE "poke_lounge_league_run_save" (
  "run_id" uuid NOT NULL,
  "rev" integer NOT NULL,
  "data" jsonb NOT NULL,                       -- 브라우저 세이브 봉투(5.10절). 판정에 쓰지 않는다
  "size_bytes" integer NOT NULL,
  "saved_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "PK_poke_lounge_league_run_save" PRIMARY KEY ("run_id"),
  CONSTRAINT "FK_poke_lounge_league_run_save_run" FOREIGN KEY ("run_id") REFERENCES "poke_lounge_league_run" ("id") ON DELETE CASCADE,
  CONSTRAINT "CHK_poke_lounge_league_run_save_rev" CHECK ("rev" >= 1),
  CONSTRAINT "CHK_poke_lounge_league_run_save_size" CHECK ("size_bytes" BETWEEN 2 AND 98304)
);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "poke_lounge_league_run_save"');
    await queryRunner.query('DROP TABLE "poke_lounge_league_badge_battle"');
    await queryRunner.query('DROP TABLE "poke_lounge_league_profile"');
  }
}
