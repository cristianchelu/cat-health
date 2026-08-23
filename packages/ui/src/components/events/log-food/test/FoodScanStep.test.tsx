import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GetFoodDTO } from 'shared';

import { FoodScanStep } from '../FoodScanStep.tsx';
import { renderWithProviders } from '@/test/render.tsx';

before(() => {
  /* jsdom stubs playback out and always reports readyState 0; the scanner
     waits for both before it looks at a frame. */
  const media = (
    window as unknown as { HTMLMediaElement: { prototype: object } }
  ).HTMLMediaElement.prototype;
  Object.defineProperty(media, 'play', {
    configurable: true,
    writable: true,
    value: async () => {},
  });
  Object.defineProperty(media, 'readyState', {
    configurable: true,
    get: () => 4,
  });
});

afterEach(() => {
  cleanup();
});

function food(id: number, name: string, barcode: string | null): GetFoodDTO {
  return {
    id,
    name,
    brand: 'Royal Canin',
    food_type: 'complete_wet',
    barcode_ean13: barcode,
    moisture_percent: null,
    calories_per_100g: 90,
    nutrients: null,
    serving_size_g: 85,
    notes: null,
    created_at: 0,
    updated_at: 0,
  };
}

const FOODS = [food(1, 'Tuna in Gravy', '4002052003456')];

function fakeStream() {
  const stopped: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stopped.push('stopped') }],
  } as unknown as MediaStream;
  return { stream, stopped };
}

/** A detector that reports whatever the queue hands it, then nothing. */
function fakeDetector(codes: string[]) {
  const queue = [...codes];
  return {
    detect: async () => {
      const next = queue.shift();
      return next ? [{ rawValue: next }] : [];
    },
  };
}

describe('FoodScanStep', () => {
  it('hands the food on the moment it reads the code', async () => {
    const matched: GetFoodDTO[] = [];
    const { stream, stopped } = fakeStream();

    await renderWithProviders(
      <FoodScanStep
        foods={FOODS}
        onMatch={(f) => matched.push(f)}
        createDetector={() => fakeDetector(['4002052003456'])}
        requestCamera={async () => stream}
      />,
    );

    // No confirmation to sit through: the match is the answer.
    await waitFor(() => assert.equal(matched.length, 1));
    assert.equal(matched[0].id, 1);
    // And the camera is released without waiting to be unmounted.
    assert.equal(stopped.length, 1);
  });

  it('keeps scanning on one camera, however often it re-renders', async () => {
    /* The camera is opened by an effect. Were its inputs to change identity
       every render, a match would tear down the very timer meant to report
       it — the step would sit on the viewport forever. */
    let opened = 0;
    const { stream } = fakeStream();
    const matched: GetFoodDTO[] = [];

    await renderWithProviders(
      <FoodScanStep
        foods={FOODS}
        onMatch={(f) => matched.push(f)}
        createDetector={() => fakeDetector(['1111111111116', '4002052003456'])}
        requestCamera={async () => {
          opened += 1;
          return stream;
        }}
      />,
    );

    // A "no match" re-renders the step; the second code still gets through.
    await waitFor(() =>
      assert.ok(screen.getByText('No match in your library')),
    );
    await waitFor(() => assert.equal(matched.length, 1));
    assert.equal(opened, 1);
  });

  it('says so for a code the library does not hold, and rescans on request', async () => {
    const matched: GetFoodDTO[] = [];
    const { stream } = fakeStream();

    await renderWithProviders(
      <FoodScanStep
        foods={FOODS}
        onMatch={(f) => matched.push(f)}
        createDetector={() => fakeDetector(['1111111111116'])}
        requestCamera={async () => stream}
      />,
    );

    await waitFor(() =>
      assert.ok(screen.getByText('No match in your library')),
    );
    assert.equal(matched.length, 0);

    await userEvent.click(screen.getByRole('button', { name: 'Scan again' }));
    assert.equal(screen.queryByText('No match in your library'), null);
  });

  it('says the camera was refused rather than spinning forever', async () => {
    await renderWithProviders(
      <FoodScanStep
        foods={FOODS}
        onMatch={() => {}}
        createDetector={() => fakeDetector([])}
        requestCamera={async () => {
          throw new Error('NotAllowedError');
        }}
      />,
    );

    await waitFor(() =>
      assert.ok(screen.getByText('Camera access was denied')),
    );
  });

  it('releases the camera when it goes away', async () => {
    const { stream, stopped } = fakeStream();

    const { unmount } = await renderWithProviders(
      <FoodScanStep
        foods={FOODS}
        onMatch={() => {}}
        createDetector={() => fakeDetector([])}
        requestCamera={async () => stream}
      />,
    );

    await waitFor(() => assert.ok(screen.getByText(/Point at the barcode/)));
    unmount();
    await waitFor(() => assert.equal(stopped.length, 1));
  });
});
