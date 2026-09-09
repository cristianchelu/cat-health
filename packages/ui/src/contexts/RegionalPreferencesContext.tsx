import { createContext } from 'react';
import type { Locale } from 'date-fns';
import type { ResolvedRegionalPreferences } from 'shared';
import type {
  DateDisplayStyle,
  FormatNumberOptions,
} from '@/lib/regionalFormat';

export interface Formatters {
  formatTime: (date: Date) => string;
  formatDate: (date: Date, style?: DateDisplayStyle) => string;
  formatDateNumeric: (date: Date) => string;
  formatDateTime: (date: Date) => string;
  formatNumber: (value: number, options?: FormatNumberOptions) => string;
  dateFnsLocale: Locale;
  weekOptions: { weekStartsOn: 0 | 1 };
  timezone: string;
}

export const RegionalPreferencesContext =
  createContext<ResolvedRegionalPreferences | null>(null);
export const FormattersContext = createContext<Formatters | null>(null);
