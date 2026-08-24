import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';

import type { ProviderAccount, ProviderDeps } from '../../../types.ts';
import { ThinginoAccountManager } from '../ThinginoAccountManager.ts';

const account = {
  id: 1,
  provider: 'thingino',
  name: 'Thingino',
  config: {},
  runtime_state: {},
  enabled: 1,
  internal: 1,
  created_at: 0,
  updated_at: 0,
} as ProviderAccount;

const deps = {} as unknown as ProviderDeps;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ThinginoAccountManager', () => {
  after(() => {
    mock.restoreAll();
  });

  it('probes /device with the submitted token when validating config', async () => {
    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        assert.equal(url.origin, 'http://cam.local');
        assert.equal(url.searchParams.get('token'), 'secret');
        assert.match(url.pathname, /\/api\/v1\/device$/);
        return jsonResponse({ hostname: 'cam' });
      },
    );

    const manager = new ThinginoAccountManager(account, deps);
    await manager.validateDeviceConfig({
      type: 'camera',
      config: { origin: 'http://cam.local', token: 'secret' },
    });
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});
