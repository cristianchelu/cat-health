import {
  KNOWN_ACTIONS,
  parseFeederFoodCompartments,
  type ActionDescriptor,
  type FeederFoodCompartmentsDTO,
  type IdentityOption,
  type KnownSettingValues,
  type ProcedureDescriptor,
  type ProviderPetLink,
  type SettingDescriptor,
} from 'shared';

import {
  composeControlSurface,
  InvalidControlValueError,
} from '../../control/composeControlSurface.ts';
import { pollUntil } from '../../control/observe.ts';
import type {
  Acceptance,
  ActionBinding,
  ControlSurface,
  ProcedureBinding,
  SettingBinding,
  Settlement,
} from '../../control/types.ts';
import {
  BowlType,
  CloseDelay,
  ControlRequestStatus,
  FeederTareType,
  FoodType,
  SUREPET_CONTROL_POLL_INTERVAL_MS,
  SUREPET_CONTROL_TIMEOUT_MS,
  SUREPET_LEARN_TIMEOUT_MS,
  TagRequestAction,
} from './constants.ts';
import { getLinkRemotePetId, getLinkTagId } from './petLinkResolvers.ts';
import type {
  SurePetCloudPet,
  SurePetControlReply,
  SurePetControlRequest,
  SurePetControlWrite,
  SurePetDeviceControlPayload,
  SurePetDeviceTag,
  SurePetTagWrite,
} from './types.ts';

/** A food's coarse group, as feeding events record it. */
export type FoodGroup = 'wet' | 'dry' | 'treat' | 'unknown';

/** The account's side of a feeder's controls, bound to one feeder. */
export interface SurePetControlWriter {
  put(write: SurePetControlWrite): Promise<SurePetControlReply>;
  putTag(write: SurePetTagWrite): Promise<SurePetControlReply>;
  status(): Promise<SurePetControlRequest[]>;
  /** The feeder's tags as the cloud lists them right now. */
  tags(): Promise<SurePetDeviceTag[]>;
  /** The account's pet links, which say whose tag each device tag is. */
  petLinks(): ProviderPetLink[];
  /** The household's pets as last read, each the owner of a tag. */
  householdPets(): SurePetCloudPet[];
  /** Re-read the device, so a settled write shows what the feeder now has. */
  refresh(): Promise<void>;
  foodGroups(foodIds: number[]): Promise<Map<number, FoodGroup>>;
  /** Store which food each compartment holds, on the device row. */
  saveFoodCompartments(rows: FeederFoodCompartmentsDTO): Promise<void>;
}

/** What a feeder's settings are read from and written against. */
export interface FeederControlState {
  control: SurePetDeviceControlPayload | undefined;
  /** The pet tags the feeder is assigned. */
  tags: SurePetDeviceTag[];
  /** `device.config`, which carries the local food attribution. */
  config: unknown;
  /** The account's pet links, which say whose tag each device tag is. */
  petLinks: ProviderPetLink[];
  /** The household's pets, each the owner of a tag. */
  householdPets: SurePetCloudPet[];
}

/**
 * Where one write goes: the feeder, through the cloud, or our own record. A
 * `learn` write sends nothing; it waits for the feeder to meet a tag it did
 * not have.
 */
export type FeederWrite =
  | { to: 'cloud'; control: SurePetControlWrite }
  | { to: 'tag'; tag: SurePetTagWrite }
  | { to: 'learn'; before: number[] }
  | { to: 'local'; foodCompartments: FeederFoodCompartmentsDTO };

type LidCloseDelay = KnownSettingValues['lid_close_delay'];
type Bowls = KnownSettingValues['bowls'];
type Identities = KnownSettingValues['pets'];

const CLOSE_DELAY_SECONDS: Record<LidCloseDelay, number> = {
  fast: CloseDelay.FASTER,
  normal: CloseDelay.NORMAL,
  slow: CloseDelay.SLOWER,
};

