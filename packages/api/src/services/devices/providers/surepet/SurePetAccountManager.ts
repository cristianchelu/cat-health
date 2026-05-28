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
import {
  buildMoistureChildEventValues,
  enrichFoodIntakeEventData,
  resolveFoodIdForCompartment,
} from '../../../food/enrichFoodIntake.ts';
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
  resolveLocalPetIdFromProviderData,
} from './extractFeedingEvents.ts';
import { resolveSurePetFoodCompartmentId } from './foodCompartments.ts';
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
    await this.reloadPetLinksFromDb().catch((error) => {
      this.deps.logger.error('SurePet pet_links reload failed:', error);
    });
    await this.backfillSurePetFeedingEventPetIds().catch((error) => {
      this.deps.logger.error('SurePet feeding pet_id backfill failed:', error);
    });
    await this.runFeedingSync().catch((error) => {
      this.deps.logger.error('SurePet initial feeding sync failed:', error);
    });
    await this.backfillFeedingTimelineIfNeeded().catch((error) => {
      this.deps.logger.error('SurePet feeding timeline backfill failed:', error);
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

    const surepetDeviceId = Number.parseInt(device.external_id, 10);
    if (Number.isFinite(surepetDeviceId)) {
      await this.backfillFeedingForCloudDevice(surepetDeviceId).catch((error) => {
        this.deps.logger.error(
          `SurePet feeding backfill failed for device ${device.name}:`,
          error,
        );
      });
    }
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

    return this.client;
  }

  /** pet_links are owned by provider account settings; always read fresh from DB before use. */
  private async reloadPetLinksFromDb(): Promise<void> {
    const row = await this.deps.db
      .selectFrom('provider_account')
      .select('config')
      .where('id', '=', this.accountId)
      .executeTakeFirst();

    if (!row) return;

    const config = parseAccountConfig(row.config);
    this.config.pet_links = config.pet_links;
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
          const reportDatapoints =
            extractFeedingDatapointsFromHouseholdReport(report);
          datapoints.push(...reportDatapoints);
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

      await this.ingestFeedingDatapoints(datapoints);

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

  private async backfillFeedingTimelineIfNeeded(): Promise<void> {
    if (this.config.sync?.feeding_timeline_backfill_done) return;

    await this.backfillFeedingTimeline();
    this.config.sync = {
      ...this.config.sync,
      feeding_timeline_backfill_done: true,
    };
    await this.persistAccountConfig();
  }

  private async backfillFeedingForCloudDevice(
    cloudDeviceId: number,
  ): Promise<void> {
    const client = await this.ensureClient();
    const householdId = this.config.household_id;
    if (householdId == null) return;

    const timeline = await client.getTimeline(householdId, {});
    const extracted = extractFeedingDatapointsFromTimeline(timeline);
    const datapoints = extracted.datapoints.filter(
      (datapoint) => datapoint.device_id === cloudDeviceId,
    );
    await this.ingestFeedingDatapoints(datapoints);
  }

  private async backfillFeedingTimeline(): Promise<{
    timelineEntryCount: number;
    extractedDatapointCount: number;
    ingestAttempts: number;
    skippedUnmapped: number;
  }> {
    const client = await this.ensureClient();
    const householdId = this.config.household_id;
    if (householdId == null) {
      return {
        timelineEntryCount: 0,
        extractedDatapointCount: 0,
        ingestAttempts: 0,
        skippedUnmapped: 0,
      };
    }

    const timeline = await client.getTimeline(householdId, {});
    const extracted = extractFeedingDatapointsFromTimeline(timeline);
    const ingestStats = await this.ingestFeedingDatapoints(extracted.datapoints);

    return {
      timelineEntryCount: timeline.length,
      extractedDatapointCount: extracted.datapoints.length,
      ...ingestStats,
    };
  }

  private async ingestFeedingDatapoints(
    datapoints: NormalizedFeedingDatapoint[],
  ): Promise<{ ingestAttempts: number; skippedUnmapped: number }> {
    await this.reloadPetLinksFromDb();
    const localDeviceMap = await this.buildLocalDeviceMap();
    let skippedUnmapped = 0;
    let ingestAttempts = 0;

    for (const datapoint of datapoints) {
      const localDevice =
        datapoint.device_id != null
          ? localDeviceMap.get(datapoint.device_id)
          : undefined;

      if (localDevice == null) {
        skippedUnmapped += 1;
        continue;
      }
      ingestAttempts += 1;

      const controller = this.controllers.get(localDevice.id);
      await this.ingestFeedingDatapoint(
        datapoint,
        localDevice,
        controller?.getDeviceControl(),
      );
    }

    return { ingestAttempts, skippedUnmapped };
  }

  private parseDeviceConfig(config: unknown): Record<string, unknown> {
    if (typeof config === 'string') {
      try {
        const parsed = JSON.parse(config) as unknown;
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    if (typeof config === 'object' && config !== null && !Array.isArray(config)) {
      return config as Record<string, unknown>;
    }
    return {};
  }

  private async buildLocalDeviceMap(): Promise<
    Map<number, { id: number; config: Record<string, unknown> }>
  > {
    const devices = await this.deps.db
      .selectFrom('device')
      .select(['id', 'external_id', 'config'])
      .where('provider_account_id', '=', this.accountId)
      .where('type', '=', 'feeder')
      .where('enabled', '=', 1)
      .execute();

    const map = new Map<number, { id: number; config: Record<string, unknown> }>();
    for (const device of devices) {
      const surepetId = Number.parseInt(device.external_id, 10);
      if (Number.isFinite(surepetId)) {
        map.set(surepetId, {
          id: device.id,
          config: this.parseDeviceConfig(device.config),
        });
      }
    }
    return map;
  }

  private async ingestFeedingDatapoint(
    datapoint: NormalizedFeedingDatapoint,
    localDevice: { id: number; config: Record<string, unknown> },
    deviceControl?: unknown,
  ): Promise<void> {
    let event = mapFeedingDatapointToEvent({
      datapoint,
      localDeviceId: localDevice.id,
      accountConfig: this.config,
      deviceControl,
    });

    const compartmentId = resolveSurePetFoodCompartmentId(
      deviceControl,
      datapoint.bowl_index,
    );
    const foodId = resolveFoodIdForCompartment(localDevice.config, compartmentId);
    if (foodId != null) {
      const food = await this.deps.db
        .selectFrom('food')
        .selectAll()
        .where('id', '=', foodId)
        .executeTakeFirst();
      if (food) {
        event = {
          ...event,
          data: enrichFoodIntakeEventData(event.data, food),
        };
      }
    }

    const externalKey =
      event.data.provider_data?.provider === 'surepet'
        ? event.data.provider_data.external_key
        : undefined;
    if (!externalKey) return;

    const existing = await this.deps.db
      .selectFrom('event')
      .select(['id', 'pet_id'])
      .where('device_id', '=', localDevice.id)
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

    if (existing) {
      if (existing.pet_id == null && event.pet_id != null) {
        await this.assignPetIdToFeedingEvent(existing.id, event.pet_id);
      }
      return;
    }

    const result = await this.deps.db
      .insertInto('event')
      .values(event)
      .returning(['id', 'pet_id', 'timestamp'])
      .executeTakeFirst();

    if (!result) return;

    const eventData = event.data;
    const moistureMl = eventData.nutrients?.moisture_ml;
    if (moistureMl != null) {
      await this.deps.db
        .insertInto('event')
        .values(
          buildMoistureChildEventValues({
            parentEventId: result.id,
            petId: result.pet_id,
            timestamp: result.timestamp,
            moistureMl,
          }),
        )
        .execute();
    }

    this.deps.eventBus.publish('device.event', {
      deviceId: localDevice.id,
      type: 'food_intake',
      data: eventData,
      timestamp: event.timestamp,
      eventId: result.id,
    });
  }

  private async assignPetIdToFeedingEvent(
    eventId: number,
    petId: number,
  ): Promise<void> {
    await this.deps.db
      .updateTable('event')
      .set({ pet_id: petId })
      .where('id', '=', eventId)
      .execute();

    await this.deps.db
      .updateTable('event')
      .set({ pet_id: petId })
      .where('parent_event_id', '=', eventId)
      .where('pet_id', 'is', null)
      .execute();
  }

  private async backfillSurePetFeedingEventPetIds(): Promise<void> {
    await this.reloadPetLinksFromDb();
    const links = this.config.pet_links ?? [];
    if (!links.length) return;

    const events = await this.deps.db
      .selectFrom('event')
      .select(['id', 'data'])
      .where('pet_id', 'is', null)
      .where(
        sql<string>`json_extract(data, '$.type')`,
        '=',
        'food_intake',
      )
      .where(
        sql<string>`json_extract(data, '$.provider_data.provider')`,
        '=',
        'surepet',
      )
      .execute();

    for (const row of events) {
      const data =
        typeof row.data === 'string'
          ? (JSON.parse(row.data) as FoodIntakeEventData)
          : (row.data as FoodIntakeEventData);
      const providerData = data.provider_data;
      if (providerData?.provider !== 'surepet') continue;

      const resolvedPetId = resolveLocalPetIdFromProviderData(
        this.config,
        providerData,
      );
      if (resolvedPetId == null) continue;

      await this.assignPetIdToFeedingEvent(row.id, resolvedPetId);
    }
  }

  private async persistAccountConfig(): Promise<void> {
    const row = await this.deps.db
      .selectFrom('provider_account')
      .select('config')
      .where('id', '=', this.accountId)
      .executeTakeFirst();

    if (row) {
      const dbConfig = parseAccountConfig(row.config);
      if (dbConfig.pet_links !== undefined) {
        this.config.pet_links = dbConfig.pet_links;
      }
    }

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
