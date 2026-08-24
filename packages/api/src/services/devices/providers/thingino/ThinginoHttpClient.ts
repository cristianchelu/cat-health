import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const REQUEST_TIMEOUT_MS = 12_000;
const DOWNLOAD_TIMEOUT_MS = 90_000;

export class ThinginoHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ThinginoHttpError';
    this.status = status;
  }
}

export class ThinginoHttpClient {
  private readonly origin: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(origin: string, token: string, fetchFn: typeof fetch = fetch) {
    this.origin = origin;
    this.token = token;
    this.fetchFn = fetchFn;
  }

  async getJson(
    path: string,
    extraQuery?: Record<string, string>,
    timeoutMs?: number,
  ): Promise<unknown> {
    const response = await this.request(path, { extraQuery, timeoutMs });
    const text = await response.text();
    if (isEmptyCgiChunk(text)) {
      const retry = await this.request(path, { extraQuery, timeoutMs });
      return parseJsonBody(retry);
    }
    return parseCameraJson(text);
  }

  async getBuffer(
    path: string,
    extraQuery?: Record<string, string>,
  ): Promise<Buffer> {
    const response = await this.request(path, { extraQuery });
    return Buffer.from(await response.arrayBuffer());
  }

  async downloadToFile(
    path: string,
    extraQuery: Record<string, string>,
    destPath: string,
  ): Promise<void> {
    const response = await this.request(path, {
      extraQuery,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
    });
    if (!response.body) {
      throw new Error('Camera returned an empty body');
    }
    const nodeStream = Readable.fromWeb(
      response.body as import('node:stream/web').ReadableStream,
    );
    await pipeline(nodeStream, createWriteStream(destPath));
  }

  agentPath(subpath: string): string {
    return `/x/agent.cgi/api/v1/${subpath.replace(/^\//, '')}`;
  }

  private request(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      extraQuery?: Record<string, string>;
      timeoutMs?: number;
    } = {},
  ): Promise<Response> {
    const run = this.queue.then(
      () => this.send(path, options),
      () => this.send(path, options),
    );
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async send(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      extraQuery?: Record<string, string>;
      timeoutMs?: number;
    },
  ): Promise<Response> {
    const url = this.buildUrl(path, options.extraQuery);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await this.fetchFn(url, {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          connection: 'close',
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ThinginoHttpError(
          `Camera HTTP ${response.status}`,
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof ThinginoHttpError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Camera request failed: ${redactToken(message, this.token)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, extraQuery?: Record<string, string>): string {
    const url = new URL(path, this.origin);
    url.searchParams.set('token', this.token);
    if (extraQuery) {
      for (const [key, value] of Object.entries(extraQuery)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }
}

export function unwrapAgentValue(payload: unknown, key?: string): unknown {
  if (typeof payload === 'string') {
    if (payload.startsWith('unsupported setting path')) return null;
    return payload;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if ('value' in record) return record.value;
  if (key && key in record) return record[key];
  return payload;
}

export function parseFileManagerNames(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(entryName);
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const list =
    record.entries ?? record.files ?? record.items ?? record.list ?? [];
  if (!Array.isArray(list)) return [];
  return list.flatMap(entryName);
}

function entryName(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object') return [];
  const record = entry as Record<string, unknown>;
  const absolute = record.path;
  if (typeof absolute === 'string' && absolute.startsWith('/')) {
    return [absolute];
  }
  const name = record.name ?? record.filename;
  return typeof name === 'string' && name.length > 0 ? [name] : [];
}

/** JPEG start-of-image marker. */
const JPEG_SOI = 0xffd8;

export function isJpegBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer.readUInt16BE(0) === JPEG_SOI;
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  return parseCameraJson(text);
}

function isEmptyCgiChunk(text: string): boolean {
  const trimmed = text.trim();
  return (
    /transfer-encoding:\s*chunked/i.test(trimmed) &&
    trimmed.search(/[{\[]/) < 0 &&
    !/unsupported setting path/.test(trimmed)
  );
}

/** Thingino CGI can prefix JSON with a second HTTP header block and chunk sizes. */
export function parseCameraJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    /* try to recover a JSON value from a CGI-framed body */
  }
  const unsupported = trimmed.match(/unsupported setting path:[^\r\n]*/);
  if (unsupported) return unsupported[0];
  const start = trimmed.search(/[{\[]/);
  if (start < 0) {
    if (/transfer-encoding:\s*chunked/i.test(trimmed)) return null;
    throw new Error('Camera returned non-JSON');
  }
  const slice = trimmed.slice(start);
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    const end = Math.max(slice.lastIndexOf('}'), slice.lastIndexOf(']'));
    if (end >= 0) {
      return JSON.parse(slice.slice(0, end + 1)) as unknown;
    }
    throw new Error('Camera returned non-JSON');
  }
}

function redactToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join('[token]');
}

/** Unauthenticated probe used by mDNS confirmation — never sends a token. */
export async function probeThinginoOrigin(
  origin: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const url = new URL('/x/agent.cgi/api/v1/device', origin);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (response.status === 404) return false;
    if (response.status === 401) {
      const type = response.headers.get('content-type') ?? '';
      return type.includes('json');
    }
    if (response.status === 200) {
      const body = await parseJsonBody(response);
      return isThinginoDevicePayload(body);
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function isThinginoDevicePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    typeof record.hostname === 'string' ||
    typeof record.api_version === 'string' ||
    typeof record.apiVersion === 'string'
  );
}

export function originFromBonjour(service: {
  host?: string;
  port?: number;
  addresses?: string[];
}): string | null {
  const hostname = service.host?.replace(/\.$/, '') ?? '';
  const ipv4 = service.addresses?.find(isIpv4);
  const ipv6 = service.addresses?.find(isIpv6);
  const host = hostname || ipv4 || (ipv6 ? bracketIpv6(ipv6) : '');
  if (!host) return null;
  const port = service.port ?? 80;
  return port === 80 ? `http://${host}` : `http://${host}:${port}`;
}

function isIpv4(addr: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr);
}

function isIpv6(addr: string): boolean {
  return addr.includes(':');
}

function bracketIpv6(addr: string): string {
  const bare = addr.replace(/^\[|\]$/g, '');
  return `[${bare}]`;
}

export async function confirmThinginoCandidates<
  T extends { config: Record<string, unknown> },
>(candidates: T[], fetchFn: typeof fetch = fetch): Promise<T[]> {
  const settled = await Promise.all(
    candidates.map(async (candidate) => {
      const origin = candidate.config.origin;
      if (typeof origin !== 'string') return null;
      return (await probeThinginoOrigin(origin, fetchFn)) ? candidate : null;
    }),
  );
  return settled.filter((row): row is T => row != null);
}
