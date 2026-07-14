import { enUS, ro } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import type { DateFormat, ResolvedRegionalPreferences } from 'shared';

export type DateDisplayStyle = 'short' | 'medium' | 'long';

export interface FormatNumberOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  maximumSignificantDigits?: number;
}

const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function isExplicitDateFormat(
  dateFormat: DateFormat,
): dateFormat is 'DMY' | 'MDY' | 'YMD' {
  return dateFormat === 'DMY' || dateFormat === 'MDY' || dateFormat === 'YMD';
}

function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveNumberFormatLocale(
  prefs: ResolvedRegionalPreferences,
): string | undefined {
  switch (prefs.numberFormat) {
    case 'comma_decimal':
      return 'en-US';
    case 'decimal_comma':
      return 'de';
    case 'system':
      return undefined;
    default:
      return prefs.intlLanguageTag;
  }
}

function resolveTimeFormatLocale(
  prefs: ResolvedRegionalPreferences,
): string | undefined {
  if (prefs.timeFormat === 'system') {
    return undefined;
  }
  return prefs.intlLanguageTag;
}

function resolveDateFormatLocale(
  prefs: ResolvedRegionalPreferences,
): string | undefined {
  if (prefs.dateFormat === 'system') {
    return undefined;
  }
  return prefs.intlLanguageTag;
}

function getDateTimeFormatter(
  cacheKey: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${cacheKey}:${locale ?? 'system'}:${JSON.stringify(options)}`;
  const cached = dateTimeFormatCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat(locale, options);
  dateTimeFormatCache.set(key, formatter);
  return formatter;
}

function getNumberFormatter(
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale ?? 'system'}:${JSON.stringify(options)}`;
  const cached = numberFormatCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.NumberFormat(locale, options);
  numberFormatCache.set(key, formatter);
  return formatter;
}

function reorderDateParts(
  parts: Intl.DateTimeFormatPart[],
  order: 'DMY' | 'MDY' | 'YMD',
): string {
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = lookup.day ?? '';
  const month = lookup.month ?? '';
  const year = lookup.year ?? '';

  switch (order) {
    case 'DMY':
      return `${day}/${month}/${year}`;
    case 'MDY':
      return `${month}/${day}/${year}`;
    case 'YMD':
      return `${year}-${month}-${day}`;
    default:
      return parts.map((part) => part.value).join('');
  }
}

export function formatTime(
  date: Date,
  prefs: ResolvedRegionalPreferences,
): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter = getDateTimeFormatter(
    'time',
    resolveTimeFormatLocale(prefs),
    {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: prefs.use12HourClock ? 'h12' : 'h23',
      timeZone: prefs.timezone,
    },
  );
  return formatter.format(date);
}

export function formatDate(
  date: Date,
  prefs: ResolvedRegionalPreferences,
  style: DateDisplayStyle = 'medium',
): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (isExplicitDateFormat(prefs.dateFormat)) {
    return formatDateNumeric(date, prefs);
  }

  const formatter = getDateTimeFormatter(
    `date-${style}`,
    resolveDateFormatLocale(prefs),
    {
      dateStyle: style,
      timeZone: prefs.timezone,
    },
  );
  return formatter.format(date);
}

export function formatDateNumeric(
  date: Date,
  prefs: ResolvedRegionalPreferences,
): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (prefs.dateFormat === 'language' || prefs.dateFormat === 'system') {
    const formatter = getDateTimeFormatter(
      'date-numeric-auto',
      resolveDateFormatLocale(prefs),
      {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: prefs.timezone,
      },
    );
    return formatter.format(date);
  }

  const formatter = getDateTimeFormatter(
    `date-numeric-${prefs.dateFormat}`,
    prefs.intlLanguageTag,
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: prefs.timezone,
    },
  );
  return reorderDateParts(formatter.formatToParts(date), prefs.dateFormat);
}

export function formatDateTime(
  date: Date,
  prefs: ResolvedRegionalPreferences,
): string {
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (isExplicitDateFormat(prefs.dateFormat)) {
    return `${formatDateNumeric(date, prefs)} ${formatTime(date, prefs)}`;
  }

  const formatter = getDateTimeFormatter(
    'datetime',
    resolveDateFormatLocale(prefs),
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      hourCycle: prefs.use12HourClock ? 'h12' : 'h23',
      timeZone: prefs.timezone,
    },
  );
  return formatter.format(date);
}

export function formatNumber(
  value: number,
  prefs: ResolvedRegionalPreferences,
  options: FormatNumberOptions = {},
): string {
  const formatter = getNumberFormatter(resolveNumberFormatLocale(prefs), {
    maximumFractionDigits: options.maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits,
    maximumSignificantDigits: options.maximumSignificantDigits,
  });
  return formatter.format(value);
}

export function getDateFnsLocale(prefs: ResolvedRegionalPreferences): Locale {
  const base = prefs.language === 'ro' ? ro : enUS;
  return {
    ...base,
    options: {
      ...base.options,
      weekStartsOn: prefs.weekStartsOn,
    },
  };
}

export function getWeekOptions(prefs: ResolvedRegionalPreferences) {
  return { weekStartsOn: prefs.weekStartsOn as 0 | 1 };
}

export function resolveSystemTimezone(): string {
  return getSystemTimezone();
}

export function clearRegionalFormatCaches(): void {
  dateTimeFormatCache.clear();
  numberFormatCache.clear();
}

export function getRegionalFormatCacheSizesForTests(): {
  dateTime: number;
  number: number;
} {
  return {
    dateTime: dateTimeFormatCache.size,
    number: numberFormatCache.size,
  };
}
