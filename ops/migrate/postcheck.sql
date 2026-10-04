-- Read-only postcheck. Prints booleans, counts and hashes only; exits non-zero
-- unless the state matches :'expect':
--   applied      O-1 recorded and in place, rollback not recorded
--   rolled_back  O-1 and its rollback recorded, O-1 objects gone, policy restored
-- psql variables (from ops/migrate/expect.json via run.sh):
--   expect, expect_history_count, protected_hashes, office_guard_hash,
--   office_audit_hash, pod_delete_qual_md5
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT
  h.n                                                AS history_count,
  h.o1 = 1                                           AS o1_recorded,
  h.rb = 1                                           AS rollback_recorded,
  s.col                                              AS column_present,
  COALESCE(s.guard_hash = :'office_guard_hash', false) AS guard_function_ok,
  COALESCE(s.audit_hash = :'office_audit_hash', false) AS audit_function_ok,
  s.fns                                              AS office_function_count,
  s.trgs                                             AS office_trigger_count,
  s.exec_revoked                                     AS execute_revoked,
  s.pod_policy                                       AS pod_delete_policy_present,
  COALESCE(s.protected = :'protected_hashes', false) AS protected_hashes_ok,
  CASE :'expect'
    WHEN 'applied' THEN COALESCE(h.n = :expect_history_count + 1 AND h.o1 = 1 AND h.rb = 0 AND s.col
      AND s.guard_hash = :'office_guard_hash' AND s.audit_hash = :'office_audit_hash' AND s.trgs = 2
      AND s.exec_revoked AND NOT s.pod_policy AND s.protected = :'protected_hashes', false)
    WHEN 'rolled_back' THEN COALESCE(h.n = :expect_history_count + 2 AND h.o1 = 1 AND h.rb = 1 AND NOT s.col
      AND s.fns = 0 AND s.trgs = 0 AND s.pod_policy AND s.protected = :'protected_hashes', false)
    ELSE false
  END                                                AS all_ok
FROM
  (SELECT count(*) AS n,
          count(*) FILTER (WHERE version = '20261004120000' AND name = 'office_job_guard') AS o1,
          count(*) FILTER (WHERE version = '20261004120500' AND name = 'office_job_guard_rollback') AS rb
     FROM supabase_migrations.schema_migrations) h,
  (SELECT
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs'
              AND column_name = 'cancellation_reason' AND data_type = 'text' AND is_nullable = 'YES') AS col,
     (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = 'jobs_office_guard') AS guard_hash,
     (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = 'jobs_office_audit') AS audit_hash,
     (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('jobs_office_guard', 'jobs_office_audit')) AS fns,
     (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass AND tgenabled <> 'D'
       AND tgname IN ('jobs_office_guard', 'jobs_office_audit')) AS trgs,
     COALESCE((SELECT bool_and(p.proacl IS NOT NULL AND NOT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
                 AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                  AND p.proname IN ('jobs_office_guard', 'jobs_office_audit')), false) AS exec_revoked,
     EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
              AND policyname = 'pod_photos_delete' AND cmd = 'DELETE' AND permissive = 'PERMISSIVE'
              AND roles = '{authenticated}' AND md5(qual) = :'pod_delete_qual_md5') AS pod_policy,
     (SELECT string_agg(proname || '=' || md5(pg_get_functiondef(oid)), ' ' ORDER BY proname) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname IN ('jobs_driver_field_guard', 'driver_confirm_stop',
         'driver_complete_job', 'driver_start_job', 'driver_stop_location_check', 'driver_report_location',
         'driver_report_locations', 'evaluate_geofences')) AS protected) s
\gset post_
COMMIT;
\echo 'postcheck expect=':expect ' history_count=':post_history_count ' o1_recorded=':post_o1_recorded ' rollback_recorded=':post_rollback_recorded
\echo 'postcheck column_present=':post_column_present ' guard_function_ok=':post_guard_function_ok ' audit_function_ok=':post_audit_function_ok ' office_function_count=':post_office_function_count ' office_trigger_count=':post_office_trigger_count
\echo 'postcheck execute_revoked=':post_execute_revoked ' pod_delete_policy_present=':post_pod_delete_policy_present ' protected_hashes_ok=':post_protected_hashes_ok
\if :post_all_ok
  \echo 'postcheck: PASS'
\else
  \echo 'postcheck: FAIL'
  DO $$ BEGIN RAISE EXCEPTION 'POSTCHECK FAILED'; END $$;
\endif
