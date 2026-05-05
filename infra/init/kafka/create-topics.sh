#!/usr/bin/env bash
# PlagLens — Kafka topic bootstrap.
# Idempotent: re-running on an existing cluster is a no-op for already-created
# topics; new ones are added.
#
# Topic naming follows docs/architecture/03-EVENTS.md:
#   plaglens.{service}.{domain}.{version}
# DLQ variants:
#   plaglens.{service}.{domain}.{version}.dlq.v1
#
# Single-broker dev cluster: replication=1, partitions=3 (tenant_id keying).

set -euo pipefail

BROKERS="${KAFKA_BROKERS:-kafka:9092}"
PARTITIONS="${KAFKA_PARTITIONS:-3}"
RF="${KAFKA_REPLICATION_FACTOR:-1}"
RETENTION_MS="${KAFKA_RETENTION_MS:-604800000}"   # 7 days
DLQ_RETENTION_MS="${KAFKA_DLQ_RETENTION_MS:-1209600000}"  # 14 days

# Wait for the broker to be reachable. Healthcheck on the broker is the
# main barrier, but on slow boots the API may still be re-registering.
for i in $(seq 1 60); do
    if kafka-broker-api-versions --bootstrap-server "$BROKERS" >/dev/null 2>&1; then
        echo "Kafka broker $BROKERS is reachable."
        break
    fi
    echo "Waiting for Kafka ($i/60)..."
    sleep 2
done

DOMAIN_TOPICS=(
    "plaglens.identity.user.v1"
    "plaglens.identity.tenant.v1"
    "plaglens.course.course.v1"
    "plaglens.course.assignment.v1"
    "plaglens.submission.submission.v1"
    "plaglens.submission.grade.v1"
    "plaglens.integration.import.v1"
    "plaglens.integration.config.v1"
    "plaglens.plagiarism.run.v1"
    "plaglens.ai.analysis.v1"
    "plaglens.ai.budget.v1"
    "plaglens.notification.delivery.v1"
    "plaglens.reporting.export.v1"
    "plaglens.operation.v1"
    "plaglens.audit.event.v1"
)

create_topic() {
    local topic="$1"
    local retention_ms="$2"
    if kafka-topics --bootstrap-server "$BROKERS" --describe --topic "$topic" >/dev/null 2>&1; then
        echo "Topic exists: $topic"
        return
    fi
    kafka-topics --bootstrap-server "$BROKERS" \
        --create \
        --topic "$topic" \
        --partitions "$PARTITIONS" \
        --replication-factor "$RF" \
        --config "retention.ms=$retention_ms" \
        --config "cleanup.policy=delete" \
        --config "compression.type=producer"
    echo "Created topic: $topic"
}

for t in "${DOMAIN_TOPICS[@]}"; do
    create_topic "$t" "$RETENTION_MS"
    create_topic "${t}.dlq.v1" "$DLQ_RETENTION_MS"
done

echo "All topics provisioned."
kafka-topics --bootstrap-server "$BROKERS" --list | grep '^plaglens\.' | sort
