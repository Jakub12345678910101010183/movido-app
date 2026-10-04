#!/usr/bin/env bash
# Allowlisted, single-transaction production migration runner.
# Used by .github/workflows/db-migrate.yml; the same script is rehearsed locally.
#
#   run.sh vet          extract the allowlisted file from its pinned commit,
#                       verify SHA-256 and refuse transaction control etc.
#   run.sh check-url    DATABASE_URL must be the Supabase Session Pooler on 5432
#   run.sh precheck     read-only checks before O-1 (precheck.sql)
#   run.sh apply        single transaction: wrapper + migration + history row
#   run.sh postcheck E  read-only checks, E = applied | rolled_back
#
# Inputs (environment): MIGRATION (file name), DATABASE_URL (never printed),
# GITHUB_ACTOR (history created_by). Prints only checks, booleans, counts and hashes.
set -euo pipefail
set +x

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../.." && pwd)
allowlist="$here/allowlist.json"
expect_file="$here/expect.json"
work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/movido-migrate"
die() { echo "run.sh: REFUSED: $*" >&2; exit 1; }

if [[ -n "${MIGRATE_LOCAL_REHEARSAL:-}" ]]; then
  [[ "${GITHUB_ACTIONS:-}" != "true" ]] || die "local rehearsal mode is not allowed in GitHub Actions"
  expect_file="${MIGRATE_EXPECT_FILE:?}"
fi

mode="${1:-}"
name="${MIGRATION:-}"

# The name must be exactly one of the allowlisted keys (no paths, no globbing).
[[ "$name" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]] || die "migration name is not in the expected format"
jq -e --arg n "$name" '.files | has($n)' "$allowlist" >/dev/null || die "migration is not allowlisted"
case "$name" in
  20261004120000_office_job_guard.sql)          wrapper="$here/wrap_o1.sql" ;;
  20261004120500_office_job_guard_rollback.sql) wrapper="$here/wrap_o1_rollback.sql" ;;
  *) die "no wrapper for this migration" ;;
esac
path=$(jq -r --arg n "$name" '.files[$n].path' "$allowlist")
want_sha=$(jq -r --arg n "$name" '.files[$n].sha256' "$allowlist")
commit=$(jq -r '.source_commit' "$allowlist")
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die "source commit must be a full SHA"
[[ "$path" =~ ^supabase/pending/[0-9]{14}_[a-z0-9_]+\.sql$ ]] || die "unexpected source path"
[[ "$want_sha" =~ ^[0-9a-f]{64}$ ]] || die "allowlist SHA-256 is malformed"
vetted="$work/$name"

vet() {
  mkdir -p "$work"
  git -C "$repo" cat-file -e "$commit^{commit}" 2>/dev/null || die "pinned commit $commit is not available"
  git -C "$repo" show "$commit:$path" > "$vetted" || die "file not found at the pinned commit"
  local got
  got=$(sha256sum "$vetted" | cut -d' ' -f1)
  echo "vet: file=$name commit=$commit"
  echo "vet: sha256 expected=$want_sha"
  echo "vet: sha256 actual  =$got"
  [[ "$got" == "$want_sha" ]] || die "SHA-256 mismatch"
  python3 "$here/sqlguard.py" "$vetted" || die "sqlguard refused the file"
  echo "vet: PASS"
}

check_url() {
  : "${DATABASE_URL:?DATABASE_URL is not set}"
  DATABASE_URL="$DATABASE_URL" python3 - <<'PY' || die "DATABASE_URL is not the Supabase Session Pooler on port 5432"
import os, sys, urllib.parse as u
p = u.urlsplit(os.environ["DATABASE_URL"])
ok = (p.scheme in ("postgres", "postgresql")
      and (p.hostname or "").endswith(".pooler.supabase.com")
      and p.port == 5432
      and "6543" not in (p.netloc or "")
      and (p.username or "").startswith("postgres.")
      and "sslmode=disable" not in (p.query or ""))
sys.exit(0 if ok else 1)
PY
  echo "check-url: Session Pooler, port 5432, TLS required (URL not printed)"
}

expect() { jq -r --arg k "$1" '.[$k] | tostring' "$expect_file"; }

conn() {
  : "${DATABASE_URL:?DATABASE_URL is not set}"
  [[ -n "${MIGRATE_LOCAL_REHEARSAL:-}" ]] || check_url >/dev/null
}

common_vars() {
  printf -- '-v\0expect_history_count=%s\0' "$(expect history_count_before)"
  printf -- '-v\0expect_history_last=%s\0' "$(expect history_last_before)"
  printf -- '-v\0protected_hashes=%s\0' "$(expect protected_hashes)"
  printf -- '-v\0office_guard_hash=%s\0' "$(expect office_guard_hash)"
  printf -- '-v\0office_audit_hash=%s\0' "$(expect office_audit_hash)"
  printf -- '-v\0pod_delete_qual_md5=%s\0' "$(expect pod_delete_qual_md5)"
}

psql_run() {  # psql_run <extra args...>; DATABASE_URL is passed as the only connection argument
  local -a vars=()
  while IFS= read -r -d '' x; do vars+=("$x"); done < <(common_vars)
  PGSSLMODE="${PGSSLMODE:-require}" PGAPPNAME=movido-db-migrate \
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "${vars[@]}" "$@"
}

case "$mode" in
  vet) vet ;;
  check-url) check_url ;;
  precheck)
    conn
    [[ "$name" == 20261004120000_office_job_guard.sql ]] || die "precheck.sql is for the O-1 apply; use 'postcheck applied' before a rollback"
    psql_run -f "$here/precheck.sql" ;;
  apply)
    conn
    [[ -s "$vetted" ]] || die "run 'vet' first"
    [[ "$(sha256sum "$vetted" | cut -d' ' -f1)" == "$want_sha" ]] || die "vetted file changed since vet"
    actor="${GITHUB_ACTOR:-local-rehearsal}"
    [[ "$actor" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ ]] || die "unexpected actor name"
    created_by="gha:$actor"; [[ -n "${MIGRATE_LOCAL_REHEARSAL:-}" ]] && created_by="local-rehearsal"
    echo "apply: $name in one transaction (lock_timeout 5s, statement_timeout 120s)"
    psql_run --single-transaction -v "migration_file=$vetted" -v "migration_sql=$(cat "$vetted")" \
      -v "created_by=$created_by" -f "$wrapper"
    echo "apply: COMMITTED" ;;
  postcheck)
    conn
    e="${2:-}"; [[ "$e" == applied || "$e" == rolled_back ]] || die "postcheck needs: applied | rolled_back"
    psql_run -v "expect=$e" -f "$here/postcheck.sql" ;;
  *) die "unknown mode" ;;
esac
