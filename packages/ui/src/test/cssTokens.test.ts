import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Files with pre-existing references to custom properties that are declared
 * nowhere. Those declarations silently resolve to nothing, so the affected
 * rules do not apply at all.
 *
 * This list may only shrink. Do not add to it — fix the token instead. The
 * real names live in `theme.css` (`--text-*`, `--font-*`, `--space-*`,
 * `--color-text-light`, `--color-text-muted`, `--color-error`, …).
 */
const KNOWN_BROKEN = new Set([
  'components/devices/ReferenceImagePicker.css',
  'components/devices/TestRecognitionModal.css',
  'components/events/DeviceCentricEvent.css',
  'components/events/EventDetailsModal.css',
  'components/events/LogFoodModal.css',
  'components/events/TimelapsePlayer.css',
  'components/litterbox/LitterboxDotGrid.css',
  'components/pet/avatar-upload.css',
  'components/ui/Avatar.css',
  'pages/devices/DeviceDetails.css',
  'pages/devices/components/CameraLinkSection.css',
  'pages/devices/components/DeviceTimeline.css',
  'pages/devices/components/FeederFoodSection.css',
  'pages/devices/components/ReferenceImagesTab.css',
  'pages/devices/components/SureFeederStatus.css',
  'pages/devices/components/WaterFountainStatus.css',
  'pages/settings/EditDevicePage.css',
]);

function filesWithin(dir: string, extensions: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesWithin(full, extensions);
    if (!entry.isFile()) return [];
    return extensions.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const cssFiles = filesWithin(SRC, ['.css']);
/**
 * Components both parameterize CSS by setting custom properties inline and
 * *read* tokens from TS — colour registries, chart series, brand tiles. A typo
 * there is invisible at build time and ships a transparent or black element, so
 * these files are checked for references, not only declarations.
 */
const scriptFiles = filesWithin(SRC, ['.ts', '.tsx']).filter(
  // Test files quote token names as examples; nothing they say ships.
  (file) => !file.includes(`${path.sep}test${path.sep}`),
);

/**
 * `--foo: value` — a declaration, anywhere (`:root`, a component, a selector).
 * Anchored to the start of a line *or* to a `{` / `;`, so a single-line
 * `.a { --x: 1px }` counts too. `var(--x)` never matches: the token there is
 * preceded by `(`.
 */
const DECLARED = /(?:^|[{;])\s*(--[a-z0-9-]+)\s*:/gim;
/** `'--foo':` — a declaration in a JSX inline style object. */
const DECLARED_INLINE = /['"](--[a-z0-9-]+)['"]\s*:/gi;
/** `var(--foo)` — a reference, in CSS or in a TS string literal. */
const REFERENCED = /var\(\s*(--[a-z0-9-]+)/gi;

function matchAll(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].map((m) => m[1]);
}

/**
 * Every custom property declared anywhere in the app — CSS or inline style.
 *
 * Known limitation: this is one flat set, so a declaration in *any* file
 * legitimizes a reference from *any other* file. It cannot tell you that a
 * token is out of scope at the point of use. That is deliberate — cross-file
 * resolution is real and relied on here (`PageBackLink.css` reads
 * `--page-shell-padding-inline`, declared only on `main` in `App.css`), and
 * modelling the cascade properly would need a real CSS parser.
 */
function declaredTokens(): Set<string> {
  const declared = new Set<string>();
  for (const file of cssFiles) {
    for (const token of matchAll(readFileSync(file, 'utf8'), DECLARED)) {
      declared.add(token);
    }
  }
  for (const file of scriptFiles) {
    for (const token of matchAll(readFileSync(file, 'utf8'), DECLARED_INLINE)) {
      declared.add(token);
    }
  }
  return declared;
}

function undeclaredReferences(
  files: string[],
  declared: Set<string>,
): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    const rel = path.relative(SRC, file);
    if (KNOWN_BROKEN.has(rel)) continue;
    const missing = [
      ...new Set(matchAll(readFileSync(file, 'utf8'), REFERENCED)),
    ]
      .filter((token) => !declared.has(token))
      .sort();
    if (missing.length > 0) offenders.push(`${rel}: ${missing.join(', ')}`);
  }
  return offenders;
}

describe('css custom properties', () => {
  it('references only properties that are declared somewhere', () => {
    const offenders = undeclaredReferences(cssFiles, declaredTokens());

    assert.deepEqual(
      offenders,
      [],
      `Undeclared custom properties (they resolve to nothing, so the rule never applies):\n${offenders.join('\n')}`,
    );
  });

  it('resolves var() written inside TypeScript too', () => {
    const offenders = undeclaredReferences(scriptFiles, declaredTokens());

    assert.deepEqual(
      offenders,
      [],
      `Undeclared custom properties referenced from TS/TSX (inline styles and colour registries — these render transparent or black):\n${offenders.join('\n')}`,
    );
  });

  it('has no stale entries in the known-broken allowlist', () => {
    const declared = declaredTokens();

    const stale = [...KNOWN_BROKEN].filter((rel) => {
      const full = path.join(SRC, rel);
      if (!cssFiles.includes(full) && !scriptFiles.includes(full)) return true;
      return matchAll(readFileSync(full, 'utf8'), REFERENCED).every((token) =>
        declared.has(token),
      );
    });

    assert.deepEqual(
      stale,
      [],
      `These files are clean (or gone) — remove them from KNOWN_BROKEN:\n${stale.join('\n')}`,
    );
  });
});
