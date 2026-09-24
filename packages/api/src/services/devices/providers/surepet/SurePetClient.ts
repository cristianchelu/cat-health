import {
  buildSurePetHeaders,
  SUREPET_API_BASE,
  SUREPET_LOGIN_URL,
  SUREPET_ME_START_URL,
  SUREPET_RATE_LIMIT_BASE_DELAY_MS,
  SUREPET_RATE_LIMIT_MAX_ATTEMPTS,
  SUREPET_RATE_LIMIT_MAX_DELAY_MS,
  SUREPET_REQUEST_TIMEOUT_MS,
  SUREPET_RETRYABLE_STATUSES,
  SUREPET_TIMELINE_PAGE_DELAY_MS,
  SUREPET_TIMELINE_PAGE_SIZE,
  tokenSeemsValid,
} from './constants.ts';
import type {
  SurePetApiListResponse,
  SurePetApiObjectResponse,
  SurePetCloudDevice,
  SurePetCloudPet,
  SurePetDeviceDetailPayload,
  SurePetMeStartData,
  SurePetTimelineEntry,
} from './types.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SurePetClientError extends Error {
  readonly status?: number;
  /**
   * How long the server asked us to wait, when it said. Present only on a rate
   * limit that survived every retry, so a caller can defer rather than come
   * straight back at its own poll interval.
   */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    status?: number,
    options?: { retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'SurePetClientError';
    this.status = status;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/** True when the failure is the server asking us to slow down or come back. */
export function isRetryableSurePetError(error: unknown): boolean {
  return (
    error instanceof SurePetClientError &&
    error.status != null &&
    SUREPET_RETRYABLE_STATUSES.has(error.status)
  );
}

/**
 * `Retry-After` is either a delay in seconds or an HTTP date, and SurePet is
 * not consistent about which. Anything unparseable reads as absent so the
 * caller falls back to its own backoff.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, SUREPET_RATE_LIMIT_MAX_DELAY_MS);
  }

  const when = Date.parse(header);
  if (Number.isNaN(when)) return undefined;
  return Math.min(
    Math.max(when - Date.now(), 0),
    SUREPET_RATE_LIMIT_MAX_DELAY_MS,
  );
}

export interface SurePetClientCredentials {
  email: string;
  password: string;
  deviceId: string;
  token?: string;
  /**
   * Called with every freshly minted token, including the one from the 401
   * retry inside `request()`. Without this, a token refreshed mid-request only
   * lived in memory and the next process start had to log in again.
   */
  onToken?: (token: string) => Promise<void> | void;
}

export class SurePetClient {
  private email: string;
  private password: string;
  private deviceId: string;
  private token?: string;
  private onToken?: (token: string) => Promise<void> | void;

  constructor(credentials: SurePetClientCredentials) {
    this.email = credentials.email;
    this.password = credentials.password;
    this.deviceId = credentials.deviceId;
    this.token = credentials.token;
    this.onToken = credentials.onToken;
  }

