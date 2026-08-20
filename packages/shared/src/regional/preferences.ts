import type {
  DateFormatDTO,
  FirstWeekdayDTO,
  GetSettingsResponseDTO,
  NumberFormatDTO,
  SupportedLanguageDTO,
  TimeFormatDTO,
} from '../schemas/api/settings.ts';

export type SupportedLanguage = SupportedLanguageDTO;
export type TimeFormat = TimeFormatDTO;
export type DateFormat = DateFormatDTO;
export type FirstWeekday = FirstWeekdayDTO;
export type NumberFormat = NumberFormatDTO;

export type WeekStartsOn = 0 | 1;

export interface ResolvedRegionalPreferences {
  language: SupportedLanguage;
  intlLanguageTag: string;
  timezone: string;
  timeFormat: TimeFormat;
  dateFormat: DateFormat;
  firstWeekday: FirstWeekday;
  numberFormat: NumberFormat;
  use12HourClock: boolean;
  weekStartsOn: WeekStartsOn;
}

const INTL_LANGUAGE_TAGS: Record<SupportedLanguage, string> = {
  en: 'en-US',
  ro: 'ro-RO',
};

const WEEK_START_FALLBACK: Record<SupportedLanguage, WeekStartsOn> = {
  en: 0,
  ro: 1,
};

export function toIntlLanguageTag(language: SupportedLanguage): string {
  return INTL_LANGUAGE_TAGS[language];
}

export function resolveUse12HourClock(
  timeFormat: TimeFormat,
  intlLanguageTag: string,
): boolean {
  if (timeFormat === 'h12') {
    return true;
  }
  if (timeFormat === 'h24') {
    return false;
  }

  const tag = timeFormat === 'language' ? intlLanguageTag : undefined;
  const probe = new Date('2023-01-01T22:00:00').toLocaleString(tag);
  return probe.includes('10');
}

export function resolveWeekStartsOn(
  firstWeekday: FirstWeekday,
  language: SupportedLanguage,
  intlLanguageTag: string,
): WeekStartsOn {
  if (firstWeekday === 'monday') {
    return 1;
  }
  if (firstWeekday === 'sunday') {
    return 0;
  }

  if (
    typeof Intl !== 'undefined' &&
    'Locale' in Intl &&
    'weekInfo' in Intl.Locale.prototype
  ) {
    try {
      const locale = new Intl.Locale(intlLanguageTag) as Intl.Locale & {
        weekInfo?: { firstDay?: number };
      };
      const firstDay = locale.weekInfo?.firstDay;
      if (firstDay === 1) {
        return 1;
      }
      if (firstDay === 7 || firstDay === 0) {
        return 0;
      }
    } catch {
      // fall through to static fallback
    }
  }

  return WEEK_START_FALLBACK[language];
}

export function resolveRegionalPreferences(
  settings: GetSettingsResponseDTO,
  systemTimezone: string,
): ResolvedRegionalPreferences {
  const language = settings.language;
  const intlLanguageTag = toIntlLanguageTag(language);
  const timezone = settings.timezone ?? systemTimezone;

  const use12HourClock = resolveUse12HourClock(
    settings.time_format,
    intlLanguageTag,
  );
  const weekStartsOn = resolveWeekStartsOn(
    settings.first_weekday,
    language,
    intlLanguageTag,
  );

  return {
    language,
    intlLanguageTag,
    timezone,
    timeFormat: settings.time_format,
    dateFormat: settings.date_format,
    firstWeekday: settings.first_weekday,
    numberFormat: settings.number_format,
    use12HourClock,
    weekStartsOn,
  };
}
