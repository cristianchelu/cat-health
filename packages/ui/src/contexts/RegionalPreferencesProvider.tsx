import * as React from 'react';
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
} from '@/lib/regionalFormat';
import {
  FormattersContext,
  RegionalPreferencesContext,
  type Formatters,
} from './RegionalPreferencesContext';

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

export default RegionalPreferencesProvider;
