-- Sync all Supabase role passwords to POSTGRES_PASSWORD
-- This runs after the image's built-in init scripts, overriding their defaults.
-- The \set command reads from the PGPASSWORD env var set in docker-compose.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER ROLE supabase_admin WITH PASSWORD :'pgpass';
ALTER ROLE supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'pgpass';
ALTER ROLE authenticator WITH PASSWORD :'pgpass';
ALTER ROLE postgres WITH PASSWORD :'pgpass';
