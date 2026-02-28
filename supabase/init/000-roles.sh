#!/bin/bash
set -e

# Sync all Supabase role passwords to POSTGRES_PASSWORD.
# The Supabase postgres image creates these roles with default passwords;
# this script overrides them so auth/rest can connect using POSTGRES_PASSWORD.
# Also creates the _realtime schema needed by supabase-realtime.
psql -v ON_ERROR_STOP=1 --username supabase_admin --dbname postgres <<-EOSQL
  ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
  ALTER ROLE postgres WITH PASSWORD '${POSTGRES_PASSWORD}';

  CREATE SCHEMA IF NOT EXISTS _realtime;
  GRANT ALL ON SCHEMA _realtime TO supabase_admin;
EOSQL
