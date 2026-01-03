/**
 * Module-level cache of access tokens per role to avoid hammering /auth/login
 * with rate-limited workers. Uses the storage state files written by
 * global-setup at e2e/.auth/<role>.json when available.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient, type DemoRole } from './api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.resolve(__dirname, '../.auth');

const cache = new Map<DemoRole, string>();

export async function getToken(role: DemoRole): Promise<string> {
  if (cache.has(role)) return cache.get(role) as string;

  // 1. Try the auth file written by global-setup.
  const file = path.join(AUTH_DIR, `${role}.json`);
  if (existsSync(file)) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { accessToken?: string };
      if (data.accessToken) {
        cache.set(role, data.accessToken);
        return data.accessToken;
      }
    } catch {
      // ignore — fall back to login
    }
  }

  // 2. Login fresh.
  const api = await ApiClient.create();
  try {
    const token = await api.loginAs(role);
    cache.set(role, token);
    return token;
  } finally {
    await api.dispose();
  }
}

export async function getApiClient(role: DemoRole): Promise<ApiClient> {
  const token = await getToken(role);
  return ApiClient.create(token);
}

export function clearTokenCache(): void {
  cache.clear();
}
