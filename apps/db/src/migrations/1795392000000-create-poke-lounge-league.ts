import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePokeLoungeLeague1795392000000 implements MigrationInterface {
  name = 'CreatePokeLoungeLeague1795392000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_season" (
        "id" integer NOT NULL,
        "starts_at" timestamptz NOT NULL,
        "closes_at" timestamptz NOT NULL,
        "settle_deadline" timestamptz NOT NULL,
        "settled_at" timestamptz NULL,
        "starter_species_ids" smallint[] NOT NULL,
        "starter_level" smallint NOT NULL DEFAULT 10,
        "rules_version" smallint NOT NULL,
        "engine_version" varchar(96) NOT NULL,
        "roster_version" varchar(96) NOT NULL,
        "npc_seeds" jsonb NOT NULL,          -- [{npcKey, displayName, className, order, composition, publicParty}] 5개
        "badge_npcs" jsonb NOT NULL,         -- [{npcKey, displayName, badgeIndex, composition}] 8개(F2가 사용)
        "standings_rev" bigint NOT NULL DEFAULT 0,
        "accept_seq" bigint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_league_season" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_poke_lounge_league_season_id" CHECK ("id" >= 1),
        CONSTRAINT "CHK_poke_lounge_league_season_window" CHECK ("closes_at" > "starts_at" AND "settle_deadline" >= "closes_at"),
        CONSTRAINT "CHK_poke_lounge_league_season_starters" CHECK (cardinality("starter_species_ids") BETWEEN 3 AND 6),
        CONSTRAINT "CHK_poke_lounge_league_season_level" CHECK ("starter_level" BETWEEN 1 AND 100)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_poke_lounge_league_season_unsettled"
        ON "poke_lounge_league_season" ((true)) WHERE "settled_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_run" (
        "id" uuid NOT NULL,
        "season_id" integer NOT NULL,
        "user_id" uuid NOT NULL,
        "status" varchar(12) NOT NULL,
        "starter_species_id" smallint NOT NULL,
        "badges" smallint NOT NULL DEFAULT 0,
        "checkpoint" jsonb NULL,             -- F2: 마지막으로 받아들인 PartyClaim과 시각
        "mint_count" integer NOT NULL DEFAULT 0,
        "request_key" uuid NOT NULL,         -- 성장 시작 멱등 키(F2)
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "closed_at" timestamptz NULL,
        "close_reason" varchar(16) NULL,
        CONSTRAINT "PK_poke_lounge_league_run" PRIMARY KEY ("id"),
        CONSTRAINT "FK_poke_lounge_league_run_season" FOREIGN KEY ("season_id") REFERENCES "poke_lounge_league_season" ("id"),
        CONSTRAINT "FK_poke_lounge_league_run_user" FOREIGN KEY ("user_id") REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_league_run_request" UNIQUE ("user_id", "request_key"),
        CONSTRAINT "CHK_poke_lounge_league_run_status" CHECK ("status" IN ('active', 'challenging', 'closed')),
        CONSTRAINT "CHK_poke_lounge_league_run_badges" CHECK ("badges" BETWEEN 0 AND 8),
        CONSTRAINT "CHK_poke_lounge_league_run_close" CHECK (
          ("status" = 'closed') = ("closed_at" IS NOT NULL AND "close_reason" IN ('completed', 'season_end', 'abandoned'))
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_poke_lounge_league_run_open"
        ON "poke_lounge_league_run" ("season_id", "user_id") WHERE "status" <> 'closed'
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_mon" (
        "id" uuid NOT NULL,                  -- monId
        "run_id" uuid NOT NULL,
        "origin" varchar(8) NOT NULL,
        "species_id" smallint NOT NULL,      -- 발급 당시 종족(진화 전)
        "level" smallint NOT NULL,           -- 발급 당시 레벨
        "individual_values" jsonb NOT NULL,  -- LeagueStatValues
        "nature_id" smallint NOT NULL,
        "ability_id" smallint NOT NULL,
        "gender" varchar(10) NOT NULL,
        "request_key" uuid NOT NULL,         -- 발급 멱등 키(F2)
        "minted_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_league_mon" PRIMARY KEY ("id"),
        CONSTRAINT "FK_poke_lounge_league_mon_run" FOREIGN KEY ("run_id") REFERENCES "poke_lounge_league_run" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_league_mon_request" UNIQUE ("run_id", "request_key"),
        CONSTRAINT "CHK_poke_lounge_league_mon_origin" CHECK ("origin" IN ('starter', 'capture')),
        CONSTRAINT "CHK_poke_lounge_league_mon_species" CHECK ("species_id" BETWEEN 1 AND 493),
        CONSTRAINT "CHK_poke_lounge_league_mon_level" CHECK ("level" BETWEEN 1 AND 100),
        CONSTRAINT "CHK_poke_lounge_league_mon_nature" CHECK ("nature_id" BETWEEN 0 AND 24),
        CONSTRAINT "CHK_poke_lounge_league_mon_gender" CHECK ("gender" IN ('male', 'female', 'genderless'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_league_mon_run" ON "poke_lounge_league_mon" ("run_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_attempt" (
        "id" uuid NOT NULL,
        "season_id" integer NOT NULL,
        "run_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "entry_key" uuid NOT NULL,
        "status" varchar(10) NOT NULL,
        "fail_reason" varchar(24) NULL,
        "rules_version" smallint NOT NULL,
        "engine_version" varchar(96) NOT NULL,
        "roster_version" varchar(96) NOT NULL,
        "standings_rev" bigint NOT NULL,
        "composition" jsonb NOT NULL,        -- LeagueComposition(D4)
        "challenger_party" jsonb NOT NULL,   -- LeagueBattleParty, 입장 시 복사본
        "opponents" jsonb NOT NULL,          -- [{meta, party}] 5개, 5위→1위
        "match_seeds" jsonb NOT NULL,        -- [[u16,u16,u16,u16] x5], 공개는 현재 경기 것만
        "current_match" smallint NOT NULL DEFAULT 0,
        "carry_party" jsonb NOT NULL,        -- 현재 경기 시작 상태(LeagueBattleParty)
        "carry_hash" char(16) NOT NULL,
        "rejected_submissions" smallint NOT NULL DEFAULT 0,
        "score" integer NULL,
        "score_detail" jsonb NULL,           -- {q: LeagueFraction[5], total: LeagueFraction}
        "entered_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),   -- 마지막 상태 변경(표시·운영용, 만료 판단에 쓰지 않음)
        "finished_at" timestamptz NULL,
        CONSTRAINT "PK_poke_lounge_league_attempt" PRIMARY KEY ("id"),
        CONSTRAINT "FK_poke_lounge_league_attempt_season" FOREIGN KEY ("season_id") REFERENCES "poke_lounge_league_season" ("id"),
        CONSTRAINT "FK_poke_lounge_league_attempt_run" FOREIGN KEY ("run_id") REFERENCES "poke_lounge_league_run" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_poke_lounge_league_attempt_user" FOREIGN KEY ("user_id") REFERENCES "poke_lounge_user" ("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_poke_lounge_league_attempt_entry" UNIQUE ("user_id", "entry_key"),
        CONSTRAINT "CHK_poke_lounge_league_attempt_status" CHECK ("status" IN ('active', 'completed', 'failed', 'expired', 'void')),
        CONSTRAINT "CHK_poke_lounge_league_attempt_match" CHECK ("current_match" BETWEEN 0 AND 5),
        CONSTRAINT "CHK_poke_lounge_league_attempt_hash" CHECK ("carry_hash" ~ '^[0-9a-f]{16}$'),
        CONSTRAINT "CHK_poke_lounge_league_attempt_score" CHECK ("score" IS NULL OR "score" BETWEEN 0 AND 10000),
        CONSTRAINT "CHK_poke_lounge_league_attempt_done" CHECK (("status" = 'active') = ("finished_at" IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_poke_lounge_league_attempt_active"
        ON "poke_lounge_league_attempt" ("season_id", "user_id") WHERE "status" = 'active'
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_league_attempt_run" ON "poke_lounge_league_attempt" ("run_id")
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_match" (
        "attempt_id" uuid NOT NULL,
        "match_index" smallint NOT NULL,
        "status" varchar(5) NOT NULL,
        "lead_slot" smallint NOT NULL,
        "inputs" jsonb NOT NULL,
        "inputs_hash" char(64) NOT NULL,
        "measure" jsonb NOT NULL,            -- LeagueMatchMeasure(운 통계 포함)
        "client_end_hash" varchar(16) NULL,  -- 진단용
        "judged_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_poke_lounge_league_match" PRIMARY KEY ("attempt_id", "match_index"),
        CONSTRAINT "FK_poke_lounge_league_match_attempt" FOREIGN KEY ("attempt_id") REFERENCES "poke_lounge_league_attempt" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_poke_lounge_league_match_index" CHECK ("match_index" BETWEEN 0 AND 4),
        CONSTRAINT "CHK_poke_lounge_league_match_status" CHECK ("status" IN ('won', 'lost', 'draw')),
        CONSTRAINT "CHK_poke_lounge_league_match_hash" CHECK ("inputs_hash" ~ '^[0-9a-f]{64}$')
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_record" (
        "season_id" integer NOT NULL,
        "user_id" uuid NOT NULL,
        "attempt_id" uuid NOT NULL,
        "score" integer NOT NULL,
        "accept_seq" bigint NOT NULL,
        "display_name" varchar(64) NOT NULL, -- 기록 당시 이름 복사(L4)
        "composition" jsonb NOT NULL,        -- 등록 수비 파티 원본(D4)
        "public_party" jsonb NOT NULL,       -- [{speciesId, level, moveIds}]
        "recorded_at" timestamptz NOT NULL,
        "best_rank" smallint NULL,           -- 시즌 중 실제 도달한 최고 순위(OQ3)
        "final_rank" smallint NULL,          -- 정산 때 기록(F6)
        CONSTRAINT "PK_poke_lounge_league_record" PRIMARY KEY ("season_id", "user_id"),
        CONSTRAINT "FK_poke_lounge_league_record_season" FOREIGN KEY ("season_id") REFERENCES "poke_lounge_league_season" ("id"),
        CONSTRAINT "FK_poke_lounge_league_record_user" FOREIGN KEY ("user_id") REFERENCES "poke_lounge_user" ("id"),
        CONSTRAINT "FK_poke_lounge_league_record_attempt" FOREIGN KEY ("attempt_id") REFERENCES "poke_lounge_league_attempt" ("id"),
        CONSTRAINT "UQ_poke_lounge_league_record_seq" UNIQUE ("season_id", "accept_seq"),
        CONSTRAINT "CHK_poke_lounge_league_record_score" CHECK ("score" BETWEEN 0 AND 10000),
        CONSTRAINT "CHK_poke_lounge_league_record_rank" CHECK (("best_rank" IS NULL OR "best_rank" BETWEEN 1 AND 5) AND ("final_rank" IS NULL OR "final_rank" >= 1))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_poke_lounge_league_record_order"
        ON "poke_lounge_league_record" ("season_id", "score" DESC, "accept_seq" ASC)
    `);
    await queryRunner.query(`
      CREATE TABLE "poke_lounge_league_hall_of_fame" (
        "season_id" integer NOT NULL,
        "position" smallint NOT NULL,
        "kind" varchar(6) NOT NULL,
        "user_id" uuid NULL,                 -- FK 없음: 기록 보존 우선(탈퇴 처리 정책은 L4)
        "npc_key" varchar(16) NULL,
        "display_name" varchar(64) NOT NULL,
        "score" integer NOT NULL,
        "public_party" jsonb NOT NULL,
        CONSTRAINT "PK_poke_lounge_league_hall_of_fame" PRIMARY KEY ("season_id", "position"),
        CONSTRAINT "FK_poke_lounge_league_hall_of_fame_season" FOREIGN KEY ("season_id") REFERENCES "poke_lounge_league_season" ("id"),
        CONSTRAINT "CHK_poke_lounge_league_hall_of_fame_position" CHECK ("position" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_poke_lounge_league_hall_of_fame_kind" CHECK (
          ("kind" = 'player' AND "npc_key" IS NULL) OR ("kind" = 'npc' AND "npc_key" IS NOT NULL AND "user_id" IS NULL)
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "poke_lounge_league_hall_of_fame"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_record"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_match"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_attempt"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_mon"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_run"`);
    await queryRunner.query(`DROP TABLE "poke_lounge_league_season"`);
  }
}
