import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(SRC, 'locales');
/** The source of truth for which keys exist at all. */
const BASE_LOCALE = 'en';

/**
 * Keys that exist in `en` but have never been translated into `ro`. The app
 * falls back to English for these, so they are a content gap, not a bug — but
 * the gap is frozen here so new drift cannot slip in unnoticed.
 *
 * This list may only shrink: translate the string and delete the entry. The
 * "no stale entries" test fails if you leave one behind.
 */
const UNTRANSLATED_RO = new Set([
  'annotation.confirm_convert_maintenance',
  'annotation.kbd_shift_m',
  'annotation.mark_as_maintenance_aria',
  'devices.esphome.empty_entities',
  'devices.esphome.no_reading',
  'devices.esphome.press',
  'devices.esphome.raw_payload',
  'devices.esphome.section_config',
  'devices.esphome.section_diagnostic',
  'devices.esphome.section_primary',
  'devices.esphome.subsection_controls',
  'devices.esphome.subsection_sensors',
  'devices.feeder.food_compartment_default',
  'devices.feeder.food_compartment_no_foods',
  'devices.feeder.food_compartment_numbered',
  'devices.feeder.food_compartment_save_error',
  'devices.feeder.food_compartment_settings_help',
  'devices.feeder.food_compartment_settings_title',
  'devices.feeder.food_compartment_unlinked',
  'event_details.confirm_delete_visit',
  'event_details.delete_visit',
  'event_details.edit_weight',
  'event_details.reidentify_later_visits',
  'event_details.weight',
  'event_details.weight_out_of_range',
  'event_details.weight_save_failed',
  'pet_recognizer.load_more_remaining',
  'settings.add_food',
  'settings.add_food_desc',
  'settings.add_food_title',
  'settings.clip_duration_label',
  'settings.edit_food_title',
  'settings.food_barcode_label',
  'settings.food_barcode_placeholder',
  'settings.food_brand_label',
  'settings.food_brand_placeholder',
  'settings.food_calories_label',
  'settings.food_calories_placeholder',
  'settings.food_create',
  'settings.food_create_error',
  'settings.food_invalid_nutrients_json',
  'settings.food_moisture_label',
  'settings.food_moisture_placeholder',
  'settings.food_name_label',
  'settings.food_name_placeholder',
  'settings.food_notes_label',
  'settings.food_notes_placeholder',
  'settings.food_nutrient_add',
  'settings.food_nutrient_remove',
  'settings.food_nutrients_label',
  'settings.food_serving_size_label',
  'settings.food_serving_size_placeholder',
  'settings.food_tab_basic',
  'settings.food_tab_nutrients',
  'settings.food_type_complementary_dry',
  'settings.food_type_complementary_wet',
  'settings.food_type_complete_dry',
  'settings.food_type_complete_wet',
  'settings.food_type_drink',
  'settings.food_type_label',
  'settings.food_type_treat',
  'settings.food_update_error',
  'settings.foods',
  'settings.nutrient_name_ash',
  'settings.nutrient_name_calcium',
  'settings.nutrient_name_carbs',
  'settings.nutrient_name_fat',
  'settings.nutrient_name_fiber',
  'settings.nutrient_name_omega3',
  'settings.nutrient_name_omega6',
  'settings.nutrient_name_phosphorus',
  'settings.nutrient_name_protein',
  'settings.nutrient_name_sodium',
  'settings.nutrient_name_taurine',
  'settings.nutrient_unit_g',
  'settings.nutrient_unit_mg',
  'settings.nutrient_unit_percent',
  'settings.remote_path_label',
  'settings.ssh_key_path_label',
  'settings.ssh_user_label',
]);

/**
 * Keys a non-base locale has that `en` does not. Each one is dead weight: the
 * lookup starts from the key the code asks for, which only exists in `en`.
 *
 * `pet_recognizer.load_more_remaining` is non-plural in `en`, so `ro`'s
 * `_one`/`_other` pair never resolves. Fixing it means deciding the English
 * plural forms, which is a copy change, not a test change.
 *
 * This list may only shrink.
 */
const EXTRA_KEYS: Record<string, Set<string>> = {
  ro: new Set([
    'pet_recognizer.load_more_remaining_one',
    'pet_recognizer.load_more_remaining_other',
  ]),
};

/**
 * `t('some.key')` renders the key itself when it is missing, so a typo ships
 * as literal "settings.title" on screen rather than failing anywhere. This
 * catches statically-written keys before that happens.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.isFile()) return [];
    return /\.tsx?$/.test(entry.name) &&
      !full.includes(`${path.sep}test${path.sep}`)
      ? [full]
      : [];
  });
}

/** Literal `t('a.b')` / `t("a.b")` only — template and computed keys are skipped. */
const T_CALL = /\bt\(\s*['"]([a-z0-9_]+(?:\.[a-z0-9_]+)+)['"]/gi;
/** `` t(`a.b.${x}`) `` — only the static prefix is knowable. */
const T_TEMPLATE = /\bt\(\s*`([^`$]*)/g;

function localeNames(): string[] {
  return readdirSync(LOCALES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/, ''))
    .sort();
}

