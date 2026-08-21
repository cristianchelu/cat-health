import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The global layer: a reset, the app frame, the token table, and the utility
 * sheets every page opts into by class. These are the only stylesheets that own
 * bare element selectors and free-standing utilities, which is exactly why they
 * are few and named here rather than discovered.
 */
const GLOBAL_LAYER = new Set([
  'index.css',
  'App.css',
  'theme.css',
  path.join('styles', 'page-shell.css'),
  path.join('styles', 'signal-tone.css'),
  path.join('styles', 'untracked-pattern.css'),
]);

/**
 * Roots whose name cannot be derived from the filename because the component
 * name carries an acronym or a portal target. Permanent, unlike
 * `KNOWN_VIOLATIONS` — a file listed here is correct, not pending.
 */
const ROOT_OVERRIDES = new Map<string, string>([
  [
    path.join('pages', 'devices', 'components', 'ESPHomeView.css'),
    'esphome-view',
  ],
  /*
   * `Devices.css` (the attention roster) already owns `.page-devices`, so the
   * settings inventory has to say which devices page it is.
   */
  [
    path.join('pages', 'settings', 'devices', 'DevicesPage.css'),
    'page-settings-devices',
  ],
]);

/**
 * Files that still break the rule, kept green while they are migrated.
 *
 * This list may only shrink. Removing the last entry is the point of the
 * exercise; adding one means a new stylesheet went in unnamespaced.
 */
