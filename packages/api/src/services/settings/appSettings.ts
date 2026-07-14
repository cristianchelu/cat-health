import type { Kysely } from 'kysely';
import {
  createDefaultSettingsResponse,
  DATE_FORMAT_KEY,
  DEFAULT_DATE_FORMAT,
  DEFAULT_FIRST_WEEKDAY,
  DEFAULT_LANGUAGE,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES,
  FIRST_WEEKDAY_KEY,
  LANGUAGE_KEY,
  NUMBER_FORMAT_KEY,
  TIME_FORMAT_KEY,
  TIMEZONE_KEY,
  TRACKING_GAP_THRESHOLD_MINUTES_KEY,
  type DateFormatDTO,
  type FirstWeekdayDTO,
  type GetSettingsResponseDTO,
  type NumberFormatDTO,
  type PatchSettingsRequestDTO,
  type SupportedLanguageDTO,
  type TimeFormatDTO,
} from 'shared';
import type { Database } from '../../database/index.ts';

const SUPPORTED_LANGUAGES = new Set<SupportedLanguageDTO>(['en', 'ro']);
const TIME_FORMATS = new Set<TimeFormatDTO>([
  'language',
  'system',
  'h12',
  'h24',
]);
const DATE_FORMATS = new Set<DateFormatDTO>([
  'language',
  'system',
  'DMY',
  'MDY',
  'YMD',
]);
const FIRST_WEEKDAYS = new Set<FirstWeekdayDTO>([
  'language',
  'monday',
  'sunday',
]);
const NUMBER_FORMATS = new Set<NumberFormatDTO>([
  'language',
  'system',
  'comma_decimal',
  'decimal_comma',
]);

export async function getAppSetting(
  db: Kysely<Database>,
  key: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('app_setting')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();

  return row?.value ?? null;
}

export async function setAppSetting(
  db: Kysely<Database>,
  key: string,
  value: string,
): Promise<void> {
  await db
    .insertInto('app_setting')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute();
}

export async function deleteAppSetting(
  db: Kysely<Database>,
  key: string,
): Promise<void> {
  await db.deleteFrom('app_setting').where('key', '=', key).execute();
}

export async function getTrackingGapThresholdMinutes(
  db: Kysely<Database>,
): Promise<number> {
  const raw = await getAppSetting(db, TRACKING_GAP_THRESHOLD_MINUTES_KEY);
  if (raw == null) {
    return DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TRACKING_GAP_THRESHOLD_MINUTES;
  }

  return parsed;
}

export async function setTrackingGapThresholdMinutes(
  db: Kysely<Database>,
  minutes: number,
): Promise<void> {
  await setAppSetting(db, TRACKING_GAP_THRESHOLD_MINUTES_KEY, String(minutes));
}

export async function getLanguage(
  db: Kysely<Database>,
): Promise<SupportedLanguageDTO> {
  const raw = await getAppSetting(db, LANGUAGE_KEY);
  if (raw != null && SUPPORTED_LANGUAGES.has(raw as SupportedLanguageDTO)) {
    return raw as SupportedLanguageDTO;
  }
  return DEFAULT_LANGUAGE;
}

export async function setLanguage(
  db: Kysely<Database>,
  language: SupportedLanguageDTO,
): Promise<void> {
  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new Error(`Invalid language: ${language}`);
  }
  await setAppSetting(db, LANGUAGE_KEY, language);
}

export async function getTimezone(
  db: Kysely<Database>,
): Promise<string | null> {
  const raw = await getAppSetting(db, TIMEZONE_KEY);
  if (raw == null || raw === '') {
    return null;
  }
  if (!isValidTimezone(raw)) {
    await deleteAppSetting(db, TIMEZONE_KEY);
    return null;
  }
  return raw;
}

