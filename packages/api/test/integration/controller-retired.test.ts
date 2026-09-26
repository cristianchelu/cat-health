import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createStubAccountManager } from '../helpers/accountManagerDoubles.ts';
import { insertDevice, insertProviderAccount } from '../helpers/fixtures.ts';
import { createTestIntegrationManager } from '../helpers/integrationManager.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

describe('IntegrationManager.onControllerRetired', () => {
  let ctx: TestDbContext;
  let accountId: number;
  let deviceIds: number[];

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'inert',
      name: 'Bench',
    });
    accountId = account.id;
    const devices = await Promise.all(
      ['a', 'b'].map((suffix) =>
        insertDevice(ctx.db, {
          provider_account_id: account.id,
          name: `Feeder ${suffix}`,
          type: 'feeder',
          external_id: `retired-${suffix}`,
        }),
      ),
    );
    deviceIds = devices.map((device) => device.id);
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  function createManager() {
    const inert = (account: { id: number }) =>
      createStubAccountManager({ accountId: account.id });
    return createTestIntegrationManager(ctx.db, {
      inertProviders: new Map([['inert', inert]]),
    });
  }

  it('reports the one device whose controller was invalidated', async () => {
    const manager = createManager();
    const retired: number[] = [];
    manager.onControllerRetired((id) => retired.push(id));

    await manager.invalidateDeviceController(deviceIds[0]!);

    assert.deepEqual(retired, [deviceIds[0]]);
  });

  it('reports every device of an account that is reinitialized', async () => {
    const manager = createManager();
    const retired: number[] = [];
    manager.onControllerRetired((id) => retired.push(id));

    await manager.initializeAccount(accountId);

    assert.deepEqual(retired.sort(), [...deviceIds].sort());
  });

  it('stops reporting once unsubscribed', async () => {
    const manager = createManager();
    const retired: number[] = [];
    const unsubscribe = manager.onControllerRetired((id) => retired.push(id));
    unsubscribe();

    await manager.invalidateDeviceController(deviceIds[0]!);

    assert.deepEqual(retired, []);
  });
});