const KNOWN_VIOLATIONS = new Set<string>([
  path.join('components', 'devices', 'camera', 'CameraPicker.css'),
  path.join('components', 'devices', 'entities', 'EntityButton.css'),
  path.join('components', 'devices', 'recognition', 'RecognizerPicker.css'),
  path.join('components', 'devices', 'ReferenceImagePicker.css'),
  path.join('components', 'devices', 'TestRecognitionModal.css'),
  path.join('components', 'events', 'EventDetailsModal.css'),
  path.join('components', 'events', 'log-food', 'FoodScanStep.css'),
  path.join('components', 'events', 'TimelapsePlayer.css'),
  path.join('components', 'navigation', 'MobileNav.css'),
  path.join('components', 'ui', 'AppHeader.css'),
  path.join('components', 'ui', 'CardList.css'),
  path.join('components', 'ui', 'Dialog.css'),
  path.join('components', 'ui', 'form', 'FormCard.css'),
  path.join('components', 'ui', 'form', 'FormShell.css'),
  path.join('components', 'ui', 'PageMainAction.css'),
  path.join('components', 'ui', 'PageState.css'),
  path.join('components', 'ui', 'Tooltip.css'),
  path.join('pages', 'devices', 'components', 'DeviceHeader.css'),
  path.join('pages', 'devices', 'DeviceAnnotationPage.css'),
  path.join('pages', 'devices', 'DeviceDetails.css'),
  path.join('pages', 'settings', 'AddEditFoodPage.css'),
  path.join('pages', 'settings', 'devices', 'DevicesPage.css'),
  path.join('pages', 'settings', 'EditDevicePage.css'),
  path.join('pages', 'settings', 'LanguageRegionPage.css'),
  path.join('pages', 'settings', 'providerForm.css'),
  path.join('pages', 'settings', 'providers', 'ProviderAccountPage.css'),
  path.join('pages', 'settings', 'providers', 'ProvidersPage.css'),
  path.join(
    'pages',
    'settings',
    'provider-wizard',
    'components',
    'ProviderPickerList.css',
  ),
  path.join('pages', 'settings', 'provider-wizard', 'ProviderWizardPage.css'),
  path.join(
    'pages',
    'settings',
    'provider-wizard',
    'steps',
    'DiscoverDevicesStep.css',
  ),
]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    if (!entry.isFile()) return [];
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

function stripComments(source: string): string {
  // Newlines are preserved so reported line numbers stay honest.
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
}

/**
 * `CardList` → `card-list`, `AppHeader` → `app-header`.
 *
 * Splits on lower-to-upper and on the tail of a run of capitals, so
 * `SureFeederView` reads correctly. Acronyms that a reader would not split the
 * same way go in `ROOT_OVERRIDES` rather than complicating this.
 */
function kebabOf(basename: string): string {
  return basename
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * The root class a stylesheet is expected to declare.
 *
 * A page wears a `page-` prefix and drops the redundant `Page` suffix, so
 * `Overview.css` and `AddEditPetPage.css` land on `.page-overview` and
 * `.page-add-edit-pet`. The prefix is what keeps a route's root out of the
 * namespace components draw from — `.overview` and `.settings` are exactly the
 * generic names two files end up fighting over.
 */
function expectedRoot(relative: string): string {
  const override = ROOT_OVERRIDES.get(relative);
  if (override !== undefined) return override;

  const basename = path.basename(relative, '.css');
  const segments = relative.split(path.sep);
  /*
   * `pages/` holds route roots *and* the components colocated with them. Only
   * the roots take the prefix; a stylesheet under `components/`, `steps/` or
   * `flows/` is an ordinary component that happens to live near its route.
   */
  const isRoute =
    segments[0] === 'pages' &&
    !segments.some((segment) =>
      ['components', 'steps', 'flows'].includes(segment),
    );

  return isRoute
    ? `page-${kebabOf(basename.replace(/Page$/, ''))}`
    : kebabOf(basename);
}

interface TopLevel {
  /** The selector text, or the scope root for an `@scope` block. */
  selector: string;
  line: number;
}

/**
 * The selectors a stylesheet puts at its outermost level.
 *
 * Conditional groups (`@media`, `@supports`, `@container`) are transparent: a
 * rule inside one is as top-level as the rule beside it, which is how
 * `MobileNav.css` hides a second root inside a breakpoint. `@scope` is *not*
 * transparent — its prelude names the root, and its body is that root's inside.
 */
function topLevelSelectors(source: string): TopLevel[] {
  const css = stripComments(source);
  const found: TopLevel[] = [];
  let depth = 0;
  let start = 0;
  // Depths whose contents should still count as top-level (conditional groups).
  const transparent = new Set<number>([0]);

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '{') {
      const prelude = css.slice(start, i).trim();
      if (transparent.has(depth) && prelude !== '') {
        const at = /^@([a-z-]+)\s*([\s\S]*)$/i.exec(prelude);
        if (!at) {
          for (const selector of prelude.split(',')) {
            const text = selector.trim();
            if (text !== '') {
              found.push({
                selector: text,
                line: css.slice(0, start).split('\n').length,
              });
            }
          }
        } else if (/^(media|supports|container|layer)$/i.test(at[1])) {
          transparent.add(depth + 1);
        } else if (/^scope$/i.test(at[1])) {
          const root = /^\(\s*([^)]+?)\s*\)/.exec(at[2]);
          found.push({
            selector: root ? root[1] : at[2],
            line: css.slice(0, start).split('\n').length,
          });
        }
        // Everything else (@keyframes, @font-face, @property) owns its body.
      }
      depth++;
      start = i + 1;
    } else if (char === '}') {
      transparent.delete(depth);
      depth--;
      start = i + 1;
    } else if (char === ';' && depth === 0) {
      start = i + 1;
    }
  }

  return found;
}

const files = cssFiles(SRC)
  .map((full) => ({ full, relative: path.relative(SRC, full) }))
  .filter(({ relative }) => !GLOBAL_LAYER.has(relative))
  .filter(({ relative }) => !relative.includes(`${path.sep}test${path.sep}`));

/**
 * One stylesheet, one namespace.
 *
 * CSS here is a single global sheet — no modules, no code splitting — so a
 * class declared at the outermost level of two files is one class that two
 * components take turns losing. Nesting everything under a root named after the
 * file is what makes ownership readable from the selector alone, and what lets
 * `@scope` fence a component's slots without first having to work out which of
 * its rules were meant to escape.
 */
