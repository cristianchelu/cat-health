import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  isRecord,
  parseWithSchema,
  ProductId,
  SurePetAccountConfigSchema,
  SurePetFeederConfigSchema,
  SurePetRuntimeStateSchema,
  SurePetSyncConfigSchema,
  type ProviderRemotePet,
  type SurePetAccountConfig,
  type SurePetRuntimeState,
} from 'shared';
import { parseStoredEventData } from '../../../../database/types/storedEventData.ts';
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
import { recordDeviceEvent } from '../../../events/recordDeviceEvent.ts';
import { attributionColumns } from '../../../../domain/eventAttribution.ts';
import {
  isRetryableSurePetError,
  SurePetClient,
  SurePetClientError,
} from './SurePetClient.ts';
import { FeederController } from './FeederController.ts';
import {
  SUREPET_DEVICE_STATE_POLL_INTERVAL_MS,
  SUREPET_TIMELINE_POLL_INTERVAL_MS,
  WeightContext,
} from './constants.ts';
import {
  extractFeedingDatapointsFromTimeline,
  resolveLocalPetIdFromProviderData,
} from './extractFeedingEvents.ts';
import { resolveSurePetFoodCompartmentId } from './foodCompartments.ts';
import type { SurePetControlWriter } from './feederControls.ts';
import {
  mapFeedingDatapointToEvent,
  mapServedDatapointToEvent,
} from './mapFeedingEvent.ts';
import type {
  NormalizedFeedingDatapoint,
  NormalizedServedDatapoint,
  SurePetTimelineEntry,
} from './types.ts';

function parseAccountConfig(config: unknown): SurePetAccountConfig {
  const parsed = parseWithSchema(SurePetAccountConfigSchema, config);
  if (!parsed) {
    throw new Error('SurePet account config must include email and password');
  }

  return parsed;
}

/**
 * Runtime state is provider-owned and always optional — an account connected
 * for the first time has none. A missing or malformed blob is not an error;
 * it just means everything gets re-derived on the next login.
 *
 * Parsing is per field on purpose. `parseWithSchema` is Check-only, so a single
 * bad value (say a numeric `token`) would otherwise discard the whole blob —
 * including the sync cursor, and losing that makes `runFeedingSync` re-pull the
 * household report plus the entire timeline.
 */
function parseRuntimeState(runtimeState: unknown): SurePetRuntimeState {
  // Copied, not aliased: `parseWithSchema` is Check-only and hands back the very
  // object it was given, which here is the row loaded from the database.
  const whole = parseWithSchema(SurePetRuntimeStateSchema, runtimeState);
  if (whole) return { ...whole };
  if (!isRecord(runtimeState)) return {};

  const salvaged: SurePetRuntimeState = {};
  const { device_id, token, household_id, sync } = runtimeState;

  if (typeof device_id === 'string' && device_id.length > 0) {
    salvaged.device_id = device_id;
  }
  if (typeof token === 'string' && token.length > 0) {
    salvaged.token = token;
  }
  if (typeof household_id === 'number' && Number.isFinite(household_id)) {
    salvaged.household_id = household_id;
  }
  const parsedSync = parseWithSchema(SurePetSyncConfigSchema, sync);
  if (parsedSync) {
    salvaged.sync = parsedSync;
  }

  return salvaged;
}

export class SurePetAccountManager implements AccountManager {
  readonly accountId: number;
  private account: ProviderAccount;
  private deps: ProviderDeps;
  private config: SurePetAccountConfig;
  private runtime: SurePetRuntimeState;
  private client: SurePetClient | null = null;
  private controllers = new Map<number, FeederController>();
  private timelinePollTimer: ReturnType<typeof setInterval> | null = null;
  private statePollTimer: ReturnType<typeof setInterval> | null = null;
  private syncInProgress = false;
  /** A feeder registered while the walk was running; run it again after. */
  private backfillRestartRequested = false;
  /**
   * Set by `shutdown()`. A manager is replaced (not just stopped) whenever the
   * account config is edited: the route writes the reconciled `runtime_state`
   * and then `initializeAccount` swaps in a fresh manager. Clearing the interval
   * timers cannot cancel a `runFeedingSync()` already awaiting the network, and
   * when that call resumed it wrote this instance's stale in-memory
   * `{token, household_id, sync}` straight back over the reconciled row. Once
   * retired, this instance must never persist again.
   */
  private retired = false;

