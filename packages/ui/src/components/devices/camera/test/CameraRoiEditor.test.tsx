import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { CameraRoiEditor, type CameraCropRect } from '../CameraRoiEditor.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const RESIZE_LABELS = {
  nw: 'Resize from the top-left corner',
  ne: 'Resize from the top-right corner',
  sw: 'Resize from the bottom-left corner',
  se: 'Resize from the bottom-right corner',
};

async function renderEditor(
  crop: CameraCropRect,
  onCropChange: (crop: CameraCropRect) => void,
) {
  return renderWithProviders(
    <CameraRoiEditor
      snapshotUrl="/snapshot.jpg"
      snapshotAlt="Camera snapshot"
      crop={crop}
      onCropChange={onCropChange}
      onRefresh={() => {}}
      refreshLabel="Refresh"
      moveLabel="Region of interest"
      resizeLabels={RESIZE_LABELS}
      instructions="Drag or use the arrow keys."
    />,
  );
}

/**
 * Drag deltas divide by the container's measured bounds, which are zero in
 * jsdom; pin them to a 200x100 frame so pointer math is deterministic.
 */
function stubContainerBounds() {
  const container = document.querySelector('.roi-container');
  assert.ok(container);
  (container as HTMLElement).getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    }) as DOMRect;
}

function approximately(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

describe('CameraRoiEditor', () => {
  it('moves the crop by pointer drag and clamps it inside the frame', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.4, top: 0.4, width: 0.5, height: 0.5 },
      (crop) => seen.push(crop),
    );
    stubContainerBounds();

    const surface = screen.getByRole('button', { name: 'Region of interest' });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerUp(surface, { pointerId: 1 });

    assert.equal(seen.length, 1);
    approximately(seen[0].left, 0.5, 'left clamps to 1 - width');
    approximately(seen[0].top, 0.5, 'top clamps to 1 - height');
    approximately(seen[0].width, 0.5, 'width unchanged by move');
    approximately(seen[0].height, 0.5, 'height unchanged by move');
  });

  it('resizes from a corner and enforces the 0.01 minimum size', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.2, top: 0.2, width: 0.5, height: 0.5 },
      (crop) => seen.push(crop),
    );
    stubContainerBounds();

    const handle = screen.getByRole('button', {
      name: 'Resize from the bottom-right corner',
    });
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 140, clientY: 70 });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: -1000,
      clientY: -1000,
    });
    fireEvent.pointerUp(handle, { pointerId: 1 });

    assert.equal(seen.length, 1);
    approximately(seen[0].left, 0.2, 'anchored edge stays put');
    approximately(seen[0].top, 0.2, 'anchored edge stays put');
    approximately(seen[0].width, 0.01, 'width floors at the minimum');
    approximately(seen[0].height, 0.01, 'height floors at the minimum');
  });

  it('stops mutating the crop after a cancelled pointer gesture', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.1, top: 0.1, width: 0.5, height: 0.5 },
      (crop) => seen.push(crop),
    );
    stubContainerBounds();

    const surface = screen.getByRole('button', { name: 'Region of interest' });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 60, clientY: 50 });
    assert.equal(seen.length, 1);

    fireEvent.pointerCancel(surface, { pointerId: 1 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 90, clientY: 90 });
    assert.equal(seen.length, 1, 'moves after pointercancel are ignored');
  });

  it('moves the crop with the arrow keys, larger with Shift', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.5, top: 0.5, width: 0.2, height: 0.2 },
      (crop) => seen.push(crop),
    );

    const surface = screen.getByRole('button', { name: 'Region of interest' });
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    fireEvent.keyDown(surface, { key: 'ArrowUp', shiftKey: true });

    assert.equal(seen.length, 2);
    approximately(seen[0].left, 0.51, 'small step right');
    approximately(seen[1].top, 0.4, 'large step up with Shift');
  });

  it('clamps keyboard moves at the frame edge', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.8, top: 0.5, width: 0.2, height: 0.2 },
      (crop) => seen.push(crop),
    );

    const surface = screen.getByRole('button', { name: 'Region of interest' });
    fireEvent.keyDown(surface, { key: 'ArrowRight' });

    assert.equal(seen.length, 1);
    approximately(seen[0].left, 0.8, 'left cannot exceed 1 - width');
  });

  it('resizes with the arrow keys on a corner handle', async () => {
    const seen: CameraCropRect[] = [];
    await renderEditor(
      { left: 0.2, top: 0.2, width: 0.4, height: 0.4 },
      (crop) => seen.push(crop),
    );

    const handle = screen.getByRole('button', {
      name: 'Resize from the bottom-right corner',
    });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });

    assert.equal(seen.length, 1);
    approximately(seen[0].width, 0.41, 'right edge grows by one step');
    approximately(seen[0].left, 0.2, 'left edge unchanged');
  });

  it('describes the controls with the instructions text', async () => {
    await renderEditor(
      { left: 0.2, top: 0.2, width: 0.4, height: 0.4 },
      () => {},
    );

    const surface = screen.getByRole('button', { name: 'Region of interest' });
    assert.equal(
      surface.getAttribute('aria-describedby')
        ? document.getElementById(
            surface.getAttribute('aria-describedby') as string,
          )?.textContent
        : null,
      'Drag or use the arrow keys.',
    );
  });
});
