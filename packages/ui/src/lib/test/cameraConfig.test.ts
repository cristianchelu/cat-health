import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAMERA_ROTATION_OPTIONS,
  buildCameraConfig,
  cameraConfigEqual,
  clamp01,
  deviceHasIntegratedCamera,
  draftFromCameraConfig,
  draftFromCameraLink,
  hasLinkableCameras,
  normalizeCrop,
  resolveCameraSaveAction,
  toggleAcquisitionType,
  type CameraConfigDraft,
} from '../cameraConfig.ts';

function draft(overrides: Partial<CameraConfigDraft> = {}): CameraConfigDraft {
  return {
    cameraId: null,
    crop: { left: 0, top: 0, width: 1, height: 1 },
    rotate: undefined,
    acquisitionTypes: ['snapshot'],
    fetchDelay: 60,
    snapshotIntervalSec: 0,
    snapshotFirstFrameDelaySec: 0,
    ...overrides,
  };
}

describe('clamp01', () => {
  it('clamps values below 0 to 0', () => {
    assert.equal(clamp01(-0.5), 0);
  });

  it('clamps values above 1 to 1', () => {
    assert.equal(clamp01(1.5), 1);
  });

  it('passes through in-range values unchanged', () => {
    assert.equal(clamp01(0.3), 0.3);
  });
});

describe('normalizeCrop', () => {
  it('returns a full-frame default crop when undefined', () => {
    assert.deepEqual(normalizeCrop(undefined), {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
  });

  it('clamps out-of-range crop fields into [0, 1]', () => {
    assert.deepEqual(
      normalizeCrop({ left: -1, top: 2, width: -0.2, height: 1.4 }),
      { left: 0, top: 1, width: 0, height: 1 },
    );
  });

  it('defaults missing fields within a partial crop', () => {
    assert.deepEqual(normalizeCrop({ left: 0.25 } as never), {
      left: 0.25,
      top: 0,
      width: 1,
      height: 1,
    });
  });
});

describe('cameraConfigEqual', () => {
  it('is true for two drafts with identical values', () => {
    assert.equal(
      cameraConfigEqual(draft({ cameraId: 1 }), draft({ cameraId: 1 })),
      true,
    );
  });

  it('is false when rotate differs', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, rotate: 0 }),
        draft({ cameraId: 1, rotate: 90 }),
      ),
      false,
    );
  });

  it('treats rotate undefined and rotate 0 as equal', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, rotate: undefined }),
        draft({ cameraId: 1, rotate: 0 }),
      ),
      true,
    );
  });

  it('is false when fetchDelay differs', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, fetchDelay: 10 }),
        draft({ cameraId: 1, fetchDelay: 20 }),
      ),
      false,
    );
  });

  it('is false when snapshot timing fields differ', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, snapshotIntervalSec: 1 }),
        draft({ cameraId: 1, snapshotIntervalSec: 2 }),
      ),
      false,
    );
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, snapshotFirstFrameDelaySec: 1 }),
        draft({ cameraId: 1, snapshotFirstFrameDelaySec: 2 }),
      ),
      false,
    );
  });

  it('is false when crop fields differ', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, crop: { left: 0, top: 0, width: 1, height: 1 } }),
        draft({
          cameraId: 1,
          crop: { left: 0.1, top: 0, width: 1, height: 1 },
        }),
      ),
      false,
    );
  });

  it('is false when acquisitionTypes differ in length', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, acquisitionTypes: ['snapshot'] }),
        draft({ cameraId: 1, acquisitionTypes: ['snapshot', 'recording'] }),
      ),
      false,
    );
  });

  it('is false when acquisitionTypes differ in content', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, acquisitionTypes: ['recording'] }),
        draft({ cameraId: 1, acquisitionTypes: ['snapshot'] }),
      ),
      false,
    );
  });

  it('compares acquisitionTypes order-insensitively', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: 1, acquisitionTypes: ['snapshot', 'recording'] }),
        draft({ cameraId: 1, acquisitionTypes: ['recording', 'snapshot'] }),
      ),
      true,
    );
  });

  it('is false when cameraId differs', () => {
    assert.equal(
      cameraConfigEqual(draft({ cameraId: 1 }), draft({ cameraId: 2 })),
      false,
    );
    assert.equal(
      cameraConfigEqual(draft({ cameraId: 1 }), draft({ cameraId: null })),
      false,
    );
  });

  it('treats two unlinked drafts as equal regardless of config fields', () => {
    assert.equal(
      cameraConfigEqual(
        draft({ cameraId: null, fetchDelay: 60, rotate: 90 }),
        draft({ cameraId: null, fetchDelay: 15, rotate: 180 }),
      ),
      true,
    );
  });
});

