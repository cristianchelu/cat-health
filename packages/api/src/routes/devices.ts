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
import { isRecord } from 'shared';
import type { Device } from '../database/types/DeviceTable.ts';
import type { ProviderAccount } from '../database/types/ProviderAccountTable.ts';
import type { GetDeviceResponseDTO, ProviderAccountDTO } from 'shared';
import { reidentifyLitterboxVisits } from '../services/litterbox/reidentifyLitterboxVisits.ts';

type DeviceWithProvider = Device & { provider: string };

function asConfigRecord(config: unknown): Record<string, unknown> | null {
  if (config == null) return null;
  return isRecord(config) ? config : null;
}

function parseJsonValue(
  config: Device['config'] | ProviderAccount['config'],
): unknown {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config) as unknown;
    } catch {
      return null;
    }
  }
  return config;
}

const Http404ResponseSchema = Type.Object({
  statusCode: Type.Literal(404),
  error: Type.Literal('Not Found'),
  message: Type.String(),
});

const Http400ResponseSchema = Type.Object({
  statusCode: Type.Literal(400),
  error: Type.Literal('Bad Request'),
  message: Type.String(),
});

const deviceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db, integrationManager } = fastify;

  // --- Helpers ---

  const mapDevice = async (
    device: DeviceWithProvider,
  ): Promise<GetDeviceResponseDTO> => {
    const mapped: GetDeviceResponseDTO = {
      id: device.id,
      provider_account_id: device.provider_account_id,
      provider: device.provider,
      external_id: device.external_id,
      name: device.name,
      type: device.type,
      config: parseJsonValue(device.config) ?? null,
      enabled: Boolean(device.enabled),
      created_at: new Date(device.created_at).toISOString(),
      updated_at: new Date(device.updated_at).toISOString(),
      last_seen: device.last_seen
        ? new Date(device.last_seen).toISOString()
        : null,
      status: device.status,
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
        config: asConfigRecord(mapped.config),
      });
      if (controller?.getState) {
        mapped.state = controller.getState();
      }
    } catch (error) {
      mapped.status = 'error';
      fastify.log.error(
        { err: error, deviceId: device.id },
        'Failed to load device controller state',
      );
    }

    return mapped;
  };

  /**
   * Resolve reference_images IDs to { id, file_path } for pet_recognizer
   * devices. Mutates `mapped.reference_media` in place.
   */
  async function enrichReferenceMedia(devices: GetDeviceResponseDTO[]) {
    const allIds: number[] = [];
    const petRecognizers: Array<{
      mapped: GetDeviceResponseDTO;
      refImages: Record<string, number[]>;
    }> = [];

    for (const mapped of devices) {
      if (mapped.type !== 'pet_recognizer') continue;
      const config = mapped.config;
      const refImages = isRecord(config) ? config.reference_images : undefined;
      if (!isRecord(refImages)) continue;

      const ids = Object.values(refImages).flatMap((value) =>
        Array.isArray(value)
          ? value.filter(
              (id): id is number =>
                typeof id === 'number' && Number.isFinite(id),
            )
          : [],
      );
      if (ids.length === 0) continue;

      allIds.push(...ids);
      const normalizedRefImages: Record<string, number[]> = {};
      for (const [petId, value] of Object.entries(refImages)) {
        if (!Array.isArray(value)) continue;
        const mediaIds = value.filter(
          (id): id is number => typeof id === 'number' && Number.isFinite(id),
        );
        if (mediaIds.length > 0) {
          normalizedRefImages[petId] = mediaIds;
        }
      }
      petRecognizers.push({ mapped, refImages: normalizedRefImages });
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
      const referenceMedia: Record<
        string,
        Array<{ id: number; file_path: string }>
      > = {};
      for (const [petId, ids] of Object.entries(refImages)) {
        const resolved = ids
          .map((id) => mediaById.get(id))
          .filter(
            (m): m is { id: number; file_path: string } => m !== undefined,
          );
        if (resolved.length > 0) {
          referenceMedia[petId] = resolved;
        }
      }
      mapped.reference_media = referenceMedia;
    }
  }

  const mapAccount = (account: ProviderAccount): ProviderAccountDTO => ({
    id: account.id,
    provider: account.provider,
    name: account.name,
    enabled: Boolean(account.enabled),
    internal: Boolean(account.internal),
    created_at: new Date(account.created_at).toISOString(),
    updated_at: new Date(account.updated_at).toISOString(),
    config: parseJsonValue(account.config),
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
          '400': Http400ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { provider, name, config } = request.body;

      if (!integrationManager.validateAccountConfig(provider, config)) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Invalid configuration for provider "${provider}"`,
        });
      }

      const result = await db
        .insertInto('provider_account')
        .values({
          provider,
          name,
          config,
          runtime_state: {},
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
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const account = await db
        .selectFrom('provider_account')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!account) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Account ${id} not found`,
        });
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
          '400': Http400ResponseSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;

      const existing = await db
        .selectFrom('provider_account')
        .select(['provider', 'config', 'runtime_state'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Account ${id} not found`,
        });
      }

      const updateData: Record<string, unknown> = {
        updated_at: Date.now(),
      };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.enabled !== undefined)
        updateData.enabled = updates.enabled ? 1 : 0;

      if (updates.config !== undefined) {
        if (
          !integrationManager.validateAccountConfig(
            existing.provider,
            updates.config,
          )
        ) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: `Invalid configuration for provider "${existing.provider}"`,
          });
        }

        // Some config keys select which remote account is being talked to;
        // changing them would orphan the devices already registered here.
        const rejection = await integrationManager.validateAccountConfigChange(
          id,
          existing.provider,
          {
            previousConfig: parseJsonValue(existing.config),
            nextConfig: updates.config,
          },
        );
        if (rejection) {
          return reply.code(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: rejection,
          });
        }

        updateData.config = updates.config;
        // Config is user-owned and replaced wholesale; runtime state derived
        // from it may no longer apply, so let the provider decide what survives.
        updateData.runtime_state = integrationManager.reconcileRuntimeState(
          existing.provider,
          {
            previousConfig: parseJsonValue(existing.config),
            nextConfig: updates.config,
            runtimeState: parseJsonValue(existing.runtime_state),
          },
        );
      }

      const result = await db
        .updateTable('provider_account')
        .set(updateData)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      if (!result) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Account ${id} not found`,
        });
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
          config: config ?? null,
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
          config: asConfigRecord(mapped.config),
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

      // Build update query. Milliseconds: that is what `created_at` holds and
      // what `mapDevice` reads back via `new Date(device.updated_at)`.
      const updateData: Record<string, unknown> = {
        updated_at: Date.now(),
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

      if (
        !controller ||
        !('identifyPetFromMedia' in controller) ||
        typeof controller.identifyPetFromMedia !== 'function'
      ) {
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
            config: config ?? null,
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
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { config } = request.body;

      const existing = await db
        .selectFrom('device_camera')
        .selectAll()
        .where('device_id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Camera link not found',
        });
      }

      await db
        .updateTable('device_camera')
        .set({ config: config ?? null })
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