export async function setTimezone(
  db: Kysely<Database>,
  timezone: string | null,
): Promise<void> {
  if (timezone === null || timezone === '') {
    await deleteAppSetting(db, TIMEZONE_KEY);
    return;
  }
  if (!isValidTimezone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  await setAppSetting(db, TIMEZONE_KEY, timezone);
}

export async function getTimeFormat(
  db: Kysely<Database>,
): Promise<TimeFormatDTO> {
  const raw = await getAppSetting(db, TIME_FORMAT_KEY);
  if (raw != null && TIME_FORMATS.has(raw as TimeFormatDTO)) {
    return raw as TimeFormatDTO;
  }
  return DEFAULT_TIME_FORMAT;
}

export async function setTimeFormat(
  db: Kysely<Database>,
  timeFormat: TimeFormatDTO,
): Promise<void> {
  if (!TIME_FORMATS.has(timeFormat)) {
    throw new Error(`Invalid time format: ${timeFormat}`);
  }
  await setAppSetting(db, TIME_FORMAT_KEY, timeFormat);
}

export async function getDateFormat(
  db: Kysely<Database>,
): Promise<DateFormatDTO> {
  const raw = await getAppSetting(db, DATE_FORMAT_KEY);
  if (raw != null && DATE_FORMATS.has(raw as DateFormatDTO)) {
    return raw as DateFormatDTO;
  }
  return DEFAULT_DATE_FORMAT;
}

export async function setDateFormat(
  db: Kysely<Database>,
  dateFormat: DateFormatDTO,
): Promise<void> {
  if (!DATE_FORMATS.has(dateFormat)) {
    throw new Error(`Invalid date format: ${dateFormat}`);
  }
  await setAppSetting(db, DATE_FORMAT_KEY, dateFormat);
}

export async function getFirstWeekday(
  db: Kysely<Database>,
): Promise<FirstWeekdayDTO> {
  const raw = await getAppSetting(db, FIRST_WEEKDAY_KEY);
  if (raw != null && FIRST_WEEKDAYS.has(raw as FirstWeekdayDTO)) {
    return raw as FirstWeekdayDTO;
  }
  return DEFAULT_FIRST_WEEKDAY;
}

export async function setFirstWeekday(
  db: Kysely<Database>,
  firstWeekday: FirstWeekdayDTO,
): Promise<void> {
  if (!FIRST_WEEKDAYS.has(firstWeekday)) {
    throw new Error(`Invalid first weekday: ${firstWeekday}`);
  }
  await setAppSetting(db, FIRST_WEEKDAY_KEY, firstWeekday);
}

export async function getNumberFormat(
  db: Kysely<Database>,
): Promise<NumberFormatDTO> {
  const raw = await getAppSetting(db, NUMBER_FORMAT_KEY);
  if (raw != null && NUMBER_FORMATS.has(raw as NumberFormatDTO)) {
    return raw as NumberFormatDTO;
  }
  return DEFAULT_NUMBER_FORMAT;
}

export async function setNumberFormat(
  db: Kysely<Database>,
  numberFormat: NumberFormatDTO,
): Promise<void> {
  if (!NUMBER_FORMATS.has(numberFormat)) {
    throw new Error(`Invalid number format: ${numberFormat}`);
  }
  await setAppSetting(db, NUMBER_FORMAT_KEY, numberFormat);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export async function getAllSettings(
  db: Kysely<Database>,
): Promise<GetSettingsResponseDTO> {
  const [
    tracking_gap_threshold_minutes,
    language,
    timezone,
    time_format,
    date_format,
    first_weekday,
    number_format,
  ] = await Promise.all([
    getTrackingGapThresholdMinutes(db),
    getLanguage(db),
    getTimezone(db),
    getTimeFormat(db),
    getDateFormat(db),
    getFirstWeekday(db),
    getNumberFormat(db),
  ]);

  return {
    tracking_gap_threshold_minutes,
    language,
    timezone,
    time_format,
    date_format,
    first_weekday,
    number_format,
  };
}

function normalizeTimezonePatch(
  timezone: PatchSettingsRequestDTO['timezone'],
): string | null | undefined {
  if (timezone === undefined) {
    return undefined;
  }
  if (timezone === null || timezone === '') {
    return null;
  }
  return timezone;
}

export async function applySettingsPatch(
  db: Kysely<Database>,
  patch: PatchSettingsRequestDTO,
): Promise<GetSettingsResponseDTO> {
  const timezone = normalizeTimezonePatch(patch.timezone);

  if (timezone !== undefined && timezone !== null) {
    if (!isValidTimezone(timezone)) {
      throw new Error(`Invalid timezone: ${timezone}`);
    }
  }

  await db.transaction().execute(async (trx) => {
    if (patch.tracking_gap_threshold_minutes !== undefined) {
      await setTrackingGapThresholdMinutes(
        trx,
        patch.tracking_gap_threshold_minutes,
      );
    }

    if (patch.language !== undefined) {
      await setLanguage(trx, patch.language);
    }

    if (timezone !== undefined) {
      await setTimezone(trx, timezone);
    }

    if (patch.time_format !== undefined) {
      await setTimeFormat(trx, patch.time_format);
    }

    if (patch.date_format !== undefined) {
      await setDateFormat(trx, patch.date_format);
    }

    if (patch.first_weekday !== undefined) {
      await setFirstWeekday(trx, patch.first_weekday);
    }

    if (patch.number_format !== undefined) {
      await setNumberFormat(trx, patch.number_format);
    }
  });

  return await getAllSettings(db);
}
