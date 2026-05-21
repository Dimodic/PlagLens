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
    -- NOTE: course+submission and reporting+audit+notification are NOT in this
    -- loop — each group was merged into one service whose role owns all of that
    -- group's schemas; both are provisioned in dedicated blocks below.
    services TEXT[] := ARRAY[
        'identity', 'integration', 'plagiarism',
        'ai_analysis', 'gateway'
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

-- Merged course+submission service: ONE role owning BOTH schemas (course +
-- submission were merged in the Phase 3 refactor). submission's ORM is
-- unqualified and resolves via search_path; course is always schema-qualified
-- to "course", so search_path = submission, public is correct for both.
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'course_submission_app') THEN
        EXECUTE format('CREATE ROLE course_submission_app LOGIN PASSWORD %L', '${APP_PASSWORD}');
    ELSE
        EXECUTE format('ALTER ROLE course_submission_app WITH PASSWORD %L', '${APP_PASSWORD}');
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO course_submission_app', current_database());
    EXECUTE format('GRANT CREATE ON DATABASE %I TO course_submission_app', current_database());
    ALTER SCHEMA course OWNER TO course_submission_app;
    ALTER SCHEMA submission OWNER TO course_submission_app;
    GRANT USAGE, CREATE ON SCHEMA course TO course_submission_app;
    GRANT USAGE, CREATE ON SCHEMA submission TO course_submission_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA course GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO course_submission_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA submission GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO course_submission_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA course GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO course_submission_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA submission GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO course_submission_app;
    ALTER ROLE course_submission_app SET search_path TO submission, public;
    RAISE NOTICE 'Provisioned role course_submission_app for schemas course+submission';
END
\$\$;

-- Merged reporting+audit+notification service: ONE role owning ALL THREE
-- schemas (merged in the Phase 4 refactor). All three ORMs are fully
-- schema-qualified, so search_path only matters for the public extensions.
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reporting_app') THEN
        EXECUTE format('CREATE ROLE reporting_app LOGIN PASSWORD %L', '${APP_PASSWORD}');
    ELSE
        EXECUTE format('ALTER ROLE reporting_app WITH PASSWORD %L', '${APP_PASSWORD}');
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO reporting_app', current_database());
    EXECUTE format('GRANT CREATE ON DATABASE %I TO reporting_app', current_database());
    ALTER SCHEMA reporting OWNER TO reporting_app;
    ALTER SCHEMA audit OWNER TO reporting_app;
    ALTER SCHEMA notification OWNER TO reporting_app;
    GRANT USAGE, CREATE ON SCHEMA reporting TO reporting_app;
    GRANT USAGE, CREATE ON SCHEMA audit TO reporting_app;
    GRANT USAGE, CREATE ON SCHEMA notification TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA notification GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA reporting GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO reporting_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA notification GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO reporting_app;
    ALTER ROLE reporting_app SET search_path TO reporting, audit, notification, public;
    RAISE NOTICE 'Provisioned role reporting_app for schemas reporting+audit+notification';
END
\$\$;
EOSQL
echo "[init] schemas+roles provisioned"
