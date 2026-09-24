/** SurePetcare cloud API constants (ported from py-surepetcare). */

import type { RssiLadder } from '../../signalStrength.ts';

/**
 * SurePetcare's own dBm-to-bars ladder, read off the `SpDeviceConnection`
 * icon in their web app (reverse-engineered; not official API docs).
 *
 * Not the WiFi ladder, because `device_rssi` measures the feeder's link to the
 * hub over SurePetcare's own radio, and their scale runs 19 dB tighter at the
 * top. `-Infinity` is theirs too: their weakest bin and their default both
 * yield one bar, so the scale has no zero state.
 *
 * Bounds are half-open here where theirs are exclusive at both ends, which
 * drops exactly -60 and -75 through to their one-bar default.
 */
export const SUREPET_RSSI_LADDER: RssiLadder = [-36, -60, -75, -Infinity];

export const SUREPET_API_BASE = 'https://app-api.production.surehub.io/api';
export const SUREPET_LOGIN_URL = `${SUREPET_API_BASE}/auth/login`;
export const SUREPET_ME_START_URL = `${SUREPET_API_BASE}/me/start`;

export const SUREPET_USER_AGENT =
  'pet-assistant https://github.com/cristianchelu/cat-health';

/**
 * SurePetcare household timeline `type` ids (reverse-engineered; not official API docs).
 * @see https://github.com/DiniFarb/surepetcare — message events section
 */
export const TimelineEventType = {
  /** Pet used a flap/door (in, out, or looked through). Payload: `movements`, `pets`. */
  PET_MOVEMENT: 0,
  /** Device battery below threshold. Payload: `devices`. */
  BATTERY_LOW: 1,
  /** Pet tag linked to a device (e.g. feeder assignment). Payload: `pets`, `tags`, `devices`. */
  TAG_ATTACHED: 2,
  /** Device linked or registered to the household. Payload: `devices`; `data.device_id`. */
  DEVICE_LINKED: 3,
  /** Unknown door/flap movement. Payload: `movements`. */
  UNKNOWN_DOOR_MOVEMENT: 7,
  /** Pet-related household event (e.g. profile). Payload: `pets`. */
  PET_PROFILE: 13,
  /**
   * Bowl filled by a person (not a pet meal). Payload: `weights`, `data.weight`.
   * The added grams are the POSITIVE `frames[].change`; `current_weight` is the
   * bowl level it reached.
   */
  BOWL_FILLED: 21,
  /** Pet finished eating from a feeder. Payload: `weights` (negative frame `change`), `pets`, `tags`. */
  PET_HAS_EATEN: 22,
  /** Bowl target weights or food-type settings changed. Payload: `devices`; `data.target`, `data.food_type`. */
  BOWL_SETTINGS_CHANGED: 23,
  /** Feeder bowls tared / reset. Payload: `weights`; `data.tare_type`. */
  FEEDER_RESET: 24,
  /** Feeder training or lid mode transition. Payload: `devices`; `data.mode`, `data.last_mode`. */
  FEEDER_MODE_CHANGED: 28,
  /** Pet drank from a Felaqua. Payload: `weights`, `pets`. */
  PET_DRANK: 29,
  /** Felaqua refilled. Payload: `weights`, `devices`. */
  FELAQUA_FILLED: 30,
  /** Felaqua fresh-water reminder. Payload: `devices`. */
  FELAQUA_WATER_REMINDER: 32,
  /** Unidentified drinker at a Felaqua. Payload: `weights`, `devices`. */
  FELAQUA_UNKNOWN_DRINKER: 34,
} as const;

export type TimelineEventTypeId =
  (typeof TimelineEventType)[keyof typeof TimelineEventType];

/**
 * Why a weight record exists — the `context` on every `weights[]` entry.
 * Read off their app bundle's `WeightContext` enum (reverse-engineered).
 *
 * This is a finer instrument than the timeline entry `type`: it separates the
 * pet we recognised from the one we did not (`IntruderClosed`) and from the
 * reading the feeder itself distrusts (`DubiousClosed`), which the entry type
 * lumps together. Attribution should follow this, not the type.
 */
export const WeightContext = {
  /** A recognised pet opened the lid; the visit has not closed yet. */
  PET_OPENED: 0,
  /** A recognised pet's visit closed — the meal, with negative `change`. */
  PET_CLOSED: 1,
  /** An unrecognised animal's visit closed. Ours only by luck. */
  INTRUDER_CLOSED: 2,
  /** The feeder distrusts its own reading for this visit. */
  DUBIOUS_CLOSED: 3,
  /** A person opened the lid. */
  USER_OPENED: 4,
  /** A person closed the lid — a fill or a top-up, with positive `change`. */
  USER_CLOSED: 5,
  /** A person tared the bowls. Not a serving; the weights are an artefact. */
  USER_ZEROED: 6,
} as const;

export type WeightContextId =
  (typeof WeightContext)[keyof typeof WeightContext];

