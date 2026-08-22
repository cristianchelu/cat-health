import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The only files allowed to render a bare `<img>`.
 *
 * `FallbackImage` is the primitive itself. `AvatarUpload` previews a File the
 * user just picked through an object URL — there is no server, no request to
 * fail, and the element is replaced the moment the upload resolves.
 */
const IMG_OWNERS = new Set([
  path.join('components', 'ui', 'FallbackImage.tsx'),
  path.join('components', 'pet', 'AvatarUpload.tsx'),
]);

/** `<img`, `<img>`, `<img src=…` — a literal element, not a computed tag. */
const RAW_IMG = /<img[\s>]/g;

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
 * Anything the server serves is drawn through `FallbackImage`.
 *
 * Media rows outlive their files — a snapshot is pruned, a volume is remounted
 * somewhere else, a seeded database names photos nobody has — and a bare `<img>`
 * answers that with the UA's broken-image glyph and the alt text spilling out of
 * a 52px square. `FallbackImage` answers it with an icon the size of the box it
 * is in, and it is the only place that behaviour is written down.
 */
describe('server images', () => {
  it('are drawn through FallbackImage, not a bare <img>', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file);
      if (IMG_OWNERS.has(relative)) continue;

      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(RAW_IMG)) {
        offenders.push(`${relative}:${lineOf(source, match.index)}`);
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      'Render these through `FallbackImage` (or `Avatar` / `MediaTile`, which ' +
        'already do) so a missing file degrades to an icon:\n' +
        offenders.join('\n'),
    );
  });
});
