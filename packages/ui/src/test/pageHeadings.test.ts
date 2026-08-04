import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The components allowed to emit an `<h1>`: `PageHeader` and its replacement
 * `AppHeaderBar`, which is where a page title belongs, and `FormCardHead`,
 * whose `titleAs` lets a card carry the heading on the form screens that have
 * no page title of their own.
 *
 * Two title bars is a transitional state — `PageHeader` comes off this list
 * with its last caller.
 */
const HEADING_OWNERS = new Set([
  path.join('components', 'ui', 'AppHeader.tsx'),
  path.join('components', 'ui', 'PageHeader.tsx'),
  path.join('components', 'ui', 'form', 'FormCard.tsx'),
]);

/** `<h1`, `<h1>`, `<h1 className=…` — a literal element, not a computed tag. */
const RAW_H1 = /<h1[\s>]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!entry.isFile()) return [];
    return /\.tsx$/.test(entry.name) &&
      !full.includes(`${path.sep}test${path.sep}`)
      ? [full]
      : [];
  });
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * A page gets its heading from `PageHeader`, and only from there.
 *
 * `PageHeader` moves one `<h1>` between grid areas so the desktop heading and
 * the mobile title bar are the same element — that is what stops them saying
 * different things, as `/settings/devices` once did ("← Settings" on desktop,
 * "← Devices" on mobile). A page that also hand-rolls its own `<h1>` puts a
 * second heading back on the page and reopens exactly that gap: the wizard
 * steps did, until their prompts became `<h2>`s under the wizard's title.
 */
describe('page headings', () => {
  it('come from PageHeader, not from hand-rolled <h1>s', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file);
      if (HEADING_OWNERS.has(relative)) continue;

      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(RAW_H1)) {
        offenders.push(`${relative}:${lineOf(source, match.index)}`);
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      'Render the page title through `PageHeader` instead — a second <h1> is ' +
        'a second thing the page can call itself:\n' +
        offenders.join('\n'),
    );
  });
});
