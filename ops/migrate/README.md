# Production migrations (allowlisted)

`.github/workflows/db-migrate.yml` applies one allowlisted SQL file to the
production database in a single transaction. It is started by hand and waits for
approval on the protected `production-db` GitHub environment.

## Files

| File | Purpose |
|---|---|
| `allowlist.json` | The only files that may run: name → path at the pinned `source_commit` and SHA-256 |
| `expect.json` | Production state the wrappers assert (history count/last version, protected driver-function hashes, expected Office-guard hashes, `pod_photos_delete` fingerprint) |
| `sqlguard.py` | Refuses transaction control, `CONCURRENTLY`, `VACUUM`, `COPY … PROGRAM` and psql meta-commands |
| `run.sh` | `vet`, `check-url`, `precheck`, `apply`, `postcheck applied/rolled_back` |
| `precheck.sql` / `postcheck.sql` | Read-only; print booleans, counts and hashes; exit non-zero on mismatch |
| `wrap_o1.sql` / `wrap_o1_rollback.sql` | One transaction: preconditions → migration → `supabase_migrations.schema_migrations` row → postconditions |

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
