import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  ProductId,
  type ProviderRemotePet,
  type SurePetAccountConfig,
} from 'shared';
import type {
  AccountManager,
  DeviceController,
  DiscoveredDevice,
  ProviderDeps,
  Device,
  ProviderAccount,
} from '../../types.ts';
import type { FoodIntakeEventData } from '../../../../database/types/EventTable.ts';
import { SurePetClient, SurePetClientError } from './SurePetClient.ts';
import { FeederController } from './FeederController.ts';
import {
  SUREPET_DEVICE_STATE_POLL_INTERVAL_MS,
  SUREPET_TIMELINE_POLL_INTERVAL_MS,
} from './constants.ts';
import {
  extractFeedingDatapointsFromHouseholdReport,
  extractFeedingDatapointsFromTimeline,
  refreshPetLinkTagIds,
} from './extractFeedingEvents.ts';
import {
  mapFeedingDatapointToEvent,
  parseSurePetFeederConfig,
} from './mapFeedingEvent.ts';
import type { NormalizedFeedingDatapoint } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAccountConfig(config: unknown): SurePetAccountConfig {
  if (!isRecord(config)) {
    throw new Error('SurePet account config must be an object');
  }

  const email = config.email;
  const password = config.password;
  const deviceId = config.device_id;

  if (typeof email !== 'string' || !email) {
    throw new Error('SurePet account config requires email');
  }
  if (typeof password !== 'string' || !password) {
    throw new Error('SurePet account config requires password');
  }

  const parsed = {
    ...(config as unknown as SurePetAccountConfig),
    email,
    password,
    device_id:
      typeof deviceId === 'string' && deviceId.length > 0
        ? deviceId
        : randomUUID(),
  };

  return parsed;
}

export class SurePetAccountManager implements AccountManager {
  readonly accountId: number;
  private account: ProviderAccount;
  private deps: ProviderDeps;
  private config: SurePetAccountConfig;
  private client: SurePetClient | null = null;
  private controllers = new Map<number, FeederController>();
  private timelinePollTimer: ReturnType<typeof setInterval> | null = null;
  private statePollTimer: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;

  constructor(account: ProviderAccount, deps: ProviderDeps) {
    this.account = account;
    this.deps = deps;
    this.accountId = account.id;
    this.config = parseAccountConfig(account.config);
  }

  async initialize(): Promise<void> {
    await this.ensureClient();

    const devices = await this.deps.db
      .selectFrom('device')
      .selectAll()
      .where('provider_account_id', '=', this.accountId)
      .where('type', '=', 'feeder')
      .where('enabled', '=', 1)
      .execute();

    for (const device of devices) {
      try {
        const controller = this.instantiateDeviceController(device);
        await controller.connect();
        this.deps.logger.log(`Initialized SurePet feeder: ${device.name}`);
      } catch (error) {
        this.deps.logger.error(
          `Failed to initialize SurePet feeder ${device.name}:`,
          error,
        );
      }
    }

    await this.refreshFeederStates();
    await this.runFeedingSync().catch((error) => {
      this.deps.logger.error('SurePet initial feeding sync failed:', error);
    });

    this.timelinePollTimer = setInterval(() => {
      void this.runFeedingSync().catch((error) => {
        this.deps.logger.error('SurePet timeline sync failed:', error);
      });
    }, SUREPET_TIMELINE_POLL_INTERVAL_MS);

    this.statePollTimer = setInterval(() => {
      void this.refreshFeederStates().catch((error) => {
        this.deps.logger.error('SurePet feeder state refresh failed:', error);
      });
    }, SUREPET_DEVICE_STATE_POLL_INTERVAL_MS);
  }

  async shutdown(): Promise<void> {
    if (this.timelinePollTimer) {
      clearInterval(this.timelinePollTimer);
      this.timelinePollTimer = null;
    }
    if (this.statePollTimer) {
      clearInterval(this.statePollTimer);
      this.statePollTimer = null;
    }

    for (const controller of this.controllers.values()) {
      await controller.disconnect();
    }
    this.controllers.clear();
    this.client = null;
  }

