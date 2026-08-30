import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLegacyCoreSchema1759999999999 implements MigrationInterface {
  name = 'CreateLegacyCoreSchema1759999999999';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        core_object_count integer;
        enum_labels text[];
        later_enum_migration_applied boolean := false;
        schema_matches boolean;
      BEGIN
        IF pg_catalog.to_regclass('public."migrations"') IS NOT NULL THEN
          EXECUTE
            'SELECT EXISTS (
              SELECT 1
              FROM public."migrations"
              WHERE "name" = $1
            )'
          INTO later_enum_migration_applied
          USING 'AddPokeLoungeGameType1793664000000';
        END IF;

        SELECT
          (CASE WHEN pg_catalog.to_regclass('public."user"') IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN pg_catalog.to_regclass('public.game_history') IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN EXISTS (
            SELECT 1
            FROM pg_catalog.pg_type type_record
            JOIN pg_catalog.pg_namespace namespace
              ON namespace.oid = type_record.typnamespace
            WHERE namespace.nspname = 'public'
              AND type_record.typname = 'game_history_gametype_enum'
          ) THEN 1 ELSE 0 END)
        INTO core_object_count;

        IF later_enum_migration_applied AND core_object_count <> 3 THEN
          RAISE EXCEPTION 'Legacy core schema/ledger mismatch: AddPokeLoungeGameType1793664000000 is recorded in public.migrations but required public legacy core objects are missing';
        END IF;

        IF core_object_count = 0 THEN
          CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;

          CREATE TABLE public."user" (
            "id" varchar PRIMARY KEY,
            "email" varchar NOT NULL,
            "firstName" varchar NOT NULL,
            "lastName" varchar NOT NULL,
            "accessToken" varchar
          );

          CREATE TYPE public.game_history_gametype_enum AS ENUM ('SKY_DROP');

          CREATE TABLE public.game_history (
            "id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
            "score" integer NOT NULL,
            "gameType" public.game_history_gametype_enum NOT NULL DEFAULT 'SKY_DROP',
            "playTime" integer,
            "createdAt" timestamp NOT NULL DEFAULT pg_catalog.now(),
            "userId" varchar NOT NULL,
            CONSTRAINT "FK_game_history_user_id"
              FOREIGN KEY ("userId") REFERENCES public."user" ("id")
              ON DELETE NO ACTION ON UPDATE NO ACTION
          );

          CREATE INDEX "IDX_game_history_user_id"
            ON public.game_history ("userId");

          RETURN;
        END IF;

        IF core_object_count <> 3 THEN
          RAISE EXCEPTION
            'Legacy core schema is partial: expected public.user, public.game_history, and public.game_history_gametype_enum to be all absent or all present';
        END IF;

        SELECT count(*) = 5 AND bool_and(COALESCE(
          CASE column_name
            WHEN 'id' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'NO' AND column_default IS NULL
            WHEN 'email' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'NO' AND column_default IS NULL
            WHEN 'firstName' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'NO' AND column_default IS NULL
            WHEN 'lastName' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'NO' AND column_default IS NULL
            WHEN 'accessToken' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'YES' AND column_default IS NULL
            ELSE false
          END,
          false
        ))
        INTO schema_matches
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user';

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.user columns, types, nullability, or defaults differ from the canonical schema';
        END IF;

        SELECT count(*) = 6 AND bool_and(COALESCE(
          CASE column_name
            WHEN 'id' THEN
              data_type = 'uuid' AND udt_schema = 'pg_catalog' AND
              udt_name = 'uuid' AND is_nullable = 'NO' AND
              column_default ~ '^((pg_catalog|public)\\.)?(gen_random_uuid|uuid_generate_v4)\\(\\)$'
            WHEN 'score' THEN
              data_type = 'integer' AND udt_schema = 'pg_catalog' AND
              udt_name = 'int4' AND is_nullable = 'NO' AND
              column_default IS NULL
            WHEN 'gameType' THEN
              data_type = 'USER-DEFINED' AND udt_schema = 'public' AND
              udt_name = 'game_history_gametype_enum' AND
              is_nullable = 'NO' AND
              column_default ~ '^''SKY_DROP''::(public\\.)?game_history_gametype_enum$'
            WHEN 'playTime' THEN
              data_type = 'integer' AND udt_schema = 'pg_catalog' AND
              udt_name = 'int4' AND is_nullable = 'YES' AND
              column_default IS NULL
            WHEN 'createdAt' THEN
              data_type = 'timestamp without time zone' AND
              udt_schema = 'pg_catalog' AND udt_name = 'timestamp' AND
              is_nullable = 'NO' AND
              column_default IN (
                'now()',
                'pg_catalog.now()',
                'CURRENT_TIMESTAMP'
              )
            WHEN 'userId' THEN
              data_type = 'character varying' AND udt_schema = 'pg_catalog' AND
              udt_name = 'varchar' AND character_maximum_length IS NULL AND
              is_nullable = 'NO' AND column_default IS NULL
            ELSE false
          END,
          false
        ))
        INTO schema_matches
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'game_history';

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.game_history columns, types, nullability, or defaults differ from the canonical schema';
        END IF;

        SELECT count(*) = 1 AND bool_and(
          constraint_record.convalidated AND
          NOT constraint_record.condeferrable AND
          NOT constraint_record.condeferred AND
          (
            SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_record.conkey)
              WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = constraint_record.conrelid
              AND attribute.attnum = key.attnum
          ) = ARRAY['id']::name[]
        )
        INTO schema_matches
        FROM pg_catalog.pg_constraint constraint_record
        WHERE constraint_record.conrelid = 'public."user"'::regclass
          AND constraint_record.contype = 'p';

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.user must have only id as its primary key';
        END IF;

        SELECT count(*) = 1 AND bool_and(
          constraint_record.convalidated AND
          NOT constraint_record.condeferrable AND
          NOT constraint_record.condeferred AND
          (
            SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_record.conkey)
              WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = constraint_record.conrelid
              AND attribute.attnum = key.attnum
          ) = ARRAY['id']::name[]
        )
        INTO schema_matches
        FROM pg_catalog.pg_constraint constraint_record
        WHERE constraint_record.conrelid = 'public.game_history'::regclass
          AND constraint_record.contype = 'p';

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.game_history must have only id as its primary key';
        END IF;

        SELECT count(*) = 1 AND bool_and(
          constraint_record.confrelid = 'public."user"'::regclass AND
          constraint_record.confdeltype = 'a' AND
          constraint_record.confupdtype = 'a' AND
          constraint_record.confmatchtype = 's' AND
          constraint_record.convalidated AND
          NOT constraint_record.condeferrable AND
          NOT constraint_record.condeferred AND
          (
            SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_record.conkey)
              WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = constraint_record.conrelid
              AND attribute.attnum = key.attnum
          ) = ARRAY['userId']::name[] AND
          (
            SELECT array_agg(attribute.attname ORDER BY key.ordinality)
            FROM unnest(constraint_record.confkey)
              WITH ORDINALITY AS key(attnum, ordinality)
            JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = constraint_record.confrelid
              AND attribute.attnum = key.attnum
          ) = ARRAY['id']::name[]
        )
        INTO schema_matches
        FROM pg_catalog.pg_constraint constraint_record
        WHERE constraint_record.conrelid = 'public.game_history'::regclass
          AND constraint_record.contype = 'f';

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.game_history must have the canonical userId foreign key';
        END IF;

        SELECT count(*) = 1
        INTO schema_matches
        FROM pg_catalog.pg_index index_record
        JOIN pg_catalog.pg_class index_relation
          ON index_relation.oid = index_record.indexrelid
        JOIN pg_catalog.pg_am access_method
          ON access_method.oid = index_relation.relam
        WHERE index_record.indrelid = 'public.game_history'::regclass
          AND access_method.amname = 'btree'
          AND NOT index_record.indisprimary
          AND NOT index_record.indisunique
          AND index_record.indisvalid
          AND index_record.indisready
          AND index_record.indislive
          AND index_record.indnkeyatts = 1
          AND index_record.indnatts = 1
          AND index_record.indpred IS NULL
          AND index_record.indexprs IS NULL
          AND (
            SELECT count(*) = 1 AND bool_and(
              attribute.attname = 'userId' AND
              operator_class.opcdefault AND
              operator_class.opcmethod = access_method.oid AND
              collation_record.oid = attribute.attcollation AND
              collation_namespace.nspname = 'pg_catalog' AND
              collation_record.collname = 'default' AND
              key.option = 0
            )
            FROM unnest(
              index_record.indkey::smallint[],
              index_record.indclass::oid[],
              index_record.indcollation::oid[],
              index_record.indoption::smallint[]
            ) WITH ORDINALITY AS key(
              attnum,
              opclass_oid,
              collation_oid,
              option,
              ordinality
            )
            JOIN pg_catalog.pg_attribute attribute
              ON attribute.attrelid = index_record.indrelid
              AND attribute.attnum = key.attnum
            JOIN pg_catalog.pg_opclass operator_class
              ON operator_class.oid = key.opclass_oid
            JOIN pg_catalog.pg_collation collation_record
              ON collation_record.oid = key.collation_oid
            JOIN pg_catalog.pg_namespace collation_namespace
              ON collation_namespace.oid = collation_record.collnamespace
            WHERE key.ordinality <= index_record.indnkeyatts
          );

        IF NOT COALESCE(schema_matches, false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.game_history must have one canonical btree userId index';
        END IF;

        SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
        INTO enum_labels
        FROM pg_catalog.pg_enum enum_value
        JOIN pg_catalog.pg_type type_record ON type_record.oid = enum_value.enumtypid
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = type_record.typnamespace
        WHERE namespace.nspname = 'public'
          AND type_record.typname = 'game_history_gametype_enum';

        IF NOT COALESCE(enum_labels IN (
          ARRAY['SKY_DROP']::text[],
          ARRAY['SKY_DROP', 'POKE_LOUNGE']::text[]
        ), false) THEN
          RAISE EXCEPTION 'Legacy core schema mismatch: public.game_history_gametype_enum must contain SKY_DROP, optionally followed by POKE_LOUNGE';
        END IF;

        IF later_enum_migration_applied AND enum_labels <> ARRAY['SKY_DROP', 'POKE_LOUNGE']::text[] THEN
          RAISE EXCEPTION 'Legacy core schema/ledger mismatch: AddPokeLoungeGameType1793664000000 is recorded in public.migrations but public.game_history_gametype_enum does not contain POKE_LOUNGE';
        END IF;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        RAISE EXCEPTION 'Legacy core baseline is irreversible because it may have adopted existing production objects and data';
      END $$;
    `);
  }
}