const lidCloseDelay: SettingBinding<FeederWrite, FeederControlState> = {
  key: 'lid_close_delay',
  descriptor: () => ({
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
  }),
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
    key: 'bowls',
    descriptor: () => ({
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
    }),

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
          throw new InvalidControlValueError(
            `food ${foodIds[index]} is neither wet nor dry`,
          );
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

const tagLabel = (tagId: number): string => `Tag ${tagId}`;

/**
 * Every identity the feeder can be assigned, in the household's terms: each
 * pet that owns a tag, named as the household names it, and any tag on the
 * feeder that no household pet owns, so nothing the feeder opens for goes
 * unlisted. An identity's id is its tag id, which is what the feeder is
 * assigned. A link claims an identity by its tag, or by its remote pet.
 */
function identityOptions({
  tags,
  householdPets,
  petLinks,
}: FeederControlState): IdentityOption[] {
  const petByTag = new Map<number, number>();
  const petByRemoteId = new Map<number, number>();
  for (const link of petLinks) {
    if (link.pet_id <= 0) continue;
    const tagId = getLinkTagId(link);
    if (tagId !== undefined) petByTag.set(tagId, link.pet_id);
    const remoteId = getLinkRemotePetId(link);
    if (remoteId !== undefined) petByRemoteId.set(remoteId, link.pet_id);
  }
  const options: IdentityOption[] = [];
  const listed = new Set<number>();
  for (const pet of householdPets) {
    const tagId = pet.tag_id ?? pet.tag?.id ?? null;
    if (tagId == null || listed.has(tagId)) continue;
    listed.add(tagId);
    options.push({
      id: String(tagId),
      label: pet.name?.trim() || tagLabel(tagId),
      pet_id: petByTag.get(tagId) ?? petByRemoteId.get(pet.id) ?? null,
    });
  }
  for (const tag of tags) {
    if (listed.has(tag.id)) continue;
    listed.add(tag.id);
    options.push({
      id: String(tag.id),
      label: tagLabel(tag.id),
      pet_id: petByTag.get(tag.id) ?? null,
    });
  }
  return options;
}

const readIdentities = ({ tags }: FeederControlState): Identities =>
  [...new Set(tags.map((tag) => String(tag.id)))].sort();

/** Which identities the feeder opens for: its assigned tags, one write each. */
const petsSetting: SettingBinding<FeederWrite, FeederControlState> = {
  key: 'pets',
  descriptor: (state): SettingDescriptor => ({
    key: 'pets',
    label: { i18n: 'devices.controls.settings.pets' },
    type: { kind: 'identities', options: identityOptions(state) },
    placement: 'setting',
    group: 'primary',
  }),
  read: readIdentities,
  encode: (value, state) => {
    const wanted = new Set(value as Identities);
    const current = new Set(readIdentities(state));
    const op = (id: string, request_action: number): FeederWrite => ({
      to: 'tag',
      tag: { tag_id: Number(id), request_action },
    });
    return [
      ...[...wanted]
        .filter((id) => !current.has(id))
        .map((id) => op(id, TagRequestAction.ASSIGN)),
      ...[...current]
        .filter((id) => !wanted.has(id))
        .map((id) => op(id, TagRequestAction.UNASSIGN)),
    ];
  },
};

const learnPetDescriptor: ProcedureDescriptor = {
  key: 'learn_pet',
  label: { i18n: 'devices.controls.procedures.learn_pet.title' },
  steps: [
    {
      key: 'present',
      instruction: {
        i18n: 'devices.controls.procedures.learn_pet.steps.present',
      },
      inputs: [],
    },
  ],
  available: true,
  group: 'primary',
};

/**
 * Meet a new pet. The feeder learns a tag on its own once its button is
 * pressed, and the cloud makes a household pet for it; all this step does is
 * wait for a tag the feeder did not have, as their app does.
 */
const learnPet: ProcedureBinding<FeederWrite, FeederControlState> = {
  key: 'learn_pet',
  descriptor: () => learnPetDescriptor,
  encode: (step, _inputs, { tags }) =>
    step === 'present'
      ? [{ to: 'learn', before: tags.map((tag) => tag.id) }]
      : [],
};

type TareSide = (typeof KNOWN_ACTIONS)['tare']['side'][number];

const TARE_TYPE: Record<TareSide, number> = {
  left: FeederTareType.LEFT,
  right: FeederTareType.RIGHT,
  both: FeederTareType.BOTH,
};

/**
 * Zero the scale. A split tray picks a side, as their app's zero sheet
 * offers; a single bowl has nothing to pick and is zeroed as the left one,
 * which is what their app sends for it.
 */
const tare: ActionBinding<FeederWrite, FeederControlState> = {
  key: 'tare',
  descriptor: ({ control }): ActionDescriptor => {
    const layout = layoutOf(control?.bowls?.type);
    return {
      key: 'tare',
      label: { i18n: 'devices.controls.actions.tare' },
      args:
        layout === 'split'
          ? {
              side: {
                kind: 'enum',
                options: KNOWN_ACTIONS.tare.side.map((side) => ({
                  value: side,
                  label: { i18n: `devices.controls.args.tare.side.${side}` },
                })),
              },
            }
          : {},
      confirm: false,
      available: layout !== null,
      group: 'primary',
    };
  },
  encode: (args) => {
    const side = KNOWN_ACTIONS.tare.side.find((name) => name === args.side);
    return [
      {
        to: 'cloud',
        control: { tare: side ? TARE_TYPE[side] : FeederTareType.LEFT },
      },
    ];
  },
};

/**
 * Whether a write asks the feeder to do something rather than hold a value.
 * The cloud answering "no change" to one means it did nothing, which their
 * app reports as a failed zero (usually a closed lid); to a setting it means
 * the value was already there.
 */
const isCommand = (control: SurePetControlWrite): boolean =>
  control.tare !== undefined;

/**
 * How a write is confirmed. A tag write leaves no control document to read
 * back, so it is only ever followed by request; a learn waits on the tags.
 */
type FollowUp =
  | { kind: 'request'; id: string; control: SurePetControlWrite }
  | { kind: 'readback'; control: SurePetControlWrite }
  | { kind: 'learn'; before: number[] };

/** A tag write's reply, as a follow-up or a settlement. */
function acceptTag(
  request: SurePetControlRequest | null,
): Acceptance<FollowUp> {
  if (request?.request_id == null) {
    return {
      status: 'failed',
      reason: 'timeout',
      message: 'the cloud queued no request to follow',
    };
  }
  return (
    settlementOf(requestStatus(request), {}) ?? {
      status: 'pending',
      ref: { kind: 'request', id: String(request.request_id), control: {} },
    }
  );
}

/**
 * Whether the device's control document now holds everything a write set:
 * every value the write carries, compared field by field, so fields the
 * cloud adds of its own do not count against it.
 */
function holds(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => holds(actual[index], item))
    );
  }
  if (typeof expected === 'object' && expected !== null) {
    return (
      typeof actual === 'object' &&
      actual !== null &&
      Object.entries(expected).every(([key, value]) =>
        holds((actual as Record<string, unknown>)[key], value),
      )
    );
  }
  return actual === expected;
}

