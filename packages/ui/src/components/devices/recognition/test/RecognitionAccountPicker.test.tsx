import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RecognitionAccountPicker } from '../RecognitionAccountPicker.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const ACCOUNTS = [
  { id: 1, name: 'OpenRouter', description: 'Inference' },
  { id: 2, name: 'Spare key', description: 'Inference' },
];

function renderPicker(
  overrides: {
    selectedId?: number | null;
    accounts?: typeof ACCOUNTS;
    onSelect?: (id: number | null) => void;
  } = {},
) {
  const { accounts = ACCOUNTS, ...rest } = overrides;
  return renderWithProviders(
    <RecognitionAccountPicker
      open
      onOpenChange={() => {}}
      title="Choose an account"
      accounts={accounts}
      noneLabel="None"
      emptyLabel="No accounts available."
      onSelect={() => {}}
      {...rest}
    />,
  );
}

/* DS picker rows: the list is a radiogroup, so the rows answer as radios. */
const rows = () => screen.getAllByRole('radio');

describe('RecognitionAccountPicker', () => {
  it('lists every account with its provider, plus a None row', async () => {
    await renderPicker();

    assert.equal(rows().length, 3);
    assert.match(rows()[0].textContent ?? '', /None/);
    assert.match(rows()[1].textContent ?? '', /OpenRouter/);
    assert.match(rows()[1].textContent ?? '', /Inference/);
  });

  it('marks the linked one, and only that one', async () => {
    await renderPicker({ selectedId: 2 });

    assert.equal(rows()[2].getAttribute('aria-checked'), 'true');
    assert.equal(rows()[1].getAttribute('aria-checked'), 'false');
    /* The check belongs to the choice, not to every row that could be one. */
    assert.equal(document.querySelectorAll('.picker-row-check').length, 1);
  });

  it('marks None when nothing is linked', async () => {
    await renderPicker({ selectedId: null });

    assert.equal(rows()[0].getAttribute('aria-checked'), 'true');
    assert.equal(document.querySelectorAll('.picker-row-check').length, 1);
  });

  it('reports the account that was picked', async () => {
    const picked: Array<number | null> = [];
    await renderPicker({ onSelect: (id) => picked.push(id) });

    await userEvent.click(screen.getByText('Spare key'));
    assert.deepEqual(picked, [2]);
  });

  it('reports null when None is picked, so the tab can unlink', async () => {
    const picked: Array<number | null> = [];
    await renderPicker({ selectedId: 1, onSelect: (id) => picked.push(id) });

    await userEvent.click(screen.getByText('None'));
    assert.deepEqual(picked, [null]);
  });

  it('says so when there is nothing to choose from', async () => {
    await renderPicker({ accounts: [] });

    assert.ok(screen.getByText('No accounts available.'));
    assert.equal(document.querySelectorAll('.picker-row').length, 0);
  });
});
