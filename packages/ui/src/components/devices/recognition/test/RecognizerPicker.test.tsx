import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RecognizerPicker } from '../RecognizerPicker.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

const RECOGNIZERS = [
  { id: 1, name: 'Living Room', model: 'yolov8n' },
  { id: 2, name: 'Spare Room', model: 'yolov8s' },
];

function renderPicker(overrides: { selectedId?: number } = {}) {
  return renderWithProviders(
    <RecognizerPicker
      open
      onOpenChange={() => {}}
      title="Choose a recognizer"
      recognizers={RECOGNIZERS}
      emptyLabel="No recognizers yet"
      onSelect={() => {}}
      {...overrides}
    />,
  );
}

describe('RecognizerPicker', () => {
  it('lists every recognizer with its model', async () => {
    await renderPicker();

    const rows = document.querySelectorAll(
      '.recognizer-picker-list .list-item',
    );
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent ?? '', /Living Room/);
    assert.match(rows[0].textContent ?? '', /yolov8n/);
  });

  it('marks the linked one, and only that one', async () => {
    await renderPicker({ selectedId: 2 });

    const rows = [
      ...document.querySelectorAll('.recognizer-picker-list .list-item'),
    ];
    assert.equal(rows[1].getAttribute('aria-current'), 'true');
    assert.equal(rows[0].getAttribute('aria-current'), null);
    /* The check belongs to the choice, not to every row that could be one. */
    assert.equal(document.querySelectorAll('.item-check').length, 1);
  });

  it('reports the recognizer that was picked', async () => {
    const picked: number[] = [];
    await renderWithProviders(
      <RecognizerPicker
        open
        onOpenChange={() => {}}
        title="Choose a recognizer"
        recognizers={RECOGNIZERS}
        emptyLabel="No recognizers yet"
        onSelect={(id) => picked.push(id)}
      />,
    );

    await userEvent.click(screen.getByText('Spare Room'));
    assert.deepEqual(picked, [2]);
  });

  it('says so when there is nothing to choose from', async () => {
    await renderWithProviders(
      <RecognizerPicker
        open
        onOpenChange={() => {}}
        title="Choose a recognizer"
        recognizers={[]}
        emptyLabel="No recognizers yet"
        onSelect={() => {}}
      />,
    );

    assert.ok(screen.getByText('No recognizers yet'));
    assert.equal(document.querySelectorAll('.list-item').length, 0);
  });
});
