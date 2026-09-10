import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { GetDevicePreviewsResponseDTO } from 'shared';

import { useCameraPreviewAtlas } from '../deviceQueries.ts';

const queryClients: QueryClient[] = [];

const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const OriginalImage = globalThis.Image;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.Image = OriginalImage;
  for (const client of queryClients.splice(0)) client.clear();
});

function layout(generation: number): GetDevicePreviewsResponseDTO {
  return {
    generation,
    cell_size: 80,
    columns: 1,
    width: 80,
    height: 80,
    devices: [{ id: 1, x: 0, y: 0 }],
  };
}

function installAtlasDecode(options?: { decode?: () => Promise<void> }) {
  let blobs = 0;
  globalThis.fetch = (async () => ({
    ok: true,
    blob: async () => new Blob(['jpeg']),
  })) as unknown as typeof fetch;
  URL.createObjectURL = () => `blob:atlas-${++blobs}`;
  URL.revokeObjectURL = () => undefined;
  globalThis.Image = class FakeImage {
    src = '';
    decode = options?.decode ?? (() => Promise.resolve());
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
  } as unknown as typeof Image;
  return () => blobs;
}

function renderAtlasHook(client: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return renderHook(() => useCameraPreviewAtlas(true), { wrapper: Wrapper });
}

describe('useCameraPreviewAtlas', () => {
  it('does not publish the atlas URL until the blob has decoded', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installAtlasDecode({ decode: () => gate });

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      },
    });
    queryClients.push(client);
    client.setQueryData(['devicePreviews'], layout(1));

    const { result } = renderAtlasHook(client);

    await waitFor(() => {
      assert.equal(result.current.layout?.generation, undefined);
    });
    assert.equal(result.current.atlasUrl, undefined);

    release();

    await waitFor(() => {
      assert.equal(result.current.atlasUrl, 'blob:atlas-1');
    });
    assert.equal(result.current.layout?.generation, 1);
  });

  it('swaps to a blob URL of the next generation after it decodes', async () => {
    installAtlasDecode();

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      },
    });
    queryClients.push(client);
    client.setQueryData(['devicePreviews'], layout(1));

    const { result } = renderAtlasHook(client);

    await waitFor(() => {
      assert.equal(result.current.atlasUrl, 'blob:atlas-1');
    });

    client.setQueryData(['devicePreviews'], layout(2));

    await waitFor(() => {
      assert.equal(result.current.atlasUrl, 'blob:atlas-2');
    });
    assert.equal(result.current.layout?.generation, 2);
  });
});
