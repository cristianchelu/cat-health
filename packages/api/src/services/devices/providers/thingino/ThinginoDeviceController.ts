import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { format } from 'date-fns';
import { NodeSSH } from 'node-ssh';
import { type Static, Type } from '@fastify/type-provider-typebox';
import type { EventType } from 'shared';
import type { Camera, RecordingResult, RecordingSource } from '../../types.ts';
import {
  CameraConfigSchema,
  CameraDeviceController,
} from '../camera/CameraDeviceController.ts';
import type { Device, ProviderDeps } from '../../types.ts';

const execAsync = promisify(exec);

export const ThinginoConfigSchema = Type.Intersect([
  CameraConfigSchema,
  Type.Object({
    recording: Type.Optional(
      Type.Object({
        ssh: Type.Object({
          user: Type.Optional(Type.String()),
          privateKeyPath: Type.Optional(Type.String()),
          password: Type.Optional(Type.String()),
        }),
        remotePath: Type.String(),
        clipDurationSeconds: Type.Optional(Type.Number()),
        bufferSeconds: Type.Optional(Type.Number()),
      }),
    ),
  }),
]);
export type ThinginoConfig = Static<typeof ThinginoConfigSchema>;

interface ThinginoRecordingConfig {
  host: string;
  sshUser: string;
  privateKeyPath?: string;
  password?: string;
  remotePath: string;
  clipDurationSeconds: number;
  bufferSeconds: number;
}

/**
 * Thingino camera controller: HTTP snapshot (via base Camera) + SSH onboard recording fetch.
 * Assumes server and camera use the same timezone.
 */
