import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';

import { FallbackImage } from '../FallbackImage.tsx';
import { renderWithProviders } from '@/test/render.tsx';

afterEach(() => {
  cleanup();
});

describe('FallbackImage', () => {
  it('shows the fallback when src is missing', async () => {
    await renderWithProviders(
      <FallbackImage
        src={undefined}
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    assert.ok(screen.getByText('Offline'));
    assert.equal(screen.queryByRole('img', { name: 'Preview' }), null);
  });

  it('swaps to the fallback when the image fails to load', async () => {
    await renderWithProviders(
      <FallbackImage
        src="/broken-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    const img = screen.getByRole('img', { name: 'Preview' });
    fireEvent.error(img);

    assert.ok(screen.getByText('Offline'));
    assert.equal(screen.queryByRole('img', { name: 'Preview' }), null);
  });

  it('retries the image when src changes after a failure', async () => {
    const { rerender } = await renderWithProviders(
      <FallbackImage
        src="/broken-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'Preview' }));
    assert.ok(screen.getByText('Offline'));

    rerender(
      <FallbackImage
        src="/fresh-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    assert.ok(screen.getByRole('img', { name: 'Preview' }));
    assert.equal(screen.queryByText('Offline'), null);
  });

  it('drops the loaded state as soon as src changes', async () => {
    const { rerender } = await renderWithProviders(
      <FallbackImage
        src="/first-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    const img = screen.getByRole('img', { name: 'Preview' });
    Object.defineProperty(img, 'naturalWidth', { value: 640 });
    Object.defineProperty(img, 'naturalHeight', { value: 480 });
    fireEvent.load(img);
    assert.equal(img.classList.contains('is-ready'), true);

    rerender(
      <FallbackImage
        src="/second-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    const nextImg = screen.getByRole('img', { name: 'Preview' });
    assert.equal(nextImg.getAttribute('src'), '/second-snapshot.jpg');
    assert.equal(nextImg.classList.contains('is-ready'), false);
  });

  it('swaps to the fallback when a 200 response is not a real image', async () => {
    await renderWithProviders(
      <FallbackImage
        src="/empty-snapshot.jpg"
        alt="Preview"
        fallback={<span>Offline</span>}
      />,
    );

    const img = screen.getByRole('img', { name: 'Preview' });
    Object.defineProperty(img, 'naturalWidth', { value: 0 });
    Object.defineProperty(img, 'naturalHeight', { value: 0 });
    fireEvent.load(img);

    assert.ok(screen.getByText('Offline'));
    assert.equal(screen.queryByRole('img', { name: 'Preview' }), null);
  });
});
