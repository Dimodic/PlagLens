/**
 * API client tests:
 *  - response interceptor parses RFC 7807 Problem on errors
 *  - on 401 + TOKEN_EXPIRED → calls /auth/refresh once and retries the original request
 *  - if refresh fails → notifies via the unauthorized handler
 */
import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  setUnauthorizedHandler,
  tokenStore,
} from '@/api/client';

describe('api/client', () => {
  let client: ReturnType<typeof createApiClient>;
  let mock: MockAdapter;

  beforeEach(() => {
    client = createApiClient('/api/v1');
    // axios-mock-adapter dynamic import for cleaner failure if missing
    mock = new MockAdapter(client);
    tokenStore.clear();
  });

  afterEach(() => {
    mock.restore();
    setUnauthorizedHandler(null);
  });

  it('parses Problem on error responses', async () => {
    mock.onGet('/users/me').reply(403, {
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'No permission',
      errors: [],
    });

    await expect(client.get('/users/me')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      title: 'Forbidden',
    });
  });

  it('refreshes once on TOKEN_EXPIRED and retries the original request', async () => {
    tokenStore.set('expired-token');
    let callsToProtected = 0;
    mock.onGet('/users/me').reply(() => {
      callsToProtected++;
      if (callsToProtected === 1) {
        return [
          401,
          {
            title: 'Token expired',
            status: 401,
            code: 'TOKEN_EXPIRED',
          },
        ];
      }
      return [200, { id: 'usr_x', email: 'x@y.z' }];
    });
    mock.onPost('/auth/refresh').reply(200, {
      access_token: 'fresh-token',
      expires_in: 900,
    });

    const resp = await client.get('/users/me');
    expect(resp.status).toBe(200);
    expect(callsToProtected).toBe(2);
    expect(tokenStore.get()).toBe('fresh-token');
  });

  it('triggers unauthorized handler when refresh fails', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('expired-token');

    mock.onGet('/users/me').reply(401, {
      title: 'Token expired',
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
    mock.onPost('/auth/refresh').reply(401, {
      title: 'No refresh',
      status: 401,
      code: 'UNAUTHENTICATED',
    });

    await expect(client.get('/users/me')).rejects.toBeTruthy();
    expect(handler).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
  });
});
