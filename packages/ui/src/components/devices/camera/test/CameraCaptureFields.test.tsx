import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CameraCaptureFields,
  type CameraCaptureFieldsProps,
} from '../CameraCaptureFields.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function baseProps(
  overrides: Partial<CameraCaptureFieldsProps> = {},
): CameraCaptureFieldsProps {
  return {
    snapshotEnabled: true,
    onToggleSnapshot: () => {},
    snapshotLabel: 'Snapshot on activity',
    snapshotHint: 'Frames while a visit is in progress',
    snapshotIntervalSec: 0,
    onSnapshotIntervalChange: () => {},
    snapshotIntervalLabel: 'Interval (seconds)',
    snapshotIntervalHint: 'Seconds between frames.',
    snapshotFirstFrameDelaySec: 0,
    onSnapshotFirstFrameDelayChange: () => {},
    snapshotFirstFrameDelayLabel: 'First frame delay (seconds)',
    snapshotFirstFrameDelayHint: 'Wait after activity starts.',
    recordingEnabled: false,
    onToggleRecording: () => {},
    recordingLabel: 'Record clip',
    recordingHint: "Fetch the camera's recording after each visit",
    fetchDelay: 60,
    onFetchDelayChange: () => {},
    fetchDelayLabel: 'Fetch delay (seconds)',
    fetchDelayHint: 'Wait before fetching.',
    ...overrides,
  };
}

describe('CameraCaptureFields', () => {
  it('folds the snapshot timing fields out only while snapshot is enabled', async () => {
    const { rerender } = await renderWithProviders(
      <CameraCaptureFields {...baseProps({ snapshotEnabled: false })} />,
    );

    assert.equal(
      screen.queryByRole('spinbutton', { name: 'Interval (seconds)' }),
      null,
    );

    rerender(<CameraCaptureFields {...baseProps({ snapshotEnabled: true })} />);

    assert.ok(screen.getByRole('spinbutton', { name: 'Interval (seconds)' }));
    assert.ok(
      screen.getByRole('spinbutton', { name: 'First frame delay (seconds)' }),
    );
  });

  it('folds the fetch delay field out only while recording is enabled', async () => {
    const { rerender } = await renderWithProviders(
      <CameraCaptureFields {...baseProps({ recordingEnabled: false })} />,
    );

    assert.equal(
      screen.queryByRole('spinbutton', { name: 'Fetch delay (seconds)' }),
      null,
    );

    rerender(
      <CameraCaptureFields {...baseProps({ recordingEnabled: true })} />,
    );

    assert.ok(
      screen.getByRole('spinbutton', { name: 'Fetch delay (seconds)' }),
    );
  });

  it('links each field to its hint via aria-describedby', async () => {
    await renderWithProviders(<CameraCaptureFields {...baseProps()} />);

    const input = screen.getByRole('spinbutton', {
      name: 'Interval (seconds)',
    });
    const describedBy = input.getAttribute('aria-describedby');
    assert.ok(describedBy);
    assert.equal(
      document.getElementById(describedBy as string)?.textContent,
      'Seconds between frames.',
    );
  });

  it('stays empty while the user clears the field and commits 0 on blur', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];

    await renderWithProviders(
      <CameraCaptureFields
        {...baseProps({
          snapshotIntervalSec: 5,
          onSnapshotIntervalChange: (value) => seen.push(value),
        })}
      />,
    );

    const input = screen.getByRole('spinbutton', {
      name: 'Interval (seconds)',
    });
    await user.clear(input);

    assert.equal((input as HTMLInputElement).value, '');
    assert.deepEqual(seen, [], 'clearing must not snap the draft to 0');

    await user.tab();
    assert.deepEqual(seen, [0], 'blur commits the empty field as 0');
  });

  it('commits typed values as non-negative numbers', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];

    await renderWithProviders(
      <CameraCaptureFields
        {...baseProps({
          snapshotIntervalSec: 0,
          onSnapshotIntervalChange: (value) => seen.push(value),
        })}
      />,
    );

    const input = screen.getByRole('spinbutton', {
      name: 'Interval (seconds)',
    });
    await user.clear(input);
    await user.type(input, '2.5');

    assert.equal(seen.at(-1), 2.5);
  });
});
