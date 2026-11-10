import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { BandSourceHint } from '../components/BandSourceHint.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

async function openHint() {
  await renderWithProviders(
    <BandSourceHint
      label="Where these numbers come from"
      source="FEDIAF 2025"
      reference="Table VII-9, neutered and/or indoor"
      notes={["The source gives one number, so the ± is the app's."]}
      href="https://example.org/fediaf.pdf"
      linkLabel="Read the source"
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Where these numbers come from' }),
  );
}

describe('BandSourceHint', () => {
  it('names the source, then the place in it, then what the app changed', async () => {
    await openHint();
    const tip = screen.getByRole('dialog');
    assert.equal(
      tip.textContent,
      "FEDIAF 2025 Table VII-9, neutered and/or indoorThe source gives one number, so the ± is the app's.",
    );
  });

  it('links to the source in a new tab, as an icon with a name', async () => {
    await openHint();
    const link = screen.getByRole('link', { name: 'Read the source' });
    assert.deepEqual(
      [link.getAttribute('href'), link.getAttribute('target')],
      ['https://example.org/fediaf.pdf', '_blank'],
    );
  });
});
