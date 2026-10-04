# Production migrations (allowlisted)

`.github/workflows/db-migrate.yml` applies one allowlisted SQL file to the
production database in a single transaction. It is started by hand and waits for
approval on the protected `production-db` GitHub environment.

## Files

| File | Purpose |
|---|---|
| `allowlist.json` | The only files that may run: name → path at the pinned `source_commit` and SHA-256 |
| `expect.json` | State the wrappers assert: history count/last version, protected driver-function hashes and `pod_photos_delete` fingerprint (read from production); md5 of the Office function bodies and their `search_path` (from the pinned O-1 file) |
| `fnbody.py` | Prints the md5 of each function body in a SQL file; `vet` refuses unless it matches `expect.json` |
| `sqlguard.py` | Refuses transaction control, `CONCURRENTLY`, `VACUUM`, `COPY … PROGRAM` and psql meta-commands |
| `run.sh` | `vet`, `check-url`, `precheck`, `apply`, `postcheck applied/rolled_back` |
| `precheck.sql` / `postcheck.sql` | Read-only; print booleans, counts and hashes; exit non-zero on mismatch |
| `wrap_o1.sql` / `wrap_o1_rollback.sql` | One transaction: preconditions → migration → `supabase_migrations.schema_migrations` row → postconditions |

## Migration history and checks

- History rows are identified by **name** (`office_job_guard`,
  `office_job_guard_rollback`). Each row's version is generated inside the
  transaction as the apply-time UTC timestamp
  (`to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISS')`), must be
  14 digits, later than the current latest version and unused. The wrappers stop
  if the history table's `version`/`name`/`created_by` are not text, `statements`
  is not `text[]` or `version` has no unique key.
- The Office functions are checked semantically, independent of the PostgreSQL
  version: no arguments, `returns trigger`, `plpgsql`, SECURITY DEFINER only for
  the audit function, `search_path=public, pg_temp`, `md5(prosrc)` equal to the
  body in the pinned O-1 file, and both triggers wired to them (BEFORE INSERT OR
  UPDATE / AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW, enabled).

## Run (owner)

1. Actions → *db-migrate (production, allowlisted)* → Run workflow on `main`.
2. Choose the file and type `APPLY <file name>`.
3. Approve the `production-db` deployment.

Order for O-1: apply `20261004120000_office_job_guard.sql`, then deploy the
Office web change. Rollback: run `20261004120500_office_job_guard_rollback.sql`
(after rolling the web back first if it was deployed).

## Setup (owner, once)

- Environment `production-db`: required reviewer = owner; deployment branches = `main`.
- Environment secret `SUPABASE_DB_URL`: the Supabase **Session Pooler** connection
  string (port **5432**). The transaction pooler (6543) is refused.

Never paste the connection string anywhere else.
