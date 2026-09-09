import { useContext } from 'react';
import type { ResolvedRegionalPreferences } from 'shared';
import {
  FormattersContext,
  RegionalPreferencesContext,
  type Formatters,
} from '@/contexts/RegionalPreferencesContext';

export function useRegionalPreferences(): ResolvedRegionalPreferences {
  const context = useContext(RegionalPreferencesContext);
  if (!context) {
    throw new Error(
      'useRegionalPreferences must be used within RegionalPreferencesProvider',
    );
  }
  return context;
}

export function useFormatters(): Formatters {
  const context = useContext(FormattersContext);
  if (!context) {
    throw new Error(
      'useFormatters must be used within RegionalPreferencesProvider',
    );
  }
  return context;
}
