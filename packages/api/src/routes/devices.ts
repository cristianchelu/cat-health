import {
  type FastifyPluginAsyncTypebox,
  Type,
} from '@fastify/type-provider-typebox';
import type { FastifyReply } from 'fastify';
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
  PutDeviceRecognitionRequestSchema,
  PatchDeviceRecognitionRequestSchema,
  PostDeviceTestIdentifyRequestSchema,
  PostDeviceTestIdentifyResponseSchema,
  ReidentifyLitterboxVisitsQuerySchema,
  ReidentifyLitterboxVisitsResponseSchema,
} from 'shared';
import { DEVICE_SIGNAL_KEYS, isRecord } from 'shared';
import type { Device } from '../database/types/DeviceTable.ts';
import type { ProviderAccount } from '../database/types/ProviderAccountTable.ts';
import type {
  DeviceSignal,
  DeviceType,
  GetDeviceResponseDTO,
  ProviderAccountDTO,
} from 'shared';
import { reidentifyLitterboxVisits } from '../services/litterbox/reidentifyLitterboxVisits.ts';
import { getDepositsSinceScoop } from '../services/litterbox/depositsSinceScoop.ts';
import { presenceSignals } from '../services/devices/presenceSignals.ts';
import type { LiveControllerFailure } from '../services/devices/types.ts';
import { isDeviceReachable } from '../services/devices/deviceEnablement.ts';

/** Deposit track length on a device card. */
const DEPOSIT_PIP_SLOTS = 8;

type DeviceWithProvider = Device & {
  provider: string;
  account_enabled: number;
};

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

/**
 * One answer for every route that needs a working controller, so a device the
 * user switched off never reads as a misconfiguration.
 */
