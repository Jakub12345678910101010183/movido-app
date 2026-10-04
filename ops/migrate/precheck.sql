-- Read-only precheck before applying O-1 (office_job_guard).
-- Prints booleans, counts, versions and hashes only; exits non-zero if any check fails.
-- Migration history is matched by name; the history table's column types and the
-- unique key on version are asserted (fail closed if they are not as expected).
-- psql variables (from ops/migrate/expect.json via run.sh):
--   expect_history_count, expect_history_last, protected_hashes, pod_delete_qual_md5
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT
  h.n                                          AS history_count,
  COALESCE(h.last, 'none')                     AS history_last,
  COALESCE(t.version_type, 'missing')          AS history_version_type,
  COALESCE(t.shape_ok, false)                  AS history_table_shape_ok,
  COALESCE(h.all14, false)                     AS history_versions_14_digits,
  h.n = :expect_history_count                  AS history_count_ok,
  COALESCE(h.last = :'expect_history_last', false) AS history_last_ok,
  h.named = 0                                  AS o1_not_recorded,
  NOT s.col                                    AS column_absent,
  s.fns = 0                                    AS functions_absent,
  s.trgs = 0                                   AS triggers_absent,
  s.pod_policy                                 AS pod_delete_policy_present,
  COALESCE(s.protected = :'protected_hashes', false) AS protected_hashes_ok,
  s.heavy_locks                                AS heavy_locks,
  s.idle_tx                                    AS long_idle_transactions,
  COALESCE(t.shape_ok AND h.all14 AND h.n = :expect_history_count AND h.last = :'expect_history_last' AND h.named = 0
   AND NOT s.col AND s.fns = 0 AND s.trgs = 0 AND s.pod_policy AND s.protected = :'protected_hashes'
   AND s.heavy_locks = 0, false) AS all_ok
FROM
  (SELECT count(*) AS n, max(version::text) AS last, bool_and(version::text ~ '^[0-9]{14}$') AS all14,
          count(*) FILTER (WHERE name IN ('office_job_guard', 'office_job_guard_rollback')) AS named
     FROM supabase_migrations.schema_migrations) h,
  (SELECT
     (SELECT data_type FROM information_schema.columns WHERE table_schema = 'supabase_migrations'
       AND table_name = 'schema_migrations' AND column_name = 'version') AS version_type,
     (SELECT count(*) = 3 FROM information_schema.columns WHERE table_schema = 'supabase_migrations'
       AND table_name = 'schema_migrations' AND column_name IN ('version', 'name', 'created_by')
       AND data_type IN ('text', 'character varying'))
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations'
       AND table_name = 'schema_migrations' AND column_name = 'statements' AND data_type = 'ARRAY' AND udt_name = '_text')
     AND EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'version'
       WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype IN ('p', 'u')
       AND c.conkey = ARRAY[a.attnum]) AS shape_ok) t,
  (SELECT
     EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'cancellation_reason') AS col,
     (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('jobs_office_guard', 'jobs_office_audit')) AS fns,
     (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass
       AND tgname IN ('jobs_office_guard', 'jobs_office_audit')) AS trgs,
     EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'pod_photos_delete' AND cmd = 'DELETE' AND permissive = 'PERMISSIVE'
              AND roles = '{authenticated}' AND md5(qual) = :'pod_delete_qual_md5') AS pod_policy,
     (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) AS protected,
     (SELECT count(*) FROM pg_locks l WHERE l.pid <> pg_backend_pid() AND l.granted
       AND l.relation IN ('public.jobs'::regclass, 'storage.objects'::regclass)
       AND l.mode IN ('AccessExclusiveLock', 'ExclusiveLock', 'ShareRowExclusiveLock', 'ShareLock')) AS heavy_locks,
     (SELECT count(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid()
       AND state = 'idle in transaction' AND xact_start < now() - interval '60 seconds') AS idle_tx) s
\gset pre_
COMMIT;
\echo 'precheck history_count=':pre_history_count ' history_last=':pre_history_last ' history_count_ok=':pre_history_count_ok ' history_last_ok=':pre_history_last_ok ' o1_not_recorded=':pre_o1_not_recorded
\echo 'precheck history_version_type=':pre_history_version_type ' history_table_shape_ok=':pre_history_table_shape_ok ' history_versions_14_digits=':pre_history_versions_14_digits
\echo 'precheck column_absent=':pre_column_absent ' functions_absent=':pre_functions_absent ' triggers_absent=':pre_triggers_absent ' pod_delete_policy_present=':pre_pod_delete_policy_present
\echo 'precheck protected_hashes_ok=':pre_protected_hashes_ok ' heavy_locks=':pre_heavy_locks ' long_idle_transactions=':pre_long_idle_transactions
\if :pre_all_ok
  \echo 'precheck: PASS'
\else
  \echo 'precheck: FAIL'
  DO $$ BEGIN RAISE EXCEPTION 'PRECHECK FAILED'; END $$;
\endif
