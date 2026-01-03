# PlagLens — Infrastructure

Self-contained Docker Compose stack for the 10 PlagLens microservices and
their supporting infrastructure (Postgres, Redis, Kafka, MinIO, Prometheus,
Grafana, Jaeger, Vault, Traefik, Mailhog).

## Quickstart

```bash
cp .env.example .env
# Edit .env — at minimum set POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD,
# VAULT_DEV_ROOT_TOKEN, GRAFANA_ADMIN_PASSWORD, WEBHOOK_HMAC_SECRET.

docker compose up -d
docker compose ps
```

For development with hot reload of service code:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.override.yml up -d
```

## Endpoints

| Component | URL |
|---|---|
| API Gateway (TLS) | https://localhost (Traefik → gateway:8000) |
| Traefik dashboard | http://localhost:8081 |
| Kafka UI | http://localhost:8080 |
| Grafana | http://localhost:3000 (admin / `GRAFANA_ADMIN_PASSWORD`) |
| Prometheus | http://localhost:9090 |
| Jaeger UI | http://localhost:16686 |
| Mailhog UI | http://localhost:8025 |
| Vault UI | http://localhost:8200 (token: `VAULT_DEV_ROOT_TOKEN`) |
| MinIO console | http://localhost:9001 |
| Postgres | localhost:5432 (user: `plaglens_admin`) |
| Redis | localhost:6379 |

In dev override, each service is also exposed:
gateway 8001, identity 8002, course 8003, submission 8004, integration 8005,
plagiarism 8006, ai-analysis 8007, notification 8008, reporting 8009, audit 8010.

## What lives here

```
infra/
  docker-compose.yml                       # main stack
  docker-compose.dev.override.yml          # hot-reload + relaxed health
  .env.example                             # all env vars (placeholders only)
  README.md
  init/
    postgres/01-create-schemas.sql         # one schema + role per service
    kafka/create-topics.sh                 # all domain topics + DLQ variants
    kafka/Dockerfile                       # bootstrap image (optional)
    minio/create-buckets.sh                # default + tenant bucket, lifecycle
    vault/seed-secrets.sh                  # placeholder secrets in dev mode
  prometheus/prometheus.yml                # scrape config (10 services)
  grafana/
    provisioning/datasources/prometheus.yml
    provisioning/dashboards/dashboards.yml
    dashboards/overview.json               # RPS, p95, error rate, kafka lag
  traefik/
    traefik.yml                            # static config: TLS, ACME staging
    dynamic/routes.yml                     # routes for ops UIs
```

## Operational notes

- All services share one Docker network: `plaglens-net`.
- Persistent state lives in named volumes (`postgres-data`, `redis-data`,
  `kafka-data`, `minio-data`, `prometheus-data`, `grafana-data`,
  `vault-data`, `traefik-acme`).
- Kafka runs in **KRaft mode** (no Zookeeper). Single broker, replication
  factor 1 — dev/prototype only.
- Vault runs in **dev mode**. Data is in `vault-data` but secrets are
  re-seeded by the `vault-init` one-shot every restart. Do not use as-is
  in any environment that handles real secrets.
- Traefik uses Let's Encrypt **staging** by default; certificates are
  untrusted by browsers (expected for dev).
- Healthchecks are configured on all critical services. Application
  services depend on `postgres`, `redis`, `kafka` being healthy before
  they start.

## Validation

```bash
# Validate the base stack:
docker compose -f docker-compose.yml config

# Validate base + dev override:
docker compose -f docker-compose.yml -f docker-compose.dev.override.yml config
```

## Production hardening checklist (out of scope for КТ-1)

- [ ] Replace dev-mode Vault with a sealed cluster + auto-unseal.
- [ ] Issue real TLS certs (LE production directory or in-house CA).
- [ ] Postgres: split to managed/Patroni cluster, enable WAL archiving.
- [ ] Kafka: 3-broker cluster, replication factor 3, min ISR 2.
- [ ] Per-service Postgres roles get distinct passwords from Vault.
- [ ] Disable Traefik insecure dashboard, lock behind auth middleware.
- [ ] Tighten healthcheck timing back to production values.
