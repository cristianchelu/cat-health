import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getAccountConfigModule,
  hasAccountConfigModule,
} from '../accountConfigRegistry.ts';

describe('account config registry', () => {
  it('resolves providers that have a connect form', () => {
    for (const provider of ['surepet', 'inference']) {
      assert.equal(hasAccountConfigModule(provider), true);
      assert.ok(getAccountConfigModule(provider).Fields);
    }
  });

  it('falls back to the generic module for everything else', () => {
    const generic = getAccountConfigModule('esphome');
    for (const provider of ['esphome', 'camera', 'thingino', 'unknown', '']) {
      assert.equal(hasAccountConfigModule(provider), false);
      assert.equal(getAccountConfigModule(provider), generic);
    }
  });

  it('gives the generic module a config that owns nothing', () => {
    // This is what replaced the raw JSON textarea. It must be incapable of
    // damaging a config it does not understand.
    const generic = getAccountConfigModule('esphome');
    assert.deepEqual(generic.defaultConfigValues, {});
    assert.deepEqual(generic.toFormValues({ host: '10.0.0.5' }), {});
    assert.deepEqual(generic.toConfig({ anything: 'here' }), {});
  });

  it('round-trips surepet credentials', () => {
    const module = getAccountConfigModule('surepet');
    const values = module.toFormValues({
      email: 'you@example.com',
      password: 'pw',
      pet_links: [{ external_pet_id: '1', pet_id: 7 }],
    });
    assert.deepEqual(values, { email: 'you@example.com', password: 'pw' });
    assert.deepEqual(module.toConfig(values), {
      email: 'you@example.com',
      password: 'pw',
    });
  });

  it('opens accounts that predate config validation', () => {
    // Nothing validated these before, so a missing password is realistic and
    // must still render rather than throwing the page away.
    const module = getAccountConfigModule('surepet');
    assert.deepEqual(module.toFormValues({ email: 'you@example.com' }), {
      email: 'you@example.com',
      password: '',
    });
  });

  it('tolerates junk config for every module', () => {
    for (const provider of ['surepet', 'inference', 'esphome']) {
      const module = getAccountConfigModule(provider);
      for (const junk of [null, undefined, 42, [], 'nope']) {
        assert.doesNotThrow(() => module.toFormValues(junk));
      }
    }
  });

  it('trims whitespace out of inference settings', () => {
    const module = getAccountConfigModule('inference');
    assert.deepEqual(
      module.toConfig({
        api_key: '  sk-abc  ',
        base_url: '  https://openrouter.ai/api/v1  ',
      }),
      { api_key: 'sk-abc', base_url: 'https://openrouter.ai/api/v1' },
    );
  });

  it('flags the surepet unofficial-access note', () => {
    assert.equal(getAccountConfigModule('surepet').note?.variant, 'warn');
    assert.equal(getAccountConfigModule('inference').note, undefined);
  });
});
