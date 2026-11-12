import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import type { ProviderAccount } from '../../../database/types/ProviderAccountTable.ts';
import {
  applyAccountOverride,
  loadAccountOverrides,
} from '../accountOverrides.ts';

const ACCOUNT: ProviderAccount = {
  id: 4,
  provider: 'mqtt',
  name: 'Broker',
  config: { url: 'mqtt://broker.local', client_id: 'hub' },
  runtime_state: {},
  enabled: 1,
  internal: 0,
  created_at: 0,
  updated_at: 0,
};

function overridesFile(contents: unknown): string {
  const path = join(
    mkdtempSync(join(tmpdir(), 'account-overrides-')),
    'o.json',
  );
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

describe('loadAccountOverrides', () => {
  it('has none when ACCOUNT_OVERRIDES is unset', () => {
    assert.deepEqual(loadAccountOverrides({}), {});
  });

  it('reads overrides keyed by account id', () => {
    const path = overridesFile({ '4': { config: { client_id: 'dev' } } });
    assert.deepEqual(loadAccountOverrides({ ACCOUNT_OVERRIDES: path }), {
      '4': { config: { client_id: 'dev' } },
    });
  });

  it('rejects a key that is not an account id', () => {
    const path = overridesFile({ broker: { config: {} } });
    assert.throws(
      () => loadAccountOverrides({ ACCOUNT_OVERRIDES: path }),
      /Invalid account overrides/,
    );
  });

  it('rejects fields other than config', () => {
    const path = overridesFile({ '4': { config: {}, enabled: false } });
    assert.throws(
      () => loadAccountOverrides({ ACCOUNT_OVERRIDES: path }),
      /Invalid account overrides/,
    );
  });
});

describe('applyAccountOverride', () => {
  it('replaces overridden keys and keeps the rest', () => {
    const effective = applyAccountOverride(ACCOUNT, {
      config: { client_id: 'dev' },
    });
    assert.deepEqual(effective.config, {
      url: 'mqtt://broker.local',
      client_id: 'dev',
    });
  });

  it('leaves the stored account untouched', () => {
    applyAccountOverride(ACCOUNT, { config: { client_id: 'dev' } });
    assert.equal(ACCOUNT.config.client_id, 'hub');
  });
});
