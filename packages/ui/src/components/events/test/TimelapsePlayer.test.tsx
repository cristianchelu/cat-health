import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { act, cleanup } from '@testing-library/react';

import TimelapsePlayer from '../TimelapsePlayer.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
  mock.timers.reset();
});

describe('TimelapsePlayer', () => {
  it('keeps the previous frame mounted while the next src loads', async () => {
    mock.timers.enable({ apis: ['setInterval'] });

    const { container } = await renderWithProviders(
      <TimelapsePlayer
        frames={[
          { url: 'api/media/a.jpg', offsetSec: 0 },
          { url: 'api/media/b.jpg', offsetSec: 1 },
        ]}
        durationSec={2}
        intervalSec={1}
        alt="Visit"
      />,
    );

    assert.equal(container.querySelectorAll('img').length, 1);

    act(() => {
      mock.timers.tick(1000);
    });

    const frames = [...container.querySelectorAll('img')];
    assert.equal(frames.length, 2);
    assert.equal(frames[0]?.getAttribute('src'), 'api/media/a.jpg');
    assert.equal(frames[1]?.getAttribute('src'), 'api/media/b.jpg');
  });
});
