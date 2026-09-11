import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { MqttProvider } from '../MqttProvider.ts';
import { buildMqttClientOptions } from '../mqttConnection.ts';
import { startFakeBroker, type FakeBroker } from './fakeBroker.ts';

describe('MqttProvider', () => {
  const provider = new MqttProvider();

  it('registers no device types yet', () => {
    assert.deepEqual(provider.capabilities.supported_device_types, []);
  });

  it('accepts a bare broker URL and every supported scheme', () => {
    for (const url of [
      'mqtt://broker.local',
      'mqtts://broker.local:8883',
      'ws://broker.local:9001/mqtt',
      'wss://broker.local/mqtt',
    ]) {
      assert.equal(provider.validateAccountConfig({ url }), true, url);
    }
    assert.equal(
      provider.validateAccountConfig({
        url: 'mqtt://broker.local',
        username: 'hub',
        password: 'secret',
        client_id: 'cat-health',
      }),
      true,
    );
  });

  it('rejects configs the client could not dial', () => {
    assert.equal(provider.validateAccountConfig(null), false);
    assert.equal(provider.validateAccountConfig({}), false);
    assert.equal(provider.validateAccountConfig({ url: '' }), false);
    assert.equal(
      provider.validateAccountConfig({ url: 'broker.local' }),
      false,
    );
    assert.equal(
      provider.validateAccountConfig({ url: 'http://broker.local' }),
      false,
    );
    assert.equal(provider.validateAccountConfig({ url: 'mqtt://' }), false);
  });
});

describe('MqttProvider topic prefix', () => {
  const provider = new MqttProvider();
  const withPrefix = (topic_prefix: string) =>
    provider.validateAccountConfig({
      url: 'mqtt://broker.local',
      topic_prefix,
    });

  it('accepts plain multi-level prefixes', () => {
    assert.equal(withPrefix('cathealth'), true);
    assert.equal(withPrefix('cathealth/tenant-1'), true);
  });

  it('refuses wildcards, empty levels and the HA discovery root', () => {
    for (const prefix of [
      '',
      'cathealth/#',
      'cat+health',
      '/cathealth',
      'cathealth/',
      '$SYS',
      'homeassistant',
      'homeassistant/sensor',
    ]) {
      assert.equal(withPrefix(prefix), false, prefix);
    }
  });
});

describe('buildMqttClientOptions', () => {
  it('drops empty credentials instead of presenting them', () => {
    const options = buildMqttClientOptions(
      { url: 'mqtt://broker.local', username: '', password: '' },
      'cat-health-abc123',
    );
    assert.equal('username' in options, false);
    assert.equal('password' in options, false);
    assert.equal(options.clientId, 'cat-health-abc123');
  });

  it('only applies TLS material to secure schemes', () => {
    const tls = {
      ca_cert: 'CA',
      client_cert: 'CERT',
      client_key: 'KEY',
      allow_untrusted_certs: true,
    };
    const plain = buildMqttClientOptions(
      { url: 'mqtt://broker.local', ...tls },
      'id',
    );
    assert.equal('ca' in plain, false);
    assert.equal('rejectUnauthorized' in plain, false);

    const secure = buildMqttClientOptions(
      { url: 'mqtts://broker.local', ...tls },
      'id',
    );
    assert.equal(secure.ca, 'CA');
    assert.equal(secure.cert, 'CERT');
    assert.equal(secure.key, 'KEY');
    assert.equal(secure.rejectUnauthorized, false);
  });
});

describe('MqttProvider.probeAccountConfig', () => {
  const provider = new MqttProvider();
  let broker: FakeBroker;

  before(async () => {
    broker = await startFakeBroker({
      answer: (packet) =>
        packet.username === 'hub' && packet.password?.toString() === 'secret'
          ? 0
          : 4,
    });
  });

  after(() => broker.close());

  it('resolves when the broker acknowledges the credentials', async () => {
    await provider.probeAccountConfig({
      url: broker.url,
      username: 'hub',
      password: 'secret',
    });
    assert.equal(broker.connects.at(-1)?.username, 'hub');
  });

  it('never probes under the account’s own client id', async () => {
    await provider.probeAccountConfig({
      url: broker.url,
      username: 'hub',
      password: 'secret',
      client_id: 'the-live-session',
    });
    const clientId = broker.connects.at(-1)?.clientId ?? '';
    assert.notEqual(clientId, 'the-live-session');
    assert.match(clientId, /^cat-health-probe-/);
    assert.ok(clientId.length <= 23, clientId);
  });

  it('reports a refused CONNECT in the broker’s words', async () => {
    await assert.rejects(
      provider.probeAccountConfig({
        url: broker.url,
        username: 'hub',
        password: 'wrong',
      }),
      /Broker refused the connection: Bad username or password/,
    );
  });

  it('reports a port nobody listens on', async () => {
    await assert.rejects(
      provider.probeAccountConfig({ url: 'mqtt://127.0.0.1:1' }),
      /not accepting connections/,
    );
  });

  it('rejects config it cannot dial before touching the network', async () => {
    await assert.rejects(
      provider.probeAccountConfig({ url: 'nonsense' }),
      /broker URL/,
    );
  });
});
