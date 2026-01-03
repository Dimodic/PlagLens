#!/bin/sh
# PlagLens — Vault dev-mode secret seeding.
# Writes placeholder secrets under `secret/plaglens/*` so services can boot
# locally without external credentials. In prod Vault is initialized and
# unsealed manually and these paths are populated by an out-of-band process.

set -eu

VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
VAULT_TOKEN="${VAULT_TOKEN:?VAULT_TOKEN must be set}"

export VAULT_ADDR VAULT_TOKEN

# Wait for Vault to become ready.
i=0
until vault status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
        echo "Vault not reachable at $VAULT_ADDR after 60 attempts" >&2
        exit 1
    fi
    echo "Waiting for Vault ($i/60)..."
    sleep 2
done

# `secret/` KV v2 is enabled by default in dev mode. Make sure of it.
vault secrets list -format=json 2>/dev/null | grep -q '"secret/"' || \
    vault secrets enable -version=2 -path=secret kv

# JWT signing keys — placeholders only. In prod these are RSA pairs minted
# by Identity at first boot or rotated by an external process.
vault kv put secret/plaglens/jwt \
    issuer="https://plaglens.local" \
    audience="plaglens-api" \
    private_key_pem="REPLACE_WITH_PEM" \
    public_key_pem="REPLACE_WITH_PEM" \
    kid="dev-1"

# OAuth — Google.
vault kv put secret/plaglens/oauth/google \
    client_id="REPLACE_ME" \
    client_secret="REPLACE_ME" \
    redirect_uri="https://localhost/api/v1/auth/oauth/google/callback"

# OAuth — Yandex.
vault kv put secret/plaglens/oauth/yandex \
    client_id="REPLACE_ME" \
    client_secret="REPLACE_ME" \
    redirect_uri="https://localhost/api/v1/auth/oauth/yandex/callback"

# OAuth — GitHub (used as student login at HSE/etc.).
vault kv put secret/plaglens/oauth/github \
    client_id="REPLACE_ME" \
    client_secret="REPLACE_ME" \
    redirect_uri="https://localhost/api/v1/auth/oauth/github/callback"

# LLM provider keys — out-of-band by default.
vault kv put secret/plaglens/llm/openai api_key="REPLACE_ME" base_url="https://api.openai.com/v1"
vault kv put secret/plaglens/llm/yandex_gpt api_key="REPLACE_ME" folder_id="REPLACE_ME"

# Plagiarism providers.
vault kv put secret/plaglens/plagiarism/moss user_id="REPLACE_ME"
vault kv put secret/plaglens/plagiarism/codequiry api_key="REPLACE_ME"

# Webhook signing.
vault kv put secret/plaglens/integration/webhook hmac_secret="REPLACE_ME"

echo "Vault seed complete:"
vault kv list secret/plaglens || true
vault kv list secret/plaglens/oauth || true
vault kv list secret/plaglens/llm || true
