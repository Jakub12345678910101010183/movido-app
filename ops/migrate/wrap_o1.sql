-- O-1 apply wrapper. Run ONLY as:
--   psql -X --single-transaction -v ON_ERROR_STOP=1 -f wrap_o1.sql (via run.sh)
-- Everything below is one transaction: precondition checks, the allowlisted
-- migration, the migration-history row and postcondition checks. Any failure
-- raises and psql rolls the whole transaction back.
-- The history version is generated here, inside the transaction, as the
-- apply-time UTC timestamp (YYYYMMDDHH24MISS), like Supabase's apply_migration;
-- the row is identified by its name, office_job_guard.
-- psql variables (run.sh): migration_file, migration_sql, created_by,
--   expect_history_count, expect_history_last, protected_hashes,
--   office_guard_prosrc_md5, office_audit_prosrc_md5, office_proconfig, pod_delete_qual_md5
\set ON_ERROR_STOP on
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT count(*) AS settings_loaded FROM (SELECT
  set_config('migrate.history_count', :'expect_history_count', true),
  set_config('migrate.history_last', :'expect_history_last', true),
  set_config('migrate.protected_hashes', :'protected_hashes', true),
  set_config('migrate.guard_src', :'office_guard_prosrc_md5', true),
  set_config('migrate.audit_src', :'office_audit_prosrc_md5', true),
  set_config('migrate.proconfig', :'office_proconfig', true),
  set_config('migrate.pod_qual_md5', :'pod_delete_qual_md5', true),
  set_config('migrate.sql', :'migration_sql', true),
  set_config('migrate.created_by', :'created_by', true)) s;
-- One migration run at a time.
SELECT true AS migration_lock_taken FROM (SELECT pg_advisory_xact_lock(hashtext('movido.db-migrate'))) l;

-- Preconditions.
DO $$
DECLARE fail text[] := '{}';
BEGIN
  -- History table: text-like version/name/created_by, text[] statements, single-column unique key on version.
  IF NOT ((SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
             AND column_name IN ('version', 'name', 'created_by') AND data_type IN ('text', 'character varying'))
          AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
             AND column_name = 'statements' AND data_type = 'ARRAY' AND udt_name = '_text')
          AND EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'version'
             WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype IN ('p', 'u') AND c.conkey = ARRAY[a.attnum]))
    THEN fail := array_append(fail, 'history_table_shape'); END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text !~ '^[0-9]{14}$') THEN fail := array_append(fail, 'history_version_format'); END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations)::text IS DISTINCT FROM current_setting('migrate.history_count') THEN fail := array_append(fail, 'history_count'); END IF;
  IF (SELECT max(version::text) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM current_setting('migrate.history_last') THEN fail := array_append(fail, 'history_last'); END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name IN ('office_job_guard', 'office_job_guard_rollback')) THEN fail := array_append(fail, 'o1_already_recorded'); END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'cancellation_reason') THEN fail := array_append(fail, 'column_present'); END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_office_guard', 'jobs_office_audit')) THEN fail := array_append(fail, 'functions_present'); END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass AND tgname IN ('jobs_office_guard', 'jobs_office_audit')) THEN fail := array_append(fail, 'triggers_present'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pod_photos_delete'
                 AND md5(qual) = current_setting('migrate.pod_qual_md5')) THEN fail := array_append(fail, 'pod_delete_policy_missing'); END IF;
  IF (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) IS DISTINCT FROM current_setting('migrate.protected_hashes') THEN fail := array_append(fail, 'protected_hashes'); END IF;
  IF cardinality(fail) > 0 THEN RAISE EXCEPTION 'PRECONDITION FAILED: %', array_to_string(fail, ', '); END IF;
END $$;

-- The allowlisted migration (SHA-256 and sqlguard checked by run.sh).
\i :migration_file

-- Migration history: same table, columns and single-statement format the
-- Supabase migration tool uses; version = apply-time UTC timestamp.
DO $$
DECLARE v text; prev text;
BEGIN
  SELECT max(version::text) INTO prev FROM supabase_migrations.schema_migrations;
  v := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS');
  IF v IS NULL OR v !~ '^[0-9]{14}$' THEN RAISE EXCEPTION 'HISTORY VERSION FORMAT: %', v; END IF;
  IF prev IS NULL OR v <= prev THEN RAISE EXCEPTION 'HISTORY VERSION % NOT AFTER LATEST %', v, prev; END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = v) THEN RAISE EXCEPTION 'HISTORY VERSION % EXISTS', v; END IF;
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
  VALUES (v, 'office_job_guard', ARRAY[current_setting('migrate.sql')], current_setting('migrate.created_by'));
  PERFORM set_config('migrate.new_version', v, true);
  PERFORM set_config('migrate.prev_version', prev, true);