  getToken(): string | undefined {
    return this.token;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  async login(): Promise<string> {
    // The login endpoint is the one that rate limits first — it is the only
    // call a fresh client makes, so a burst of short-lived clients hits it
    // hardest. Reuse a token wherever possible; `ensureAuthenticated` does.
    const response = await this.fetchWithBackoff(
      SUREPET_LOGIN_URL,
      {
        method: 'POST',
        headers: buildSurePetHeaders({ deviceId: this.deviceId }),
        body: JSON.stringify({
          email_address: this.email,
          password: this.password,
          device_id: this.deviceId,
        }),
      },
      'login',
    );

    if (!response.ok) {
      throw new SurePetClientError(
        `SurePet login failed (${response.status})`,
        response.status,
      );
    }

    const body = await this.parseJson(response);

    const token = this.extractToken(body);
    if (!token) {
      throw new SurePetClientError('SurePet login response missing token');
    }

    this.token = token;
    await this.onToken?.(token);
    return token;
  }

  /** Logs in only when the stored token cannot plausibly still work. */
  async ensureAuthenticated(): Promise<void> {
    if (tokenSeemsValid(this.token)) return;
    await this.login();
  }

  async meStart(): Promise<SurePetMeStartData> {
    const response = await this.request<
      SurePetApiObjectResponse<SurePetMeStartData>
    >('GET', SUREPET_ME_START_URL);
    return response.data ?? {};
  }

  async getPets(householdId?: number): Promise<SurePetCloudPet[]> {
    const params = new URLSearchParams();
    params.append('with[]', 'tag');
    if (householdId != null) {
      params.set('HouseholdId', String(householdId));
    }

    const response = await this.request<
      SurePetApiListResponse<SurePetCloudPet>
    >('GET', `${SUREPET_API_BASE}/pet?${params.toString()}`);
    return response.data ?? [];
  }

  async getDevices(householdId?: number): Promise<SurePetCloudDevice[]> {
    const params = new URLSearchParams();
    params.append('with[]', 'status');
    params.append('with[]', 'control');
    if (householdId != null) {
      params.set('HouseholdId', String(householdId));
    }

    const response = await this.request<
      SurePetApiListResponse<SurePetCloudDevice>
    >('GET', `${SUREPET_API_BASE}/device?${params.toString()}`);
    return response.data ?? [];
  }

  async getDevice(deviceId: number): Promise<SurePetDeviceDetailPayload> {
    const response = await this.request<
      SurePetApiObjectResponse<SurePetDeviceDetailPayload>
    >('GET', `${SUREPET_API_BASE}/device/${deviceId}`);
    if (!response.data) {
      throw new SurePetClientError(`Device ${deviceId} not found`, 404);
    }
    return response.data;
  }

  async getTimeline(
    householdId: number,
    options?: { sinceId?: number; beforeId?: number; pageSize?: number },
  ): Promise<SurePetTimelineEntry[]> {
    const params = new URLSearchParams();
    if (options?.sinceId != null) {
      params.set('since_id', String(options.sinceId));
    }
    if (options?.beforeId != null) {
      params.set('before_id', String(options.beforeId));
    }
    if (options?.pageSize != null) {
      params.set('page_size', String(options.pageSize));
    }

    const query = params.toString();
    const url = `${SUREPET_API_BASE}/timeline/household/${householdId}${query ? `?${query}` : ''}`;
    const response = await this.request<
      SurePetApiListResponse<SurePetTimelineEntry>
    >('GET', url);
    const entries = response.data ?? [];
    return entries;
  }

  /**
   * Walk backward through timeline pages until the API returns no entries.
   *
   * A full walk of a four-month household is around 120 requests, so it is
   * interruptible by design: `onPage` hands each page over as it lands, and
   * `startBeforeId` picks a walk back up where one left off. A caller that
   * persists the cursor it is given in `onPage` never repeats work it has
   * already stored, which matters because a rate limit part way through used
   * to throw the whole walk away.
   */
  async getFullTimeline(
    householdId: number,
    options?: {
      pageSize?: number;
      pageDelayMs?: number;
      /** Resume point: the `nextBeforeId` from an interrupted walk. */
      startBeforeId?: number;
      /**
       * Called with each non-empty page before the next is fetched.
       * `nextBeforeId` is the cursor that resumes *after* this page, so
       * persisting it means this page is never fetched again. It is undefined
       * on the page that ends the walk — there is nothing after it to resume
       * from — which is also the signal that the caller has now seen
       * everything.
       */
      onPage?: (
        page: SurePetTimelineEntry[],
        nextBeforeId: number | undefined,
      ) => Promise<void> | void;
    },
  ): Promise<SurePetTimelineEntry[]> {
    const pageSize = options?.pageSize ?? SUREPET_TIMELINE_PAGE_SIZE;
    const pageDelayMs = options?.pageDelayMs ?? SUREPET_TIMELINE_PAGE_DELAY_MS;
    const allEntries: SurePetTimelineEntry[] = [];
    let beforeId: number | undefined = options?.startBeforeId;

    while (true) {
      const page = await this.getTimeline(householdId, {
        beforeId,
        pageSize,
      });
      if (page.length === 0) break;

      allEntries.push(...page);

      const ids = page
        .map((entry) => entry.id)
        .filter((id): id is number => typeof id === 'number');
      const minId = ids.length > 0 ? Math.min(...ids) : undefined;
      // A cursor that does not move would re-fetch this page forever; treat it
      // as the end, the same as a page with no usable ids at all.
      const advances =
        minId !== undefined && (beforeId === undefined || minId < beforeId);

      // Every non-empty page is handed over, the last one included, so a
      // consumer never has to fetch a tail of its own. A throw in here stops
      // the walk with the cursor still pointing at this page.
      await options?.onPage?.(page, advances ? minId : undefined);

      if (!advances) break;
      beforeId = minId;

      if (pageDelayMs > 0) {
        await delay(pageDelayMs);
      }
    }

    return allEntries;
  }

  /**
   * One HTTP call, retried while the server is asking us to back off.
   *
   * A 429 is answered with an HTML error page, so the old flow parsed it as
   * JSON and failed with "non-JSON response" — a message that named the symptom
   * and hid the cause. Rate limiting is now retried here, honouring
   * `Retry-After` when it is sent and doubling from a base delay when it is
   * not, and only a limit that outlives every attempt reaches the caller.
   */
  private async fetchWithBackoff(
    url: string,
    init: RequestInit,
    label: string,
  ): Promise<Response> {
    let lastRetryAfterMs: number | undefined;

    for (
      let attempt = 1;
      attempt <= SUREPET_RATE_LIMIT_MAX_ATTEMPTS;
      attempt++
    ) {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(SUREPET_REQUEST_TIMEOUT_MS),
      });

      if (!SUREPET_RETRYABLE_STATUSES.has(response.status)) return response;

      lastRetryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (attempt === SUREPET_RATE_LIMIT_MAX_ATTEMPTS) {
        throw new SurePetClientError(
          response.status === 429
            ? `SurePet rate limited ${label} (429) after ${attempt} attempts`
            : `SurePet ${label} failed (${response.status}) after ${attempt} attempts`,
          response.status,
          { retryAfterMs: lastRetryAfterMs },
        );
      }

      const backoffMs = Math.min(
        SUREPET_RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1),
        SUREPET_RATE_LIMIT_MAX_DELAY_MS,
      );
      await delay(lastRetryAfterMs ?? backoffMs);
    }

    // Unreachable: the final attempt above always returns or throws.
    throw new SurePetClientError(`SurePet ${label} exhausted retries`);
  }

  private async request<T>(method: string, url: string): Promise<T> {
    await this.ensureAuthenticated();

    const send = () =>
      this.fetchWithBackoff(
        url,
        {
          method,
          headers: buildSurePetHeaders({
            token: this.token,
            deviceId: this.deviceId,
          }),
        },
        `${method} ${url}`,
      );

    let response = await send();

    if (response.status === 401) {
      this.token = undefined;
      await this.login();
      response = await send();
    }

    // Checked before parsing: an error response is an HTML page often enough
    // that parsing it first turns every failure into a parse failure.
    if (!response.ok) {
      throw new SurePetClientError(
        `SurePet API ${method} ${url} failed (${response.status})`,
        response.status,
      );
    }

    return (await this.parseJson(response)) as T;
  }

  private async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new SurePetClientError(
        `SurePet API returned non-JSON response (${response.status})`,
        response.status,
      );
    }
  }

  private extractToken(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) return undefined;
    const data = (body as { data?: { token?: string } }).data;
    return typeof data?.token === 'string' ? data.token : undefined;
  }
}
