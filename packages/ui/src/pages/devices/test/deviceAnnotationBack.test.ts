import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const annotationPagePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../DeviceAnnotationPage.tsx',
);

describe('DeviceAnnotationPage', () => {
  it('renders an AppHeader back control on the workspace', () => {
    const source = readFileSync(annotationPagePath, 'utf8');
    assert.match(source, /AppHeaderBar/);
    assert.match(source, /useBackNavigation/);
    assert.match(source, /parseDeviceRouteId/);
  });
});
