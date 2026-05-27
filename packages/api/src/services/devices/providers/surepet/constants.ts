/** SurePetcare cloud API constants (ported from py-surepetcare). */

export const SUREPET_API_BASE = 'https://app-api.production.surehub.io/api';
export const SUREPET_LOGIN_URL = `${SUREPET_API_BASE}/auth/login`;
export const SUREPET_ME_START_URL = `${SUREPET_API_BASE}/me/start`;

export const SUREPET_USER_AGENT =
  'pet-assistant https://github.com/cristianchelu/cat-health';

/** SurePetcare timeline consumption substance types (py-surepetcare `SubstanceType`). */
export const SubstanceType = {
  WATER: 1,
  FOOD: 2,
} as const;

export type SubstanceTypeId = (typeof SubstanceType)[keyof typeof SubstanceType];

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
