import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isVisitAnnotationEnabled } from '../deviceAnnotation.ts';

describe('isVisitAnnotationEnabled', () => {
  it('returns true only when visit_annotation_enabled is set in config', () => {
    assert.equal(
      isVisitAnnotationEnabled({ config: { visit_annotation_enabled: true } }),
      true,
    );
    assert.equal(
      isVisitAnnotationEnabled({ config: { visit_annotation_enabled: false } }),
      false,
    );
    assert.equal(isVisitAnnotationEnabled({ config: {} }), false);
    assert.equal(isVisitAnnotationEnabled({}), false);
  });
});
