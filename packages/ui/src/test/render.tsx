import * as React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { MemoryRouter, type MemoryRouterProps } from 'react-router';

/** Minimal keys used by ConfirmDialog / FormInlineDiscard / Dialog close. */
const testResources = {
  common: {
    cancel: 'Cancel',
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
