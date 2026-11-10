import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import * as React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { BandValueInput } from '../BandValueInput.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

/** A band whose target must stay within 100–300, with the committed values shown beside it. */
function ControlledBand() {
  const [band, setBand] = React.useState({ target: 200, tolerance: 20 });
  return (
    <>
      <BandValueInput
        target={band.target}
        tolerance={band.tolerance}
        targetMin={100}
        targetMax={300}
        onTargetCommit={(target) => setBand((b) => ({ ...b, target }))}
        onToleranceCommit={(tolerance) => setBand((b) => ({ ...b, tolerance }))}
        unit="kcal"
        note="≈ 1 × resting need"
        targetLabel="Target"
        toleranceLabel="Tolerance"
      />
      <output>{`${band.target} ± ${band.tolerance}`}</output>
    </>
  );
}

const targetInput = () => screen.getByRole('textbox', { name: 'Target' });
const committed = () => screen.getByRole('status').textContent;

describe('BandValueInput', () => {
  it('takes a typed target as soon as it is inside the range', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.change(targetInput(), { target: { value: '250' } });
    assert.equal(committed(), '250 ± 20');
  });

  it('keeps a half-typed target as a draft, without moving the band', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.change(targetInput(), { target: { value: '25' } });
    assert.deepEqual(
      [committed(), targetInput().getAttribute('value')],
      ['200 ± 20', '25'],
    );
  });

  it('drops a draft that never became a value when focus leaves', async () => {
    await renderWithProviders(<ControlledBand />);
    fireEvent.change(targetInput(), { target: { value: '25' } });
    fireEvent.blur(targetInput());
    assert.equal(targetInput().getAttribute('value'), '200');
  });

  it('reads a decimal comma', async () => {
    await renderWithProviders(<ControlledBand />);
    const tolerance = screen.getByRole('textbox', { name: 'Tolerance' });
    fireEvent.change(tolerance, { target: { value: '4,5' } });
    assert.equal(committed(), '200 ± 4.5');
  });

  it('refuses a negative tolerance', async () => {
    await renderWithProviders(<ControlledBand />);
    const tolerance = screen.getByRole('textbox', { name: 'Tolerance' });
    fireEvent.change(tolerance, { target: { value: '-5' } });
    assert.equal(committed(), '200 ± 20');
  });
});