  async invalidateDeviceController(deviceId: number): Promise<void> {
    const controller = this.controllers.get(deviceId);
    if (controller) {
      await controller.disconnect();
      this.controllers.delete(deviceId);
    }
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    const client = await this.ensureClient();
    const householdId = this.config.household_id;
    const devices = await client.getDevices(householdId ?? undefined);

    return devices
      .filter((device) => device.product_id === ProductId.FEEDER_CONNECT)
      .map((device) => {
        const household =
          device.household_id ?? householdId ?? this.config.household_id;
        const label =
          device.name?.trim() ||
          (device.serial_number
            ? `SureFeed Connect (${device.serial_number})`
            : `SureFeed Connect (${device.id})`);

        return {
          externalId: String(device.id),
          name: label,
          type: 'feeder' as const,
          config: {
            product_id: ProductId.FEEDER_CONNECT,
            household_id: household,
            ...(device.serial_number
              ? { serial_number: device.serial_number }
              : {}),
          },
        };
      });
  }

  async listRemotePets(): Promise<ProviderRemotePet[]> {
    const client = await this.ensureClient();
    const pets = await client.getPets(this.config.household_id ?? undefined);
    return pets.map((pet) => {
      const tagId = pet.tag_id ?? pet.tag?.id ?? null;
      return {
        external_id: String(pet.id),
        name: pet.name ?? null,
        ...(tagId != null ? { metadata: { tag_id: tagId } } : {}),
      };
    });
  }

  async onDeviceRegistered(device: Device): Promise<void> {
    if (device.type !== 'feeder') return;
    const controller = this.instantiateDeviceController(device);
    await controller.connect();
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) return existing;

    if (device.type !== 'feeder') {
      throw new Error(
        `Unsupported device type for SurePet provider: ${device.type}`,
      );
    }

