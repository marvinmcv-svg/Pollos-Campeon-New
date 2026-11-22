#!/usr/bin/env bash
# Recreates a throwaway local DB, applies stub + migrations + seed, runs tests/db.local.sql.
# Needs a local Postgres. Usage: PGHOST=/var/tmp/pctest PGPORT=54329 PGUSER=postgres tests/db-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -q -c "drop database if exists pc_test" -c "create database pc_test"
for f in tests/supabase-stub.sql supabase/migrations/001_core_schema.sql supabase/migrations/002_ops_security_rpcs.sql supabase/migrations/003_rpcs.sql supabase/seed.sql tests/db.local.sql; do
  psql -q -v ON_ERROR_STOP=1 -d pc_test -f "$f" 2>&1 | grep -v NOTICE || true
done