function sendControllerFailure(
  reply: FastifyReply,
  deviceId: number,
  reason: LiveControllerFailure,
) {
  if (reason === 'disabled') {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Device ${deviceId} is disabled`,
    });
  }

  return reply.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message:
      reason === 'missing'
        ? `Device ${deviceId} not found`
        : `Device ${deviceId} has no controller available`,
  });
}

const deviceRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db, integrationManager } = fastify;

  // --- Helpers ---

  /**
   * `includeState` is off for the list: `state` is the controller's whole
   * payload, which for ESPHome is its entire entity table. The grid renders
   * `signals`, so shipping state per row would be dead weight on every load.
   */

  async function assertValidDeviceConfig(
    accountId: number,
    type: DeviceType,
    config: unknown,
  ): Promise<void> {
    const manager = integrationManager.getAccountManager(accountId);
    await manager?.validateDeviceConfig?.({ type, config });
  }

  function invalidDeviceConfigReply(reply: FastifyReply, error: unknown) {
    return reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * A stored camera link on the wire, or `null` when the device has none.
   *
   * `config` is nullable in the database but absent-or-object on the wire, so
   * the null has to be dropped here — passing it straight through produced a
   * device that failed its own response schema, which the previously optional
   * `camera_link` hid by not looking.
   */
  const toCameraLink = (row: {
    camera_id: number | null;
    camera_config: unknown;
  }): GetDeviceResponseDTO['camera_link'] => {
    if (!row.camera_id) return null;
    const config =
      typeof row.camera_config === 'string'
        ? JSON.parse(row.camera_config)
        : row.camera_config;
    return { camera_id: row.camera_id, ...(config ? { config } : {}) };
  };

  /**
   * A stored recognition attachment on the wire, or `null` when the device has
   * none. `config` is NOT NULL in the database, so unlike the camera link there
   * is no absent-config case to fold away here.
   */
  const toRecognitionLink = (row: {
    recognition_account_id: number | null;
    recognition_config: unknown;
  }): GetDeviceResponseDTO['recognition'] => {
    if (!row.recognition_account_id) return null;
    const config =
      typeof row.recognition_config === 'string'
        ? JSON.parse(row.recognition_config)
        : row.recognition_config;
    return { account_id: row.recognition_account_id, config };
  };

  const mapDevice = async (
    device: DeviceWithProvider,
    { includeState = true }: { includeState?: boolean } = {},
  ): Promise<GetDeviceResponseDTO> => {
    const mapped: GetDeviceResponseDTO = {
      id: device.id,
      provider_account_id: device.provider_account_id,
      provider: device.provider,
      external_id: device.external_id,
      name: device.name,
      type: device.type,
      config: parseJsonValue(device.config),
      enabled: Boolean(device.enabled),
      account_enabled: Boolean(device.account_enabled),
      /* No link unless a caller joined one and says otherwise. Stated here so
         every route answers the question rather than skipping it. */
      camera_link: null,
      recognition: null,
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

    // A device nobody is dialling has no connectivity story: `status` and
    // `last_seen` keep their last honest reading, but leaving `signals` to
    // `presenceSignals` would dress that stale reading up as an OFFLINE alarm
    // the user raised on themselves.
    if (!isDeviceReachable(device)) {
      mapped.signals = [];
      return mapped;
    }

    const providerSignals: DeviceSignal[] = [];

    try {
      const controller = integrationManager.instantiateDeviceController({
        ...device,
        config: asConfigRecord(mapped.config),
      });
      if (includeState && controller?.getState) {
        mapped.state = controller.getState();
      }
      if (controller?.getSignals) {
        providerSignals.push(...controller.getSignals());
      }
    } catch (error) {
      mapped.status = 'error';
      fastify.log.error(
        { err: error, deviceId: device.id },
        'Failed to load device controller state',
      );
    }

    mapped.signals = [
      ...presenceSignals(
        mapped.status,
        snapshot.lastSeenMs != null ? new Date(snapshot.lastSeenMs) : null,
        Date.now(),
      ),
      ...providerSignals,
    ];

    return mapped;
  };

  /**
   * Resolve reference_images IDs to { id, file_path } for devices that carry a
   * recognition attachment. Mutates `mapped.reference_media` in place.
   */
  async function enrichReferenceMedia(devices: GetDeviceResponseDTO[]) {
    const allIds: number[] = [];
    const watched: Array<{
      mapped: GetDeviceResponseDTO;
      refImages: Record<string, number[]>;
    }> = [];

    for (const mapped of devices) {
      if (mapped.recognition == null) continue;
      const refImages = mapped.recognition.config.reference_images;
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
      watched.push({ mapped, refImages: normalizedRefImages });
    }

    if (allIds.length === 0) return;

    const uniqueIds = [...new Set(allIds)];
    const mediaRows = await db
      .selectFrom('media')
      .select(['id', 'file_path'])
      .where('id', 'in', uniqueIds)
      .execute();

    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

    for (const { mapped, refImages } of watched) {
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

  /**
   * Attach the deposit breakdown to litterbox waste signals.
   *
   * The box weighs its waste but cannot say what produced it, so the pips come
   * from the event log. Devices with no waste sensor still get the signal, with
   * the summed elimination weight standing in for the reading.
   */
  async function enrichLitterboxDeposits(devices: GetDeviceResponseDTO[]) {
    // Runs after `mapDevice`, so it has to ask `isDeviceReachable` again: the
    // signal list it appends to was emptied there for a reason.
    const litterboxes = devices.filter(
      (d) => d.type === 'litterbox' && isDeviceReachable(d),
    );
    if (litterboxes.length === 0) return;

    const deposits = await getDepositsSinceScoop(
      db,
      litterboxes.map((d) => d.id),
    );

    for (const device of litterboxes) {
      const entry = deposits.get(device.id);
      if (!entry) continue;

      /* Overflow past the track is shown as the most recent deposits. What a
       * 10-plus visit box should look like is still an open design question. */
      const pips = entry.pips.slice(-DEPOSIT_PIP_SLOTS);
      const display = {
        kind: 'pips' as const,
        of: DEPOSIT_PIP_SLOTS,
        pips,
      };

      const signals = device.signals ?? [];
      const waste = signals.find(
        (signal) => signal.key === DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
      );

      if (waste) {
        waste.display = display;
      } else {
        signals.push({
          key: DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP,
          label_key: `devices.signals.${DEVICE_SIGNAL_KEYS.WASTE_SINCE_SCOOP}`,
          value: { kind: 'number', value: Math.round(entry.weight), unit: 'g' },
          display,
          icon: 'waste',
          category: 'primary',
        });
        device.signals = signals;
      }
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
        // The camera link travels with the row, as it does on GET /:id. It was
        // missing here only by omission, and the DTO declaring it optional made
        // that look deliberate: a caller reading `camera_link` off a listed
        // device got `undefined` for a device that plainly has one.
        .leftJoin('device_camera', 'device.id', 'device_camera.device_id')
        .leftJoin(
          'device_recognition',
          'device.id',
          'device_recognition.device_id',
        )
        .selectAll('device')
        .select('provider_account.provider as provider')
        .select('provider_account.enabled as account_enabled')
        .select([
          'device_camera.camera_id as camera_id',
          'device_camera.config as camera_config',
          'device_recognition.account_id as recognition_account_id',
          'device_recognition.config as recognition_config',
        ])
        .execute();
      const mapped = await Promise.all(
        devices.map(async (d) => {
          const device = await mapDevice(d, { includeState: false });
          device.camera_link = toCameraLink(d);
          device.recognition = toRecognitionLink(d);
          return device;
        }),
      );
      await Promise.all([
        enrichReferenceMedia(mapped),
        enrichLitterboxDeposits(mapped),
      ]);
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
          '400': Http400ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, type, provider_account_id, external_id, config } =
        request.body;

      const manager = integrationManager.getAccountManager(provider_account_id);
      try {
        await assertValidDeviceConfig(provider_account_id, type, config);
      } catch (error) {
        return invalidDeviceConfigReply(reply, error);
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
        .select(['provider', 'enabled'])
        .where('id', '=', provider_account_id)
        .executeTakeFirstOrThrow();

      const mapped = await mapDevice({
        ...result,
        provider: account.provider,
        account_enabled: account.enabled,
      });

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
        .leftJoin(
          'device_recognition',
          'device.id',
          'device_recognition.device_id',
        )
        .selectAll('device')
        .select('provider_account.provider as provider')
        .select('provider_account.enabled as account_enabled')
        .select([
          'device_camera.camera_id as camera_id',
          'device_camera.config as camera_config',
          'device_recognition.account_id as recognition_account_id',
          'device_recognition.config as recognition_config',
        ])
        .where('device.id', '=', id)
        .executeTakeFirst();
      if (!device) throw new Error('Device not found');
      const mapped = await mapDevice(device);
      mapped.camera_link = toCameraLink(device);
      mapped.recognition = toRecognitionLink(device);
      await Promise.all([
        enrichReferenceMedia([mapped]),
        enrichLitterboxDeposits([mapped]),
      ]);
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
          '400': Http400ResponseSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
        const existing = await db
          .selectFrom('device')
          .select('config')
          .select('type')
          .select('provider_account_id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (!existing) {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Device ${id} not found`,
          });
        }
        const previousConfig = parseJsonValue(existing.config);
        const nextConfig = updates.config;
        if (JSON.stringify(previousConfig) !== JSON.stringify(nextConfig)) {
          try {
            await assertValidDeviceConfig(
              existing.provider_account_id,
              existing.type,
              nextConfig,
            );
          } catch (error) {
            return invalidDeviceConfigReply(reply, error);
          }
        }
        updateData.config = JSON.stringify(nextConfig);
      }

      await db
        .updateTable('device')
        .set(updateData)
        .where('id', '=', id)
        .execute();

      await integrationManager.reconcileDeviceController(id);

      // Fetch updated device
      const device = await db
        .selectFrom('device')
        .innerJoin(
          'provider_account',
          'device.provider_account_id',
          'provider_account.id',
        )
        .leftJoin('device_camera', 'device.id', 'device_camera.device_id')
        .leftJoin(
          'device_recognition',
          'device.id',
          'device_recognition.device_id',
        )
        .selectAll('device')
        .select('provider_account.provider as provider')
        .select('provider_account.enabled as account_enabled')
        .select([
          'device_camera.camera_id as camera_id',
          'device_camera.config as camera_config',
          'device_recognition.account_id as recognition_account_id',
          'device_recognition.config as recognition_config',
        ])
        .where('device.id', '=', id)
        .executeTakeFirst();

      if (!device) throw new Error('Device not found');

      const mapped = await mapDevice(device);
      mapped.camera_link = toCameraLink(device);
      mapped.recognition = toRecognitionLink(device);

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
          '400': Http400ResponseSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id: deviceId } = request.params;
      const { media_id } = request.body;

      const outcome = await fastify.recognitionService.testIdentify(
        deviceId,
        media_id,
      );

      if (!outcome.ok) {
        if (outcome.reason === 'no_recognition') {
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Device ${deviceId} has no recognition configured`,
          });
        }
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Device ${deviceId} recognition is disabled: its provider account is switched off`,
        });
      }

      return outcome.result;
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

      const resolved = await integrationManager.resolveLiveController(id);
      if (!resolved.ok) {
        return sendControllerFailure(reply, id, resolved.reason);
      }
      const { controller } = resolved;

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
        reply.header('Cache-Control', 'no-store');
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

  // --- Device Recognition Attachment ---

  fastify.put(
    '/:id/recognition',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PutDeviceRecognitionRequestSchema,
        response: {
          '200': GetDeviceResponseSchema,
          '400': Http400ResponseSchema,
          '404': Http404ResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { account_id, config } = request.body;

      const device = await db
        .selectFrom('device')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!device) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Device ${id} not found`,
        });
      }

      const account = await db
        .selectFrom('provider_account')
        .select(['id', 'provider'])
        .where('id', '=', account_id)
        .executeTakeFirst();
      if (!account) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Provider account ${account_id} not found`,
        });
      }

      /* On the capability, never the provider name (AGENTS.md): a second
         provider that can answer a vision prompt should work here without this
         route learning its name. */
      const provider = integrationManager
        .getProviders()
        .find((p) => p.name === account.provider);
      if (!provider?.capabilities.supports_recognition) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: `Provider ${account.provider} does not support recognition`,
        });
      }

      await db.transaction().execute(async (trx) => {
        await trx
          .deleteFrom('device_recognition')
          .where('device_id', '=', id)
          .execute();

        await trx
          .insertInto('device_recognition')
          .values({ device_id: id, account_id, config })
          .execute();
      });

      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );

  fastify.patch(
    '/:id/recognition',
    {
      schema: {
        params: GetDeviceParamsSchema,
        body: PatchDeviceRecognitionRequestSchema,
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
        .selectFrom('device_recognition')
        .select('device_id')
        .where('device_id', '=', id)
        .executeTakeFirst();
      if (!existing) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Recognition link not found',
        });
      }

      await db
        .updateTable('device_recognition')
        .set({ config })
        .where('device_id', '=', id)
        .execute();

      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );

  fastify.delete(
    '/:id/recognition',
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
        .deleteFrom('device_recognition')
        .where('device_id', '=', id)
        .execute();
      return fastify
        .inject({ method: 'GET', url: `/api/devices/${id}` })
        .then((r) => JSON.parse(r.payload));
    },
  );
};

export default deviceRoutes;
