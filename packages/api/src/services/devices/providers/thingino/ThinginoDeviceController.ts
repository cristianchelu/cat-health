import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import sharp from 'sharp';
import { type Static, Type } from '@fastify/type-provider-typebox';
import {
  DEVICE_SIGNAL_KEYS,
  requireWithSchema,
  type DeviceSignal,
  type DeviceStatus,
  type EventType,
} from 'shared';
import type {
  Camera,
  Device,
  ProviderDeps,
  RecordingResult,
  RecordingSource,
} from '../../types.ts';
import {
  percentSignal,
  statusSignal,
  unknownSignal,
} from '../../signalBuilders.ts';
import {
  ThinginoHttpClient,
  ThinginoHttpError,
  isJpegBuffer,
  parseFileManagerNames,
  unwrapAgentValue,
} from './ThinginoHttpClient.ts';
import {
  BUFFER_SECONDS,
  DEFAULT_CLIP_DURATION_SECONDS,
  assertDefaultRecordingLayout,
  clipsRoot,
  dayDirectories,
  filenameToEpoch,
  filesOverlappingWindow,
  hourDirectories,
  joinListedFile,
  recordingLayoutKind,
  recordsRoot,
} from './thinginoLayout.ts';

export const ThinginoConfigSchema = Type.Object(
  {
    origin: Type.String({ minLength: 1 }),
    token: Type.String({ minLength: 1 }),
  },
  { additionalProperties: true },
);
export type ThinginoConfig = Static<typeof ThinginoConfigSchema>;

const FILE_MANAGER_PATH = '/x/tool-file-manager.cgi';
const RECORD_TOOL_PATH = '/x/tool-record.cgi';
const SNAPSHOT_PATH = '/x/ch0.jpg';
/** Agent CGI takes ~1s; `/health` is ~3s and shells out. `/device` is identity JSON. */
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 4_000;
const HEARTBEAT_MISS_LIMIT = 2;

interface CachedStorage {
  recordingEnabled: boolean;
  recorderActive: boolean;
  durationSeconds: number | null;
  mount: string | null;
  usedBytes: number | null;
  totalBytes: number | null;
}

interface RuntimeRecording {
  active: boolean;
}

interface RecordingLayout {
  hostname: string;
  mount: string | null;
  filename: string | null;
  devicePath: string | null;
  durationSeconds: number | null;
  autostart: boolean;
}

export class ThinginoDeviceController implements Camera, RecordingSource {
  readonly deviceId: number;
  private readonly device: Device;
  private readonly deps: ProviderDeps;
  private readonly config: ThinginoConfig;
  private readonly client: ThinginoHttpClient;
  private status: DeviceStatus = 'unknown';
  private cachedStorage: CachedStorage | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatEnabled = false;
  private heartbeatBusy = false;
  private heartbeatMisses = 0;

  constructor(device: Device, deps: ProviderDeps, client?: ThinginoHttpClient) {
    this.device = device;
    this.deps = deps;
    this.deviceId = device.id;
    this.config = requireWithSchema(
      ThinginoConfigSchema,
      device.config,
      'Thingino configuration',
    );
    this.client =
      client ??
      new ThinginoHttpClient(
        this.config.origin.replace(/\/+$/, ''),
        this.config.token,
      );
  }

