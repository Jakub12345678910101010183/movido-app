-- O-1 rollback wrapper. Run ONLY as:
--   psql -X --single-transaction -v ON_ERROR_STOP=1 -f wrap_o1_rollback.sql (via run.sh)
-- One transaction: checks that O-1 is applied, runs the allowlisted rollback,
-- records it in migration history and checks the restored state. Any failure
-- raises and psql rolls the whole transaction back.
-- psql variables (run.sh): migration_file, migration_sql, created_by,
--   expect_history_count, protected_hashes, office_guard_hash,
--   office_audit_hash, pod_delete_qual_md5
\set ON_ERROR_STOP on
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT count(*) AS settings_loaded FROM (SELECT
  set_config('migrate.history_count', :'expect_history_count', true),
  set_config('migrate.protected_hashes', :'protected_hashes', true),
  set_config('migrate.guard_hash', :'office_guard_hash', true),
  set_config('migrate.audit_hash', :'office_audit_hash', true),
  set_config('migrate.pod_qual_md5', :'pod_delete_qual_md5', true)) s;
SELECT true AS migration_lock_taken FROM (SELECT pg_advisory_xact_lock(hashtext('movido.db-migrate'))) l;

-- Preconditions: O-1 applied exactly as audited, rollback not yet recorded.
DO $$
DECLARE fail text[] := '{}';
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM current_setting('migrate.history_count')::int + 1 THEN fail := array_append(fail, 'history_count'); END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261004120000' AND name = 'office_job_guard') THEN fail := array_append(fail, 'o1_not_recorded'); END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261004120500') THEN fail := array_append(fail, 'rollback_already_recorded'); END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'cancellation_reason') THEN fail := array_append(fail, 'column_missing'); END IF;
  IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'jobs_office_guard')
       IS DISTINCT FROM current_setting('migrate.guard_hash') THEN fail := array_append(fail, 'guard_function'); END IF;
  IF (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'jobs_office_audit')
       IS DISTINCT FROM current_setting('migrate.audit_hash') THEN fail := array_append(fail, 'audit_function'); END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pod_photos_delete') THEN fail := array_append(fail, 'pod_delete_policy_present'); END IF;
  IF (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) IS DISTINCT FROM current_setting('migrate.protected_hashes') THEN fail := array_append(fail, 'protected_hashes'); END IF;
  IF cardinality(fail) > 0 THEN RAISE EXCEPTION 'PRECONDITION FAILED: %', array_to_string(fail, ', '); END IF;
END $$;

-- The allowlisted rollback (SHA-256 and sqlguard checked by run.sh).
\i :migration_file

INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
VALUES ('20261004120500', 'office_job_guard_rollback', ARRAY[:'migration_sql'], :'created_by');

-- Postconditions: O-1 objects gone, policy restored exactly, driver functions untouched.
DO $$
DECLARE fail text[] := '{}';
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM current_setting('migrate.history_count')::int + 2 THEN fail := array_append(fail, 'history_count'); END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261004120500' AND name = 'office_job_guard_rollback') THEN fail := array_append(fail, 'history_row'); END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'cancellation_reason') THEN fail := array_append(fail, 'column_still_present'); END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_office_guard', 'jobs_office_audit')) THEN fail := array_append(fail, 'functions_still_present'); END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass AND tgname IN ('jobs_office_guard', 'jobs_office_audit')) THEN fail := array_append(fail, 'triggers_still_present'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'pod_photos_delete'
                 AND cmd = 'DELETE' AND permissive = 'PERMISSIVE' AND roles = '{authenticated}'
                 AND md5(qual) = current_setting('migrate.pod_qual_md5')) THEN fail := array_append(fail, 'pod_delete_policy_not_restored'); END IF;
  IF (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) IS DISTINCT FROM current_setting('migrate.protected_hashes') THEN fail := array_append(fail, 'protected_hashes'); END IF;
  IF cardinality(fail) > 0 THEN RAISE EXCEPTION 'POSTCONDITION FAILED: %', array_to_string(fail, ', '); END IF;
END $$;
\echo 'wrap_o1_rollback: all in-transaction assertions passed; committing'
