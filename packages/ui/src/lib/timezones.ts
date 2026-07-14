import type { SelectOption } from '@/components/ui/form/Select';

const SYSTEM_TIMEZONE_VALUE = '';

export function formatTimezoneLabel(
  timezone: string,
  referenceDate = new Date(),
): string {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(referenceDate);
    const offset =
      parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
    return offset ? `${timezone} (${offset})` : timezone;
  } catch {
    return timezone;
  }
}

export function getTimezoneSelectOptions(): SelectOption[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [Intl.DateTimeFormat().resolvedOptions().timeZone];

  const referenceDate = new Date();
  const withOffsets = zones.map((timezone) => {
    const offsetMinutes = getTimezoneOffsetMinutes(timezone, referenceDate);
    return {
      timezone,
      offsetMinutes,
      label: formatTimezoneLabel(timezone, referenceDate),
    };
  });

  withOffsets.sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    return a.timezone.localeCompare(b.timezone);
  });

  return [
    { value: SYSTEM_TIMEZONE_VALUE, label: 'system' },
    ...withOffsets.map((entry) => ({
      value: entry.timezone,
      label: entry.label,
    })),
  ];
}

export function timezoneSelectValueToApi(value: string): string | null {
  return value === SYSTEM_TIMEZONE_VALUE ? null : value;
}

export function timezoneApiValueToSelect(timezone: string | null): string {
  return timezone ?? SYSTEM_TIMEZONE_VALUE;
}

function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value;
  if (!tzName) {
    return 0;
  }

  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? '0', 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  return sign * (hours * 60 + minutes);
}
