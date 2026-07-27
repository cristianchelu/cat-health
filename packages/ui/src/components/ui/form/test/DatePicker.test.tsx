import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';

import { DatePicker } from '../DatePicker.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('DatePicker', () => {
  it('shows a stored calendar date unshifted', async () => {
    // Regression: the value used to be parsed with `new Date('2021-03-25')`,
    // which is UTC midnight, then formatted in local time — so every user west
    // of UTC saw 2021-03-24. Re-picking the displayed date then wrote a value
    // that differed from the stored one, marking an untouched form dirty.
    await renderWithProviders(
      <DatePicker aria-label="Birth date" value="2021-03-25" readOnly />,
    );

    const input = screen.getByLabelText<HTMLInputElement>('Birth date');
    assert.equal(input.value, '2021-03-25');
  });

  it('renders an empty string for a missing or unparseable value', async () => {
    await renderWithProviders(
      <>
        <DatePicker aria-label="Empty" value="" readOnly />
        <DatePicker aria-label="Junk" value="not-a-date" readOnly />
      </>,
    );

    assert.equal(screen.getByLabelText<HTMLInputElement>('Empty').value, '');
    assert.equal(screen.getByLabelText<HTMLInputElement>('Junk').value, '');
  });
});
