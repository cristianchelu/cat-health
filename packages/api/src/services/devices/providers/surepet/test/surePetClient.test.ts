import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';

import {
  SurePetClient,
  SurePetClientError,
} from '../SurePetClient.ts';
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
        return new Response(JSON.stringify({ data: { token: 'cloud-token-123' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
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
