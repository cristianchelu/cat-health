import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Device, ProviderDeps } from '../../../types.ts';
import {
  ThinginoHttpClient,
  ThinginoHttpError,
} from '../ThinginoHttpClient.ts';
import { ThinginoLayoutError } from '../thinginoLayout.ts';
import { ThinginoDeviceController } from '../ThinginoDeviceController.ts';

const device: Device = {
  id: 7,
  provider_account_id: 1,
  external_id: 'littercam.local',
  name: 'Littercam',
  type: 'camera',
  config: {
    origin: 'http://camera.local',
    token: 'secret-token',
  },
  enabled: 1,
  last_seen: null,
  status: 'unknown',
  created_at: 0,
  updated_at: 0,
};

const deps = {
  presence: {
    reportOnline() {},
    reportOffline() {},
    recordActivity() {},
  },
  mediaManager: {
    createPendingMedia: async () => ({
      path: '/tmp/clip.mp4',
      cleanup: async () => {},
    }),
  },
} as unknown as ProviderDeps;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const RECORD_TOOL_REDIRECT = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/"><title>Redirecting...</title></head><body></body></html>`;

function agentConfigResponse(
  storage: Record<string, unknown> | null = {},
  backend = 'prudynt',
): Response {
  return jsonResponse({
    storage:
      storage === null
        ? undefined
        : {
            autostart: false,
            channel: 0,
            device_path: '%hostname',
            duration: 60,
            filename: '%Y/%m/%d/%H-%M-%S',
            mount: '/mnt/mmcblk0p1',
            ...storage,
          },
    backend: { name: backend },
  });
}

function runtimeAllResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    storage: {
      used_kib: 94,
      total_kib: 100,
      record_root: '/mnt/mmcblk0p1/littercam',
    },
    recording: { active: false, configured_autostart: false },
    ...overrides,
  });
}

function recordToolResponse(
  video: Record<string, unknown> = {},
  mounts: string[] = ['/mnt/mmcblk0p1'],
): Response {
  return jsonResponse({
    ok: true,
    data: {
      video: {
        autostart: false,
        channel: 0,
        device_path: '%hostname',
        duration: 60,
        filename: '%Y/%m/%d/%H-%M-%S',
        mount: '',
        ...video,
      },
      mounts,
    },
  });
}

