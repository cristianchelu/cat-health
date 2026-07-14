import { formatDistanceToNow } from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import type { Locale } from 'date-fns';

/**
 * Maps i18next-style language tags to date-fns locales used by formatDistanceToNow and format().
 */
export function resolveDateFnsLocale(language: string | undefined): Locale {
  const base = (language ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  if (base === 'ro') {
    return ro;
  }
  return enUS;
}

/**
 * Parses API / ESPHome timestamp payloads into a Date.
 * - Numeric ESPHome timestamp sensors use **seconds** since epoch (values below ~1e12 are treated as seconds).
 * - Millisecond epochs and ISO strings are accepted as-is.
 */
export function coerceEpochDate(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'bigint') {
    return coerceEpochDate(Number(value));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.abs(value) >= 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '') {
      return null;
    }
    if (/^-?\d+(?:\.\d+)?$/.test(s)) {
      return coerceEpochDate(Number(s));
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Reject epoch-garbage (e.g. seconds stored as ms → 1970) for device presence. */
const MIN_MEANINGFUL_LAST_SEEN_MS = Date.UTC(2000, 0, 1);

export function isMeaningfulLastSeen(
  date: Date | null | undefined,
): date is Date {
  return date != null && date.getTime() >= MIN_MEANINGFUL_LAST_SEEN_MS;
}

export interface FormatRelativeTimeAgoOptions {
  locale?: Locale;
  /** Reference instant (defaults to now). */
  baseDate?: Date;
  addSuffix?: boolean;
}

/**
 * “2 hours ago” / “in 5 minutes” relative to `baseDate`, localized via date-fns.
 */
export function formatRelativeTimeAgo(
  input: Date | number | string,
  options?: FormatRelativeTimeAgoOptions,
): string | null {
  const date = input instanceof Date ? input : coerceEpochDate(input);
  if (!date) {
    return null;
  }
  return formatDistanceToNow(date, {
    locale: options?.locale,
    addSuffix: options?.addSuffix ?? true,
    includeSeconds: false,
  });
}
