import {
  buildSurePetHeaders,
  SUREPET_API_BASE,
  SUREPET_LOGIN_URL,
  SUREPET_ME_START_URL,
  SUREPET_REQUEST_TIMEOUT_MS,
  SUREPET_TIMELINE_PAGE_DELAY_MS,
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

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'SurePetClientError';
    this.status = status;
  }
}

export interface SurePetClientCredentials {
  email: string;
  password: string;
  deviceId: string;
  token?: string;
}

export class SurePetClient {
  private email: string;
  private password: string;
  private deviceId: string;
  private token?: string;

  constructor(credentials: SurePetClientCredentials) {
    this.email = credentials.email;
    this.password = credentials.password;
    this.deviceId = credentials.deviceId;
    this.token = credentials.token;
  }

  getToken(): string | undefined {
    return this.token;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  async login(): Promise<string> {
    const response = await fetch(SUREPET_LOGIN_URL, {
      method: 'POST',
      headers: buildSurePetHeaders({ deviceId: this.deviceId }),
      body: JSON.stringify({
        email_address: this.email,
        password: this.password,
        device_id: this.deviceId,
      }),
      signal: AbortSignal.timeout(SUREPET_REQUEST_TIMEOUT_MS),
    });

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new SurePetClientError(
        `SurePet login failed (${response.status})`,
        response.status,
      );
    }

    const token = this.extractToken(body);
    if (!token) {
      throw new SurePetClientError('SurePet login response missing token');
    }

    this.token = token;
    return token;
  }

  async ensureAuthenticated(): Promise<void> {
    if (tokenSeemsValid(this.token)) return;
    await this.login();
  }

  async meStart(): Promise<SurePetMeStartData> {
    const response = await this.request<SurePetApiObjectResponse<SurePetMeStartData>>(
      'GET',
      SUREPET_ME_START_URL,
    );
    return response.data ?? {};
  }

  async getPets(householdId?: number): Promise<SurePetCloudPet[]> {
    const params = new URLSearchParams();
    params.append('with[]', 'tag');
    if (householdId != null) {
      params.set('HouseholdId', String(householdId));
    }

    const response = await this.request<SurePetApiListResponse<SurePetCloudPet>>(
      'GET',
      `${SUREPET_API_BASE}/pet?${params.toString()}`,
    );
    return response.data ?? [];
  }

  async getDevices(householdId?: number): Promise<SurePetCloudDevice[]> {
    const params = new URLSearchParams();
    params.append('with[]', 'status');
    params.append('with[]', 'control');
    if (householdId != null) {
      params.set('HouseholdId', String(householdId));
    }

    const response = await this.request<SurePetApiListResponse<SurePetCloudDevice>>(
      'GET',
      `${SUREPET_API_BASE}/device?${params.toString()}`,
    );
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
    const response = await this.request<SurePetApiListResponse<SurePetTimelineEntry>>(
      'GET',
      url,
    );
    const entries = response.data ?? [];
    return entries;
  }

  /** Walk backward through timeline pages until the API returns no entries. */
  async getFullTimeline(
    householdId: number,
    options?: { pageSize?: number; pageDelayMs?: number },
  ): Promise<SurePetTimelineEntry[]> {
    const pageSize = options?.pageSize ?? 100;
    const pageDelayMs = options?.pageDelayMs ?? SUREPET_TIMELINE_PAGE_DELAY_MS;
    const allEntries: SurePetTimelineEntry[] = [];
    let beforeId: number | undefined;

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
      if (ids.length === 0) break;

      const minId = Math.min(...ids);
      if (beforeId != null && minId >= beforeId) break;
      beforeId = minId;

      if (pageDelayMs > 0) {
        await delay(pageDelayMs);
      }
    }

    return allEntries;
  }

  async getHouseholdReport(householdId: number): Promise<unknown> {
    const response = await this.request<{ data?: unknown }>(
      'GET',
      `${SUREPET_API_BASE}/report/household/${householdId}`,
    );
    return response.data ?? [];
  }

  async getPetFeedingReport(
    petId: number,
    from: string,
    to: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({ from, to });
    const response = await this.request<{ data?: unknown }>(
      'GET',
      `${SUREPET_API_BASE}/pet/${petId}/report?${params.toString()}`,
    );
    return response.data;
  }

  private async request<T>(method: string, url: string): Promise<T> {
    await this.ensureAuthenticated();

    let response = await fetch(url, {
      method,
      headers: buildSurePetHeaders({
        token: this.token,
        deviceId: this.deviceId,
      }),
      signal: AbortSignal.timeout(SUREPET_REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401) {
      this.token = undefined;
      await this.login();
      response = await fetch(url, {
        method,
        headers: buildSurePetHeaders({
          token: this.token,
          deviceId: this.deviceId,
        }),
        signal: AbortSignal.timeout(SUREPET_REQUEST_TIMEOUT_MS),
      });
    }

    const body = await this.parseJson(response);
    if (!response.ok) {
      throw new SurePetClientError(
        `SurePet API ${method} ${url} failed (${response.status})`,
        response.status,
      );
    }

    return body as T;
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
