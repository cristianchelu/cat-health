import type { Kysely } from 'kysely';
import {
  InferenceAccountConfigSchema,
  DeviceRecognitionConfigSchema,
  requireWithSchema,
} from 'shared';
import type {
  DeviceRecognitionConfigDTO,
  InferenceAccountConfig,
} from 'shared';
import type { Database } from '../../database/index.ts';
import type { EventBus, DeviceMediaReadyEvent } from '../devices/EventBus.ts';
import {
  identifyPetFromMedia,
  recordIdentification,
  type PetIdentificationResult,
} from './identification.ts';

export type IdentifyFn = (
  db: Kysely<Database>,
  config: DeviceRecognitionConfigDTO,
  accountConfig: InferenceAccountConfig,
  mediaId: number,
) => Promise<PetIdentificationResult>;

export interface RecognitionLink {
  config: DeviceRecognitionConfigDTO;
  accountConfig: InferenceAccountConfig;
  accountEnabled: boolean;
}

export type TestIdentifyOutcome =
  | { ok: true; result: PetIdentificationResult }
  | { ok: false; reason: 'no_recognition' | 'account_disabled' };

/**
 * Runs recognition for every device that has one, out of a single subscription
 * rather than one controller per recognizer device.
 *
 * Recognition is not a device: it is something attached to a device, the way a
 * camera link is. So this sits beside `EventMediaCoordinator` — subscribe once
 * to `device.event.media_ready`, look up the observed device's attachment, and
 * act on it. Nothing here holds per-device state, so a config edit takes effect
 * on the next event with no controller to invalidate.
 */
export class RecognitionService {
  private db: Kysely<Database>;
  private eventBus: EventBus;
  private identify: IdentifyFn;
  private onMediaReadyBound: (event: DeviceMediaReadyEvent) => void;

  constructor(
    db: Kysely<Database>,
    eventBus: EventBus,
    identify: IdentifyFn = identifyPetFromMedia,
  ) {
    this.db = db;
    this.eventBus = eventBus;
    this.identify = identify;
    this.onMediaReadyBound = this.onMediaReady.bind(this);
  }

  async initialize(): Promise<void> {
    this.eventBus.subscribe(
      'device.event.media_ready',
      this.onMediaReadyBound as (e: unknown) => void,
    );
  }

  async shutdown(): Promise<void> {
    this.eventBus.removeListener(
      'device.event.media_ready',
      this.onMediaReadyBound as (e: unknown) => void,
    );
  }

  /**
   * The device's recognition attachment joined to the account that pays for
   * it, or `null` when it has none. Both blobs go through their schema — a
   * config that cannot be read is a configuration error worth throwing on, not
   * something to guess around mid-identification.
   */
  async loadLink(deviceId: number): Promise<RecognitionLink | null> {
    const row = await this.db
      .selectFrom('device_recognition')
      .innerJoin(
        'provider_account',
        'provider_account.id',
        'device_recognition.account_id',
      )
      .where('device_recognition.device_id', '=', deviceId)
      .select([
        'device_recognition.config as config',
        'provider_account.config as account_config',
        'provider_account.enabled as account_enabled',
      ])
      .executeTakeFirst();
    if (!row) return null;

    return {
      config: requireWithSchema(
        DeviceRecognitionConfigSchema,
        row.config,
        'device recognition configuration',
      ),
      accountConfig: requireWithSchema(
        InferenceAccountConfigSchema,
        row.account_config,
        'inference account configuration',
      ),
      accountEnabled: Boolean(row.account_enabled),
    };
  }

  private onMediaReady(event: DeviceMediaReadyEvent): void {
    this.handleMediaReady(event).catch((error) => {
      console.error(
        `[RecognitionService] Error auto-identifying pet for event ${event.eventId}:`,
        error,
      );
    });
  }

  /**
   * Awaitable on purpose: tests call it directly rather than publishing and
   * racing the fire-and-forget wrapper above.
   */
  async handleMediaReady(event: DeviceMediaReadyEvent): Promise<void> {
    const link = await this.loadLink(event.deviceId);
    if (!link) return;
    if (link.config.auto_identify === false) return;
    if (!link.accountEnabled) return;

    await this.identifyForEvent(link, event.eventId);
  }

  private async identifyForEvent(
    link: RecognitionLink,
    eventId: number,
  ): Promise<PetIdentificationResult> {
    console.log(`Running pet identification for event ${eventId}`);

    try {
      const eventMedia = await this.db
        .selectFrom('media_link')
        .innerJoin('media', 'media.id', 'media_link.media_id')
        .where('media_link.entity_type', '=', 'event')
        .where('media_link.entity_id', '=', eventId.toString())
        .select(['media.id', 'media_link.relation'])
        .orderBy('media.created_at', 'asc')
        .orderBy('media.id', 'asc')
        .execute();

      if (eventMedia.length === 0) {
        console.warn(
          `Invariant violation: device.event.media_ready fired without linked media for event ${eventId}`,
        );
        return {
          pet_id: null,
          caused_by: 'unknown',
          pet_name: 'unknown',
          raw_response: 'No media',
        };
      }

      const snapshotMedia = eventMedia.find((m) => m.relation === 'snapshot');
      const mediaId = snapshotMedia?.id ?? eventMedia[0].id;
      const result = await this.identify(
        this.db,
        link.config,
        link.accountConfig,
        mediaId,
      );

      const outcome = await recordIdentification(this.db, eventId, result);

      if (outcome === 'unresolved') {
        console.log(
          `Could not identify pet in event ${eventId}, AI said: ${result.raw_response}`,
        );
      } else if (outcome === 'already_attributed') {
        console.log(
          `Left event ${eventId} alone — already attributed; AI said ${result.pet_name}`,
        );
      } else {
        console.log(
          `Attributed event ${eventId} as ${result.caused_by} (${result.pet_name})`,
        );
      }

      return result;
    } catch (error) {
      console.error(`Failed to identify pet for event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * The Test Recognition diagnostic: run the configured account against one
   * image and report the verdict without writing it anywhere.
   *
   * Gated only on there being a link and the account being switched on. Neither
   * the device's own switch nor `auto_identify` applies — this is a human
   * asking a question by hand, and the whole point of turning auto-identify off
   * while tuning a prompt is to keep asking it.
   */
  async testIdentify(
    deviceId: number,
    mediaId: number,
  ): Promise<TestIdentifyOutcome> {
    const link = await this.loadLink(deviceId);
    if (!link) return { ok: false, reason: 'no_recognition' };
    if (!link.accountEnabled) return { ok: false, reason: 'account_disabled' };

    const result = await this.identify(
      this.db,
      link.config,
      link.accountConfig,
      mediaId,
    );
    return { ok: true, result };
  }
}