  constructor(account: ProviderAccount, deps: ProviderDeps) {
    this.account = account;
    this.deps = deps;
    this.accountId = account.id;
    this.config = parseAccountConfig(account.config);
    this.runtime = parseRuntimeState(account.runtime_state);
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
    // Not awaited: a full walk is a hundred-odd requests and, under a rate
    // limit, minutes of backoff — none of which should hold up the pollers.
    this.startTimelineBackfill();

    this.timelinePollTimer = setInterval(() => {
      void this.runFeedingSync()
        .catch((error) => {
          this.deps.logger.error('SurePet timeline sync failed:', error);
        })
        // An interrupted backfill picks up again here, at its stored cursor,
        // rather than waiting for the next restart.
        .finally(() => this.startTimelineBackfill());
    }, SUREPET_TIMELINE_POLL_INTERVAL_MS);

    this.statePollTimer = setInterval(() => {
      void this.refreshFeederStates().catch((error) => {
        this.deps.logger.error('SurePet feeder state refresh failed:', error);
      });
    }, SUREPET_DEVICE_STATE_POLL_INTERVAL_MS);
  }

  async shutdown(): Promise<void> {
    this.retired = true;

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
    if (!(controller instanceof FeederController)) {
      return;
    }

    const device = await this.deps.db
      .selectFrom('device')
      .selectAll()
      .where('id', '=', deviceId)
      .executeTakeFirst();
    if (device) {
      controller.updateDevice(device);
    }
  }

