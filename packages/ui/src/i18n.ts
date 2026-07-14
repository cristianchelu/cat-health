import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ro from './locales/ro.json';

export const SUPPORTED_LANGUAGES = ['en', 'ro'] as const;

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en,
    },
    ro: {
      translation: ro,
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
