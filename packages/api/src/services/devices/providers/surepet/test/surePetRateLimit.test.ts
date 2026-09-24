import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';

import {
  SurePetClient,
  SurePetClientError,
  isRetryableSurePetError,
} from '../SurePetClient.ts';
import {
  SUREPET_RATE_LIMIT_MAX_ATTEMPTS,
  SUREPET_TIMELINE_PAGE_SIZE,
} from '../constants.ts';

const TOKEN = 'x'.repeat(360);

function client(overrides: Partial<{ token: string }> = {}) {
  return new SurePetClient({
    email: 'cat@example.com',
    password: 'secret',
    deviceId: 'device-1',
    token: overrides.token ?? TOKEN,
  });
}

/** A 429 from SurePet is an HTML error page, not JSON. */
function rateLimited(retryAfter?: string): Response {
  return new Response('<html><body>Too Many Requests</body></html>', {
    status: 429,
    headers: {
      'content-type': 'text/html',
      ...(retryAfter ? { 'retry-after': retryAfter } : {}),
    },
  });
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SurePetClient rate limiting', () => {
  after(() => {
    mock.restoreAll();
  });

  it('retries a 429 and succeeds, honouring a short Retry-After', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => {
      calls++;
      return calls === 1 ? rateLimited('0') : ok({ data: [{ id: 1 }] });
    });

    const pets = await client().getPets(349965);

    assert.equal(calls, 2, 'the rate-limited call was retried');
    assert.deepEqual(pets, [{ id: 1 }]);
    mock.restoreAll();
  });

  it('gives up after the attempt budget and says it was rate limited', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => {
      calls++;
      return rateLimited('0');
    });

    const error = await client()
      .getPets(349965)
      .then(
        () => null,
        (e: unknown) => e,
      );

    assert.ok(error instanceof SurePetClientError);
    assert.equal(error.status, 429);
    assert.equal(calls, SUREPET_RATE_LIMIT_MAX_ATTEMPTS);
    // The old flow parsed the HTML body first and reported a parse failure,
    // which named the symptom and hid the cause.
    assert.match(error.message, /rate limited/i);
    assert.ok(!/non-JSON/.test(error.message));
    assert.ok(isRetryableSurePetError(error));
    mock.restoreAll();
  });

  it('carries Retry-After out to the caller so it can defer', async () => {
    mock.method(globalThis, 'fetch', async () => rateLimited('0'));

    const error = (await client()
      .getPets(349965)
      .catch((e: unknown) => e)) as SurePetClientError;

    assert.equal(error.retryAfterMs, 0);
    mock.restoreAll();
  });

  it('rate limits the login endpoint too, which is what fails first', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => {
      calls++;
      return calls === 1
        ? rateLimited('0')
        : ok({ data: { token: 'fresh-token' } });
    });

    const token = await new SurePetClient({
      email: 'cat@example.com',
      password: 'secret',
      deviceId: 'device-1',
    }).login();

    assert.equal(token, 'fresh-token');
    assert.equal(calls, 2);
    mock.restoreAll();
  });

  it('leaves a genuine non-JSON 200 reported as a parse failure', async () => {
    mock.method(
      globalThis,
      'fetch',
      async () => new Response('not json', { status: 200 }),
    );

    const error = (await client()
      .getPets(349965)
      .catch((e: unknown) => e)) as SurePetClientError;

    assert.match(error.message, /non-JSON/);
    mock.restoreAll();
  });
});

describe('getFullTimeline paging', () => {
  after(() => {
    mock.restoreAll();
  });

  /** Ids descend, 25 to a page, as the real endpoint returns them. */
  function pagedFetch(totalPages: number, seen: string[]) {
    let page = 0;
    return async (url: string | URL | Request) => {
      seen.push(String(url));
      if (String(url).includes('/timeline/')) {
        if (page >= totalPages) return ok({ data: [] });
        const base = 1000 - page * SUREPET_TIMELINE_PAGE_SIZE;
        page++;
        return ok({
          data: Array.from({ length: SUREPET_TIMELINE_PAGE_SIZE }, (_, i) => ({
            id: base - i,
          })),
        });
      }
      return ok({ data: [] });
    };
  }

  it('asks for 25 a page, which is all the server will give', async () => {
    const seen: string[] = [];
    mock.method(globalThis, 'fetch', pagedFetch(1, seen));

    await client().getFullTimeline(349965, { pageDelayMs: 0 });

    assert.ok(
      seen.some((u) => u.includes(`page_size=${SUREPET_TIMELINE_PAGE_SIZE}`)),
      `expected page_size=${SUREPET_TIMELINE_PAGE_SIZE}, saw ${seen[0]}`,
    );
    mock.restoreAll();
  });

  it('hands over every page, the last one with no resume cursor', async () => {
    mock.method(globalThis, 'fetch', pagedFetch(3, []));
    const pages: Array<number | undefined> = [];

    await client().getFullTimeline(349965, {
      pageDelayMs: 0,
      onPage: (page, nextBeforeId) => {
        assert.equal(page.length, SUREPET_TIMELINE_PAGE_SIZE);
        pages.push(nextBeforeId);
      },
    });

    assert.equal(pages.length, 3, 'no page is withheld from the consumer');
    assert.deepEqual(pages.slice(0, 2), [976, 951]);
    assert.equal(
      pages[2],
      926,
      'the final page still offers a cursor; the empty fetch after it ends the walk',
    );
    mock.restoreAll();
  });

  it('resumes from a stored cursor instead of starting over', async () => {
    const seen: string[] = [];
    mock.method(globalThis, 'fetch', pagedFetch(1, seen));

    await client().getFullTimeline(349965, {
      pageDelayMs: 0,
      startBeforeId: 500,
    });

    assert.ok(
      seen[0]?.includes('before_id=500'),
      `expected the walk to resume at 500, saw ${seen[0]}`,
    );
    mock.restoreAll();
  });

  it('stops rather than loop when the cursor stops advancing', async () => {
    let calls = 0;
    mock.method(globalThis, 'fetch', async () => {
      calls++;
      // Same ids every time: a server that ignores `before_id` used to spin here.
      return ok({ data: [{ id: 10 }, { id: 11 }] });
    });
    const pages: Array<number | undefined> = [];

    await client().getFullTimeline(349965, {
      pageDelayMs: 0,
      startBeforeId: 10,
      onPage: (_page, nextBeforeId) => {
        pages.push(nextBeforeId);
      },
    });

    assert.equal(calls, 1);
    assert.deepEqual(pages, [undefined], 'consumed, but with no resume cursor');
    mock.restoreAll();
  });
});