describe('buildCameraConfig', () => {
  it('includes snapshot options when acquisitionTypes includes snapshot', () => {
    const config = buildCameraConfig(
      draft({
        acquisitionTypes: ['snapshot'],
        snapshotIntervalSec: 5,
        snapshotFirstFrameDelaySec: 2,
      }),
    );
    assert.deepEqual(config.snapshot, {
      intervalSec: 5,
      firstFrameDelaySec: 2,
    });
  });

  it('omits snapshot options when acquisitionTypes excludes snapshot', () => {
    const config = buildCameraConfig(
      draft({ acquisitionTypes: ['recording'] }),
    );
    assert.equal(config.snapshot, undefined);
  });

  it('defaults to ["snapshot"] when acquisitionTypes is empty', () => {
    const config = buildCameraConfig(draft({ acquisitionTypes: [] }));
    assert.deepEqual(config.acquisitionTypes, ['snapshot']);
    assert.notEqual(config.snapshot, undefined);
  });

  it('carries through crop, rotate and fetchDelay verbatim', () => {
    const crop = { left: 0.1, top: 0.2, width: 0.3, height: 0.4 };
    const config = buildCameraConfig(
      draft({ crop, rotate: 180, fetchDelay: 30 }),
    );
    assert.deepEqual(config.crop, crop);
    assert.equal(config.rotate, 180);
    assert.equal(config.fetchDelay, 30);
  });
});

describe('toggleAcquisitionType', () => {
  it('adds a type that is absent, sorted', () => {
    assert.deepEqual(toggleAcquisitionType(['snapshot'], 'recording'), [
      'recording',
      'snapshot',
    ]);
  });

  it('removes a type that is present', () => {
    assert.deepEqual(
      toggleAcquisitionType(['recording', 'snapshot'], 'snapshot'),
      ['recording'],
    );
  });

  it('does not mutate the input array', () => {
    const input = ['snapshot'];
    toggleAcquisitionType(input, 'recording');
    assert.deepEqual(input, ['snapshot']);
  });
});

describe('CAMERA_ROTATION_OPTIONS', () => {
  it('is exactly [0, 90, 180, 270]', () => {
    assert.deepEqual(CAMERA_ROTATION_OPTIONS, [0, 90, 180, 270]);
  });
});

describe('draftFromCameraConfig', () => {
  it('returns full defaults when config is undefined', () => {
    assert.deepEqual(draftFromCameraConfig(undefined), draft());
  });

  it('fills gaps for a partial config', () => {
    assert.deepEqual(
      draftFromCameraConfig({ rotate: 90 }),
      draft({ rotate: 90 }),
    );
  });

  it('carries through a fully specified config', () => {
    const config = {
      crop: { left: 0.1, top: 0.1, width: 0.5, height: 0.5 },
      rotate: 270,
      acquisitionTypes: ['recording'],
      fetchDelay: 15,
      snapshot: { intervalSec: 3, firstFrameDelaySec: 1 },
    };
    assert.deepEqual(
      draftFromCameraConfig(config),
      draft({
        crop: config.crop,
        rotate: 270,
        acquisitionTypes: ['recording'],
        fetchDelay: 15,
        snapshotIntervalSec: 3,
        snapshotFirstFrameDelaySec: 1,
      }),
    );
  });

  it('defaults acquisitionTypes to ["snapshot"] when the config array is empty', () => {
    assert.deepEqual(
      draftFromCameraConfig({ acquisitionTypes: [] }),
      draft({ acquisitionTypes: ['snapshot'] }),
    );
  });

  it('leaves cameraId null — link id comes from draftFromCameraLink', () => {
    assert.equal(draftFromCameraConfig({}).cameraId, null);
  });
});

