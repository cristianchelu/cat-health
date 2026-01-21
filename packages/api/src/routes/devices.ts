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
  PutDeviceCameraRequestSchema,
  PatchDeviceCameraRequestSchema,
} from 'shared';
import { db } from '../database/index.ts';

const deviceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { integrationManager } = fastify;

  // --- Helpers ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapDevice = (device: any) => {
    const mapped = {
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
    };

    try {
      const controller = integrationManager.instantiateDeviceController({
        ...device,
        config: mapped.config,
      });
      if (controller) {
        mapped.status = controller.getStatus();
        if (controller.getState) {
          mapped.state = controller.getState();
        }
      }
    } catch {
      // Ignore errors when fetching controller state
    }

    return mapped;
  };

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
      const devices = await db
        .selectFrom('device')
        .innerJoin(
          'provider_account',
          'device.provider_account_id',
          'provider_account.id',
        )
        .selectAll('device')
        .select('provider_account.provider as provider')
        .execute();
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
          config: config ? (config as Record<string, unknown>) : null,
          enabled: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const account = await db
        .selectFrom('provider_account')
        .select('provider')
        .where('id', '=', provider_account_id)
        .executeTakeFirstOrThrow();

      return mapDevice({ ...result, provider: account.provider });
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
        .innerJoin(
          'provider_account',
          'device.provider_account_id',
          'provider_account.id',
        )
        .leftJoin('device_camera', 'device.id', 'device_camera.device_id')
        .selectAll('device')
        .select('provider_account.provider as provider')
        .select([
          'device_camera.camera_id as camera_id',
          'device_camera.config as camera_config',
        ])
        .where('device.id', '=', id)
        .executeTakeFirst();
      if (!device) throw new Error('Device not found');
      const mapped = mapDevice(device);
      if (device.camera_id) {
        mapped.camera_link = {
          camera_id: device.camera_id,
          config:
            typeof device.camera_config === 'string'
              ? JSON.parse(device.camera_config)
              : device.camera_config,
        };
      }
      return mapped;
    },
  );

  fastify.get(
    '/:id/snapshot',
    {
      schema: {
        params: GetDeviceParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const controller = await integrationManager.instantiateController(id);

      if (!controller) {
        throw new Error('Device controller not found');
      }

      // Check if it's a camera with getSnapshotBuffer
      if (
        'getSnapshotBuffer' in controller &&
        typeof controller.getSnapshotBuffer === 'function'
      ) {
        const buffer = await controller.getSnapshotBuffer();
        if (!buffer) {
          throw new Error('Failed to capture snapshot');
        }

        reply.header('Content-Type', 'image/jpeg');
        return buffer;
      }

      throw new Error('Device does not support snapshots');
    },
  );

  // --- Device Camera Link ---
  fastify.put(
    '/:id/camera',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PutDeviceCameraRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { camera_id, config } = request.body;

      // ensure device exists
      const device = await db
        .selectFrom('device')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!device) throw new Error('Device not found');

      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom('device_camera')
          .where('device_id', '=', id)
          .execute();

        await trx
          .insertInto('device_camera')
          .values({
            device_id: id,
            camera_id,
            config: config ? (config as Record<string, unknown>) : null,
          })
          .execute();
      });

      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );

  fastify.patch(
    '/:id/camera',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PatchDeviceCameraRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { config } = request.body;

      const existing = await db
        .selectFrom('device_camera')
        .selectAll()
        .where('device_id', '=', id)
        .executeTakeFirst();
      if (!existing) throw new Error('Camera link not found');

      await db
        .updateTable('device_camera')
        .set({ config: config ? (config as Record<string, unknown>) : null })
        .where('device_id', '=', id)
        .execute();

      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );

  fastify.delete(
    '/:id/camera',
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
      await db
        .deleteFrom('device_camera')
        .where('device_id', '=', id)
        .execute();
      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );
};

export default deviceRoutes;
