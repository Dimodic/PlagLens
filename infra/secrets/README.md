# infra/secrets/

Local mount point for runtime secrets (RS256 JWT keypair, Google service-account
JSON, etc). Mounted read-only into Identity and Gateway containers as
`/run/secrets/`.

Everything except this README and `.gitignore` is gitignored. Generate the
JWT keypair before the first `docker compose up`:

```bash
make gen-keys
# or
bash tools/scripts/gen-jwt-keys.sh infra/secrets
```

This creates:

- `jwt_private.pem` — RSA-2048 private key (Identity uses it to sign tokens)
- `jwt_public.pem` — public key (Identity exposes it via JWKS; Gateway verifies)

In production these are managed by Vault / a secrets store and bind-mounted
the same way.
