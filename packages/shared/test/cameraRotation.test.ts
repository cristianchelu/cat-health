import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAMERA_ROTATION_OPTIONS,
  gravityUpEdge,
  normalizeCameraRotation,
} from '../src/cameraRotation.ts';

describe('normalizeCameraRotation', () => {
  it('is 0 when the angle is omitted', () => {
    assert.equal(normalizeCameraRotation(undefined), 0);
  });

  it('keeps the four Camera-tab stops', () => {
    assert.deepEqual(
      CAMERA_ROTATION_OPTIONS.map((deg) => normalizeCameraRotation(deg)),
      [0, -90, 180, 90],
    );
  });

  it('maps 270 onto -90 so the same turn can be selected', () => {
    assert.equal(normalizeCameraRotation(270), -90);
  });
});

describe('gravityUpEdge', () => {
  it('follows normalizeCameraRotation, so 270 is the same right edge as -90', () => {
    assert.equal(gravityUpEdge(undefined), 'top');
    assert.equal(gravityUpEdge(-90), 'right');
    assert.equal(gravityUpEdge(270), 'right');
    assert.equal(gravityUpEdge(90), 'left');
    assert.equal(gravityUpEdge(180), 'bottom');
  });
});