  async connect(): Promise<void> {
    try {
      await this.refreshStorage();
      this.status = 'online';
      this.markReachable();
      if (this.deviceId !== 0) {
        this.deps.presence.reportOnline(this.deviceId);
      }
    } catch (error) {
      this.status = 'error';
      if (this.deviceId !== 0) {
        this.deps.presence.reportOffline(this.deviceId);
      }
      throw error;
    } finally {
      this.startHeartbeat();
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.status = 'offline';
    if (this.deviceId !== 0) {
      this.deps.presence.reportOffline(this.deviceId);
    }
  }

  getStatus(): DeviceStatus {
    return this.status;
  }

  private markReachable(): void {
    this.heartbeatMisses = 0;
    if (this.heartbeatEnabled) {
      this.scheduleHeartbeat();
    }
  }

  private startHeartbeat(): void {
    this.heartbeatEnabled = true;
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = setTimeout(() => {
      void this.tickHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    this.heartbeatEnabled = false;
    this.clearHeartbeatTimer();
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer != null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async tickHeartbeat(): Promise<void> {
    try {
      if (this.heartbeatEnabled && !this.heartbeatBusy) {
        await this.pingCamera();
      }
    } finally {
      if (this.heartbeatEnabled) {
        this.scheduleHeartbeat();
      }
    }
  }

  private async pingCamera(): Promise<void> {
    this.heartbeatBusy = true;
    try {
      await this.client.getJson(
        this.client.agentPath('device'),
        undefined,
        HEARTBEAT_TIMEOUT_MS,
      );
      if (!this.heartbeatEnabled) return;
      this.heartbeatMisses = 0;
      if (this.status !== 'online') {
        try {
          await this.refreshStorage();
        } catch {
          /* identity ping already succeeded */
        }
        this.status = 'online';
        if (this.deviceId !== 0) {
          this.deps.presence.reportOnline(this.deviceId);
        }
      } else if (this.deviceId !== 0) {
        this.deps.presence.recordActivity(this.deviceId);
      }
    } catch {
      if (!this.heartbeatEnabled) return;
      this.heartbeatMisses += 1;
      if (
        this.heartbeatMisses >= HEARTBEAT_MISS_LIMIT &&
        this.status !== 'offline'
      ) {
        this.status = 'offline';
        if (this.deviceId !== 0) {
          this.deps.presence.reportOffline(this.deviceId);
        }
      }
    } finally {
      this.heartbeatBusy = false;
    }
  }

  getSignals(): DeviceSignal[] {
    const storage = this.cachedStorage;
    if (!storage) {
      return [
        unknownSignal({ key: DEVICE_SIGNAL_KEYS.STORAGE, icon: 'scale' }),
        unknownSignal({
          key: DEVICE_SIGNAL_KEYS.RECORDING,
          icon: 'camera',
          category: 'drawer',
        }),
      ];
    }

    const usedPercent =
      storage.usedBytes != null &&
      storage.totalBytes != null &&
      storage.totalBytes > 0
        ? Math.round((storage.usedBytes / storage.totalBytes) * 100)
        : null;

    const recordingKey = storage.recorderActive
      ? 'devices.signals.values.recording_on'
      : storage.recordingEnabled
        ? 'devices.signals.values.recording_idle'
        : 'devices.signals.values.recording_off';

    return [
      usedPercent != null
        ? percentSignal(
            { key: DEVICE_SIGNAL_KEYS.STORAGE, icon: 'scale' },
            usedPercent,
          )
        : unknownSignal({ key: DEVICE_SIGNAL_KEYS.STORAGE, icon: 'scale' }),
      statusSignal(
        {
          key: DEVICE_SIGNAL_KEYS.RECORDING,
          icon: 'camera',
          category: 'drawer',
        },
        recordingKey,
        false,
      ),
    ];
  }

  async getSnapshotBuffer(): Promise<Buffer> {
    const buffer = await this.client.getBuffer(SNAPSHOT_PATH);
    if (!isJpegBuffer(buffer)) {
      throw new Error('Camera snapshot was empty');
    }
    this.markReachable();
    if (this.deviceId !== 0) {
      this.deps.presence.recordActivity(this.deviceId);
    }
    return buffer;
  }

  async captureSnapshot(options: {
    timestamp: Date;
    crop?: { left: number; top: number; width: number; height: number };
    rotate?: number;
  }) {
    void options.timestamp;
    const buffer = await this.getSnapshotBuffer();
    const image = sharp(buffer);
    const metadata = await image.metadata();

    const pendingMedia = await this.deps.mediaManager.createPendingMedia(
      'jpg',
      {
        height: metadata.height,
        width: metadata.width,
      },
    );

    let pipeline = sharp(buffer);
    if (options.crop) {
      const { left, top, width, height } = options.crop;
      let absCrop = { left, top, width, height };
      if (left <= 1 && top <= 1 && width <= 1 && height <= 1) {
        absCrop = {
          left: Math.round(left * (metadata.width ?? 0)),
          top: Math.round(top * (metadata.height ?? 0)),
          width: Math.round(width * (metadata.width ?? 0)),
          height: Math.round(height * (metadata.height ?? 0)),
        };
      }
      pipeline = pipeline.extract(absCrop);
    }
    if (options.rotate) {
      pipeline = pipeline.rotate(options.rotate);
    }
    await pipeline.toFile(pendingMedia.path);
    return pendingMedia;
  }

  async fetchRecording(options: {
    startTime: Date;
    endTime: Date;
    eventType: EventType;
    transforms?: {
      crop?: { left: number; top: number; width: number; height: number };
      rotate?: number;
    };
  }): Promise<RecordingResult> {
    void options.eventType;
    void options.transforms;

    const startEpoch = Math.floor(options.startTime.getTime() / 1000);
    const endEpoch = Math.floor(options.endTime.getTime() / 1000);
    if (startEpoch >= endEpoch) {
      throw new Error('Start time must be before end time');
    }

    const layout = await this.readRecordingLayout();
    assertDefaultRecordingLayout(layout.filename, layout.devicePath);
    if (!layout.mount) {
      throw new Error('Camera recording mount is not set');
    }

    const pendingMedia = await this.deps.mediaManager.createPendingMedia(
      'mp4',
      {},
    );
    const tempDir = path.join(
      os.tmpdir(),
      `thingino_${this.deviceId}_${Date.now()}`,
    );

    try {
      await fs.mkdir(tempDir, { recursive: true });

      const duration = layout.durationSeconds ?? DEFAULT_CLIP_DURATION_SECONDS;
      const relevantFiles = await this.listOverlappingFiles(
        layout.mount,
        layout.hostname,
        options.startTime,
        options.endTime,
        duration,
        layout.filename,
        layout.devicePath,
      );
      if (relevantFiles.length === 0) {
        throw new Error(
          'No recording files found that overlap with the time range',
        );
      }

      const localNames = await this.downloadFiles(relevantFiles, tempDir);
      await this.processVideo(
        relevantFiles,
        localNames,
        tempDir,
        pendingMedia.path,
        startEpoch,
        endEpoch,
      );

      if (this.deviceId !== 0) {
        this.deps.presence.recordActivity(this.deviceId);
      }
      this.markReachable();

      return {
        type: 'local',
        pendingMedia,
        mimeType: 'video/mp4',
      };
    } catch (error) {
      await pendingMedia.cleanup().catch(() => {});
      throw error;
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private async refreshStorage(): Promise<CachedStorage> {
    const layout = await this.readRecordingLayout();
    const runtimeStorage = await this.readRuntimeStorage();
    const runtimeRecording = await this.readRuntimeRecording();

    const cached: CachedStorage = {
      recordingEnabled: layout.autostart,
      recorderActive: runtimeRecording.active,
      durationSeconds: layout.durationSeconds,
      mount: layout.mount,
      usedBytes: runtimeStorage.usedBytes,
      totalBytes: runtimeStorage.totalBytes,
    };
    this.cachedStorage = cached;
    this.status = 'online';
    this.markReachable();
    if (this.deviceId !== 0) {
      this.deps.presence.recordActivity(this.deviceId);
    }
    return cached;
  }

  private async readRecordingLayout(): Promise<RecordingLayout> {
    const [device, recorder] = await Promise.all([
      this.agentSetting('device'),
      this.client.getJson(RECORD_TOOL_PATH),
    ]);
    const parsed = parseRecordTool(recorder);
    return {
      hostname: stringSetting(objectField(device, 'hostname')) || 'camera',
      ...parsed,
    };
  }

  private async readRuntimeStorage(): Promise<{
    usedBytes: number | null;
    totalBytes: number | null;
  }> {
    const payload = await this.agentSetting('runtime/storage');
    if (!payload || typeof payload !== 'object') {
      return { usedBytes: null, totalBytes: null };
    }
    const record = payload as Record<string, unknown>;
    const usedKib = numberSetting(record.used_kib);
    const totalKib = numberSetting(record.total_kib);
    return {
      usedBytes:
        usedKib != null
          ? usedKib * 1024
          : numberSetting(record.used ?? record.used_bytes ?? record.size_used),
      totalBytes:
        totalKib != null
          ? totalKib * 1024
          : numberSetting(record.total ?? record.total_bytes ?? record.size),
    };
  }

  private async readRuntimeRecording(): Promise<RuntimeRecording> {
    const payload = await this.agentSetting('runtime/recording');
    if (typeof payload === 'boolean') {
      return { active: payload };
    }
    if (typeof payload === 'string') {
      return {
        active:
          payload === 'recording' || payload === 'active' || payload === 'on',
      };
    }
    if (!payload || typeof payload !== 'object') return { active: false };
    const record = payload as Record<string, unknown>;
    const state = record.state ?? record.status ?? record.recording;
    if (typeof state === 'boolean') return { active: state };
    if (typeof state === 'string') {
      return {
        active: state === 'recording' || state === 'active' || state === 'on',
      };
    }
    return { active: booleanSetting(record.active ?? record.enabled) };
  }

  private async listOverlappingFiles(
    mount: string,
    hostname: string,
    start: Date,
    end: Date,
    clipDurationSeconds: number,
    filename: string | null,
    devicePath: string | null,
  ): Promise<string[]> {
    const kind = recordingLayoutKind(filename, devicePath);
    const dirs =
      kind === 'ciao-day'
        ? dayDirectories(clipsRoot(mount, hostname), start, end, BUFFER_SECONDS)
        : hourDirectories(
            recordsRoot(mount, hostname),
            start,
            end,
            BUFFER_SECONDS,
          );
    const listed: string[] = [];
    for (const dir of dirs) {
      listed.push(...(await this.listDirectoryFiles(dir)));
    }
    return filesOverlappingWindow(
      listed,
      start,
      end,
      clipDurationSeconds,
      BUFFER_SECONDS,
    );
  }

  private async listDirectoryFiles(directory: string): Promise<string[]> {
    try {
      const payload = await this.client.getJson(FILE_MANAGER_PATH, {
        cd: directory,
      });
      return parseFileManagerNames(payload).map((name) =>
        joinListedFile(directory, name),
      );
    } catch (error) {
      if (error instanceof ThinginoHttpError && error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  private async downloadFiles(
    files: string[],
    tempDir: string,
  ): Promise<string[]> {
    const localNames: string[] = [];
    for (const [index, file] of files.entries()) {
      const localName = `seg-${String(index).padStart(3, '0')}.mp4`;
      const localPath = path.join(tempDir, localName);
      await this.client.downloadToFile(
        FILE_MANAGER_PATH,
        { dl: file },
        localPath,
      );
      const stats = await fs.stat(localPath);
      if (stats.size === 0) {
        throw new Error(`Downloaded file is empty: ${path.basename(file)}`);
      }
      localNames.push(localName);
    }
    return localNames;
  }

  private async processVideo(
    files: string[],
    localNames: string[],
    tempDir: string,
    outputPath: string,
    startEpoch: number,
    endEpoch: number,
  ): Promise<void> {
    // Thingino MP4s keep a running PTS, so container duration is the last
    // timestamp rather than clip length. Concat-copy without a reset makes
    // -ss/-t a no-op.
    const normalized: string[] = [];
    for (const name of localNames) {
      const outName = `norm-${name}`;
      await execa(
        'ffmpeg',
        [
          '-y',
          '-loglevel',
          'warning',
          '-i',
          name,
          '-c',
          'copy',
          '-bsf:v',
          'setts=ts=PTS-STARTPTS',
          '-bsf:a',
          'setts=ts=PTS-STARTPTS',
          outName,
        ],
        { cwd: tempDir },
      );
      normalized.push(outName);
    }

    const filelistPath = path.join(tempDir, 'filelist.txt');
    await fs.writeFile(
      filelistPath,
      normalized.map((name) => `file '${name}'`).join('\n'),
    );

    const startTrim = Math.max(0, startEpoch - filenameToEpoch(files[0]));
    const totalDuration = endEpoch - startEpoch;
    await execa(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'warning',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'filelist.txt',
        '-ss',
        String(startTrim),
        '-t',
        String(totalDuration),
        '-c',
        'copy',
        path.resolve(outputPath),
      ],
      { cwd: tempDir },
    );
  }

  private async agentSetting(subpath: string): Promise<unknown> {
    const leaf = subpath.split('/').pop() ?? subpath;
    try {
      const payload = await this.client.getJson(this.client.agentPath(subpath));
      return unwrapAgentValue(payload, leaf);
    } catch (error) {
      if (error instanceof ThinginoHttpError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }
}

function parseRecordTool(payload: unknown): Omit<RecordingLayout, 'hostname'> {
  const root = unwrapRecordTool(payload);
  const video = objectField(root, 'video');
  const videoRecord =
    video && typeof video === 'object' && !Array.isArray(video)
      ? (video as Record<string, unknown>)
      : {};
  const mounts = objectField(root, 'mounts');
  const listedMount =
    Array.isArray(mounts) && typeof mounts[0] === 'string'
      ? stringSetting(mounts[0])
      : null;
  // Ciao leaves video.mount empty and puts the card in data.mounts.
  return {
    mount: stringSetting(videoRecord.mount) ?? listedMount,
    filename: stringSetting(videoRecord.filename),
    devicePath: stringSetting(videoRecord.device_path),
    durationSeconds: numberSetting(videoRecord.duration),
    autostart: booleanSetting(videoRecord.autostart),
  };
}

function unwrapRecordTool(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data;
  }
  return payload;
}

function objectField(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  return (payload as Record<string, unknown>)[key];
}

function stringSetting(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '' && value !== 'null') {
    return value;
  }
  return null;
}

function numberSetting(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanSetting(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'on';
  }
  return false;
}
