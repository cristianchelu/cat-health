import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import * as React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { Slider } from '../Slider.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const DETENTS = [0, 21, 43, 64, 85, 106, 128, 149, 170];

function ControlledSlider({
  initial = 40,
  withDetents = true,
  onChange,
}: {
  initial?: number;
  withDetents?: boolean;
  onChange?: (value: number) => void;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <Slider
      value={value}
      min={0}
      max={170}
      step={1}
      detents={withDetents ? DETENTS : undefined}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      label="Amount in grams"
      valueText={`${value} g`}
    />
  );
}

/** jsdom gives every element a zero-size rect; the slider needs a real one. */
function stubTrackRect(track: HTMLElement) {
  track.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 100,
      left: 0,
      right: 200,
      top: 100,
      bottom: 110,
      width: 200,
      height: 10,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('Slider', () => {
  it('exposes slider semantics with the value text', async () => {
    await renderWithProviders(<ControlledSlider />);
    const thumb = screen.getByRole('slider', { name: 'Amount in grams' });

    assert.equal(thumb.getAttribute('aria-valuenow'), '40');
    assert.equal(thumb.getAttribute('aria-valuemin'), '0');
    assert.equal(thumb.getAttribute('aria-valuemax'), '170');
    assert.equal(thumb.getAttribute('aria-valuetext'), '40 g');
  });

  it('moves by step on arrows and by detent on page keys', async () => {
    await renderWithProviders(<ControlledSlider />);
    const thumb = screen.getByRole('slider');

    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '41');

    fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '39');

    fireEvent.keyDown(thumb, { key: 'PageUp' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '43');

    fireEvent.keyDown(thumb, { key: 'PageDown' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '21');
  });

  it('clamps at both ends', async () => {
    await renderWithProviders(<ControlledSlider />);
    const thumb = screen.getByRole('slider');

    fireEvent.keyDown(thumb, { key: 'Home' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '0');
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '0');

    fireEvent.keyDown(thumb, { key: 'End' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '170');
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '170');
  });

  it('falls back to ten steps on page keys when there are no detents', async () => {
    await renderWithProviders(<ControlledSlider withDetents={false} />);
    const thumb = screen.getByRole('slider');

    fireEvent.keyDown(thumb, { key: 'PageUp' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '50');
    fireEvent.keyDown(thumb, { key: 'PageDown' });
    assert.equal(thumb.getAttribute('aria-valuenow'), '40');
  });

  it('drags fine above the track and snaps to detents below it', async () => {
    const { container } = await renderWithProviders(<ControlledSlider />);
    const surface = container.querySelector('.slider') as HTMLElement;
    const track = container.querySelector('.slider-track') as HTMLElement;
    stubTrackRect(track);
    const thumb = screen.getByRole('slider');

    // Half the 200px-wide track at 0-170 is 85; a hair right of it is 86.
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 101,
      clientY: 102, // above the track's vertical centre (105) → fine
    });
    assert.equal(thumb.getAttribute('aria-valuenow'), '86');

    // Same x, but below the centre → the nearest detent, 85.
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 101,
      clientY: 108,
    });
    assert.equal(thumb.getAttribute('aria-valuenow'), '85');

    // And back to fine granularity mid-drag, no mode switch.
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 110,
      clientY: 101,
    });
    assert.equal(thumb.getAttribute('aria-valuenow'), '94');
  });

  it('still moves when the browser refuses to capture the pointer', async () => {
    const { container } = await renderWithProviders(<ControlledSlider />);
    const surface = container.querySelector('.slider') as HTMLElement;
    stubTrackRect(container.querySelector('.slider-track') as HTMLElement);
    // Chrome throws NotFoundError for a pointer that is no longer active;
    // losing capture must not cost us the interaction.
    surface.setPointerCapture = () => {
      throw new Error('NotFoundError');
    };

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 101,
      clientY: 102,
    });
    assert.equal(
      screen.getByRole('slider').getAttribute('aria-valuenow'),
      '86',
    );
  });

  it('ignores pointer moves that are not part of a drag', async () => {
    const { container } = await renderWithProviders(<ControlledSlider />);
    const surface = container.querySelector('.slider') as HTMLElement;
    stubTrackRect(container.querySelector('.slider-track') as HTMLElement);

    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 10, clientY: 102 });
    assert.equal(
      screen.getByRole('slider').getAttribute('aria-valuenow'),
      '40',
    );
  });

  it('renders a tick per detent and a label only where one is given', async () => {
    const { container } = await renderWithProviders(
      <Slider
        value={40}
        min={0}
        max={170}
        step={1}
        detents={DETENTS}
        detentLabels={new Map([[85, '1 pouch']])}
        onValueChange={() => {}}
        label="Amount in grams"
      />,
    );

    assert.equal(container.querySelectorAll('.slider-tick').length, 9);
    const labels = container.querySelectorAll('.slider-label');
    assert.equal(labels.length, 1);
    assert.equal(labels[0].textContent, '1 pouch');
  });
});
