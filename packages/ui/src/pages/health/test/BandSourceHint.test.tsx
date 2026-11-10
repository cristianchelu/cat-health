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
      sentences={[
        'According to FEDIAF 2025: Table VII-9.',
        "The source gives one number, so the ± is the app's.",
      ]}
      href="https://example.org/fediaf.pdf"
      linkLabel="Read the source"
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Where these numbers come from' }),
  );
}

describe('BandSourceHint', () => {
  it('says every sentence about the source once opened', async () => {
    await openHint();
    assert.ok(
      screen.getByText(
        "According to FEDIAF 2025: Table VII-9. The source gives one number, so the ± is the app's.",
      ),
    );
  });

  it('links to the source in a new tab', async () => {
    await openHint();
    const link = screen.getByRole('link', { name: 'Read the source' });
    assert.deepEqual(
      [link.getAttribute('href'), link.getAttribute('target')],
      ['https://example.org/fediaf.pdf', '_blank'],
    );
  });
});
