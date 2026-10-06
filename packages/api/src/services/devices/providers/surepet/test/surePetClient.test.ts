import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';

import { SurePetClient, SurePetClientError } from '../SurePetClient.ts';
import { ProviderPermanentError } from '../../../providerFailure.ts';
import { SUREPET_LOGIN_URL } from '../constants.ts';

describe('SurePetClient', () => {
  after(() => {
    mock.restoreAll();
  });

  it('stores the token returned by the login endpoint', async () => {
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (url: string | URL | Request) => {
        assert.equal(String(url), SUREPET_LOGIN_URL);
        return new Response(
          JSON.stringify({ data: { token: 'cloud-token-123' } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
    );

    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
    });

    const token = await client.login();

    assert.equal(token, 'cloud-token-123');
    assert.equal(client.getToken(), 'cloud-token-123');
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it('reports the token refreshed by a 401 retry', async () => {
    // Without this the refreshed token only lived in memory, so `runtime_state`
    // kept the dead one and the next process start had to log in again.
    const reported: string[] = [];
    let call = 0;
    mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      call += 1;
      if (String(url) === SUREPET_LOGIN_URL) {
        const body = JSON.stringify({ data: { token: `token-${call}` } });
        return new Response(body, { status: 200 });
      }
      // First data request is stale, the retry after re-login succeeds.
      return new Response(JSON.stringify({ data: {} }), {
        status: reported.length < 2 ? 401 : 200,
      });
    });

    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
      onToken: (token) => {
        reported.push(token);
      },
    });

    await client.meStart();

    assert.deepEqual(reported, ['token-1', 'token-3']);
    assert.equal(client.getToken(), 'token-3');
  });

  it('treats a refused login as permanent', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response(JSON.stringify({ error: 'nope' }), { status: 401 });
    });

    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
    });

    await assert.rejects(
      () => client.login(),
      (error: unknown) => {
        assert.ok(error instanceof ProviderPermanentError);
        assert.ok(error.cause instanceof SurePetClientError);
        assert.equal(error.cause.status, 401);
        return true;
      },
    );
  });

  it('treats a 422 login as refused credentials too', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response('{}', { status: 422 });
    });
    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
    });

    await assert.rejects(() => client.login(), ProviderPermanentError);
  });

  it('leaves a 403 login retryable', async () => {
    mock.method(globalThis, 'fetch', async () => {
      return new Response('{}', { status: 403 });
    });
    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
    });

    await assert.rejects(
      () => client.login(),
      (error: unknown) =>
        error instanceof SurePetClientError && error.status === 403,
    );
  });

  it('writes a control change and returns the request it queued', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    mock.method(
      globalThis,
      'fetch',
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        return new Response(
          JSON.stringify({
            data: { lid: { close_delay: 20 } },
            results: [{ request_id: 'req-1', status_id: 5 }],
          }),
          { status: 200 },
        );
      },
    );

    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
      // Long enough that the client takes it as live and skips the login.
      token: 't'.repeat(400),
    });

    const { request } = await client.putDeviceControl(123, {
      lid: { close_delay: 20 },
    });

    assert.deepEqual(request, { request_id: 'req-1', status_id: 5 });
    const write = calls.find((call) => call.method === 'PUT');
    assert.ok(write?.url.endsWith('/device/123/control/async'));
    assert.deepEqual(write?.body, { lid: { close_delay: 20 } });
  });

  it('assigns a tag through the v2 route and reads the request it queued', async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    mock.method(
      globalThis,
      'fetch',
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          method: init?.method,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        return new Response(
          JSON.stringify([
            {
              data: { id: 11 },
              results: [{ request_id: 'req-2', status_id: 5 }],
            },
          ]),
          { status: 200 },
        );
      },
    );

    const client = new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
      token: 't'.repeat(400),
    });

    const { request } = await client.putDeviceTag(123, {
      tag_id: 11,
      request_action: 1,
    });

    assert.deepEqual(request, { request_id: 'req-2', status_id: 5 });
    const write = calls.find((call) => call.method === 'PUT');
    assert.ok(write?.url.endsWith('/api/v2/device/123/tag/async'));
    assert.deepEqual(write?.body, [{ tag_id: 11, request_action: 1 }]);
  });
});