export class ThinginoDeviceController
  extends CameraDeviceController
  implements Camera, RecordingSource
{
  private ssh: NodeSSH;
  private recordingConfig: ThinginoRecordingConfig | null = null;
  private connectionPromise: Promise<void> | null = null;
  private isSshConnected = false;

  constructor(device: Device, deps: ProviderDeps) {
    super(device, deps);
    this.ssh = new NodeSSH();

    const rawConfig = device.config as unknown as ThinginoConfig;
    if (rawConfig.recording) {
      const r = rawConfig.recording;
      const host =
        typeof rawConfig.snapshotUrl === 'string'
          ? new URL(rawConfig.snapshotUrl).hostname
          : '';
      if (!host) {
        throw new Error(
          'Thingino recording requires snapshotUrl with a valid host for SSH',
        );
      }
      this.recordingConfig = {
        host,
        sshUser: r.ssh?.user ?? 'root',
        privateKeyPath: r.ssh?.privateKeyPath,
        password: r.ssh?.password,
        remotePath: r.remotePath,
        clipDurationSeconds: r.clipDurationSeconds ?? 120,
        bufferSeconds: r.bufferSeconds ?? 60,
      };
    }
  }

  override async connect(): Promise<void> {
    await super.connect();
    // SSH connects lazily on first fetchRecording
  }

  override async disconnect(): Promise<void> {
    try {
      if (this.isSshConnected) {
        this.ssh.dispose();
        this.isSshConnected = false;
        this.connectionPromise = null;
      }
    } catch {
      /* ignore */
    }
    await super.disconnect();
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
    if (!this.recordingConfig) {
      throw new Error('Thingino device has no recording config');
    }

    await this.ensureSshConnected();

    const pendingMedia = await this.deps.mediaManager.createPendingMedia(
      'mp4',
      {},
    );

    const tempDir = path.join(
      os.tmpdir(),
      `thingino_${this.deviceId}_${Date.now()}`,
    );

    try {
      const startEpoch = this.datetimeToEpoch(options.startTime);
      const endEpoch = this.datetimeToEpoch(options.endTime);
      if (startEpoch >= endEpoch) {
        throw new Error('Start time must be before end time');
      }

      await fs.mkdir(tempDir, { recursive: true });

      const relevantFiles = await this.findRelevantFiles(
        options.startTime,
        options.endTime,
      );
      if (relevantFiles.length === 0) {
        throw new Error(
          'No recording files found that overlap with the time range',
        );
      }

      await this.downloadFiles(relevantFiles, tempDir);

      await this.processVideo(
        relevantFiles,
        tempDir,
        pendingMedia.path,
        startEpoch,
        endEpoch,
      );

      return {
        type: 'local',
        pendingMedia,
        mimeType: 'video/mp4',
      };
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private async ensureSshConnected(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    const cfg = this.recordingConfig!;
    this.connectionPromise = this.ssh
      .connect({
        host: cfg.host,
        username: cfg.sshUser,
        privateKeyPath: cfg.privateKeyPath,
        password: cfg.password,
        keepaliveInterval: 30000,
        readyTimeout: 10000,
      })
      .then(() => {
        this.isSshConnected = true;
      })
      .catch((err) => {
        this.connectionPromise = null;
        throw err;
      });
    return this.connectionPromise;
  }

  private datetimeToEpoch(datetime: Date): number {
    return Math.floor(datetime.getTime() / 1000);
  }

  private filenameToEpoch(filename: string): number {
    try {
      const datetimePart = path.basename(filename, '.mp4');
      const year = parseInt(datetimePart.substring(0, 4), 10);
      const month = parseInt(datetimePart.substring(4, 6), 10) - 1;
      const day = parseInt(datetimePart.substring(6, 8), 10);
      const hour = parseInt(datetimePart.substring(9, 11), 10);
      const minute = parseInt(datetimePart.substring(11, 13), 10);
      const second = parseInt(datetimePart.substring(13, 15), 10);
      const date = new Date(year, month, day, hour, minute, second);
      return Math.floor(date.getTime() / 1000);
    } catch {
      return 0;
    }
  }

  private async findRelevantFiles(
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<string[]> {
    const cfg = this.recordingConfig!;
    const startEpoch = this.datetimeToEpoch(startDateTime);
    const endEpoch = this.datetimeToEpoch(endDateTime);
    const extendedStartEpoch = startEpoch - cfg.bufferSeconds;

    const fileList = await this.getRemoteFileList(startDateTime, endDateTime);
    const relevantFiles: string[] = [];

    for (const filePath of fileList) {
      if (!filePath) continue;
      const fileStartEpoch = this.filenameToEpoch(filePath);
      if (fileStartEpoch === 0) continue;
      const fileEndEpoch = fileStartEpoch + cfg.clipDurationSeconds;
      if (
        fileStartEpoch < endEpoch &&
        fileEndEpoch > extendedStartEpoch
      ) {
        relevantFiles.push(filePath);
      }
    }

    return relevantFiles.sort();
  }

  private async getRemoteFileList(
    startDt: Date,
    endDt: Date,
  ): Promise<string[]> {
    const cfg = this.recordingConfig!;
    const startEpoch = this.datetimeToEpoch(startDt);
    const searchStartEpoch = startEpoch - cfg.bufferSeconds;
    const searchStartDate = new Date(searchStartEpoch * 1000);
    const endDate = new Date(this.datetimeToEpoch(endDt) * 1000);

    const startHourDate = new Date(
      searchStartDate.getFullYear(),
      searchStartDate.getMonth(),
      searchStartDate.getDate(),
      searchStartDate.getHours(),
    );
    const endHourDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      endDate.getHours(),
    );

    const dirsToScan: string[] = [];
    for (
      let d = new Date(startHourDate.getTime());
      d <= endHourDate;
      d.setHours(d.getHours() + 1)
    ) {
      const dirPath = format(d, 'yyyyMMdd/HH');
      dirsToScan.push(`${cfg.remotePath}/${dirPath}`);
    }

    const allFiles: string[] = [];
    for (const dir of dirsToScan) {
      try {
        const result = await this.ssh.execCommand(
          `[ -d "${dir}" ] && ls -1 "${dir}"/*.mp4 2>/dev/null || true`,
        );
        if (result.stdout.trim()) {
          allFiles.push(
            ...result.stdout.trim().split('\n').filter(Boolean),
          );
        }
      } catch {
        /* ignore missing dirs */
      }
    }

    return allFiles;
  }

  private async downloadFiles(
    files: string[],
    tempDir: string,
  ): Promise<void> {
    for (const file of files) {
      const filename = path.basename(file);
      const localPath = path.join(tempDir, filename);
      await this.downloadFileAsStream(file, localPath);
      const stats = await fs.stat(localPath);
      if (stats.size === 0) {
        throw new Error(`Downloaded file is empty: ${filename}`);
      }
    }
  }

  private async downloadFileAsStream(
    remotePath: string,
    localPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const localWriteStream = createWriteStream(localPath);
      localWriteStream.on('error', (err) => {
        reject(
          new Error(`Failed to write to ${localPath}: ${err.message}`),
        );
      });
      localWriteStream.on('finish', () => {
        localWriteStream.close((err) => (err ? reject(err) : resolve()));
      });

      this.ssh
        .exec('cat', [remotePath], {
          onStdout: (chunk: Buffer) => {
            localWriteStream.write(chunk);
          },
        })
        .then(() => {
          localWriteStream.end();
        })
        .catch((err: Error) => {
          localWriteStream.end();
          reject(
            new Error(
              `Remote cat ${remotePath} failed: ${err.message}`,
            ),
          );
        });
    });
  }

  private async processVideo(
    files: string[],
    tempDir: string,
    outputPath: string,
    startEpoch: number,
    endEpoch: number,
  ): Promise<void> {
    const filelistPath = path.join(tempDir, 'filelist.txt');
    const filelistContent = files
      .map((file) => `file '${path.basename(file)}'`)
      .join('\n');
    await fs.writeFile(filelistPath, filelistContent);

    const tempConcat = path.join(tempDir, 'temp_concat.mp4');
    await execAsync(
      `cd "${tempDir}" && ffmpeg -f concat -safe 0 -i "filelist.txt" -c copy "${path.basename(
        tempConcat,
      )}" -y -loglevel warning -fflags +genpts`,
    );

    const firstFileStart = this.filenameToEpoch(files[0]);
    const startTrim = Math.max(0, startEpoch - firstFileStart);
    const totalDuration = endEpoch - startEpoch;

    const ffmpegCmd = `ffmpeg -i "${tempConcat}" -ss ${startTrim} -t ${totalDuration} -c:v copy -c:a copy "${path.resolve(outputPath)}" -y -loglevel warning`;

    await execAsync(ffmpegCmd);
  }
}
