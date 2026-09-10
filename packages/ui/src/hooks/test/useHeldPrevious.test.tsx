import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, render } from '@testing-library/react';

import { useHeldPrevious } from '../useHeldPrevious.ts';

afterEach(() => {
  cleanup();
});

function Probe({ item, itemKey }: { item: string; itemKey: string }) {
  const { current, previous } = useHeldPrevious(item, itemKey);
  return (
    <div>
      <span data-current={current} />
      {previous !== undefined ? <span data-previous={previous} /> : null}
    </div>
  );
}

describe('useHeldPrevious', () => {
  it('keeps the previous item after the key changes', () => {
    const { rerender, container } = render(
      <Probe item="one.jpg" itemKey="one.jpg" />,
    );

    assert.equal(container.querySelector('[data-previous]'), null);

    rerender(<Probe item="two.jpg" itemKey="two.jpg" />);

    assert.equal(
      container.querySelector('[data-current]')?.getAttribute('data-current'),
      'two.jpg',
    );
    assert.equal(
      container.querySelector('[data-previous]')?.getAttribute('data-previous'),
      'one.jpg',
    );
  });
});
