/* eslint-disable react-refresh/only-export-components -- Context provider and its consumer hooks share one boundary. */
import * as React from 'react';
import type { Locale } from 'date-fns';
import {
  resolveRegionalPreferences,
  createDefaultSettingsResponse,
  type ResolvedRegionalPreferences,
} from 'shared';
import { useSettings } from '@/hooks/queries/settingsQueries';
import i18n from '@/i18n';
import {
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatNumber,
  formatTime,
  getDateFnsLocale,
  getWeekOptions,
  resolveSystemTimezone,
  type DateDisplayStyle,
  type FormatNumberOptions,
} from '@/lib/regionalFormat';

interface Formatters {
  formatTime: (date: Date) => string;
  formatDate: (date: Date, style?: DateDisplayStyle) => string;
  formatDateNumeric: (date: Date) => string;
  formatDateTime: (date: Date) => string;
  formatNumber: (value: number, options?: FormatNumberOptions) => string;
  dateFnsLocale: Locale;
  weekOptions: { weekStartsOn: 0 | 1 };
  timezone: string;
}

const RegionalPreferencesContext =
  React.createContext<ResolvedRegionalPreferences | null>(null);
const FormattersContext = React.createContext<Formatters | null>(null);

function buildFormatters(prefs: ResolvedRegionalPreferences): Formatters {
  return {
    formatTime: (date) => formatTime(date, prefs),
    formatDate: (date, style) => formatDate(date, prefs, style),
    formatDateNumeric: (date) => formatDateNumeric(date, prefs),
    formatDateTime: (date) => formatDateTime(date, prefs),
    formatNumber: (value, options) => formatNumber(value, prefs, options),
    dateFnsLocale: getDateFnsLocale(prefs),
    weekOptions: getWeekOptions(prefs),
    timezone: prefs.timezone,
  };
}

const RegionalPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data: settings } = useSettings();
  const systemTimezone = React.useMemo(() => resolveSystemTimezone(), []);

  const prefs = React.useMemo(() => {
    if (!settings) {
      return resolveRegionalPreferences(
        createDefaultSettingsResponse(),
        systemTimezone,
      );
    }

    return resolveRegionalPreferences(settings, systemTimezone);
  }, [settings, systemTimezone]);

  const formatters = React.useMemo(() => buildFormatters(prefs), [prefs]);

  React.useEffect(() => {
    if (prefs.language !== i18n.language) {
      void i18n.changeLanguage(prefs.language);
    }
  }, [prefs.language]);

  return (
    <RegionalPreferencesContext.Provider value={prefs}>
      <FormattersContext.Provider value={formatters}>
        {children}
      </FormattersContext.Provider>
    </RegionalPreferencesContext.Provider>
  );
};

export function useRegionalPreferences(): ResolvedRegionalPreferences {
  const context = React.useContext(RegionalPreferencesContext);
  if (!context) {
    throw new Error(
      'useRegionalPreferences must be used within RegionalPreferencesProvider',
    );
  }
  return context;
}

export function useFormatters(): Formatters {
  const context = React.useContext(FormattersContext);
  if (!context) {
    throw new Error(
      'useFormatters must be used within RegionalPreferencesProvider',
    );
  }
  return context;
}

export default RegionalPreferencesProvider;
