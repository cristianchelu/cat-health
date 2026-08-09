import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CameraTabView, type CameraTabViewProps } from '../CameraTabView.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

function baseProps(
  overrides: Partial<CameraTabViewProps> = {},
): CameraTabViewProps {
  return {
    copy: {
      title: 'Camera',
      sourceSubtitle: 'Source, framing & rotation',
      changeSource: 'Change',
      noSourceTitle: 'No camera selected',
      pickerTitle: 'Choose a camera',
      pickerEmpty: 'No cameras available',
      noneSource: 'None',
      snapshotAlt: 'Camera snapshot',
      refreshSnapshot: 'Refresh',
      roiMoveLabel: 'Region of interest',
      roiResizeLabels: {
        nw: 'Resize from the top-left corner',
        ne: 'Resize from the top-right corner',
        sw: 'Resize from the bottom-left corner',
        se: 'Resize from the bottom-right corner',
      },
      roiInstructions: 'Drag or use the arrow keys.',
      rotateLabel: 'Rotation',
      captureTitle: 'Capture',
      captureSubtitle: 'What to grab on each visit',
      snapshotLabel: 'Snapshot on activity',
      snapshotHint: 'Frames while a visit is in progress',
      snapshotIntervalLabel: 'Interval (seconds)',
      snapshotIntervalHint: 'Seconds between frames.',
      snapshotFirstFrameDelayLabel: 'First frame delay (seconds)',
      snapshotFirstFrameDelayHint: 'Wait after activity starts.',
      recordingLabel: 'Record clip',
      recordingHint: "Fetch the camera's recording after each visit",
      fetchDelayLabel: 'Fetch delay (seconds)',
      fetchDelayHint: 'Wait before fetching.',
      cancelLabel: 'Cancel',
      saveLabel: 'Save',
      saveError: 'Could not save camera settings.',
      emptyTitle: 'No camera to link',
      emptyDescription: 'Link an existing camera or add a new one.',
      emptyCta: 'Add a camera',
    },
    hasLinkableCameras: true,
    onAddDevice: () => {},
    isLinked: false,
    onOpenPicker: () => {},
    pickerOpen: false,
    onPickerOpenChange: () => {},
    cameraOptions: [],
    onSelectCamera: () => {},
    onRefreshSnapshot: () => {},
    crop: { left: 0, top: 0, width: 1, height: 1 },
    onCropChange: () => {},
    rotate: undefined,
    onRotateChange: () => {},
    snapshotEnabled: true,
    onToggleSnapshot: () => {},
    recordingEnabled: false,
    onToggleRecording: () => {},
    snapshotIntervalSec: 0,
    onSnapshotIntervalChange: () => {},
    snapshotFirstFrameDelaySec: 0,
    onSnapshotFirstFrameDelayChange: () => {},
    fetchDelay: 60,
    onFetchDelayChange: () => {},
    onSubmit: () => {},
    onCancel: () => {},
    isDirty: false,
    isSaving: false,
    saveFailed: false,
    discardConfirm: { open: false, onConfirm: () => {}, onCancel: () => {} },
    ...overrides,
  };
}

describe('CameraTabView', () => {
  it('shows the empty state with an add-device CTA when no cameras can be linked', async () => {
    await renderWithProviders(
      <CameraTabView
        {...baseProps({ hasLinkableCameras: false, isLinked: false })}
      />,
    );

    assert.ok(screen.getByText('No camera to link'));
    assert.ok(screen.getByRole('button', { name: 'Add a camera' }));
  });

  it('does not show the empty state when already linked even if nothing else is linkable', async () => {
    await renderWithProviders(
      <CameraTabView
        {...baseProps({
          hasLinkableCameras: false,
          isLinked: true,
          sourceName: 'Litterbox Camera',
        })}
      />,
    );

    assert.equal(screen.queryByText('No camera to link'), null);
    assert.ok(screen.getByText('Litterbox Camera'));
  });

  it('keeps the form (with Save) when clearing the only source while dirty', async () => {
    await renderWithProviders(
      <CameraTabView
        {...baseProps({
          hasLinkableCameras: false,
          isLinked: false,
          isDirty: true,
        })}
      />,
    );

    assert.equal(screen.queryByText('No camera to link'), null);
    assert.ok(screen.getByRole('button', { name: 'Save' }));
    assert.ok(screen.getByText('No camera selected'));
  });

  it('does not render a header Unlink control', async () => {
    await renderWithProviders(
      <CameraTabView
        {...baseProps({
          isLinked: true,
          sourceName: 'Litterbox Camera',
        })}
      />,
    );

    assert.equal(screen.queryByRole('button', { name: 'Unlink' }), null);
    assert.ok(screen.getByRole('button', { name: 'Change' }));
  });

  it('calls onAddDevice when the empty-state CTA is clicked', async () => {
    const user = userEvent.setup();
    let clicked = false;

    await renderWithProviders(
      <CameraTabView
        {...baseProps({
          hasLinkableCameras: false,
          isLinked: false,
          onAddDevice: () => {
            clicked = true;
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add a camera' }));
    assert.equal(clicked, true);
  });

  it('does not render the empty state when a camera can be linked', async () => {
    await renderWithProviders(
      <CameraTabView {...baseProps({ hasLinkableCameras: true })} />,
    );

    assert.equal(screen.queryByText('No camera to link'), null);
  });

  it('shows the save error banner when saveFailed is set', async () => {
    await renderWithProviders(
      <CameraTabView {...baseProps({ saveFailed: true })} />,
    );

    assert.ok(screen.getByText('Could not save camera settings.'));
  });

  it('does not show the save error banner otherwise', async () => {
    await renderWithProviders(<CameraTabView {...baseProps()} />);

    assert.equal(screen.queryByText('Could not save camera settings.'), null);
  });

  it('disables Save when the draft is clean', async () => {
    await renderWithProviders(
      <CameraTabView {...baseProps({ isDirty: false })} />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('disables Save while saving even when dirty', async () => {
    await renderWithProviders(
      <CameraTabView {...baseProps({ isDirty: true, isSaving: true })} />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(save.hasAttribute('disabled'), true);
  });

  it('enables Save when dirty and not saving', async () => {
    await renderWithProviders(
      <CameraTabView {...baseProps({ isDirty: true, isSaving: false })} />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    assert.equal(save.hasAttribute('disabled'), false);
  });

  it('reports rotation selection and marks the active option', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];

    await renderWithProviders(
      <CameraTabView
        {...baseProps({
          isLinked: true,
          sourceName: 'Litterbox Camera',
          rotate: 180,
          onRotateChange: (deg) => seen.push(deg),
        })}
      />,
    );

    const group = screen.getByRole('group', { name: 'Rotation' });
    assert.ok(group);

    const active = screen.getByRole('button', { name: '180°' });
    assert.equal(active.getAttribute('aria-pressed'), 'true');
    assert.equal(
      screen.getByRole('button', { name: '90°' }).getAttribute('aria-pressed'),
      'false',
    );

    await user.click(screen.getByRole('button', { name: '90°' }));
    assert.deepEqual(seen, [90]);
  });
});
