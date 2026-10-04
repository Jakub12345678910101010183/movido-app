-- ROLLBACK for 20261004120000_office_job_guard. PREPARED, NOT APPLIED.
-- Restores the state before it: no Office guard or job audit triggers, no
-- jobs.cancellation_reason, and the pod_photos_delete policy exactly as in
-- the production baseline. Idempotent.
-- Data note: dropping the column discards any cancellation reasons recorded
-- since the migration (the audit_log entries keep them). Audit entries stay.

drop trigger if exists jobs_office_audit on public.jobs;
drop trigger if exists jobs_office_guard on public.jobs;
drop function if exists public.jobs_office_audit();
drop function if exists public.jobs_office_guard();
alter table public.jobs drop column if exists cancellation_reason;

drop policy if exists pod_photos_delete on storage.objects;
create policy pod_photos_delete on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'pod-photos'::text) AND ((storage.foldername(name))[1] = (auth_org_id())::text) AND (auth_role() = ANY (ARRAY['admin'::text, 'dispatcher'::text]))));