const requestStatus = (request: SurePetControlRequest): number | undefined =>
  request.status_id ?? request.status ?? undefined;

/**
 * A request's status as a settlement, or undefined while it is pending. Only
 * a status that says so counts as applied; a missing or unfamiliar one is
 * followed like a pending request until it leaves the queue or times out.
 */
function settlementOf(
  status: number | undefined,
  control: SurePetControlWrite,
): Settlement | undefined {
  switch (status) {
    case ControlRequestStatus.SUCCESS:
      return { status: 'applied' };
    case ControlRequestStatus.NO_CHANGE:
      return isCommand(control)
        ? {
            status: 'failed',
            reason: 'rejected',
            message: 'the feeder reported no change',
          }
        : { status: 'applied' };
    case ControlRequestStatus.DEVICE_TIMEOUT:
      return { status: 'failed', reason: 'timeout' };
    case ControlRequestStatus.SERVER_ERROR:
    case ControlRequestStatus.DEVICE_ERROR:
      return { status: 'failed', reason: 'rejected' };
    default:
      return undefined;
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
    learnTimeoutMs: SUREPET_LEARN_TIMEOUT_MS,
  },
): ControlSurface {
  /** Resolves once the feeder lists a tag it did not have, or never. */
  const learned = (before: Set<number>) => async () => {
    const tags = await writer.tags();
    return tags.some((tag) => !before.has(tag.id))
      ? { status: 'applied' as const }
      : undefined;
  };

  return composeControlSurface<FeederWrite, FeederControlState, FollowUp>({
    state,
    settings: [lidCloseDelay, bowlsSetting(writer), petsSetting],
    actions: [tare],
    procedures: [learnPet],
    channel: {
      async submit(write): Promise<Acceptance<FollowUp>> {
        if (write.to === 'local') {
          await writer.saveFoodCompartments(write.foodCompartments);
          return { status: 'applied' };
        }
        if (write.to === 'learn') {
          return {
            status: 'pending',
            ref: { kind: 'learn', before: write.before },
          };
        }
        if (write.to === 'tag') {
          const acceptance = acceptTag(
            (await writer.putTag(write.tag)).request,
          );
          if (acceptance.status === 'applied') {
            await writer.refresh().catch(() => {});
          }
          return acceptance;
        }
        const { request } = await writer.put(write.control);
        // A bowls change can come back without a queued request; their app
        // reads it optionally there and reloads the device instead. A command
        // leaves nothing in the control document to read back.
        if (request?.request_id == null) {
          if (isCommand(write.control)) {
            return {
              status: 'failed',
              reason: 'timeout',
              message: 'the cloud queued no request to follow',
            };
          }
          return {
            status: 'pending',
            ref: { kind: 'readback', control: write.control },
          };
        }
        const settlement = settlementOf(requestStatus(request), write.control);
        if (settlement === undefined) {
          return {
            status: 'pending',
            ref: {
              kind: 'request',
              id: String(request.request_id),
              control: write.control,
            },
          };
        }
        await writer.refresh().catch(() => {});
        return settlement;
      },
    },
    confirmer: {
      async settle(followUp, signal) {
        if (followUp.kind === 'learn') {
          const settlement = await pollUntil(
            learned(new Set(followUp.before)),
            {
              intervalMs: timing.intervalMs,
              timeoutMs: timing.learnTimeoutMs,
              signal,
            },
          );
          await writer.refresh().catch(() => {});
          return (
            settlement ?? {
              status: 'failed',
              reason: 'timeout',
              message: 'the feeder met no new tag',
            }
          );
        }
        const settlement = await pollUntil(
          followUp.kind === 'request'
            ? async () => {
                const requests = await writer.status();
                const request = requests.find(
                  (candidate) => String(candidate.request_id) === followUp.id,
                );
                // Gone from the queue means the cloud is done with it; their
                // app reloads the device at that point, and so does this.
                return request
                  ? settlementOf(requestStatus(request), followUp.control)
                  : { status: 'applied' as const };
              }
            : async () => {
                await writer.refresh();
                return holds(state().control, followUp.control)
                  ? { status: 'applied' as const }
                  : undefined;
              },
          { ...timing, signal },
        );
        await writer.refresh().catch(() => {});
        return settlement ?? { status: 'failed', reason: 'timeout' };
      },
    },
  });
}
