import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getAccountConfigModule,
  hasAccountConfigModule,
} from '../accountConfigRegistry.ts';

describe('account config registry', () => {
  it('resolves providers that have a connect form', () => {
    for (const provider of ['surepet', 'inference', 'mqtt']) {
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
    for (const provider of ['surepet', 'inference', 'mqtt', 'esphome']) {
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

  it('stores only what was set for an mqtt broker', () => {
    const module = getAccountConfigModule('mqtt');
    assert.deepEqual(
      module.toConfig({
        ...module.defaultConfigValues,
        url: ' mqtt://broker.local:1883 ',
        username: 'hub ',
        password: ' keep me ',
      }),
      {
        url: 'mqtt://broker.local:1883',
        username: 'hub',
        password: ' keep me ',
      },
    );
    assert.deepEqual(
      module.toConfig({
        ...module.defaultConfigValues,
        url: 'mqtts://broker.local',
        allow_untrusted_certs: true,
      }),
      { url: 'mqtts://broker.local', allow_untrusted_certs: true },
    );
  });

  it('drops TLS material once the mqtt scheme is plain', () => {
    // The form hides those fields on mqtt://, so a stale PEM from an earlier
    // mqtts:// edit must not ride along unseen.
    const module = getAccountConfigModule('mqtt');
    assert.deepEqual(
      module.toConfig({
        ...module.defaultConfigValues,
        url: 'mqtt://broker.local',
        ca_cert: 'CA',
        client_cert: 'CERT',
        client_key: 'KEY',
        allow_untrusted_certs: true,
      }),
      { url: 'mqtt://broker.local' },
    );
  });

  it('round-trips a full mqtt config', () => {
    const module = getAccountConfigModule('mqtt');
    const config = {
      url: 'mqtts://broker.local:8883',
      username: 'hub',
      password: 'pw',
      client_id: 'cat-health-1',
      ca_cert: 'CA',
      client_cert: 'CERT',
      client_key: 'KEY',
      allow_untrusted_certs: true,
      topic_prefix: 'cathealth/home',
    };
    assert.deepEqual(module.toConfig(module.toFormValues(config)), config);
    assert.deepEqual(module.toFormValues({ url: 'mqtt://broker.local' }), {
      ...module.defaultConfigValues,
      url: 'mqtt://broker.local',
    });
  });

  it('flags the surepet unofficial-access note', () => {
    assert.equal(getAccountConfigModule('surepet').note?.tone, 'warning');
    assert.equal(getAccountConfigModule('inference').note, undefined);
  });
});