/**
 * py-surepetcare `TareType` — which bowls a `FEEDER_RESET` zeroed.
 * Their app calls this `DeviceFeederTareType`.
 */
export const FeederTareType = {
  UNKNOWN: 0,
  LEFT: 1,
  RIGHT: 2,
  BOTH: 3,
} as const;

/**
 * How their app words a fill, kept here because it explains readings that look
 * like ours disagreeing with theirs when they do not.
 *
 * - "topped up" vs "filled" is `current_weight - change > 1` — whether the bowl
 *   still held food. We store the levels instead and let the reader decide.
 * - the grams are replaced by the phrase "portion size" when
 *   `Math.abs(change - target) <= 1`. That is deliberate on their side, not a
 *   missing number: a fill landing on its target prints no weight at all.
 *
 * Either way `frames[].change` carries the grams, so neither wording affects
 * what we record.
 */
export const SUREPET_PORTION_WORDING_TOLERANCE_G = 1;

/** SurePetcare timeline consumption substance types (py-surepetcare `SubstanceType`). */
export const SubstanceType = {
  WATER: 1,
  FOOD: 2,
} as const;

export type SubstanceTypeId =
  (typeof SubstanceType)[keyof typeof SubstanceType];

/**
 * py-surepetcare `BowlType` — feeder bowl layout. Their own app only knows
 * `Single = 1` and `Half = 4`; `NOT_DETERMINED` is py-surepetcare's and has
 * never been observed on the wire here.
 */
export const BowlType = {
  LARGE: 1,
  TWO_SMALL: 4,
  NOT_DETERMINED: 5,
} as const;

/** py-surepetcare `BowlPosition`. */
export const BowlPosition = {
  ONE: 0,
  TWO: 1,
  BOTH: 2,
} as const;

/** py-surepetcare `FoodType` for bowl settings. */
export const FoodType = {
  NOT_SET: 0,
  WET: 1,
  DRY: 2,
  BOTH: 3,
} as const;

/** py-surepetcare `FeederTrainingMode`. */
export const FeederTrainingMode = {
  DISABLED: 0,
  STEP_1: 1,
  STEP_2: 2,
  STEP_3: 3,
  STEP_4: 4,
} as const;

/** py-surepetcare `CloseDelay` — lid close delay in seconds. */
export const CloseDelay = {
  FASTER: 0,
  NORMAL: 4,
  SLOWER: 20,
} as const;

// TODO: Move to individual device
export const SUREPET_BATTERY_VOLTAGE_FULL = 1.6;
// TODO: Move to individual device
export const SUREPET_BATTERY_VOLTAGE_LOW = 1.2;
// TODO: Move to individual device
export const SUREPET_BATTERY_VOLTAGE_DIFF =
  SUREPET_BATTERY_VOLTAGE_FULL - SUREPET_BATTERY_VOLTAGE_LOW;

/** Minimum valid token length heuristic from surepy. */
export const SUREPET_TOKEN_MIN_LENGTH = 320;
export const SUREPET_TOKEN_MAX_LENGTH = 448;

export const SUREPET_TIMELINE_POLL_INTERVAL_MS = 3 * 60 * 1000;
export const SUREPET_DEVICE_STATE_POLL_INTERVAL_MS = 60 * 1000;

/** Pause between paginated timeline fetches during backfill (one-time, not polling). */
export const SUREPET_TIMELINE_PAGE_DELAY_MS = 1000;

export const SUREPET_REQUEST_TIMEOUT_MS = 45_000;

export function buildSurePetHeaders(options: {
  token?: string;
  deviceId: string;
}): Record<string, string> {
  const { token, deviceId } = options;
  const headers: Record<string, string> = {
    Host: 'app-api.production.surehub.io',
    Connection: 'keep-alive',
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en',
    'User-Agent': SUREPET_USER_AGENT,
    'X-Requested-With': 'com.sureflap.surepetcare',
    'X-Device-Id': deviceId,
    Origin: 'https://www.surepetcare.io',
    Referer: 'https://www.surepetcare.io/',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-fetch-dest': 'empty',
    'sec-ch-ua':
      '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'spc-client-type': 'react',
    dnt: '1',
    priority: 'u=1, i',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export function tokenSeemsValid(token: string | undefined): boolean {
  if (!token) return false;
  return (
    token.length > SUREPET_TOKEN_MIN_LENGTH &&
    token.length < SUREPET_TOKEN_MAX_LENGTH &&
    /^[\x20-\x7E]+$/.test(token)
  );
}

export function computeBatteryPercent(
  batteryVoltage: number | undefined,
): number | undefined {
  if (batteryVoltage == null || !Number.isFinite(batteryVoltage)) {
    return undefined;
  }
  const perCell = batteryVoltage / 4;
  const voltageDiff = perCell - SUREPET_BATTERY_VOLTAGE_LOW;
  const percent = Math.round(
    (voltageDiff / SUREPET_BATTERY_VOLTAGE_DIFF) * 100,
  );
  return Math.max(0, Math.min(100, percent));
}
