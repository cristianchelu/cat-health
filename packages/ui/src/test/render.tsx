/* eslint-disable react-refresh/only-export-components -- Test providers and render helpers are not Fast Refresh boundaries. */
import * as React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { MemoryRouter, type MemoryRouterProps } from 'react-router';

/**
 * Minimal keys used by ConfirmDialog / FormInlineDiscard / Dialog close /
 * SearchInput / SortControl / the food picker's shared rows.
 */
const testResources = {
  food_picker: {
    kcal_per_kg: '{{value}} kcal/kg',
    group_wet: 'Wet food',
    group_dry: 'Dry food',
    group_treat: 'Treats',
    group_wet_short: 'wet',
    group_dry_short: 'dry',
    group_treat_short: 'treat',
    no_brand: 'No brand',
    food_count: '{{count}} foods',
  },
  log_food: {
    scan_hint: 'Point at the barcode on the pack',
    scan_no_match: 'No match in your library',
    scan_rescan: 'Scan again',
    scan_denied: 'Camera access was denied',
  },
  common: {
    cancel: 'Cancel',
    save: 'Save',
    back: 'Back',
    clear: 'Clear',
    sort_ascending: 'Ascending',
    sort_descending: 'Descending',
    confirm: 'Confirm',
    discard: 'Discard',
    keep_editing: 'Keep editing',
    discard_unsaved_title: 'Discard unsaved changes?',
    discard_unsaved_body: 'Your changes will be lost.',
    close: 'Close',
  },
};

let i18nReady: Promise<typeof i18n> | null = null;

function ensureTestI18n() {
  if (!i18nReady) {
    if (i18n.isInitialized) {
      i18nReady = Promise.resolve(i18n);
    } else {
      i18n.use(initReactI18next);
      i18nReady = i18n
        .init({
          lng: 'en',
          fallbackLng: 'en',
          resources: { en: { translation: testResources } },
          interpolation: { escapeValue: false },
        })
        .then(() => i18n);
    }
  }
  return i18nReady;
}

interface ProvidersProps {
  children: React.ReactNode;
  router?: MemoryRouterProps;
}

function Providers({ children, router }: ProvidersProps) {
  const content = router ? (
    <MemoryRouter {...router}>{children}</MemoryRouter>
  ) : (
    children
  );

  return <I18nextProvider i18n={i18n}>{content}</I18nextProvider>;
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  router?: MemoryRouterProps;
}

async function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  await ensureTestI18n();
  const { router, ...renderOptions } = options;

  return render(ui, {
    ...renderOptions,
    wrapper: ({ children }) => (
      <Providers router={router}>{children}</Providers>
    ),
  });
}

export { renderWithProviders, ensureTestI18n };
