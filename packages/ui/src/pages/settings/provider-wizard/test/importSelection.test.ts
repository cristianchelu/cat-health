import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  DiscoveredDeviceDTO,
  GetDeviceResponseDTO,
  ProviderAccountDTO,
} from 'shared';

import { describeCandidates, importDevices } from '../importSelection.ts';
import { getFlow } from '../flows/registry.ts';

const candidate = (
  externalId: string,
  type = 'feeder',
): DiscoveredDeviceDTO => ({
  externalId,
  name: `Device ${externalId}`,
  type: type as DiscoveredDeviceDTO['type'],
  config: { product_id: 4, household_id: 42 },
});

const existing = (
  externalId: string,
  provider_account_id: number,
): GetDeviceResponseDTO =>
  ({ external_id: externalId, provider_account_id }) as GetDeviceResponseDTO;

describe('describeCandidates', () => {
  it('marks devices already imported into this account', () => {
    const [row] = describeCandidates([candidate('a')], [existing('a', 1)], 1, [
      'feeder',
    ]);
    assert.equal(row.disabledReason, 'already-added');
  });

  it('does not confuse the same external id on another account', () => {
    const [row] = describeCandidates([candidate('a')], [existing('a', 99)], 1, [
      'feeder',
    ]);
    assert.equal(row.disabledReason, undefined);
  });

  it('describes unsupported hardware rather than hiding it', () => {
    // Silently dropping a device the user can see in the vendor's own app
    // reads as a bug, so it stays listed but disabled.
    const rows = describeCandidates([candidate('a', 'camera')], [], 1, [
      'feeder',
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].disabledReason, 'unsupported');
  });

  it('reports already-added ahead of unsupported', () => {
    const [row] = describeCandidates(
      [candidate('a', 'camera')],
      [existing('a', 1)],
      1,
      ['feeder'],
    );
    assert.equal(row.disabledReason, 'already-added');
  });

  it('keeps one row per external id', () => {
    // externalId is the row identity: a provider echoing the same device twice
    // would otherwise duplicate React keys and one toggle would flip both.
    const rows = describeCandidates(
      [candidate('a'), candidate('a'), candidate('b')],
      [],
      1,
      ['feeder'],
    );
    assert.deepEqual(
      rows.map((r) => r.device.externalId),
      ['a', 'b'],
    );
  });

  it('keeps the first occurrence of a duplicated external id', () => {
    const first = { ...candidate('a'), name: 'First' };
    const second = { ...candidate('a'), name: 'Second' };
    const rows = describeCandidates([first, second], [], 1, ['feeder']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].device.name, 'First');
  });

  it('marks everything unsupported when the flow supports no types', () => {
    const rows = describeCandidates(
      [candidate('a'), candidate('b')],
      [],
      1,
      [],
    );
    assert.deepEqual(
      rows.map((r) => r.disabledReason),
      ['unsupported', 'unsupported'],
    );
  });

  it('leaves importable devices undisabled', () => {
    const rows = describeCandidates([candidate('a'), candidate('b')], [], 1, [
      'feeder',
    ]);
    assert.deepEqual(
      rows.map((r) => r.disabledReason),
      [undefined, undefined],
    );
  });
});

describe('importDevices', () => {
  it('submits sequentially, in order', async () => {
    const order: string[] = [];
    await importDevices([candidate('a'), candidate('b')], async (device) => {
      order.push(device.externalId);
    });
    assert.deepEqual(order, ['a', 'b']);
  });

  it('keeps going after a failure and reports per device', async () => {
    // A partial import must be reportable as "N of M", not one opaque
    // rejection that loses which devices actually landed.
    const outcomes = await importDevices(
      [candidate('a'), candidate('b'), candidate('c')],
      async (device) => {
        if (device.externalId === 'b') throw new Error('boom');
      },
    );
    assert.deepEqual(
      outcomes.map((o) => o.ok),
      [true, false, true],
    );
    assert.equal(outcomes.filter((o) => o.ok).length, 2);
  });

  it('does nothing for an empty selection', async () => {
    let called = 0;
    const outcomes = await importDevices([], async () => {
      called += 1;
    });
    assert.equal(called, 0);
    assert.deepEqual(outcomes, []);
  });
});

describe('surepet buildDeviceFromDiscovery', () => {
  it('matches what the registration form would have submitted', () => {
    // Parity lock for the single -> multi select migration:
    // SurePetRegisterDeviceForm submits provider_account_id, external_id,
    // name (defaulted to the discovered name), type and the discovered config.
    const build = getFlow('surepet').buildDeviceFromDiscovery;
    assert.ok(build, 'surepet should support direct import');

    const account = { id: 7 } as ProviderAccountDTO;
    const device = candidate('99');

    assert.deepEqual(build(account, device), {
      provider_account_id: 7,
      external_id: '99',
      name: 'Device 99',
      type: 'feeder',
      config: { product_id: 4, household_id: 42 },
    });
  });

  it('is absent for flows whose form collects more than a name', () => {
    // esphome asks for a device type and per-type settings, so importing
    // without the form would lose information.
    assert.equal(getFlow('esphome').buildDeviceFromDiscovery, undefined);
  });
});
