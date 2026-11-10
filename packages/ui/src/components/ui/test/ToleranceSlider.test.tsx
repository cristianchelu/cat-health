import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import * as React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { ToleranceSlider } from '../ToleranceSlider.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const NOTCHES = [
  { key: 'lose', value: 180, label: 'Lose weight', tolerance: 10 },
  { key: 'maintain', value: 220, label: 'Maintain', tolerance: 40 },
];

/** A band on a 100–300 kcal track that applies whatever the slider asks for. */
function ControlledBand({ far = false }: { far?: boolean }) {
  const [band, setBand] = React.useState({ target: 200, tolerance: 20 });
  const notches = far ? [NOTCHES[0], { ...NOTCHES[1], value: 280 }] : NOTCHES;
  const onNotch = notches.find(
    (notch) =>
      notch.value === band.target && notch.tolerance === band.tolerance,
  );
  return (
    <ToleranceSlider
      target={band.target}
      tolerance={band.tolerance}
      min={100}
      max={300}
      step={5}
      notches={notches}
      activeNotch={onNotch?.key ?? null}
      onTargetChange={(target) => setBand((b) => ({ ...b, target }))}
      onToleranceChange={(tolerance) => setBand((b) => ({ ...b, tolerance }))}
      onNotchSelect={(key) => {
        const notch = notches.find((n) => n.key === key);
        if (notch) setBand({ target: notch.value, tolerance: notch.tolerance });
      }}
      targetLabel="Target"
      toleranceLabel="Tolerance"
      targetValueText={`${band.target} kcal`}
    />
  );
}

/** jsdom gives every element a zero-size rect; the slider needs a real one: 200px wide, so 1px is 1 kcal. */
function stubTrackRect() {
  const track = document.querySelector('.slider-track');
  assert.ok(track instanceof HTMLElement);
  const rect: DOMRect = {
    x: 0,
    y: 100,
    left: 0,
    right: 200,
    top: 100,
    bottom: 104,
    width: 200,
    height: 4,
    toJSON: () => ({}),
  };
  track.getBoundingClientRect = () => rect;
  return track;
}

const target = () => screen.getByRole('slider', { name: 'Target' });
const edges = () => screen.getAllByRole('slider', { name: 'Tolerance' });

describe('ToleranceSlider', () => {
  it('exposes the target as a slider with its value text', async () => {
    await renderWithProviders(<ControlledBand />);
    assert.deepEqual(
      [
        target().getAttribute('aria-valuenow'),
        target().getAttribute('aria-valuetext'),
      ],
      ['200', '200 kcal'],
    );
  });

  it('shows the tolerance as two edge cursors', async () => {
    await renderWithProviders(<ControlledBand />);
    assert.deepEqual(
      edges().map((edge) => edge.getAttribute('aria-valuenow')),
      ['20', '20'],
    );
  });

  it('moves the target by a step on the arrow keys', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.keyDown(target(), { key: 'ArrowRight' });
    assert.equal(target().getAttribute('aria-valuenow'), '205');
  });

  it('jumps the target to the next notch on PageUp', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.keyDown(target(), { key: 'PageUp' });
    assert.equal(target().getAttribute('aria-valuenow'), '220');
  });

  it('widens the band on the upper edge with the right arrow', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.keyDown(edges()[1], { key: 'ArrowRight' });
    assert.equal(edges()[1].getAttribute('aria-valuenow'), '25');
  });

  it('widens the band on the lower edge with the left arrow', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.keyDown(edges()[0], { key: 'ArrowLeft' });
    assert.equal(edges()[0].getAttribute('aria-valuenow'), '25');
  });

  it('picks a notch when its label is pressed', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.click(screen.getByRole('button', { name: 'Maintain' }));
    assert.equal(
      screen
        .getByRole('button', { name: 'Maintain' })
        .getAttribute('aria-pressed'),
      'true',
    );
  });

  it('moves the target in steps when dragged along the track', async () => {
    await renderWithProviders(<ControlledBand />);
    const track = stubTrackRect();
    fireEvent.pointerDown(track, { clientX: 100, clientY: 102 });
    fireEvent.pointerMove(track, { clientX: 163, clientY: 102 });
    assert.equal(target().getAttribute('aria-valuenow'), '265');
  });

  it('lands on the nearest notch when dragged over the labels', async () => {
    await renderWithProviders(<ControlledBand />);
    const track = stubTrackRect();
    fireEvent.pointerDown(track, { clientX: 100, clientY: 130 });
    fireEvent.pointerMove(track, { clientX: 130, clientY: 130 });
    assert.equal(target().getAttribute('aria-valuenow'), '220');
  });

  it('changes the tolerance when an edge cursor is dragged', async () => {
    await renderWithProviders(<ControlledBand />);
    const track = stubTrackRect();
    // The upper edge sits at 220 kcal, which is x = 120 on the stubbed track.
    fireEvent.pointerDown(track, { clientX: 121, clientY: 102 });
    fireEvent.pointerMove(track, { clientX: 150, clientY: 102 });
    assert.equal(edges()[1].getAttribute('aria-valuenow'), '50');
  });

  it('turns the labels of two crowded notches away from each other', async () => {
    await renderWithProviders(<ControlledBand />);
    assert.deepEqual(
      [
        screen
          .getByRole('button', { name: 'Lose weight' })
          .classList.contains('at-end'),
        screen
          .getByRole('button', { name: 'Maintain' })
          .classList.contains('at-start'),
      ],
      [true, true],
    );
  });

  it('centres the labels of notches that have room', async () => {
    await renderWithProviders(<ControlledBand far />);
    const label = screen.getByRole('button', { name: 'Maintain' });
    assert.deepEqual(
      [
        label.classList.contains('at-start'),
        label.classList.contains('at-end'),
      ],
      [false, false],
    );
  });
});
