import {
  type FastifyPluginAsyncTypebox,
  Type,
} from '@fastify/type-provider-typebox';
import {
  GetDeviceParamsSchema,
  GetDeviceResponseSchema,
  GetDevicesResponseSchema,
  PostDeviceRequestSchema,
  GetProviderAccountsResponseSchema,
  PostProviderAccountRequestSchema,
  GetDiscoveredDevicesResponseSchema,
  ProviderAccountSchema,
  GetProvidersResponseSchema,
} from 'shared';
import { db } from '../database/index.ts';

const deviceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { integrationManager } = fastify;

  // --- Helpers ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapDevice = (device: any) => ({
    ...device,
    enabled: Boolean(device.enabled),
    created_at: new Date(device.created_at).toISOString(),
    updated_at: new Date(device.updated_at).toISOString(),
    last_seen: device.last_seen
      ? new Date(device.last_seen).toISOString()
      : null,
    config:
      typeof device.config === 'string'
        ? JSON.parse(device.config)
        : device.config,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapAccount = (account: any) => ({
    ...account,
    enabled: Boolean(account.enabled),
    internal: Boolean(account.internal),
    created_at: new Date(account.created_at).toISOString(),
    updated_at: new Date(account.updated_at).toISOString(),
    config:
      typeof account.config === 'string'
        ? JSON.parse(account.config)
        : account.config,
  });

  // --- Providers ---

  fastify.get(
    '/providers',
    {
      schema: {
        response: {
          '200': GetProvidersResponseSchema,
        },
      },
    },
    async () => {
      return integrationManager.getProviders();
    },
  );

  // --- Accounts ---

  fastify.get(
    '/accounts',
    {
      schema: {
        response: {
          '200': GetProviderAccountsResponseSchema,
        },
      },
    },
    async () => {
      const accounts = await db
        .selectFrom('provider_account')
        .selectAll()
        .execute();
      return accounts.map(mapAccount);
    },
  );

  fastify.post(
    '/accounts',
    {
      schema: {
        body: PostProviderAccountRequestSchema,
        response: {
          '200': ProviderAccountSchema,
        },
      },
    },
    async (request) => {
      const { provider, name, config } = request.body;

      const result = await db
        .insertInto('provider_account')
        .values({
          provider,
          name,
          config: config as Record<string, unknown>,
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Initialize the account in IntegrationManager
      await integrationManager.initializeAccount(result.id);

      return mapAccount(result);
    },
  );

  fastify.get(
    '/accounts/:id/discover',
    {
      schema: {
        params: Type.Object({ id: Type.Number() }),
        response: {
          '200': GetDiscoveredDevicesResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const manager = integrationManager.getAccountManager(id);
      if (!manager) {
        throw new Error('Account manager not found');
      }

      const devices = await manager.discoverDevices();
      return devices;
    },
  );

  // --- Devices ---

  fastify.get(
    '/',
    {
      schema: {
        response: {
          '200': GetDevicesResponseSchema,
        },
      },
    },
    async () => {
      const devices = await db.selectFrom('device').selectAll().execute();
      return devices.map(mapDevice);
    },
  );

  fastify.post(
    '/',
    {
      schema: {
        body: PostDeviceRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { name, type, provider_account_id, external_id, config } =
        request.body;

      // Validate device config if supported by the provider
      const manager = integrationManager.getAccountManager(provider_account_id);
      if (manager?.validateDeviceConfig) {
        await manager.validateDeviceConfig({ type, config });
      }

      const result = await db
        .insertInto('device')
        .values({
          name,
          type,
          provider_account_id,
          external_id,
          config: config ? JSON.stringify(config) : null,
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapDevice(result);
    },
  );

  fastify.get(
    '/:id',
    {
      schema: {
        params: GetDeviceParamsSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const device = await db
        .selectFrom('device')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!device) throw new Error('Device not found');
      return mapDevice(device);
    },
  );
};

export default deviceRoutes;
