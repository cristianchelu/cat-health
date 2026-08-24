import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ThinginoLayoutError,
  assertDefaultRecordingLayout,
  clipsRoot,
  dayDirectories,
  filesOverlappingWindow,
  hourDirectories,
  isDefaultRecordingLayout,
  joinListedFile,
  recordsRoot,
} from '../thinginoLayout.ts';

describe('thinginoLayout', () => {
  it('accepts the default prudynt filename and device_path', () => {
    assert.equal(
      isDefaultRecordingLayout('%Y%m%dT%H%M%S.mp4', '%hostname/records'),
      true,
    );
    assert.equal(
      isDefaultRecordingLayout('%Y%m%d/%H/%Y%m%dT%H%M%S', 'records'),
      true,
    );
  });

  it('accepts Ciao factory filename when device_path is unset', () => {
    assert.equal(isDefaultRecordingLayout('%Y/%m/%d/%H-%M-%S', null), true);
    assert.equal(
      isDefaultRecordingLayout('%Y/%m/%d/%H-%M-%S', '%hostname'),
      true,
    );
  });

  it('lists Ciao day directories that overlap the visit window', () => {
    const root = clipsRoot('/mnt/mmcblk0p1', 'littercam');
    const start = new Date(2026, 6, 18, 23, 50, 0);
    const end = new Date(2026, 6, 19, 0, 10, 0);
    assert.deepEqual(dayDirectories(root, start, end, 60), [
      '/mnt/mmcblk0p1/littercam/2026/07/18',
      '/mnt/mmcblk0p1/littercam/2026/07/19',
    ]);
  });

  it('selects Ciao clip names that overlap the visit', () => {
    const files = [
      '/mnt/mmcblk0p1/littercam/2026/07/18/17-22-39.mp4',
      '/mnt/mmcblk0p1/littercam/2026/07/18/readme.txt',
      '/mnt/mmcblk0p1/littercam/2026/07/18/17-30-00.mp4',
    ];
    const start = new Date(2026, 6, 18, 17, 23, 0);
    const end = new Date(2026, 6, 18, 17, 24, 0);
    assert.deepEqual(filesOverlappingWindow(files, start, end, 60, 60), [
      '/mnt/mmcblk0p1/littercam/2026/07/18/17-22-39.mp4',
    ]);
  });

  it('fails closed on a custom recording path', () => {
    assert.throws(
      () => assertDefaultRecordingLayout('%f', '/custom'),
      ThinginoLayoutError,
    );
  });

  it('lists only hour directories that overlap the visit window', () => {
    const root = recordsRoot('/mnt/mmcblk0p1', 'littercam');
    const start = new Date(2026, 5, 11, 1, 50, 0);
    const end = new Date(2026, 5, 11, 2, 10, 0);
    assert.deepEqual(hourDirectories(root, start, end, 60), [
      '/mnt/mmcblk0p1/littercam/records/20260611/01',
      '/mnt/mmcblk0p1/littercam/records/20260611/02',
    ]);
  });

  it('selects default basenames that overlap the visit', () => {
    const files = [
      '/mnt/mmcblk0p1/littercam/records/20260611/01/20260611T014830.mp4',
      '/mnt/mmcblk0p1/littercam/records/20260611/01/readme.txt',
      '/mnt/mmcblk0p1/littercam/records/20260611/02/20260611T020000.mp4',
    ];
    const start = new Date(2026, 5, 11, 1, 50, 0);
    const end = new Date(2026, 5, 11, 1, 55, 0);
    assert.deepEqual(filesOverlappingWindow(files, start, end, 60, 60), [
      '/mnt/mmcblk0p1/littercam/records/20260611/01/20260611T014830.mp4',
    ]);
  });

  it('joins relative file-manager names onto the listed directory', () => {
    assert.equal(
      joinListedFile('/mnt/mmcblk0p1/littercam/records/20260611/01', 'a.mp4'),
      '/mnt/mmcblk0p1/littercam/records/20260611/01/a.mp4',
    );
    assert.equal(joinListedFile('/dir', '/absolute/a.mp4'), '/absolute/a.mp4');
  });
});
