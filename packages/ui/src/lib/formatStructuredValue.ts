/**
 * Compact display for arbitrary device/API payload fragments (e.g. ESPHome Tier B entities).
 */
import { formatSensorNumericDisplay } from '@/lib/formatSensorNumericDisplay';

export interface FormattedStructuredValue {
  summary: string;
  /** Full serialized payload for expandable “raw” UI */
  raw?: string;
}

export interface FormatStructuredValueOptions {
  formatGroupedNumber?: (value: number) => string;
}

const SUMMARY_MAX_LEN = 96;

export function formatStructuredValue(
  value: unknown,
  options?: FormatStructuredValueOptions,
): FormattedStructuredValue {
  if (value === undefined || value === null) {
    return { summary: '—' };
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return { summary: String(value) };
  }

  if (typeof value === 'number') {
    return {
      summary: formatSensorNumericDisplay(value, {
        formatGroupedNumber: options?.formatGroupedNumber,
      }),
    };
  }

  if (typeof value === 'bigint') {
    return { summary: String(value) };
  }

  try {
    const raw = JSON.stringify(value, null, 2);
    const summary =
      raw.length <= SUMMARY_MAX_LEN ? raw : `${raw.slice(0, SUMMARY_MAX_LEN)}…`;
    return { summary, raw };
  } catch {
    return { summary: String(value) };
  }
}
