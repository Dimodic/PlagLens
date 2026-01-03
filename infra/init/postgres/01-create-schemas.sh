#!/usr/bin/env bash
# Postgres init wrapper. Runs the SQL with $POSTGRES_PASSWORD substituted
# at runtime (avoids psql `:var` quoting limitations of docker-entrypoint).
set -euo pipefail

APP_PASSWORD="${POSTGRES_PASSWORD:-plaglens_dev_changeme}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS course;
CREATE SCHEMA IF NOT EXISTS submission;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS plagiarism;
CREATE SCHEMA IF NOT EXISTS ai_analysis;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS gateway;

DO \$\$
DECLARE
    svc TEXT;
    role_name TEXT;
    services TEXT[] := ARRAY[
        'identity', 'course', 'submission', 'integration', 'plagiarism',
        'ai_analysis', 'notification', 'reporting', 'audit', 'gateway'
    ];
BEGIN
    FOREACH svc IN ARRAY services LOOP
        role_name := svc || '_app';
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', role_name, '${APP_PASSWORD}');
        ELSE
            EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', role_name, '${APP_PASSWORD}');
        END IF;
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), role_name);
        EXECUTE format('GRANT CREATE ON DATABASE %I TO %I', current_database(), role_name);
        EXECUTE format('ALTER SCHEMA %I OWNER TO %I', svc, role_name);
        EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', svc, role_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO %I', svc, role_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', svc, role_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', svc, role_name);
        EXECUTE format('ALTER ROLE %I SET search_path TO %I, public', role_name, svc);
        RAISE NOTICE 'Provisioned role % for schema %', role_name, svc;
    END LOOP;
END
\$\$;
EOSQL
echo "[init] schemas+roles provisioned"