    const controller = new FeederController(device, this.deps);
    this.controllers.set(device.id, controller);
    return controller;
  }

  async validateDeviceConfig(device: {
    type: string;
    config: unknown;
  }): Promise<void> {
    if (device.type !== 'feeder') {
      throw new Error('SurePet provider only supports feeder devices');
    }

    const config = parseSurePetFeederConfig(device.config);
    if (config.product_id !== ProductId.FEEDER_CONNECT) {
      throw new Error(
        `Unsupported SurePet product_id ${config.product_id}; expected ${ProductId.FEEDER_CONNECT}`,
      );
    }
  }

  private async ensureClient(): Promise<SurePetClient> {
    if (!this.config.device_id) {
      this.config.device_id = randomUUID();
      await this.persistAccountConfig();
    }

    if (!this.client) {
      this.client = new SurePetClient({
        email: this.config.email,
        password: this.config.password,
        deviceId: this.config.device_id,
        token: this.config.token,
      });
    }

    const token = await this.client.login();
    if (token !== this.config.token) {
      this.config.token = token;
      await this.persistAccountConfig();
    }

    if (this.config.household_id == null) {
      const bootstrap = await this.client.meStart();
      const householdId =
        bootstrap.households?.[0]?.id ??
        bootstrap.devices?.find((d) => d.household_id != null)?.household_id ??
        bootstrap.pets?.find((p) => p.household_id != null)?.household_id;

      if (householdId == null) {
        throw new Error('Could not determine SurePet household_id from me/start');
      }

      this.config.household_id = householdId;
      await this.persistAccountConfig();
    }

    if (this.config.pet_links?.length) {
      const pets = await this.client.getPets(this.config.household_id);
      const refreshedLinks = refreshPetLinkTagIds(this.config.pet_links, pets);
      if (JSON.stringify(refreshedLinks) !== JSON.stringify(this.config.pet_links)) {
        this.config.pet_links = refreshedLinks;
        await this.persistAccountConfig();
      }
    }

    return this.client;
  }

  private async refreshFeederStates(): Promise<void> {
    const client = await this.ensureClient();

    for (const controller of this.controllers.values()) {
      try {
        const surepetDeviceId = controller.getSurePetDeviceId();
        const payload = await client.getDevice(surepetDeviceId);
        controller.updateFromCloudPayload(payload);
      } catch (error) {
        this.deps.logger.error(
          `Failed to refresh SurePet feeder state for device ${controller.deviceId}:`,
          error,
        );
      }
    }
  }

  private async runFeedingSync(): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const client = await this.ensureClient();
      const householdId = this.config.household_id;
      if (householdId == null) return;

      const sinceId = this.config.sync?.last_timeline_since_id;
      const isFirstSync = sinceId == null;
      const datapoints: NormalizedFeedingDatapoint[] = [];
      let maxTimelineEntryId: number | null = null;

      if (isFirstSync) {
        try {
          const report = await client.getHouseholdReport(householdId);
          datapoints.push(
            ...extractFeedingDatapointsFromHouseholdReport(report),
          );
        } catch (error) {
          if (error instanceof SurePetClientError && error.status === 404) {
            this.deps.logger.log(
              `SurePet household report not available for household ${householdId}; skipping backfill`,
            );
          } else {
            this.deps.logger.error(
              'SurePet household report backfill failed:',
              error,
            );
          }
        }
      }

      try {
        const timeline = await client.getTimeline(householdId, {
          sinceId: isFirstSync ? undefined : sinceId,
        });
        const extracted = extractFeedingDatapointsFromTimeline(timeline);
        datapoints.push(...extracted.datapoints);
        maxTimelineEntryId = extracted.maxEntryId;
      } catch (error) {
        this.deps.logger.error('SurePet timeline fetch failed:', error);
        return;
      }

      const localDeviceMap = await this.buildLocalDeviceMap();

      for (const datapoint of datapoints) {
        const localDeviceId =
          datapoint.device_id != null
            ? localDeviceMap.get(datapoint.device_id)
            : undefined;

        if (localDeviceId == null) continue;

        const controller = this.controllers.get(localDeviceId);
        await this.ingestFeedingDatapoint(
          datapoint,
          localDeviceId,
          controller?.getDeviceControl(),
        );
      }

      if (isFirstSync) {
        const nextSinceId = maxTimelineEntryId ?? 0;
        this.config.sync = {
          ...this.config.sync,
          last_timeline_since_id: nextSinceId,
        };
        await this.persistAccountConfig();
      } else if (maxTimelineEntryId != null) {
        const currentSinceId = this.config.sync?.last_timeline_since_id ?? 0;
        const nextSinceId = Math.max(currentSinceId, maxTimelineEntryId);
        if (nextSinceId !== this.config.sync?.last_timeline_since_id) {
          this.config.sync = {
            ...this.config.sync,
            last_timeline_since_id: nextSinceId,
          };
          await this.persistAccountConfig();
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  private async buildLocalDeviceMap(): Promise<Map<number, number>> {
    const devices = await this.deps.db
      .selectFrom('device')
      .select(['id', 'external_id'])
      .where('provider_account_id', '=', this.accountId)
      .where('type', '=', 'feeder')
      .where('enabled', '=', 1)
      .execute();

    const map = new Map<number, number>();
    for (const device of devices) {
      const surepetId = Number.parseInt(device.external_id, 10);
      if (Number.isFinite(surepetId)) {
        map.set(surepetId, device.id);
      }
    }
    return map;
  }

  private async ingestFeedingDatapoint(
    datapoint: NormalizedFeedingDatapoint,
    localDeviceId: number,
    deviceControl?: unknown,
  ): Promise<void> {
    const event = mapFeedingDatapointToEvent({
      datapoint,
      localDeviceId,
      accountConfig: this.config,
      deviceControl,
    });

    const externalKey =
      event.data.provider_data?.provider === 'surepet'
        ? event.data.provider_data.external_key
        : undefined;
    if (!externalKey) return;

    const existing = await this.deps.db
      .selectFrom('event')
      .select('id')
      .where('device_id', '=', localDeviceId)
      .where(
        sql<string>`json_extract(data, '$.provider_data.external_key')`,
        '=',
        externalKey,
      )
      .where(
        sql<string>`json_extract(data, '$.provider_data.provider')`,
        '=',
        'surepet',
      )
      .executeTakeFirst();

    if (existing) return;

    const result = await this.deps.db
      .insertInto('event')
      .values(event)
      .returning('id')
      .executeTakeFirst();

    if (!result) return;

    const eventData = event.data as FoodIntakeEventData;
    this.deps.eventBus.publish('device.event', {
      deviceId: localDeviceId,
      type: 'food_intake',
      data: eventData,
      timestamp: event.timestamp,
      eventId: result.id,
    });
  }

  private async persistAccountConfig(): Promise<void> {
    await this.deps.db
      .updateTable('provider_account')
      .set({
        config: this.config as Record<string, unknown>,
        updated_at: Date.now(),
      })
      .where('id', '=', this.accountId)
      .execute();

    this.account = {
      ...this.account,
      config: this.config as unknown as Record<string, unknown>,
    };
  }
}
