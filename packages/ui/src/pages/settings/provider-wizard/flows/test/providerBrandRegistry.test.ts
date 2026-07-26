import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getProviderBrand } from '../providerBrandRegistry.ts';

describe('getProviderBrand', () => {
  it('resolves known providers to a human label', () => {
    assert.equal(getProviderBrand('surepet').label, 'Sure Petcare');
    assert.equal(getProviderBrand('esphome').label, 'ESPHome');
  });

  it('falls back to a neutral tile for unknown providers', () => {
    // The seeded "Legacy Devices" account uses provider `unknown`, and new
    // providers can appear before this registry learns about them.
    for (const provider of ['unknown', 'petkit', 'xiaomi', '']) {
      const brand = getProviderBrand(provider);
      assert.ok(brand.label.length > 0, `${provider} has no label`);
      assert.ok(brand.tileColor.length > 0, `${provider} has no tile colour`);
      assert.ok(brand.monogram, `${provider} has no monogram`);
    }
  });

  it('always derives a monogram', () => {
    assert.equal(getProviderBrand('surepet').monogram, 'S');
    assert.equal(getProviderBrand('unknown').monogram, 'UN');
    assert.equal(getProviderBrand('').monogram, 'UN');
  });

  it('gives low-contrast tiles an explicit dark foreground', () => {
    // White on --color-secondary / --color-warning fails WCAG AA.
    assert.ok(getProviderBrand('esphome').tileTextColor);
    assert.ok(getProviderBrand('thingino').tileTextColor);
  });

  it('exposes an account identity only for providers that have one', () => {
    assert.equal(
      typeof getProviderBrand('surepet').accountIdentity,
      'function',
    );
    assert.equal(getProviderBrand('esphome').accountIdentity, undefined);
    assert.equal(getProviderBrand('unknown').accountIdentity, undefined);
  });

  it('reads identities without throwing on junk config', () => {
    const surepet = getProviderBrand('surepet').accountIdentity!;
    assert.equal(surepet({ email: 'you@example.com' }), 'you@example.com');
    for (const junk of [null, undefined, 42, [], 'nope', {}]) {
      assert.equal(surepet(junk), undefined);
    }

    const inference = getProviderBrand('inference').accountIdentity!;
    assert.equal(
      inference({ base_url: 'https://openrouter.ai/api/v1' }),
      'openrouter.ai',
    );
    assert.equal(inference({ base_url: 'not a url' }), 'not a url');
    assert.equal(inference({}), undefined);
  });

  it('never surfaces a secret as the identity line', () => {
    const inference = getProviderBrand('inference').accountIdentity!;
    const identity = inference({
      api_key: 'sk-super-secret',
      base_url: 'https://openrouter.ai/api/v1',
    });
    assert.ok(!identity?.includes('sk-super-secret'));
  });
});
