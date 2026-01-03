#!/usr/bin/env bash
# Generates an RS256 keypair for JWT signing.
#
# Outputs PEM files to <SECRETS_DIR>/jwt_private.pem and jwt_public.pem.
# The default SECRETS_DIR (infra/secrets) is gitignored — never commit the
# private key.
#
# Usage:
#   tools/scripts/gen-jwt-keys.sh                  # → infra/secrets/
#   tools/scripts/gen-jwt-keys.sh /tmp/test-keys   # custom dir
#
# Idempotent: skips key generation if both files already exist. Use
# `rm <SECRETS_DIR>/jwt_*.pem` first to force a regeneration.
set -euo pipefail

SECRETS_DIR="${1:-infra/secrets}"
mkdir -p "$SECRETS_DIR"

PRIV="$SECRETS_DIR/jwt_private.pem"
PUB="$SECRETS_DIR/jwt_public.pem"

# Skip if already exist.
if [ -f "$PRIV" ] && [ -f "$PUB" ]; then
    echo "JWT keys already exist at $SECRETS_DIR — skipping."
    echo "  Remove jwt_private.pem and jwt_public.pem to force regeneration."
    exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl is required but not found in PATH." >&2
    exit 1
fi

# Generate 2048-bit RSA private key (PKCS#8 PEM).
openssl genpkey \
    -algorithm RSA \
    -pkeyopt rsa_keygen_bits:2048 \
    -out "$PRIV"

# Extract public key.
openssl rsa -pubout -in "$PRIV" -out "$PUB" 2>/dev/null

# Tighten permissions on the private key (best-effort; chmod is a no-op on
# Windows file systems but the operation must not fail there).
chmod 600 "$PRIV" 2>/dev/null || true
chmod 644 "$PUB"  2>/dev/null || true

echo "JWT keys generated at $SECRETS_DIR/"
echo "  Private: $PRIV  (NEVER COMMIT — gitignored)"
echo "  Public:  $PUB"
