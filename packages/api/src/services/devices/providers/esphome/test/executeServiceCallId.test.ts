import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  UserServicesApi,
  type ExecuteServiceOptions,
  type ServiceEntity,
  type UserServicesApiHost,
} from 'esphome-client';

// `patches/esphome-client+2.0.0.patch` adds these options; the test fails if
// an upgrade drops it before the release that carries it upstream.
describe('esphome-client service execution', () => {
  const service: ServiceEntity = {
    key: 0x01020304,
    name: 'calibration_tare',
    args: [],
  };

  function execute(options?: ExecuteServiceOptions): string | undefined {
    const sent: string[] = [];
    // ServiceRegistry is not exported and has private fields, so a fake of
    // its two lookups can only be passed through a cast.
    const serviceRegistry = {
      byKey: () => service,
      byName: () => service,
    } as unknown as UserServicesApiHost['serviceRegistry'];
    const api = new UserServicesApi({
      serviceRegistry,
      log: { debug() {}, error() {}, info() {}, warn() {} },
      send: (_type, payload) => sent.push(payload.toString('hex')),
    });
    api.execute(service.key, [], options);
    return sent[0];
  }

  it('puts a call id and return_response on the wire', () => {
    assert.equal(
      execute({ callId: 300, returnResponse: true }),
      '0d04030201' + '18ac02' + '2001',
    );
  });

  it('leaves both off when no call id is asked for', () => {
    assert.equal(execute(), '0d04030201');
  });
});
