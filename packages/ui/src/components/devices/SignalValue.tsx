import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SignalValue as SignalValueData } from 'shared';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import {
  coerceEpochDate,
  formatRelativeTimeAgo,
} from '@/lib/formatRelativeTime';
import { daysValueParts } from '@/lib/daysValueParts';

interface SignalValueProps {
  value: SignalValueData;
  /** Render as an em dash regardless, for a device whose readings are stale. */
  stale?: boolean;
}

/**
 * Renders a signal's typed value.
 *
 * The API sends the reading and its kind, never a formatted string, so numbers
 * and times land here to be formatted against the viewer's regional
 * preferences and language.
 */
export const SignalValue: React.FC<SignalValueProps> = ({ value, stale }) => {
  const { t } = useTranslation();
  const { formatNumber, dateFnsLocale } = useFormatters();

  if (stale || value.kind === 'none') {
    return <>{'—'}</>;
  }

  switch (value.kind) {
    case 'percent':
      return <>{t('devices.signals.units.percent', { value: value.value })}</>;

    case 'number': {
      const formatted = formatNumber(value.value, {
        minimumFractionDigits: value.decimals,
        maximumFractionDigits: value.decimals,
      });
      return (
        <>
          {value.unit
            ? t('devices.signals.units.with_unit', {
                value: formatted,
                unit: value.unit,
              })
            : formatted}
        </>
      );
    }

    case 'days': {
      /* Overdue reads as a count past due, not a negative number; sub-day
       * values read in hours. See daysValueParts. */
      const parts = daysValueParts(value.value);
      return <>{t(`devices.signals.units.${parts.key}`, { count: parts.count })}</>;
    }

    case 'timestamp': {
      const date = coerceEpochDate(value.value);
      return (
        <>
          {date
            ? formatRelativeTimeAgo(date, { locale: dateFnsLocale })
            : '—'}
        </>
      );
    }

    case 'text':
      return <>{t(value.key, value.params)}</>;
  }
};
