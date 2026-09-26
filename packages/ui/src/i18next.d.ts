import 'i18next';

import type en from './locales/en.json';

/** Types every `t()` key against `en.json`, so a missing key fails the build. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
