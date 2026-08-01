import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TFunction } from 'i18next';

import {
  getProviderBrand,
  providerBrandLabel,
} from '../providerBrandRegistry.ts';

/** Stand-in for i18next: resolves from a table, else honours `defaultValue`. */
const fakeT = (table: Record<string, string>) =>
  ((key: string, options?: { defaultValue?: string }) =>
    table[key] ?? options?.defaultValue ?? key) as unknown as TFunction;

describe('getProviderBrand', () => {
  it('resolves known providers to a human label', () => {
    assert.equal(getProviderBrand('surepet').label, 'Sure Petcare');
    assert.equal(getProviderBrand('esphome').label, 'ESPHome');
  });

  it('falls back to a neutral tile for unknown providers', () => {
    // Literal `unknown`, empty, and providers this registry has not learned
    // about yet all need a usable tile rather than a throw.
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

  it('uses a theme token for every tile colour', () => {
    // A raw hex cannot follow the theme, and the one that existed sank into the
    // background in dark mode.
    for (const provider of [
      'surepet',
      'inference',
      'esphome',
      'camera',
      'thingino',
      'unknown',
    ]) {
      const brand = getProviderBrand(provider);
      assert.match(brand.tileColor, /^var\(--/, `${provider} tile colour`);
    }
  });
});

describe('providerBrandLabel', () => {
  const t = fakeT({
    'device_types.camera': 'Cameră',
    'common.unknown': 'Necunoscut',
  });

  it('translates common-noun labels', () => {
    assert.equal(providerBrandLabel(getProviderBrand('camera'), t), 'Cameră');
    assert.equal(
      providerBrandLabel(getProviderBrand('unknown'), t),
      'Necunoscut',
    );
    assert.equal(providerBrandLabel(getProviderBrand(''), t), 'Necunoscut');
  });

  it('leaves brand names alone', () => {
    assert.equal(
      providerBrandLabel(getProviderBrand('surepet'), t),
      'Sure Petcare',
    );
    assert.equal(providerBrandLabel(getProviderBrand('esphome'), t), 'ESPHome');
  });

  it('falls back to English when the locales lack the key', () => {
    // A label key must never render as `settings.whatever` on screen.
    assert.equal(
      providerBrandLabel(getProviderBrand('inference'), t),
      'Inference',
    );
  });

  it('shows an unrecognised provider key as-is', () => {
    assert.equal(providerBrandLabel(getProviderBrand('petkit'), t), 'petkit');
  });
});

describe('getProviderBrand identities', () => {
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
