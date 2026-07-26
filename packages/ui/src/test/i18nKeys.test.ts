import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EN = path.join(SRC, 'locales', 'en.json');

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
    return /\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)
      ? [full]
      : [];
  });
}

/** Literal `t('a.b')` / `t("a.b")` only — template and computed keys are skipped. */
const T_CALL = /\bt\(\s*['"]([a-z0-9_]+(?:\.[a-z0-9_]+)+)['"]/gi;

function flatten(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${k}` : k;
      keys.add(next);
      for (const nested of flatten(v, next)) keys.add(nested);
    }
  }
  return keys;
}

describe('i18n keys', () => {
  it('every literal t() key exists in en.json', () => {
    const declared = flatten(JSON.parse(readFileSync(EN, 'utf8')));

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
});
