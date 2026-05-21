#!/bin/sh
# PlagLens — MinIO bucket bootstrap.
# Creates default and example tenant buckets. All buckets are private
# (no anon-read). A lifecycle rule deletes non-current versions after 30d
# to bound storage growth in dev.

set -eu

ENDPOINT="${MINIO_ENDPOINT:-http://minio:9000}"
ACCESS_KEY="${MINIO_ROOT_USER}"
SECRET_KEY="${MINIO_ROOT_PASSWORD}"

# mc alias setup — retry until MinIO is fully ready.
i=0
until mc alias set local "$ENDPOINT" "$ACCESS_KEY" "$SECRET_KEY" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
        echo "MinIO not reachable at $ENDPOINT after 60 attempts" >&2
        exit 1
    fi
    echo "Waiting for MinIO ($i/60)..."
    sleep 2
done

ensure_bucket() {
    bucket="$1"
    if mc ls "local/$bucket" >/dev/null 2>&1; then
        echo "Bucket exists: $bucket"
    else
        mc mb "local/$bucket"
        echo "Created bucket: $bucket"
    fi

    # Private only — explicitly remove any anonymous policy.
    mc anonymous set none "local/$bucket" >/dev/null 2>&1 || true

    # Enable versioning so soft-delete works for blobs.
    mc version enable "local/$bucket" >/dev/null 2>&1 || true

    # Lifecycle: drop non-current versions after 30 days.
    cat > /tmp/lifecycle.json <<JSON
{
    "Rules": [
        {
            "ID": "expire-noncurrent-versions",
            "Status": "Enabled",
            "Filter": { "Prefix": "" },
            "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
        }
    ]
}
JSON
    mc ilm import "local/$bucket" < /tmp/lifecycle.json
    rm -f /tmp/lifecycle.json
}

ensure_bucket "plaglens-default"
ensure_bucket "plaglens-tnt-hse-cs"
ensure_bucket "plaglens-avatars"
# Avatars: identity uploads here and stores a presigned URL on users.avatar_url.
# Keep it private (signed URLs only) so we can rotate by re-signing.

echo "MinIO buckets provisioned."
mc ls local | sed 's/^/  /'
