import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ThinginoHttpClient,
  ThinginoHttpError,
  originFromBonjour,
  parseFileManagerNames,
  probeThinginoOrigin,
  confirmThinginoCandidates,
  unwrapAgentValue,
  parseCameraJson,
  isJpegBuffer,
} from '../ThinginoHttpClient.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ThinginoHttpClient', () => {
  it('sends the WebUI token as a query param and never as X-API-Key', async () => {
    let requested: string | undefined;
    let headers: Headers | undefined;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async (input, init) => {
        requested = String(input);
        headers = new Headers(init?.headers);
        return jsonResponse({ hostname: 'camera' });
      },
    );

    await client.getJson('/x/agent.cgi/api/v1/device');

    assert.ok(requested);
    const url = new URL(requested!);
    assert.equal(url.searchParams.get('token'), 'secret-token');
    assert.equal(headers?.get('x-api-key'), null);
    assert.equal(headers?.get('authorization'), null);
  });

  it('redacts the token from connection errors', async () => {
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async () => {
        throw new Error('connect ECONNREFUSED secret-token');
      },
    );

    await assert.rejects(
      () => client.getJson('/x/ch0.jpg'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes('secret-token'), false);
        assert.equal(error.message.includes('[token]'), true);
        return true;
      },
    );
  });

  it('surfaces HTTP failures without leaking the token', async () => {
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async () => new Response('nope', { status: 401 }),
    );

    await assert.rejects(
      () => client.getJson('/x/agent.cgi/api/v1/device'),
      (error: unknown) => {
        assert.ok(error instanceof ThinginoHttpError);
        assert.equal(error.status, 401);
        assert.equal(error.message.includes('secret-token'), false);
        return true;
      },
    );
  });

  it('runs overlapping requests one at a time', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        return jsonResponse({ hostname: 'camera' });
      },
    );

    await Promise.all([
      client.getJson('/x/agent.cgi/api/v1/device'),
      client.getJson('/x/agent.cgi/api/v1/runtime/storage'),
    ]);

    assert.equal(maxInFlight, 1);
  });

  it('retries once when the first body is an empty CGI chunk', async () => {
    let calls = 0;
    const client = new ThinginoHttpClient(
      'http://camera.local',
      'secret-token',
      async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            'Connection: close\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n0\r\n\r\n',
            { status: 200 },
          );
        }
        return jsonResponse({ hostname: 'camera' });
      },
    );

    assert.deepEqual(await client.getJson('/x/agent.cgi/api/v1/device'), {
      hostname: 'camera',
    });
    assert.equal(calls, 2);
  });
});

describe('probeThinginoOrigin', () => {
  it('accepts Thingino JSON 401 as confirmation', async () => {
    const ok = await probeThinginoOrigin(
      'http://camera.local',
      async () =>
        new Response('{"error":"unauthorized"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    assert.equal(ok, true);
  });

  it('rejects a 404 printer', async () => {
    const ok = await probeThinginoOrigin(
      'http://printer.local',
      async () => new Response('nope', { status: 404 }),
    );
    assert.equal(ok, false);
  });
});

describe('originFromBonjour', () => {
  it('prefers hostname over address and omits port 80', () => {
    assert.equal(
      originFromBonjour({
        host: 'littercam.local.',
        port: 80,
        addresses: ['192.168.1.9'],
      }),
      'http://littercam.local',
    );
  });

  it('brackets an IPv6 address when there is no hostname', () => {
    assert.equal(
      originFromBonjour({
        host: '',
        port: 80,
        addresses: ['fe80::1'],
      }),
      'http://[fe80::1]',
    );
  });
});

describe('confirmThinginoCandidates', () => {
  it('probes candidates in parallel and keeps only Thingino origins', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const confirmed = await confirmThinginoCandidates(
      [
        { config: { origin: 'http://printer.local' } },
        { config: { origin: 'http://camera.local' } },
        { config: { origin: 12 } },
      ],
      async (input) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlight -= 1;
        const url = new URL(String(input));
        if (url.hostname === 'camera.local') {
          return new Response('{"error":"unauthorized"}', {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('nope', { status: 404 });
      },
    );
    assert.deepEqual(confirmed, [
      { config: { origin: 'http://camera.local' } },
    ]);
    assert.equal(maxInFlight, 2);
  });
});

describe('payload helpers', () => {
  it('unwraps agent value envelopes', () => {
    assert.equal(
      unwrapAgentValue({ value: '/mnt/mmcblk0p1' }),
      '/mnt/mmcblk0p1',
    );
    assert.equal(unwrapAgentValue('raw'), 'raw');
  });

  it('unwraps keyed agent leaves', () => {
    assert.equal(
      unwrapAgentValue({ filename: '%Y/%m/%d/%H-%M-%S' }, 'filename'),
      '%Y/%m/%d/%H-%M-%S',
    );
    assert.equal(unwrapAgentValue({ mount: null }, 'mount'), null);
    assert.equal(
      unwrapAgentValue('unsupported setting path: storage/device_path'),
      null,
    );
  });
  it('parses file-manager listings', () => {
    assert.deepEqual(
      parseFileManagerNames({
        files: [{ name: '20260611T013147.mp4' }, 'skip', { filename: 'b.mp4' }],
      }),
      ['20260611T013147.mp4', 'b.mp4'],
    );
  });
});

describe('parseCameraJson', () => {
  it('extracts JSON from CGI chunked framing', () => {
    const body =
      'Connection: close\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\n\r\n131\r\n{"duration":60}\r\n0\r\n\r\n';
    assert.deepEqual(parseCameraJson(body), { duration: 60 });
  });

  it('treats an empty CGI chunk as a missing value', () => {
    const body =
      'Connection: close\r\nTransfer-Encoding: chunked\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nPragma: no-cache\r\n\r\n0\r\n\r\n';
    assert.equal(parseCameraJson(body), null);
  });
});

describe('isJpegBuffer', () => {
  it('accepts a JPEG SOI and rejects empty bodies', () => {
    assert.equal(isJpegBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
    assert.equal(isJpegBuffer(Buffer.alloc(0)), false);
    assert.equal(isJpegBuffer(Buffer.from('<html>')), false);
  });
});
