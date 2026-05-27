/** SurePetcare cloud API constants (ported from py-surepetcare). */

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
  /** Bowl filled by a person (not a pet meal). Payload: `weights`, `data.weight`. */
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

/** SurePetcare timeline consumption substance types (py-surepetcare `SubstanceType`). */
export const SubstanceType = {
  WATER: 1,
  FOOD: 2,
} as const;

export type SubstanceTypeId = (typeof SubstanceType)[keyof typeof SubstanceType];

/** py-surepetcare `BowlType` — feeder bowl layout. */
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