END $$;

-- Postconditions.
DO $$
DECLARE fail text[] := '{}';
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM current_setting('migrate.history_count')::int + 1 THEN fail := array_append(fail, 'history_count'); END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE name = 'office_job_guard') <> 1
     OR (SELECT version::text FROM supabase_migrations.schema_migrations WHERE name = 'office_job_guard') IS DISTINCT FROM current_setting('migrate.new_version')
     OR NOT current_setting('migrate.new_version') ~ '^[0-9]{14}$'
     OR NOT current_setting('migrate.new_version') > current_setting('migrate.history_last')
     OR (SELECT max(version::text) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM current_setting('migrate.new_version')
     OR (SELECT statements FROM supabase_migrations.schema_migrations WHERE name = 'office_job_guard') IS DISTINCT FROM ARRAY[current_setting('migrate.sql')]
    THEN fail := array_append(fail, 'history_row'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs'
                 AND column_name = 'cancellation_reason' AND data_type = 'text' AND is_nullable = 'YES') THEN fail := array_append(fail, 'column'); END IF;
  -- Office functions, semantically: exactly the audited bodies, signature, language, security and search_path.
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_office_guard', 'jobs_office_audit')) <> 2 THEN fail := array_append(fail, 'office_function_count'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'jobs_office_guard'
                 AND p.prokind = 'f' AND p.pronargs = 0 AND p.prorettype = 'trigger'::regtype AND NOT p.proretset
                 AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AND p.provolatile = 'v'
                 AND NOT p.prosecdef AND p.proconfig = ARRAY[current_setting('migrate.proconfig')]
                 AND md5(p.prosrc) = current_setting('migrate.guard_src')) THEN fail := array_append(fail, 'guard_function'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'jobs_office_audit'
                 AND p.prokind = 'f' AND p.pronargs = 0 AND p.prorettype = 'trigger'::regtype AND NOT p.proretset
                 AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AND p.provolatile = 'v'
                 AND p.prosecdef AND p.proconfig = ARRAY[current_setting('migrate.proconfig')]
                 AND md5(p.prosrc) = current_setting('migrate.audit_src')) THEN fail := array_append(fail, 'audit_function'); END IF;
  -- Triggers: guard BEFORE INSERT OR UPDATE FOR EACH ROW (23), audit AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW (29).
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass AND tgname IN ('jobs_office_guard', 'jobs_office_audit')) <> 2
     OR (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE t.tgrelid = 'public.jobs'::regclass AND t.tgname IN ('jobs_office_guard', 'jobs_office_audit')
            AND p.pronamespace = 'public'::regnamespace AND p.proname = t.tgname
            AND t.tgtype = CASE t.tgname WHEN 'jobs_office_guard' THEN 23 ELSE 29 END
            AND t.tgenabled = 'O' AND NOT t.tgisinternal AND t.tgnargs = 0 AND t.tgqual IS NULL
            AND cardinality(t.tgattr::int2[]) = 0) <> 2 THEN fail := array_append(fail, 'triggers'); END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('jobs_office_guard', 'jobs_office_audit')
             AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) OR has_function_privilege('anon', p.oid, 'EXECUTE')
                  OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) THEN fail := array_append(fail, 'execute_not_revoked'); END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pod_photos_delete') THEN fail := array_append(fail, 'pod_delete_policy_still_present'); END IF;
  IF (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) IS DISTINCT FROM current_setting('migrate.protected_hashes') THEN fail := array_append(fail, 'protected_hashes'); END IF;
  IF cardinality(fail) > 0 THEN RAISE EXCEPTION 'POSTCONDITION FAILED: %', array_to_string(fail, ', '); END IF;
END $$;
SELECT current_setting('migrate.new_version') AS recorded_version, current_setting('migrate.prev_version') AS previous_latest_version \gset
\echo 'wrap_o1: recorded office_job_guard version=':recorded_version ' (previous latest=':previous_latest_version ')'
\echo 'wrap_o1: all in-transaction assertions passed; committing'