type OffenceKind = 'roots' | 'name';

interface Offence {
  kind: OffenceKind;
  message: string;
}

function offencesFor(full: string, relative: string): Offence[] {
  const roots = topLevelSelectors(readFileSync(full, 'utf8'));

  if (roots.length === 0) {
    return [
      { kind: 'roots', message: `${relative} — no rules; delete it or use it` },
    ];
  }

  // One *namespace*, not one block: a root reopened under
  // `prefers-color-scheme` to restate its tokens is still the same root.
  const distinct = [...new Set(roots.map((root) => root.selector))];

  if (distinct.length > 1) {
    const names = roots
      .filter(
        (root, index, all) =>
          all.findIndex((r) => r.selector === root.selector) === index,
      )
      .map((root) => `${root.selector} (:${root.line})`)
      .join(', ');
    return [
      {
        kind: 'roots',
        message: `${relative} — ${distinct.length} roots: ${names}`,
      },
    ];
  }

  if (!/^\.[a-z][a-z0-9-]*$/.test(distinct[0])) {
    return [
      {
        kind: 'roots',
        message: `${relative} — root ${distinct[0]} is not a single plain class`,
      },
    ];
  }

  const actual = distinct[0].replace(/^\./, '');
  const expected = expectedRoot(relative);

  return actual === expected
    ? []
    : [
        {
          kind: 'name',
          message: `${relative} — root .${actual}, expected .${expected}`,
        },
      ];
}

function offendersOfKind(kind: OffenceKind): string[] {
  return files
    .filter(({ relative }) => !KNOWN_VIOLATIONS.has(relative))
    .flatMap(({ full, relative }) => offencesFor(full, relative))
    .filter((offence) => offence.kind === kind)
    .map((offence) => offence.message)
    .sort();
}

describe('css structure', () => {
  it('gives every stylesheet exactly one top-level class', () => {
    const offenders = offendersOfKind('roots');

    assert.deepEqual(
      offenders,
      [],
      'Nest everything under one class named after the file:\n' +
        offenders.join('\n'),
    );
  });

  it('names that class after the file', () => {
    const offenders = offendersOfKind('name');

    assert.deepEqual(
      offenders,
      [],
      'Rename the root so the selector says which file owns it:\n' +
        offenders.join('\n'),
    );
  });

  /*
   * The half of the ratchet that makes it one. Without this, a fixed file can
   * sit in the allowlist forever and the list stops describing anything.
   */
  it('keeps no stale entries in the allowlist', () => {
    const byPath = new Map(files.map((file) => [file.relative, file]));

    const stale = [...KNOWN_VIOLATIONS]
      .filter((relative) => {
        const file = byPath.get(relative);
        return (
          file === undefined || offencesFor(file.full, relative).length === 0
        );
      })
      .sort();

    assert.deepEqual(
      stale,
      [],
      'These now pass — delete their KNOWN_VIOLATIONS lines:\n' +
        stale.join('\n'),
    );
  });

  it('lets only one file own each root class', () => {
    const owners = new Map<string, string[]>();

    for (const { full, relative } of files) {
      for (const root of topLevelSelectors(readFileSync(full, 'utf8'))) {
        if (!root.selector.startsWith('.')) continue;
        const name = root.selector.replace(/^\./, '');
        owners.set(name, [...(owners.get(name) ?? []), relative]);
      }
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => new Set(files).size > 1)
      .map(([name, files]) => `.${name} — ${[...new Set(files)].join(' · ')}`);

    assert.deepEqual(
      shared.sort(),
      [],
      'These class names are declared at the top level of more than one file, ' +
        'and the cascade decides which one wins:\n' +
        shared.join('\n'),
    );
  });
});