function defaultAgentJson(url: URL): Response {
  if (url.pathname.endsWith('/config')) return agentConfigResponse();
  if (url.pathname.endsWith('/runtime/all')) return runtimeAllResponse();
  if (url.pathname.endsWith('/runtime/storage')) {
    return jsonResponse({ used_kib: 94, total_kib: 100 });
  }
  if (url.pathname.endsWith('/runtime/recording')) {
    return jsonResponse({ active: false });
  }
  if (url.pathname.endsWith('/x/tool-record.cgi')) {
    return new Response(RECORD_TOOL_REDIRECT, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  }
  throw new Error(`unexpected ${url.pathname}`);
}

describe('ThinginoDeviceController', () => {
  it('rejects fetchRecording when the camera is not on the default path', async () => {
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/config')) {
          return agentConfigResponse({
            filename: '%f',
            device_path: 'custom',
            mount: '/mnt/mmcblk0p1',
          });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);

    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 5, 11, 1, 50, 0),
          endTime: new Date(2026, 5, 11, 1, 55, 0),
          eventType: 'litterbox_use',
        }),
      ThinginoLayoutError,
    );
  });

  it('connects using agent config and runtime/all without the record tool', async () => {
    let recordToolGets = 0;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/x/tool-record.cgi')) {
          recordToolGets += 1;
          return new Response(RECORD_TOOL_REDIRECT, {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        }
        return defaultAgentJson(url);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await controller.connect();
    const signals = controller.getSignals();
    const storage = signals.find((signal) => signal.key === 'storage');
    const recording = signals.find((signal) => signal.key === 'recording');
    assert.equal(storage?.value.kind, 'percent');
    assert.equal(
      storage?.value.kind === 'percent' ? storage.value.value : null,
      94,
    );
    assert.equal(recording?.value.kind, 'text');
    assert.equal(
      recording?.value.kind === 'text' ? recording.value.key : null,
      'devices.signals.values.recording_off',
    );
    assert.equal(recordToolGets, 0);
    await controller.disconnect();
  });

  it('falls back to the record tool when agent config has no storage', async () => {
    const listed: string[] = [];
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/config')) {
          return jsonResponse({ backend: { name: 'prudynt' } });
        }
        if (url.pathname.endsWith('/x/tool-record.cgi')) {
          return recordToolResponse({ mount: '/mnt/mmcblk0p1' });
        }
        if (url.pathname.endsWith('/x/tool-file-manager.cgi')) {
          listed.push(url.searchParams.get('cd') ?? '');
          return jsonResponse({ entries: [] });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 6, 18, 17, 20, 0),
          endTime: new Date(2026, 6, 18, 17, 25, 0),
          eventType: 'litterbox_use',
        }),
      /No recording files found/,
    );
    assert.deepEqual(listed, ['/mnt/mmcblk0p1/littercam/2026/07/18']);
  });

  it('lists Prudynt day directories for fetchRecording', async () => {
    const listed: string[] = [];
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/config')) return agentConfigResponse();
        if (url.pathname.endsWith('/x/tool-file-manager.cgi')) {
          listed.push(url.searchParams.get('cd') ?? '');
          return jsonResponse({ entries: [] });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 6, 18, 17, 20, 0),
          endTime: new Date(2026, 6, 18, 17, 25, 0),
          eventType: 'litterbox_use',
        }),
      /No recording files found/,
    );
    assert.deepEqual(listed, ['/mnt/mmcblk0p1/littercam/2026/07/18']);
  });

  it('lists Raptor day directories from an absolute record root', async () => {
    const listed: string[] = [];
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'catcam' });
        }
        if (url.pathname.endsWith('/config')) {
          return agentConfigResponse(
            {
              autostart: true,
              device_path: '/mnt/mmcblk0p1/raptor',
              duration: 60,
              filename: null,
              mount: '/mnt/mmcblk0p1',
            },
            'raptor',
          );
        }
        if (url.pathname.endsWith('/x/tool-file-manager.cgi')) {
          listed.push(url.searchParams.get('cd') ?? '');
          return jsonResponse({ entries: [] });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 8, 7, 17, 20, 0),
          endTime: new Date(2026, 8, 7, 17, 25, 0),
          eventType: 'litterbox_use',
        }),
      /No recording files found/,
    );
    assert.deepEqual(listed, ['/mnt/mmcblk0p1/raptor/2026-09-07']);
  });

  it('uses mounts[0] when the record-tool video.mount is empty', async () => {
    const listed: string[] = [];
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/config')) {
          return jsonResponse({ backend: { name: 'prudynt' } });
        }
        if (url.pathname.endsWith('/x/tool-record.cgi')) {
          return recordToolResponse({ mount: '' });
        }
        if (url.pathname.endsWith('/x/tool-file-manager.cgi')) {
          listed.push(url.searchParams.get('cd') ?? '');
          return jsonResponse({ entries: [] });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 6, 18, 17, 20, 0),
          endTime: new Date(2026, 6, 18, 17, 25, 0),
          eventType: 'litterbox_use',
        }),
      /No recording files found/,
    );
    assert.deepEqual(listed, ['/mnt/mmcblk0p1/littercam/2026/07/18']);
  });

  it('surfaces file-manager auth failures instead of pretending the directory is empty', async () => {
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/config')) return agentConfigResponse();
        if (url.pathname.endsWith('/x/tool-file-manager.cgi')) {
          return new Response('nope', { status: 401 });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () =>
        controller.fetchRecording({
          startTime: new Date(2026, 6, 18, 17, 20, 0),
          endTime: new Date(2026, 6, 18, 17, 25, 0),
          eventType: 'litterbox_use',
        }),
      ThinginoHttpError,
    );
  });

  it('rejects an empty JPEG snapshot after trying both CGI paths', async () => {
    const paths: string[] = [];
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        paths.push(url.pathname);
        return new Response(Buffer.alloc(0), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await assert.rejects(
      () => controller.getSnapshotBuffer(),
      /Camera snapshot was empty/,
    );
    assert.deepEqual(paths, ['/x/ch0.jpg', '/x/dl0.jpg']);
  });

  it('falls back to dl0.jpg when ch0.jpg is empty', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/x/ch0.jpg')) {
          return new Response(Buffer.alloc(0), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        if (url.pathname.endsWith('/x/dl0.jpg')) {
          return new Response(jpeg, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    const buffer = await controller.getSnapshotBuffer();
    assert.equal(buffer.equals(jpeg), true);
  });

  it('falls back to dl0.jpg when ch0.jpg returns 503', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/x/ch0.jpg')) {
          return new Response('', { status: 503 });
        }
        if (url.pathname.endsWith('/x/dl0.jpg')) {
          return new Response(jpeg, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        throw new Error(`unexpected ${url.pathname}`);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    const buffer = await controller.getSnapshotBuffer();
    assert.equal(buffer.equals(jpeg), true);
  });

  it('marks the camera offline after two missed agent pings', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const offline: number[] = [];
    const online: number[] = [];
    let deviceGets = 0;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          deviceGets += 1;
          if (deviceGets === 1) {
            return jsonResponse({ hostname: 'littercam' });
          }
          return new Response('down', { status: 500 });
        }
        return defaultAgentJson(url);
      },
    );
    const controller = new ThinginoDeviceController(
      device,
      {
        ...deps,
        presence: {
          reportOnline(id: number) {
            online.push(id);
          },
          reportOffline(id: number) {
            offline.push(id);
          },
          recordActivity() {},
        },
      } as unknown as ProviderDeps,
      client,
    );
    await controller.connect();
    assert.equal(controller.getStatus(), 'online');
    assert.equal(deviceGets, 1);

    t.mock.timers.tick(10_000);
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(10_000);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(deviceGets, 3);
    assert.equal(controller.getStatus(), 'offline');
    assert.deepEqual(offline, [7]);
    assert.deepEqual(online, [7]);
    await controller.disconnect();
  });

  it('delays the agent ping when the camera was reached recently', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let deviceGets = 0;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          deviceGets += 1;
          return jsonResponse({ hostname: 'littercam' });
        }
        if (url.pathname.endsWith('/x/ch0.jpg')) {
          return new Response(jpeg, {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          });
        }
        return defaultAgentJson(url);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await controller.connect();
    assert.equal(deviceGets, 1);

    t.mock.timers.tick(9_000);
    await controller.getSnapshotBuffer();
    t.mock.timers.tick(9_000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(deviceGets, 1);

    t.mock.timers.tick(10_000);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(deviceGets, 2);
    await controller.disconnect();
  });

  it('refreshes storage when a missed camera comes back', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let deviceGets = 0;
    let usedKib = 94;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/device')) {
          deviceGets += 1;
          if (deviceGets === 1 || deviceGets >= 4) {
            return jsonResponse({ hostname: 'littercam' });
          }
          return new Response('down', { status: 500 });
        }
        if (url.pathname.endsWith('/runtime/all')) {
          return runtimeAllResponse({
            storage: {
              used_kib: usedKib,
              total_kib: 100,
              record_root: '/mnt/mmcblk0p1/littercam',
            },
          });
        }
        return defaultAgentJson(url);
      },
    );
    const controller = new ThinginoDeviceController(device, deps, client);
    await controller.connect();
    assert.equal(controller.getStatus(), 'online');

    t.mock.timers.tick(10_000);
    await new Promise((resolve) => setImmediate(resolve));
    t.mock.timers.tick(10_000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.getStatus(), 'offline');

    usedKib = 50;
    t.mock.timers.tick(10_000);
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.equal(controller.getStatus(), 'online');
    const storage = controller
      .getSignals()
      .find((signal) => signal.key === 'storage');
    assert.equal(storage?.value.kind, 'percent');
    assert.equal(
      storage?.value.kind === 'percent' ? storage.value.value : null,
      50,
    );
    await controller.disconnect();
  });
});
