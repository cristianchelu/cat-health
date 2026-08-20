import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';

import { SurePetClient, SurePetClientError } from '../SurePetClient.ts';
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

  it('surfaces HTTP failures from the login endpoint', async () => {
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
        assert.ok(error instanceof SurePetClientError);
        assert.equal(error.status, 401);
        return true;
      },
    );
  });
});
