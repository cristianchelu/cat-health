import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InferenceProvider } from '../InferenceProvider.ts';

describe('InferenceProvider', () => {
  const provider = new InferenceProvider();

  it('registers no device types but offers recognition', () => {
    // The account is a credential recognition is billed against, not a source
    // of hardware — so the add-device wizard must never offer it.
    assert.deepEqual(provider.capabilities.supported_device_types, []);
    assert.equal(provider.capabilities.supports_recognition, true);
  });

  it('accepts account config with api_key and base_url', () => {
    assert.equal(
      provider.validateAccountConfig({
        api_key: 'test-key',
        base_url: 'http://inference.local:8080',
      }),
      true,
    );
  });

  it('rejects empty or partial account config', () => {
    assert.equal(provider.validateAccountConfig(null), false);
    assert.equal(
      provider.validateAccountConfig({ api_key: 'only-key' }),
      false,
    );
    assert.equal(
      provider.validateAccountConfig({ base_url: 'http://inference.local' }),
      false,
    );
  });
});
