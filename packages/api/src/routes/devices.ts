import {
  type FastifyPluginAsyncTypebox,
  Type,
} from '@fastify/type-provider-typebox';
import {
  GetDeviceParamsSchema,
  GetDeviceResponseSchema,
  GetDevicesResponseSchema,
  PostDeviceRequestSchema,
  PatchDeviceRequestSchema,
  GetProviderAccountsResponseSchema,
  PostProviderAccountRequestSchema,
  PatchProviderAccountRequestSchema,
  GetProviderAccountParamsSchema,
  GetDiscoveredDevicesResponseSchema,
  GetProviderRemotePetsResponseSchema,
  ProviderAccountSchema,
  GetProvidersResponseSchema,
  PutDeviceCameraRequestSchema,
  PatchDeviceCameraRequestSchema,
  PostDeviceTestIdentifyRequestSchema,
  PostDeviceTestIdentifyResponseSchema,
  ReidentifyLitterboxVisitsQuerySchema,
  ReidentifyLitterboxVisitsResponseSchema,
} from 'shared';
import { db } from '../database/index.ts';
import { reidentifyLitterboxVisits } from '../services/litterbox/reidentifyLitterboxVisits.ts';

const deviceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { integrationManager } = fastify;

  // --- Helpers ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapDevice = async (device: any) => {
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

    const snapshot = await integrationManager
      .getPresence()
      .getSnapshot(device.id);
    mapped.status = snapshot.status;
    mapped.last_seen =
      snapshot.lastSeenMs != null
        ? new Date(snapshot.lastSeenMs).toISOString()
        : null;

    try {
      const controller = integrationManager.instantiateDeviceController({
        ...device,
        config: mapped.config,
      });
      if (controller?.getState) {
        mapped.state = controller.getState();
      }
    } catch {
      // Ignore errors when fetching controller state
    }

    return mapped;
  };

  /**
   * Resolve reference_images IDs to { id, file_path } for pet_recognizer
   * devices. Mutates `mapped.reference_media` in place.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function enrichReferenceMedia(devices: any[]) {
    const allIds: number[] = [];
    const petRecognizers: Array<{ mapped: Record<string, unknown>; refImages: Record<string, number[]> }> = [];

    for (const mapped of devices) {
      if (mapped.type !== 'pet_recognizer') continue;
      const refImages = (mapped.config as Record<string, unknown>)?.reference_images as Record<string, number[]> | undefined;
      if (!refImages) continue;

      const ids = Object.values(refImages).flat();
      if (ids.length === 0) continue;

      allIds.push(...ids);
      petRecognizers.push({ mapped, refImages });
    }

    if (allIds.length === 0) return;

    const uniqueIds = [...new Set(allIds)];
    const mediaRows = await db
      .selectFrom('media')
      .select(['id', 'file_path'])
      .where('id', 'in', uniqueIds)
      .execute();

    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

    for (const { mapped, refImages } of petRecognizers) {
      const referenceMedia: Record<string, Array<{ id: number; file_path: string }>> = {};
      for (const [petId, ids] of Object.entries(refImages)) {
        const resolved = ids
          .map((id) => mediaById.get(id))
          .filter((m): m is { id: number; file_path: string } => m !== undefined);
        if (resolved.length > 0) {
          referenceMedia[petId] = resolved;
        }
      }
      mapped.reference_media = referenceMedia;
    }
  }

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
    '/accounts/:id',
    {
      schema: {
        params: GetProviderAccountParamsSchema,
        response: {
          '200': ProviderAccountSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const account = await db
        .selectFrom('provider_account')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!account) {
        throw new Error('Account not found');
      }
      return mapAccount(account);
    },
  );

  fastify.patch(
    '/accounts/:id',
    {
      schema: {
        params: GetProviderAccountParamsSchema,
        body: PatchProviderAccountRequestSchema,
        response: {
          '200': ProviderAccountSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const updates = request.body;
      const updateData: Record<string, unknown> = {
        updated_at: Math.floor(Date.now() / 1000),
      };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.config !== undefined) updateData.config = JSON.stringify(updates.config);
      if (updates.enabled !== undefined) updateData.enabled = updates.enabled ? 1 : 0;
      const result = await db
        .updateTable('provider_account')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (!result) {
        throw new Error('Account not found');
      }
      await integrationManager.initializeAccount(id);
      return mapAccount(result);
    },
  );

  fastify.get(
    '/accounts/:id/remote-pets',
    {
      schema: {
        params: GetProviderAccountParamsSchema,
        response: {
          '200': GetProviderRemotePetsResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const account = await db
        .selectFrom('provider_account')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!account) {
        throw new Error('Account not found');
      }

      const manager = integrationManager.getAccountManager(id);
      if (!manager?.listRemotePets) {
        throw new Error('Remote pet listing is not supported for this account');
      }

      return await manager.listRemotePets();
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
      const mapped = await Promise.all(devices.map((d) => mapDevice(d)));
      await enrichReferenceMedia(mapped);
      return mapped;
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

      const mapped = await mapDevice({ ...result, provider: account.provider });

      if (manager?.onDeviceRegistered) {
        await manager.onDeviceRegistered({
          ...result,
          config: mapped.config,
        });
      }

      return mapped;
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
      const mapped = await mapDevice(device);
      if (device.camera_id) {
        mapped.camera_link = {
          camera_id: device.camera_id,
          config:
            typeof device.camera_config === 'string'
              ? JSON.parse(device.camera_config)
              : device.camera_config,
        };
      }
      await enrichReferenceMedia([mapped]);
      return mapped;
    },
  );

  fastify.post(
    '/:id/litterbox-visits/reidentify',
    {
      schema: {
        params: GetDeviceParamsSchema,
        querystring: ReidentifyLitterboxVisitsQuerySchema,
        response: {
          '200': ReidentifyLitterboxVisitsResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const { after } = request.query;

      const device = await db
        .selectFrom('device')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!device) {
        throw new Error('Device not found');
      }

      const afterDate = after ? new Date(after) : new Date(0);
      return reidentifyLitterboxVisits(db, id, afterDate);
    },
  );

  fastify.patch(
    '/:id',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PatchDeviceRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params;
      const updates = request.body;

      // Build update query
      const updateData: Record<string, unknown> = {
        updated_at: Math.floor(Date.now() / 1000),
      };

      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }
      if (updates.enabled !== undefined) {
        updateData.enabled = updates.enabled ? 1 : 0;
      }
      if (updates.config !== undefined) {
        updateData.config = JSON.stringify(updates.config);
      }

      await db
        .updateTable('device')
        .set(updateData)
        .where('id', '=', id)
        .execute();

      await integrationManager.invalidateDeviceController(id);

      // Fetch updated device
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

      const mapped = await mapDevice(device);
      if (device.camera_id) {
        mapped.camera_link = {
          camera_id: device.camera_id,
          config:
            typeof device.camera_config === 'string'
              ? JSON.parse(device.camera_config)
              : device.camera_config,
        };
      }

      await enrichReferenceMedia([mapped]);
      return mapped;
    },
  );

  fastify.post(
    '/:id/test-identify',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PostDeviceTestIdentifyRequestSchema,
        response: {
          '200': PostDeviceTestIdentifyResponseSchema,
        },
      },
    },
    async (request) => {
      const { id: deviceId } = request.params;
      const { media_id } = request.body;

      const controller = integrationManager.instantiateDeviceController(
        await db
          .selectFrom('device')
          .selectAll()
          .where('id', '=', deviceId)
          .executeTakeFirstOrThrow(),
      );

      if (!controller || !('identifyPetFromMedia' in controller) || typeof controller.identifyPetFromMedia !== 'function') {
        throw new Error('Device is not a pet recognizer');
      }

      const result = await controller.identifyPetFromMedia(media_id);
      return result;
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