describe('draftFromCameraLink', () => {
  it('uses null cameraId when there is no link', () => {
    assert.deepEqual(draftFromCameraLink(undefined), draft());
    assert.deepEqual(draftFromCameraLink(null), draft());
  });

  it('copies camera_id and config into the draft', () => {
    assert.deepEqual(
      draftFromCameraLink({
        camera_id: 6,
        config: { rotate: 90, fetchDelay: 15 },
      }),
      draft({ cameraId: 6, rotate: 90, fetchDelay: 15 }),
    );
  });
});

describe('resolveCameraSaveAction', () => {
  it('is none when draft matches baseline', () => {
    assert.deepEqual(
      resolveCameraSaveAction(draft({ cameraId: 6 }), draft({ cameraId: 6 })),
      { type: 'none' },
    );
  });

  it('unlinks when the draft clears a linked camera', () => {
    assert.deepEqual(
      resolveCameraSaveAction(
        draft({ cameraId: 6 }),
        draft({ cameraId: null }),
      ),
      { type: 'unlink' },
    );
  });

  it('links when selecting a camera from none', () => {
    const next = draft({ cameraId: 6, fetchDelay: 30 });
    assert.deepEqual(resolveCameraSaveAction(draft(), next), {
      type: 'link',
      cameraId: 6,
      config: buildCameraConfig(next),
    });
  });

  it('links when replacing one camera with another', () => {
    const next = draft({ cameraId: 7 });
    assert.deepEqual(resolveCameraSaveAction(draft({ cameraId: 6 }), next), {
      type: 'link',
      cameraId: 7,
      config: buildCameraConfig(next),
    });
  });

  it('patches config when the camera stays the same but settings change', () => {
    const baseline = draft({ cameraId: 6, fetchDelay: 60 });
    const next = draft({ cameraId: 6, fetchDelay: 15 });
    assert.deepEqual(resolveCameraSaveAction(baseline, next), {
      type: 'updateConfig',
      config: buildCameraConfig(next),
    });
  });

  it('is none when both sides are unlinked even if config fields differ', () => {
    const baseline = draft({ cameraId: null, fetchDelay: 60 });
    const next = draft({ cameraId: null, fetchDelay: 15 });
    assert.deepEqual(resolveCameraSaveAction(baseline, next), {
      type: 'none',
    });
    assert.equal(cameraConfigEqual(baseline, next), true);
  });

  it('never lets isDirty and the save action disagree while unlinked', () => {
    const baseline = draft({ cameraId: null });
    const edits: Array<Partial<CameraConfigDraft>> = [
      { fetchDelay: 15 },
      { rotate: 180 },
      { snapshotIntervalSec: 3 },
      { snapshotFirstFrameDelaySec: 2 },
      { crop: { left: 0.1, top: 0.1, width: 0.5, height: 0.5 } },
      { acquisitionTypes: ['recording'] },
      { cameraId: 6 },
    ];
    for (const edit of edits) {
      const next = draft({ cameraId: null, ...edit });
      const isDirty = !cameraConfigEqual(baseline, next);
      const action = resolveCameraSaveAction(baseline, next);
      assert.equal(
        isDirty,
        action.type !== 'none',
        `dirty flag and save action disagree for ${JSON.stringify(edit)}`,
      );
    }
  });
});

describe('hasLinkableCameras', () => {
  it('is false when there are no other cameras and no integrated camera', () => {
    assert.equal(
      hasLinkableCameras({ cameras: [], hasIntegratedCamera: false }),
      false,
    );
  });

  it('is true when there is an integrated camera', () => {
    assert.equal(
      hasLinkableCameras({ cameras: [], hasIntegratedCamera: true }),
      true,
    );
  });

  it('is true when there is at least one other camera device', () => {
    assert.equal(
      hasLinkableCameras({ cameras: [{ id: 1 }], hasIntegratedCamera: false }),
      true,
    );
  });
});

describe('deviceHasIntegratedCamera', () => {
  it('is true from live state', () => {
    assert.equal(
      deviceHasIntegratedCamera({ state: { hasCamera: true }, config: null }),
      true,
    );
  });

  it('is true from the durable config flag when state is cold', () => {
    assert.equal(
      deviceHasIntegratedCamera({
        state: { waterLevel: 0 },
        config: { hasCamera: true },
      }),
      true,
    );
  });

  it('is false when neither state nor config advertises a camera', () => {
    assert.equal(
      deviceHasIntegratedCamera({
        state: { waterLevel: 0 },
        config: { host: '192.168.1.10' },
      }),
      false,
    );
  });
});
