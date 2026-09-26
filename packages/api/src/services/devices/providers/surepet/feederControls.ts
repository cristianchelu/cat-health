import {
  parseFeederFoodCompartments,
  type FeederFoodCompartmentsDTO,
  type KnownSettingValues,
  type SettingDescriptor,
} from 'shared';

import { composeControlSurface } from '../../control/composeControlSurface.ts';
import { pollUntil } from '../../control/observe.ts';
import type {
  Acceptance,
  ControlSurface,
  SettingBinding,
  Settlement,
} from '../../control/types.ts';
import {
  BowlType,
  CloseDelay,
  ControlRequestStatus,
  FoodType,
  SUREPET_CONTROL_POLL_INTERVAL_MS,
  SUREPET_CONTROL_TIMEOUT_MS,
} from './constants.ts';
import type {
  SurePetControlRequest,
  SurePetControlWrite,
  SurePetDeviceControlPayload,
} from './types.ts';

/** A food's coarse group, as feeding events record it. */
export type FoodGroup = 'wet' | 'dry' | 'treat' | 'unknown';

/** The account's side of a feeder's writes, bound to one feeder. */
export interface SurePetControlWriter {
  put(write: SurePetControlWrite): Promise<SurePetControlRequest | null>;
  status(): Promise<SurePetControlRequest[]>;
  /** Re-read the device, so a settled write shows what the feeder now has. */
  refresh(): Promise<void>;
  foodGroups(foodIds: number[]): Promise<Map<number, FoodGroup>>;
  /** Store which food each compartment holds, on the device row. */
  saveFoodCompartments(rows: FeederFoodCompartmentsDTO): Promise<void>;
}

/** What a feeder's settings are read from and written against. */
export interface FeederControlState {
  control: SurePetDeviceControlPayload | undefined;
  /** `device.config`, which carries the local food attribution. */
  config: unknown;
}

/** Where one write goes: the feeder, through the cloud, or our own record. */
export type FeederWrite =
  | { to: 'cloud'; control: SurePetControlWrite }
  | { to: 'local'; foodCompartments: FeederFoodCompartmentsDTO };

type LidCloseDelay = KnownSettingValues['lid_close_delay'];
type Bowls = KnownSettingValues['bowls'];

const CLOSE_DELAY_SECONDS: Record<LidCloseDelay, number> = {
  fast: CloseDelay.FASTER,
  normal: CloseDelay.NORMAL,
  slow: CloseDelay.SLOWER,
};

const lidCloseDelay: SettingBinding<FeederWrite, FeederControlState> = {
  descriptor: {
    key: 'lid_close_delay',
    label: { i18n: 'devices.controls.settings.lid_close_delay' },
    type: {
      kind: 'enum',
      options: (['fast', 'normal', 'slow'] as const).map((value) => ({
        value,
        label: { i18n: `devices.controls.options.lid_close_delay.${value}` },
      })),
    },
    placement: 'setting',
    group: 'config',
  } satisfies SettingDescriptor,
  read: ({ control }) => {
    const seconds = control?.lid?.close_delay;
    const entry = Object.entries(CLOSE_DELAY_SECONDS).find(
      ([, value]) => value === seconds,
    );
    return entry?.[0] ?? null;
  },
  // Their app sends `lid` whole, so the rest of it rides along unchanged.
  encode: (value, { control }) => [
    {
      to: 'cloud',
      control: {
        lid: {
          ...control?.lid,
          close_delay: CLOSE_DELAY_SECONDS[value as LidCloseDelay],
        },
      },
    },
  ],
};

/** A portion is either none or at least this, as their app enforces. */
const MIN_PORTION_G = 10;

/**
 * The two layouts their app offers, with the portion bounds it enforces for
 * each and the compartment ids feeding events are attributed under.
 */
const BOWL_LAYOUTS = {
  single: { type: BowlType.LARGE, maxPortionG: 250, compartments: ['default'] },
  split: {
    type: BowlType.TWO_SMALL,
    maxPortionG: 100,
    compartments: ['0', '1'],
  },
} as const;

const layoutOf = (type: number | null | undefined): Bowls['layout'] | null =>
  type === BowlType.LARGE
    ? 'single'
    : type === BowlType.TWO_SMALL
      ? 'split'
      : null;

const SUREPET_FOOD_TYPE: Partial<Record<FoodGroup, number>> = {
  wet: FoodType.WET,
  dry: FoodType.DRY,
};