/** Leaf keys only — a namespace object is never a translation. */
function leafKeys(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const nested of leafKeys(v, next)) keys.add(nested);
      } else {
        keys.add(next);
      }
    }
  }
  return keys;
}

function loadLocale(name: string): Set<string> {
  return leafKeys(
    JSON.parse(readFileSync(path.join(LOCALES, `${name}.json`), 'utf8')),
  );
}

describe('i18n keys', () => {
  it(`every literal t() key exists in ${BASE_LOCALE}.json`, () => {
    const declared = loadLocale(BASE_LOCALE);

    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const [, key] of source.matchAll(T_CALL)) {
        // i18next pluralization: `count` picks a _one/_other variant.
        const pluralised = [`${key}_one`, `${key}_other`].some((k) =>
          declared.has(k),
        );
        if (!declared.has(key) && !pluralised) {
          missing.push(`${path.relative(SRC, file)}: ${key}`);
        }
      }
    }

    assert.deepEqual(
      [...new Set(missing)].sort(),
      [],
      `Missing translations — these render as the raw key on screen:\n${missing.join('\n')}`,
    );
  });

  it('every locale carries every key, bar the frozen untranslated set', () => {
    const base = loadLocale(BASE_LOCALE);

    const drift: string[] = [];
    for (const locale of localeNames()) {
      if (locale === BASE_LOCALE) continue;
      const allowed = locale === 'ro' ? UNTRANSLATED_RO : new Set<string>();
      const keys = loadLocale(locale);
      for (const key of [...base].sort()) {
        if (!keys.has(key) && !allowed.has(key)) drift.push(`${locale}: ${key}`);
      }
    }

    assert.deepEqual(
      drift,
      [],
      `New translation gaps. Translate them, or you are shipping English text in another locale:\n${drift.join('\n')}`,
    );
  });

  it('no locale carries a key the base locale has dropped', () => {
    const base = loadLocale(BASE_LOCALE);

    const orphans: string[] = [];
    for (const locale of localeNames()) {
      if (locale === BASE_LOCALE) continue;
      const allowed = EXTRA_KEYS[locale] ?? new Set<string>();
      for (const key of [...loadLocale(locale)].sort()) {
        if (!base.has(key) && !allowed.has(key)) {
          orphans.push(`${locale}: ${key}`);
        }
      }
    }

    assert.deepEqual(
      orphans,
      [],
      `Keys that exist only in a translation are never reachable — delete them:\n${orphans.join('\n')}`,
    );
  });

  it('has no stale entries in the drift allowlists', () => {
    const base = loadLocale(BASE_LOCALE);
    const stale: string[] = [];

    for (const key of [...UNTRANSLATED_RO].sort()) {
      const ro = loadLocale('ro');
      if (!base.has(key)) stale.push(`UNTRANSLATED_RO: ${key} is gone from en`);
      else if (ro.has(key)) stale.push(`UNTRANSLATED_RO: ${key} is translated`);
    }
    for (const [locale, keys] of Object.entries(EXTRA_KEYS)) {
      const actual = loadLocale(locale);
      for (const key of [...keys].sort()) {
        if (!actual.has(key)) stale.push(`EXTRA_KEYS.${locale}: ${key} is gone`);
        else if (base.has(key)) {
          stale.push(`EXTRA_KEYS.${locale}: ${key} now exists in en`);
        }
      }
    }

    assert.deepEqual(
      stale,
      [],
      `The allowlists may only shrink — remove these:\n${stale.join('\n')}`,
    );
  });

  /*
   * Reported, not asserted. Keys reached through a computed key —
   * `t(`devices.status.${device.status}`)`, `t(`settings.food_type_${type}`)` —
   * cannot be resolved statically, so a hard failure here would be wrong more
   * often than right. Read the diagnostic when pruning copy.
   */
  it('reports locale keys that nothing appears to reference', (t) => {
    const literal = new Set<string>();
    const prefixes = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const [, key] of source.matchAll(T_CALL)) {
        literal.add(key);
        // A `count` call site legitimizes the plural variants of the key.
        literal.add(`${key}_one`);
        literal.add(`${key}_other`);
      }
      for (const [, prefix] of source.matchAll(T_TEMPLATE)) {
        if (prefix.length > 0) prefixes.add(prefix);
      }
    }

    const unreferenced = [...loadLocale(BASE_LOCALE)]
      .filter(
        (key) =>
          !literal.has(key) &&
          ![...prefixes].some((prefix) => key.startsWith(prefix)),
      )
      .sort();

    t.diagnostic(
      `${unreferenced.length} ${BASE_LOCALE} keys have no statically visible reference` +
        (unreferenced.length > 0 ? `:\n  ${unreferenced.join('\n  ')}` : ''),
    );
  });
});
