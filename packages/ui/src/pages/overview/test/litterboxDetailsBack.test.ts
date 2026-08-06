import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const litterboxDetailsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../LitterboxDetails.tsx',
);

describe('LitterboxDetails back target', () => {
  it('falls back to the overview index `/`, not `/overview`', () => {
    // `/overview` is not a route — cold-start back 404'd there.
    const source = readFileSync(litterboxDetailsPath, 'utf8');
    assert.match(source, /to:\s*['"]\/['"]/);
    assert.equal(source.includes("to: '/overview'"), false);
    assert.equal(source.includes('to: "/overview"'), false);
  });
});