/** Bowl layout and contents; `writer` looks up whether a food is wet or dry. */
function bowlsSetting(
  writer: SurePetControlWriter,
): SettingBinding<FeederWrite, FeederControlState> {
  return {
    descriptor: {
      key: 'bowls',
      label: { i18n: 'devices.controls.settings.bowls' },
      type: {
        kind: 'compartments',
        layouts: (['single', 'split'] as const).map((layout) => ({
          value: layout,
          label: { i18n: `devices.controls.options.bowls.${layout}` },
          compartments: (layout === 'single'
            ? (['single'] as const)
            : (['left', 'right'] as const)
          ).map((name) => ({ i18n: `devices.controls.compartments.${name}` })),
          fields: {
            food: {
              label: { i18n: 'devices.controls.fields.food' },
              // A bowl is set to wet or dry; nothing else reaches the feeder.
              type: { kind: 'food', groups: ['wet', 'dry'] },
            },
            portion: {
              label: { i18n: 'devices.controls.fields.portion' },
              type: {
                kind: 'number',
                min: 0,
                max: BOWL_LAYOUTS[layout].maxPortionG,
                step: 1,
                unit: 'g',
              },
            },
          },
        })),
      },
      placement: 'setting',
      group: 'config',
    } satisfies SettingDescriptor,

    read: ({ control, config }) => {
      const layout = layoutOf(control?.bowls?.type);
      if (!layout) return null;
      const foods = parseFeederFoodCompartments(config);
      const settings = control?.bowls?.settings ?? [];
      return {
        layout,
        compartments: BOWL_LAYOUTS[layout].compartments.map((id, index) => ({
          food: foods.get(id) ?? null,
          portion: settings[index]?.target ?? 0,
        })),
      } satisfies Bowls;
    },

    validate: (value) => {
      const { compartments } = value as Bowls;
      if (compartments.some((compartment) => compartment.food == null)) {
        return 'every bowl needs a food, which sets it to wet or dry';
      }
      const portion = compartments.find(
        (compartment) =>
          compartment.portion != null &&
          compartment.portion > 0 &&
          compartment.portion < MIN_PORTION_G,
      );
      return portion
        ? `a portion is either 0 or at least ${MIN_PORTION_G} g`
        : null;
    },

    /**
     * The feeder first, then our attribution once it has confirmed, so a
     * refused change cannot leave feeding events credited to a food the bowl
     * was never set up for. The cloud write is skipped when only the local
     * attribution changed, since their app never sends a value unchanged.
     */
    encode: async (value, { control, config }) => {
      const next = value as Bowls;
      const layout = BOWL_LAYOUTS[next.layout];
      const foodIds = next.compartments.map((compartment) =>
        Number(compartment.food),
      );
      const groups = await writer.foodGroups(foodIds);
      const settings = next.compartments.map((compartment, index) => {
        const foodType =
          SUREPET_FOOD_TYPE[groups.get(foodIds[index]) ?? 'unknown'];
        if (foodType === undefined) {
          throw new Error(`Food ${foodIds[index]} is neither wet nor dry`);
        }
        return { food_type: foodType, target: compartment.portion ?? 0 };
      });

      const current = control?.bowls;
      const unchanged =
        current?.type === layout.type &&
        JSON.stringify(
          (current.settings ?? []).map((setting) => ({
            food_type: setting?.food_type,
            target: setting?.target,
          })),
        ) === JSON.stringify(settings);

      const kept = [...parseFeederFoodCompartments(config)].filter(
        ([id]) => !(layout.compartments as readonly string[]).includes(id),
      );
      const local: FeederWrite = {
        to: 'local',
        foodCompartments: [
          ...kept.map(([compartment, food_id]) => ({ compartment, food_id })),
          ...layout.compartments.map((compartment, index) => ({
            compartment,
            food_id: foodIds[index],
          })),
        ],
      };

      return unchanged
        ? [local]
        : [
            {
              to: 'cloud',
              control: { bowls: { type: layout.type, settings } },
            },
            local,
          ];
    },
  };
}

const requestStatus = (request: SurePetControlRequest): number | undefined =>
  request.status_id ?? request.status ?? undefined;

/** A request's status as a settlement, or undefined while it is pending. */
function settlementOf(status: number | undefined): Settlement | undefined {
  switch (status) {
    case ControlRequestStatus.PENDING:
      return undefined;
    case ControlRequestStatus.DEVICE_TIMEOUT:
      return { status: 'failed', reason: 'timeout' };
    case ControlRequestStatus.SERVER_ERROR:
    case ControlRequestStatus.DEVICE_ERROR:
      return { status: 'failed', reason: 'rejected' };
    default:
      return { status: 'applied' };
  }
}

/**
 * A SureFeed's writable settings. The cloud queues each write and hands back
 * a request id; the feeder picks it up on its next check-in, which is what
 * `control/status` reports on.
 */
export function createFeederControlSurface(
  state: () => FeederControlState,
  writer: SurePetControlWriter,
  timing = {
    intervalMs: SUREPET_CONTROL_POLL_INTERVAL_MS,
    timeoutMs: SUREPET_CONTROL_TIMEOUT_MS,
  },
): ControlSurface {
  return composeControlSurface<FeederWrite, FeederControlState, string>({
    state,
    settings: [lidCloseDelay, bowlsSetting(writer)],
    channel: {
      async submit(write): Promise<Acceptance<string>> {
        if (write.to === 'local') {
          await writer.saveFoodCompartments(write.foodCompartments);
          return { status: 'applied' };
        }
        const request = await writer.put(write.control);
        // Their app reads `results[0]` unguarded, so a reply without one is
        // an error there too.
        if (!request) {
          return {
            status: 'failed',
            reason: 'unknown',
            message: 'SurePet did not queue the change',
          };
        }
        const settlement = settlementOf(requestStatus(request));
        if (settlement === undefined && request.request_id != null) {
          return { status: 'pending', ref: String(request.request_id) };
        }
        await writer.refresh().catch(() => {});
        return settlement ?? { status: 'applied' };
      },
    },
    confirmer: {
      async settle(requestId, signal) {
        const settlement = await pollUntil(
          async () => {
            const requests = await writer.status();
            const request = requests.find(
              (candidate) => String(candidate.request_id) === requestId,
            );
            // Gone from the queue means the cloud is done with it; their app
            // reloads the device at that point, and so does this.
            return request
              ? settlementOf(requestStatus(request))
              : { status: 'applied' as const };
          },
          { ...timing, signal },
        );
        await writer.refresh().catch(() => {});
        return settlement ?? { status: 'failed', reason: 'timeout' };
      },
    },
  });
}
