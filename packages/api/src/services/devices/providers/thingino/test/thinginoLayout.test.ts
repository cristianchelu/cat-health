import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clipsRoot,
  dayDirectories,
  defaultClipDuration,
  filesOverlappingWindow,
  joinListedFile,
  parseRaptorSegmentSeconds,
  raptorDayDirectories,
  raptorRecordRoot,
  recordingLayoutKind,
} from '../thinginoLayout.ts';

describe('thinginoLayout', () => {
  it('accepts the Prudynt factory filename when device_path is unset', () => {
    assert.equal(recordingLayoutKind('%Y/%m/%d/%H-%M-%S', null), 'prudynt-day');
    assert.equal(
      recordingLayoutKind('%Y/%m/%d/%H-%M-%S', '%hostname'),
      'prudynt-day',
    );
  });

  it('lists Prudynt day directories that overlap the visit window', () => {
    const root = clipsRoot('/mnt/mmcblk0p1', 'littercam');
    const start = new Date(2026, 6, 18, 23, 50, 0);
    const end = new Date(2026, 6, 19, 0, 10, 0);
    assert.deepEqual(dayDirectories(root, start, end, 60), [
      '/mnt/mmcblk0p1/littercam/2026/07/18',
      '/mnt/mmcblk0p1/littercam/2026/07/19',
    ]);
  });

  it('selects Prudynt clip names that overlap the visit', () => {
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
    assert.equal(recordingLayoutKind('%f', '/custom'), null);
    // An absolute device_path is only a record root on a Raptor image; on any
    // other backend it is the custom path we refuse to guess at.
    assert.equal(recordingLayoutKind(null, '/mnt/mmcblk0p1/elsewhere'), null);
    assert.equal(
      recordingLayoutKind(null, '/mnt/mmcblk0p1/elsewhere', 'prudynt'),
      null,
    );
  });

  it('rejects the retired records/YYYYMMDD/HH tree', () => {
    assert.equal(
      recordingLayoutKind('%Y%m%dT%H%M%S.mp4', '%hostname/records'),
      null,
    );
    assert.deepEqual(
      filesOverlappingWindow(
        ['/mnt/mmcblk0p1/littercam/records/20260611/01/20260611T014830.mp4'],
        new Date(2026, 5, 11, 1, 50, 0),
        new Date(2026, 5, 11, 1, 55, 0),
        60,
        60,
        'prudynt-day',
      ),
      [],
    );
  });

  it('joins relative file-manager names onto the listed directory', () => {
    assert.equal(
      joinListedFile('/mnt/mmcblk0p1/littercam/2026/06/11', 'a.mp4'),
      '/mnt/mmcblk0p1/littercam/2026/06/11/a.mp4',
    );
    assert.equal(joinListedFile('/dir', '/absolute/a.mp4'), '/absolute/a.mp4');
  });

  it('accepts a Raptor absolute record root from the agent backend name', () => {
    assert.equal(
      recordingLayoutKind(null, '/mnt/mmcblk0p1/raptor', 'raptor'),
      'raptor-day',
    );
    assert.equal(
      recordingLayoutKind('', '/mnt/mmcblk0p1/raptor/', 'Raptor'),
      'raptor-day',
    );
    // Raptor spelling out its own strftime template is still the default tree.
    assert.equal(
      recordingLayoutKind(
        '%Y-%m-%d/%H-%M-%S',
        '/mnt/mmcblk0p1/raptor',
        'raptor',
      ),
      'raptor-day',
    );
    assert.equal(recordingLayoutKind(null, 'raptor', 'raptor'), null);
  });

  it('lists Raptor day directories that overlap the visit window', () => {
    const root = raptorRecordRoot('/mnt/mmcblk0p1/raptor/');
    const start = new Date(2026, 8, 7, 23, 50, 0);
    const end = new Date(2026, 8, 8, 0, 10, 0);
    assert.deepEqual(raptorDayDirectories(root, start, end, 60), [
      '/mnt/mmcblk0p1/raptor/2026-09-07',
      '/mnt/mmcblk0p1/raptor/2026-09-08',
    ]);
  });

  it('selects Raptor segments using the 5-minute default, not clip_length_sec', () => {
    const files = [
      '/mnt/mmcblk0p1/raptor/2026-09-07/17-00-00.mp4',
      '/mnt/mmcblk0p1/raptor/2026-09-07/17-05-00.mp4',
    ];
    const start = new Date(2026, 8, 7, 17, 3, 0);
    const end = new Date(2026, 8, 7, 17, 4, 0);
    assert.deepEqual(
      filesOverlappingWindow(files, start, end, 60, 60, 'raptor-day'),
      [],
    );
    assert.deepEqual(
      filesOverlappingWindow(
        files,
        start,
        end,
        defaultClipDuration('raptor-day', 60),
        60,
        'raptor-day',
      ),
      ['/mnt/mmcblk0p1/raptor/2026-09-07/17-00-00.mp4'],
    );
  });

  it('infers Raptor segment length from the next filename', () => {
    const files = [
      '/mnt/mmcblk0p1/raptor/2026-09-07/17-00-00.mp4',
      '/mnt/mmcblk0p1/raptor/2026-09-07/17-10-00.mp4',
    ];
    const start = new Date(2026, 8, 7, 17, 8, 0);
    const end = new Date(2026, 8, 7, 17, 9, 0);
    assert.deepEqual(
      filesOverlappingWindow(files, start, end, 300, 60, 'raptor-day'),
      ['/mnt/mmcblk0p1/raptor/2026-09-07/17-00-00.mp4'],
    );
  });

  it('reads the Raptor rotation out of raptor.conf', () => {
    // Shape taken from /etc/raptor.conf on a live master camera: the knobs ship
    // commented out, so a stock recorder falls through to its own default.
    const stock = [
      '[recording]',
      'enabled = true',
      'mode = continuous',
      'storage_path = /mnt/mmcblk0p1/raptor',
      '# segment_minutes = 5',
      '# segment_seconds = 0          # nonzero overrides segment_minutes',
      '# clip_length_sec = 60        # motion clip max duration',
    ].join('\n');
    assert.equal(parseRaptorSegmentSeconds(stock), null);
    assert.equal(defaultClipDuration('raptor-day', null, null), 300);

    const tuned = stock.replace(
      '# segment_minutes = 5',
      'segment_minutes = 10',
    );
    assert.equal(parseRaptorSegmentSeconds(tuned), 600);
    assert.equal(defaultClipDuration('raptor-day', 60, 600), 600);

    // segment_seconds wins when nonzero, and zero means "not set".
    assert.equal(
      parseRaptorSegmentSeconds(
        tuned.replace('# segment_seconds = 0', 'segment_seconds = 90'),
      ),
      90,
    );
    assert.equal(
      parseRaptorSegmentSeconds(
        tuned.replace('# segment_seconds = 0', 'segment_seconds = 0'),
      ),
      600,
    );

    // A segment_minutes under another section is not the recorder's.
    assert.equal(
      parseRaptorSegmentSeconds('[timelapse]\nsegment_minutes = 30\n'),
      null,
    );
  });

  it('never stretches a Prudynt clip to reach the next one', () => {
    // A really ends at 17:01:00. Stretching it to B's 17:01:50 start would make
    // it files[0] and shift processVideo's -ss offset onto a clip that is not
    // in the window at all.
    const files = [
      '/mnt/mmcblk0p1/littercam/2026/09/07/17-00-00.mp4',
      '/mnt/mmcblk0p1/littercam/2026/09/07/17-01-50.mp4',
    ];
    const start = new Date(2026, 8, 7, 17, 2, 0);
    const end = new Date(2026, 8, 7, 17, 2, 30);
    assert.deepEqual(
      filesOverlappingWindow(files, start, end, 60, 60, 'prudynt-day'),
      ['/mnt/mmcblk0p1/littercam/2026/09/07/17-01-50.mp4'],
    );
  });
});