  async discoverDevices(): Promise<DiscoveredDevice[]> {
    const client = await this.ensureClient();
    const householdId = this.runtime.household_id;
    const devices = await client.getDevices(householdId ?? undefined);

    return devices
      .filter((device) => device.product_id === ProductId.FEEDER_CONNECT)
      .map((device) => {
        const household =
          device.household_id ?? householdId ?? this.runtime.household_id;
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
    const pets = await client.getPets(this.runtime.household_id ?? undefined);
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

    // The household walk already ingests every mapped feeder, so a new one
    // only needs that walk run again — resumable and serialised with the poll,
    // instead of a second walk of its own that loses everything on a 429.
    this.requestTimelineBackfill();
  }

  instantiateDeviceController(device: Device): DeviceController {
    const existing = this.controllers.get(device.id);
    if (existing) return existing;

    if (device.type !== 'feeder') {
      throw new Error(
        `Unsupported device type for SurePet provider: ${device.type}`,
      );
    }

    const controller = new FeederController(
      device,
      this.deps,
      this.controlWriter(device.id),
    );
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

    const config = parseWithSchema(SurePetFeederConfigSchema, device.config);
    if (!config) {
      throw new Error('Invalid SurePet feeder configuration');
    }
    if (config.product_id !== ProductId.FEEDER_CONNECT) {
      throw new Error(
        `Unsupported SurePet product_id ${config.product_id}; expected ${ProductId.FEEDER_CONNECT}`,
      );
    }
  }

  /**
   * The SurePet client identity for this installation. Minted once and
   * persisted immediately, *before* the first login — a login can fail (wrong
   * password) and an unpersisted id would mean a brand new client identity on
   * every restart.
   */
  private async ensureInstallIdentity(): Promise<string> {
    const existing = this.runtime.device_id;
    if (existing) return existing;

    const deviceId = randomUUID();
    this.runtime.device_id = deviceId;
    await this.persistRuntimeState();
    return deviceId;
  }

  private async ensureClient(): Promise<SurePetClient> {
    const deviceId = await this.ensureInstallIdentity();

    if (!this.client) {
      this.client = new SurePetClient({
        email: this.config.email,
        password: this.config.password,
        deviceId,
        token: this.runtime.token,
        onToken: (token) => this.onTokenRefreshed(token),
      });
    }

    // Reuse the persisted token. `ensureAuthenticated` only hits the network
    // when `tokenSeemsValid()` says the stored one is unusable, so the common
    // path is zero HTTPS round-trips and zero writes. An unconditional
    // `login()` here used to mint a new token — and therefore a new
    // `provider_account` UPDATE — on every poll, forever.
    await this.client.ensureAuthenticated();

    if (this.runtime.household_id == null) {
      const bootstrap = await this.client.meStart();
      const householdId =
        bootstrap.households?.[0]?.id ??
        bootstrap.devices?.find((d) => d.household_id != null)?.household_id ??
        bootstrap.pets?.find((p) => p.household_id != null)?.household_id;

      if (householdId == null) {
        throw new Error(
          'Could not determine SurePet household_id from me/start',
        );
      }

      this.runtime.household_id = householdId;
      await this.persistRuntimeState();
    }

    return this.client;
  }

  /** Wired into SurePetClient so both fresh logins and 401 refreshes persist. */
  private async onTokenRefreshed(token: string): Promise<void> {
    if (token === this.runtime.token) return;
    this.runtime.token = token;
    await this.persistRuntimeState();
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

  /** Writes for one feeder, through this account's client. */
  private controlWriter(deviceId: number): SurePetControlWriter {
    const cloudId = () => {
      const controller = this.controllers.get(deviceId);
      if (!controller) throw new Error(`No SurePet feeder ${deviceId}`);
      return controller.getSurePetDeviceId();
    };
    return {
      put: async (write) =>
        (await this.ensureClient()).putDeviceControl(cloudId(), write),
      status: async () =>
        (await this.ensureClient()).getControlStatus(cloudId()),
      refresh: async () => {
        const controller = this.controllers.get(deviceId);
        if (!controller || this.retired) return;
        const client = await this.ensureClient();
        controller.updateFromCloudPayload(
          await client.getDevice(controller.getSurePetDeviceId()),
        );
      },
    };
  }

  private async refreshFeederStates(): Promise<void> {
    if (this.retired) return;
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
    if (this.retired || this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const client = await this.ensureClient();
      const householdId = this.runtime.household_id;
      if (householdId == null) return;

      const sinceId = this.runtime.sync?.last_timeline_since_id;
      const isFirstSync = sinceId == null;
      const datapoints: NormalizedFeedingDatapoint[] = [];
      const served: NormalizedServedDatapoint[] = [];
      let maxTimelineEntryId: number | null = null;

      // No household-report backfill: SurePet retired that endpoint (404), and
      // its per-pet replacement reports no fills. `backfillFeedingTimeline`
      // walks the whole timeline instead, which sees both directions.
      try {
        const timeline = await client.getTimeline(householdId, {
          sinceId: isFirstSync ? undefined : sinceId,
        });
        const extracted = extractFeedingDatapointsFromTimeline(timeline);
        datapoints.push(...extracted.datapoints);
        served.push(...extracted.served);
        maxTimelineEntryId = extracted.maxEntryId;
      } catch (error) {
        // A rate limit is the cloud asking us to wait, not a fault of ours.
        // The next poll is minutes away and the backoff inside the client has
        // already had its turn, so this only needs saying, not escalating.
        if (isRetryableSurePetError(error)) {
          const retryAfterMs =
            error instanceof SurePetClientError
              ? error.retryAfterMs
              : undefined;
          this.deps.logger.log(
            `SurePet timeline fetch deferred (${(error as SurePetClientError).status})` +
              (retryAfterMs != null ? `; asked to wait ${retryAfterMs}ms` : ''),
          );
        } else {
          this.deps.logger.error('SurePet timeline fetch failed:', error);
        }
        return;
      }

      // A replacement manager may have taken over during those fetches.
      if (this.retired) return;

      await this.ingestFeedingDatapoints(datapoints);
      await this.ingestServedDatapoints(served);

      if (isFirstSync) {
        const nextSinceId = maxTimelineEntryId ?? 0;
        this.runtime.sync = {
          ...this.runtime.sync,
          last_timeline_since_id: nextSinceId,
        };
        await this.persistRuntimeState();
      } else if (maxTimelineEntryId != null) {
        const currentSinceId = this.runtime.sync?.last_timeline_since_id ?? 0;
        const nextSinceId = Math.max(currentSinceId, maxTimelineEntryId);
        if (nextSinceId !== this.runtime.sync?.last_timeline_since_id) {
          this.runtime.sync = {
            ...this.runtime.sync,
            last_timeline_since_id: nextSinceId,
          };
          await this.persistRuntimeState();
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Runs the one-time walk in the background if it is still owed.
   *
   * Shares `syncInProgress` with the poll so the two never ingest at once —
   * both dedupe by reading before they write, which only holds when they take
   * turns. Whichever loses simply tries again on the next tick.
   */
  private startTimelineBackfill(): void {
    if (this.retired || this.syncInProgress) return;
    if (
      this.runtime.sync?.feeding_timeline_backfill_done &&
      !this.backfillRestartRequested
    ) {
      return;
    }

    this.syncInProgress = true;
    void (async () => {
      if (this.backfillRestartRequested) {
        this.backfillRestartRequested = false;
        await this.resetTimelineBackfill();
      }
      await this.backfillFeedingTimelineIfNeeded();
    })()
      .catch((error) => {
        if (this.retired) return;
        // The walk checkpoints after every page it stores, so an interrupted
        // backfill is paused rather than lost: the next poll tick resumes it.
        if (isRetryableSurePetError(error)) {
          this.deps.logger.log(
            `SurePet feeding timeline backfill paused by the cloud (${(error as SurePetClientError).status}); resumes from its stored cursor`,
          );
        } else {
          this.deps.logger.error(
            'SurePet feeding timeline backfill failed:',
            error,
          );
        }
      })
      .finally(() => {
        this.syncInProgress = false;
      });
  }

  /**
   * Owes the walk again from the top — a feeder registered after the first
   * one finished has history the earlier walk skipped as unmapped. The reset
   * itself happens when the walk next starts, never under one in flight,
   * whose cursor writes would otherwise race it.
   */
  private requestTimelineBackfill(): void {
    this.backfillRestartRequested = true;
    this.startTimelineBackfill();
  }

  private async resetTimelineBackfill(): Promise<void> {
    this.runtime.sync = {
      ...this.runtime.sync,
      feeding_timeline_backfill_done: false,
      timeline_backfill_before_id: undefined,
    };
    await this.persistRuntimeState();
  }

  private async backfillFeedingTimelineIfNeeded(): Promise<void> {
    if (this.runtime.sync?.feeding_timeline_backfill_done) return;

    await this.backfillFeedingTimeline();
    // A feeder arrived mid-walk, so pages before it were ingested without it.
    // Leave the walk owed; the next start resets it and goes again.
    if (this.retired || this.backfillRestartRequested) return;

    this.runtime.sync = {
      ...this.runtime.sync,
      feeding_timeline_backfill_done: true,
      // The walk is finished; a stale cursor would resume a completed backfill
      // part way down if the flag were ever cleared to re-run it.
      timeline_backfill_before_id: undefined,
    };
    await this.persistRuntimeState();
  }

  private async backfillFeedingTimeline(): Promise<{
    timelineEntryCount: number;
    extractedDatapointCount: number;
    ingestAttempts: number;
    skippedUnmapped: number;
  }> {
    const client = await this.ensureClient();
    const householdId = this.runtime.household_id;
    if (householdId == null) {
      return {
        timelineEntryCount: 0,
        extractedDatapointCount: 0,
        ingestAttempts: 0,
        skippedUnmapped: 0,
      };
    }

    // Ingested page by page rather than in one pass at the end: a walk this
    // long is interrupted often enough — a rate limit, a restart, a shutdown —
    // that holding everything until the last page means losing all of it.
    let timelineEntryCount = 0;
    let extractedDatapointCount = 0;
    let ingestAttempts = 0;
    let skippedUnmapped = 0;

    const consume = async (page: SurePetTimelineEntry[]) => {
      const extracted = extractFeedingDatapointsFromTimeline(page);
      const stats = await this.ingestFeedingDatapoints(extracted.datapoints);
      await this.ingestServedDatapoints(extracted.served);

      timelineEntryCount += page.length;
      extractedDatapointCount += extracted.datapoints.length;
      ingestAttempts += stats.ingestAttempts;
      skippedUnmapped += stats.skippedUnmapped;
    };

    await client.getFullTimeline(householdId, {
      startBeforeId: this.runtime.sync?.timeline_backfill_before_id,
      onPage: async (page, nextBeforeId) => {
        // A replacement manager has taken over; stop the walk rather than
        // keep paging on its behalf. The cursor stays where it is, so the
        // successor resumes instead of starting again.
        if (this.retired) {
          throw new Error('SurePet account manager retired mid-backfill');
        }
        await consume(page);
        if (nextBeforeId != null) {
          await this.persistBackfillCursor(nextBeforeId);
        }
      },
    });

    return {
      timelineEntryCount,
      extractedDatapointCount,
      ingestAttempts,
      skippedUnmapped,
    };
  }

  /** Remembers how far the one-time walk got, so a failure resumes there. */
  private async persistBackfillCursor(beforeId: number): Promise<void> {
    this.runtime.sync = {
      ...this.runtime.sync,
      timeline_backfill_before_id: beforeId,
    };
    await this.persistRuntimeState();
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

  /**
   * Servings, which need none of the meal path's machinery: no pet to resolve,
   * no nutrients to derive, no back-fill of a pet id onto an existing row.
   */
  private async ingestServedDatapoints(
    datapoints: NormalizedServedDatapoint[],
  ): Promise<void> {
    if (datapoints.length === 0) return;

    const localDeviceMap = await this.buildLocalDeviceMap();

    for (const datapoint of datapoints) {
      const localDevice =
        datapoint.device_id != null
          ? localDeviceMap.get(datapoint.device_id)
          : undefined;
      if (localDevice == null) continue;

      const controller = this.controllers.get(localDevice.id);
      const event = mapServedDatapointToEvent({
        datapoint,
        localDeviceId: localDevice.id,
        deviceControl: controller?.getDeviceControl(),
      });

      const providerData = event.data.provider_data;
      const externalKey =
        providerData?.provider === 'surepet'
          ? providerData.external_key
          : undefined;
      if (!externalKey) continue;

      const existing = await this.findEventByExternalKey(
        localDevice.id,
        externalKey,
      );
      if (existing) continue;

      const compartmentId = resolveSurePetFoodCompartmentId(
        controller?.getDeviceControl(),
        datapoint.bowl_index,
      );
      const foodId = resolveFoodIdForCompartment(
        localDevice.config,
        compartmentId,
      );

      await recordDeviceEvent(this.deps, {
        deviceId: localDevice.id,
        timestamp: event.timestamp,
        data: foodId != null ? { ...event.data, food_id: foodId } : event.data,
        // A SureFeed has no motor. Every gram that appears in its bowl was put
        // there by a person, and the feeder says so itself with `USER_CLOSED`.
        //
        caused_by: 'human',
        // No `attributed_by`: the vocabulary there names ways of identifying a
        // pet, and none of them describes a device reporting its own lid. A
        // claimed source would be less honest than an absent one.
        raw_data: event.raw_data,
        human_verified: event.human_verified,
      });
    }
  }

  private async findEventByExternalKey(
    deviceId: number,
    externalKey: string,
  ): Promise<{ id: number; pet_id: number | null } | undefined> {
    return await this.deps.db
      .selectFrom('event')
      .select(['id', 'pet_id'])
      .where('device_id', '=', deviceId)
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
  }

  private parseDeviceConfig(config: unknown): Record<string, unknown> {
    if (typeof config === 'string') {
      try {
        const parsed = JSON.parse(config) as unknown;
        return typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    if (
      typeof config === 'object' &&
      config !== null &&
      !Array.isArray(config)
    ) {
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

    const map = new Map<
      number,
      { id: number; config: Record<string, unknown> }
    >();
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
    const foodId = resolveFoodIdForCompartment(
      localDevice.config,
      compartmentId,
    );
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

    const providerData = event.data.provider_data;
    const externalKey =
      providerData?.provider === 'surepet'
        ? providerData.external_key
        : undefined;
    if (!externalKey) return;

    const existing = await this.findEventByExternalKey(
      localDevice.id,
      externalKey,
    );

    if (existing) {
      if (existing.pet_id == null && event.pet_id != null) {
        await this.assignPetIdToFeedingEvent(existing.id, event.pet_id);
      }
      return;
    }

    // The feeder's own `context` decides this: only a recognised pet keeps the
    // chip read. An intruder is another animal, and a reading the hardware
    // distrusts stays unresolved for a human to settle.
    const cause = datapoint.cause ?? 'pet';
    // SurePet identifies by the implanted chip the hardware reads, not a guess.
    const attribution = attributionColumns(
      cause,
      event.pet_id ?? null,
      cause === 'pet' ? 'microchip' : null,
    );

    const resultId = await recordDeviceEvent(this.deps, {
      deviceId: localDevice.id,
      timestamp: event.timestamp,
      data: event.data,
      pet_id: attribution.pet_id,
      caused_by: attribution.caused_by,
      attributed_by: attribution.attributed_by ?? undefined,
      raw_data: event.raw_data,
      human_verified: event.human_verified,
    });

    const moistureMl = event.data.nutrients?.moisture_ml;
    if (moistureMl != null) {
      await this.deps.db
        .insertInto('event')
        .values(
          buildMoistureChildEventValues({
            parentEventId: resultId,
            // The moisture is the meal's, so it carries the meal's decision —
            // an intruder's wet food is not our pet's hydration.
            attribution,
            timestamp: event.timestamp,
            moistureMl,
          }),
        )
        .execute();
    }
  }

  /**
   * Names the pet on a meal stored before its tag was linked.
   *
   * Writes the whole attribution, not just `pet_id`: the CHECK allows a pet id
   * only beside `caused_by = 'pet'`, and a row stored as `unknown` would
   * otherwise reject the update. Only rows still open to a chip read are
   * touched — a cause a person or the feeder settled as not-a-pet stays put.
   */
  private async assignPetIdToFeedingEvent(
    eventId: number,
    petId: number,
  ): Promise<void> {
    const columns = attributionColumns('pet', petId, 'microchip');

    await this.deps.db
      .updateTable('event')
      .set(columns)
      .where('id', '=', eventId)
      .where('pet_id', 'is', null)
      .where('caused_by', 'in', ['pet', 'unknown'])
      .execute();

    await this.deps.db
      .updateTable('event')
      .set(columns)
      .where('parent_event_id', '=', eventId)
      .where('pet_id', 'is', null)
      .where('caused_by', 'in', ['pet', 'unknown'])
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
      .where('caused_by', 'in', ['pet', 'unknown'])
      .where(sql<string>`json_extract(data, '$.type')`, '=', 'food_intake')
      .where(
        sql<string>`json_extract(data, '$.provider_data.provider')`,
        '=',
        'surepet',
      )
      .execute();

    for (const row of events) {
      const data = parseStoredEventData(
        typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      );
      if (data?.type !== 'food_intake') continue;
      const providerData = data.provider_data;
      if (providerData?.provider !== 'surepet') continue;
      // An intruder or a reading the feeder distrusts may still carry a tag;
      // it is not a chip read, so it never becomes one here. Rows without a
      // context predate it and were all chip reads.
      if (
        providerData.weight_context != null &&
        providerData.weight_context !== WeightContext.PET_CLOSED
      ) {
        continue;
      }

      const resolvedPetId = resolveLocalPetIdFromProviderData(
        this.config,
        providerData,
      );
      if (resolvedPetId == null) continue;

      await this.assignPetIdToFeedingEvent(row.id, resolvedPetId);
    }
  }

  /**
   * Writes only `runtime_state`. `config` is user-owned and must never be
   * touched here — that separation is what lets a background token refresh and
   * a concurrent user edit coexist without either clobbering the other.
   *
   * `updated_at` is deliberately not bumped: a token refresh is not a user-
   * visible modification of the account.
   *
   * A retired instance writes nothing — see {@link retired}.
   */
  private async persistRuntimeState(): Promise<void> {
    if (this.retired) return;

    const runtime_state = { ...this.runtime };
    await this.deps.db
      .updateTable('provider_account')
      .set({ runtime_state })
      .where('id', '=', this.accountId)
      .execute();

    this.account = {
      ...this.account,
      runtime_state,
    };
  }
}
