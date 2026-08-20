import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SurePetProvider } from '../SurePetProvider.ts';

const provider = new SurePetProvider();

const RUNTIME = {
  device_id: 'install-uuid',
  token: 'jwt',
  household_id: 42,
  sync: { last_timeline_since_id: 55, feeding_timeline_backfill_done: true },
};

function reconcile(
  previousConfig: unknown,
  nextConfig: unknown,
  runtimeState: unknown = RUNTIME,
) {
  return provider.reconcileRuntimeState({
    previousConfig,
    nextConfig,
    runtimeState,
  });
}

describe('SurePetProvider.reconcileRuntimeState', () => {
  it('keeps everything when credentials are unchanged', () => {
    const result = reconcile(
      { email: 'you@example.com', password: 'pw' },
      { email: 'you@example.com', password: 'pw', pet_links: [] },
    );

    assert.deepEqual(result, RUNTIME);
  });

  it('drops the token and household but keeps the cursor on a password rotation', () => {
    const result = reconcile(
      { email: 'you@example.com', password: 'old' },
      { email: 'you@example.com', password: 'new' },
    );

    assert.equal(result.token, undefined);
    assert.equal(result.household_id, undefined);
    assert.equal(
      result.device_id,
      'install-uuid',
      'the install identity is not credentials-derived',
    );
    assert.deepEqual(
      result.sync,
      RUNTIME.sync,
      'same account, so the timeline cursor is still valid',
    );
  });

  it('drops the cursor too when the email changes', () => {
    const result = reconcile(
      { email: 'old@example.com', password: 'pw' },
      { email: 'new@example.com', password: 'pw' },
    );

    assert.equal(result.token, undefined);
    assert.equal(result.household_id, undefined);
    assert.equal(
      result.sync,
      undefined,
      'a different account has a different timeline',
    );
    assert.equal(result.device_id, 'install-uuid');
  });

  it('does not mutate the runtime state it is given', () => {
    const runtime = { ...RUNTIME };
    reconcile(
      { email: 'a@example.com', password: 'pw' },
      { email: 'b@example.com', password: 'pw' },
      runtime,
    );

    assert.deepEqual(runtime, RUNTIME);
  });

  it('tolerates junk on either side', () => {
    // Both configs unreadable means no credential change was detected, so the
    // runtime state is returned as-is — a non-record one normalized to {}.
    assert.deepEqual(reconcile(null, null, RUNTIME), RUNTIME);
    assert.deepEqual(reconcile(42, [], 'nonsense'), {});
    assert.deepEqual(reconcile(42, [], []), {});

    // Junk config reads as "no email", so moving to a real one counts as a
    // change and only the non-credentials-derived install id survives.
    assert.deepEqual(reconcile(undefined, { email: 'a', password: 'b' }), {
      device_id: 'install-uuid',
    });

    // ...and a junk runtime state on a real credential change stays empty
    // rather than leaking array indices into the blob.
    assert.deepEqual(
      reconcile({ email: 'a', password: 'b' }, { email: 'c', password: 'b' }, [
        'stray',
      ]),
      {},
    );
  });
});

describe('SurePetProvider.validateAccountConfigChange', () => {
  const check = (
    previousEmail: string,
    nextEmail: string,
    registeredDeviceCount: number,
  ) =>
    provider.validateAccountConfigChange({
      previousConfig: { email: previousEmail, password: 'pw' },
      nextConfig: { email: nextEmail, password: 'pw' },
      registeredDeviceCount,
    });

  it('refuses an email change while devices are registered', () => {
    const rejection = check('old@example.com', 'new@example.com', 2);
    assert.ok(rejection, 'the edit must be refused');
    assert.match(rejection, /2 device/);
  });

  it('allows an email change on an account with no devices', () => {
    assert.equal(check('old@example.com', 'new@example.com', 0), null);
  });

  it('allows a password rotation with devices registered', () => {
    assert.equal(
      provider.validateAccountConfigChange({
        previousConfig: { email: 'you@example.com', password: 'old' },
        nextConfig: { email: 'you@example.com', password: 'new' },
        registeredDeviceCount: 3,
      }),
      null,
    );
  });
});

describe('SurePetProvider.validateAccountConfig', () => {
  it('requires a non-empty email and password', () => {
    assert.equal(
      provider.validateAccountConfig({
        email: 'you@example.com',
        password: 'pw',
      }),
      true,
    );
    assert.equal(
      provider.validateAccountConfig({ email: 'you@example.com' }),
      false,
    );
    assert.equal(
      provider.validateAccountConfig({ email: '', password: 'pw' }),
      false,
    );
    assert.equal(provider.validateAccountConfig(null), false);
    assert.equal(provider.validateAccountConfig('nope'), false);
  });

  it('accepts a config carrying pet links', () => {
    assert.equal(
      provider.validateAccountConfig({
        email: 'you@example.com',
        password: 'pw',
        pet_links: [{ external_pet_id: '1', pet_id: 7 }],
      }),
      true,
    );
  });
});
