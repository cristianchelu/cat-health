import { NodeSSH } from "node-ssh";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { format } from "date-fns";

import { EventEmitter } from "events";
import { createWriteStream } from "fs";
import type { MediaService } from "../types.ts";

const execAsync = promisify(exec);

export interface CameraConfig {
  ip: string;
  sshUser?: string;
  sshOptions?: { privateKey?: string; password?: string };
  remotePath: string;
  bufferSeconds?: number;
  clipDurationSeconds?: number;
  cropLeftHalf?: boolean;
  rotate90CCW?: boolean;
  tempDir?: string;
  recordingsDir: string;
}

export interface EventRequest {
  id: string;
  startDateTime: Date;
  endDateTime: Date;
  outputFile?: string;
  priority?: number;
}

export interface EventResult {
  id: string;
  success: boolean;
  outputFile?: string;
  error?: string;
  duration?: number;
  fileSize?: number;
}

interface QueuedEvent extends EventRequest {
  resolve: (result: EventResult) => void;
  reject: (error: Error) => void;
  startTime: number;
}

/**
 * Manages event video downloading from a camera and implements MediaService.
 *
 * This simplified version assumes the Node.js server and the camera
 * are operating in the SAME timezone.
 */
export class CameraEventDownloader extends EventEmitter implements MediaService {
  private ssh: NodeSSH;
  private config: Required<CameraConfig>;
  private isConnected: boolean = false;
  private eventQueue: QueuedEvent[] = [];
  private isProcessing: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: CameraConfig) {
    super();

    const { ip } = config;

    if (!ip) {
      throw new Error("Camera IP is required");
    }

    this.ssh = new NodeSSH();
    this.config = {
      ip,
      sshUser: config.sshUser || "root",
      sshOptions: config.sshOptions || {},
      remotePath: config.remotePath,
      bufferSeconds: config.bufferSeconds || 60,
      clipDurationSeconds: config.clipDurationSeconds || 120,
      cropLeftHalf: config.cropLeftHalf || false,
      rotate90CCW: config.rotate90CCW || false,
      tempDir:
        config.tempDir || `/tmp/temp_camera_${ip.replace(/\./g, "_")}`,
      recordingsDir: config.recordingsDir,
    };
  }

  /**
   * Connect to the camera.
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._doConnect();
    return this.connectionPromise;
  }

  private async _doConnect(): Promise<void> {
    try {
      this.emit("connecting", { ip: this.config.ip });

      await this.ssh.connect({
        host: this.config.ip,
        username: this.config.sshUser,
        privateKeyPath: this.config.sshOptions?.privateKey,
        password: this.config.sshOptions?.password,
        keepaliveInterval: 30000,
        readyTimeout: 10000,
      });

      this.isConnected = true;

      this.emit("connected", { ip: this.config.ip });

      if (this.eventQueue.length > 0 && !this.isProcessing) {
        this.processQueue();
      }
    } catch (error) {
      this.isConnected = false;
      this.connectionPromise = null;
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Disconnect from camera
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        this.ssh.dispose();
        this.isConnected = false;
        this.connectionPromise = null;
        this.emit("disconnected", { ip: this.config.ip });
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Check if connected to camera
   */
  isConnectedToCamera(): boolean {
    return this.isConnected;
  }

  /**
   * Get camera configuration
   */
  getConfig(): Required<CameraConfig> {
    return { ...this.config };
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; processing: boolean } {
    return {
      pending: this.eventQueue.length,
      processing: this.isProcessing,
    };
  }

  /**
   * Queue an event for processing
   */
  async queueEvent(request: EventRequest): Promise<EventResult> {
    return new Promise((resolve, reject) => {
      const queuedEvent: QueuedEvent = {
        ...request,
        resolve,
        reject,
        startTime: Date.now(),
      };

      const priority = request.priority || 0;
      const insertIndex = this.eventQueue.findIndex(
        (e) => (e.priority || 0) < priority
      );

      if (insertIndex === -1) {
        this.eventQueue.push(queuedEvent);
      } else {
        this.eventQueue.splice(insertIndex, 0, queuedEvent);
      }

      this.emit("eventQueued", {
        id: request.id,
        queuePosition:
          insertIndex === -1 ? this.eventQueue.length : insertIndex + 1,
        queueSize: this.eventQueue.length,
      });

      if (this.isConnected && !this.isProcessing) {
        this.processQueue();
      } else if (!this.isConnected && !this.connectionPromise) {
        this.connect().catch((error) => {
          const index = this.eventQueue.findIndex((e) => e.id === request.id);
          if (index !== -1) {
            this.eventQueue.splice(index, 1);
            reject(error);
          }
        });
      }
    });
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    if (
      this.isProcessing ||
      this.eventQueue.length === 0 ||
      !this.isConnected
    ) {
      return;
    }

    this.isProcessing = true;
    this.emit("processingStarted");

    while (this.eventQueue.length > 0 && this.isConnected) {
      const event = this.eventQueue.shift()!;

      try {
        this.emit("eventProcessingStarted", { id: event.id });
        const result = await this.processEvent(event);
        event.resolve(result);
        this.emit("eventCompleted", result);
      } catch (error) {
        const errorResult: EventResult = {
          id: event.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        event.reject(error instanceof Error ? error : new Error(String(error)));
        this.emit("eventFailed", errorResult);
      }
    }

    this.isProcessing = false;
    this.emit("processingStopped");
  }

  /**
   * Process a single event
   */
  private async processEvent(event: QueuedEvent): Promise<EventResult> {
    const startTime = Date.now();
    const tempDir = path.join(
      this.config.tempDir,
      `event_${event.id}_${Date.now()}`
    );

    try {
      const startEpoch = this.datetimeToEpoch(event.startDateTime);
      const endEpoch = this.datetimeToEpoch(event.endDateTime);

      if (startEpoch >= endEpoch) {
        throw new Error("Start datetime must be before end datetime");
      }

      const outputFile =
        event.outputFile ||
        this.generateOutputFilename(event.startDateTime, event.id);

      await fs.mkdir(tempDir, { recursive: true });

      const relevantFiles = await this.findRelevantFiles(
        event.startDateTime,
        event.endDateTime
      );
      if (relevantFiles.length === 0) {
        throw new Error(
          "No files found that overlap with the specified time range"
        );
      }

      this.emit("filesFound", {
        id: event.id,
        fileCount: relevantFiles.length,
      });

      await this.downloadFiles(relevantFiles, tempDir, event.id);

      const finalOutputPath = await this.processVideo(
        relevantFiles,
        tempDir,
        outputFile,
        startEpoch,
        endEpoch
      );

      const stats = await fs.stat(finalOutputPath);
      await fs.rm(tempDir, { recursive: true, force: true });

      return {
        id: event.id,
        success: true,
        outputFile: finalOutputPath,
        duration: Date.now() - startTime,
        fileSize: stats.size,
      };
    } catch (error) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        /* Ignore */
      }
      throw error;
    }
  }

  /**
   * Converts a Date object to a Unix epoch timestamp (seconds).
   * Assumes the Date object's local time representation matches the camera's timezone.
   */
  private datetimeToEpoch(datetime: Date): number {
    return Math.floor(datetime.getTime() / 1000);
  }

  /**
   * Converts a camera filename to a Unix epoch timestamp (seconds).
   * Assumes the filename's time is in the same timezone as the server.
   */
  private filenameToEpoch(filename: string): number {
    try {
      const datetimePart = path.basename(filename, ".mp4");
      const year = parseInt(datetimePart.substring(0, 4));
      const month = parseInt(datetimePart.substring(4, 6)) - 1; // Month is 0-indexed in JS Date
      const day = parseInt(datetimePart.substring(6, 8));
      const hour = parseInt(datetimePart.substring(9, 11));
      const minute = parseInt(datetimePart.substring(11, 13));
      const second = parseInt(datetimePart.substring(13, 15));

      // This creates a Date object using the server's local timezone.
      // Under our assumption, this is the same as the camera's timezone.
      const date = new Date(year, month, day, hour, minute, second);

      return Math.floor(date.getTime() / 1000);
    } catch {
      return 0; // Return 0 on parsing error
    }
  }

  private generateOutputFilename(startDateTime: Date, eventIdOrType: string): string {
    const timestamp = format(startDateTime, "yyyyMMdd_HHmmss");
    return `event_${timestamp}_${eventIdOrType}.mp4`;
  }

  private async findRelevantFiles(
    startDateTime: Date,
    endDateTime: Date
  ): Promise<string[]> {
    const startEpoch = this.datetimeToEpoch(startDateTime);
    const endEpoch = this.datetimeToEpoch(endDateTime);
    const extendedStartEpoch = startEpoch - this.config.bufferSeconds;

    const fileList = await this.getRemoteFileList(startDateTime, endDateTime);
    const relevantFiles: string[] = [];

    for (const filePath of fileList) {
      if (!filePath) continue;

      const fileStartEpoch = this.filenameToEpoch(filePath);
      if (fileStartEpoch === 0) continue;

      const fileEndEpoch = fileStartEpoch + this.config.clipDurationSeconds;

      if (fileStartEpoch < endEpoch && fileEndEpoch > extendedStartEpoch) {
        relevantFiles.push(filePath);
      }
    }

    return relevantFiles.sort();
  }

  private async getRemoteFileList(
    startDt: Date,
    endDt: Date
  ): Promise<string[]> {
    const startEpoch = this.datetimeToEpoch(startDt);
    const searchStartEpoch = startEpoch - this.config.bufferSeconds;

    // Create Date objects from epoch. They will be in the server's local time.
    const searchStartDate = new Date(searchStartEpoch * 1000);
    const endDate = new Date(this.datetimeToEpoch(endDt) * 1000);

    // Get the start and end hours as Date objects to simplify looping
    const startHourDate = new Date(
      searchStartDate.getFullYear(),
      searchStartDate.getMonth(),
      searchStartDate.getDate(),
      searchStartDate.getHours()
    );
    const endHourDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate(),
      endDate.getHours()
    );

    const dirsToScan: string[] = [];
    // Loop by advancing the date by one hour
    for (
      let d = startHourDate;
      d <= endHourDate;
      d.setHours(d.getHours() + 1)
    ) {
      // Format the directory path using the local date parts.
      const dirPath = format(d, "yyyyMMdd/HH");
      dirsToScan.push(`${this.config.remotePath}/${dirPath}`);
    }

    const allFiles: string[] = [];
    for (const dir of dirsToScan) {
      try {
        const result = await this.ssh.execCommand(
          `[ -d "${dir}" ] && ls -1 "${dir}"/*.mp4 2>/dev/null || true`
        );
        if (result.stdout.trim()) {
          allFiles.push(...result.stdout.trim().split("\n").filter(Boolean));
        }
      } catch (error) {
        // Log or handle error if a directory scan fails, but continue
      }
    }

    return allFiles;
  }

  private async downloadFiles(
    files: string[],
    tempDir: string,
    eventId: string
  ): Promise<void> {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = path.basename(file);
      const localPath = path.join(tempDir, filename);

      this.emit("fileDownloadStarted", {
        id: eventId,
        filename,
        progress: i + 1,
        total: files.length,
      });

      try {
        // await this.ssh.getFile(localPath, file);
        await this.downloadFileAsStream(file, localPath);
        const stats = await fs.stat(localPath);
        if (stats.size === 0) {
          throw new Error("Downloaded file is empty");
        }
        this.emit("fileDownloaded", {
          id: eventId,
          filename,
          size: stats.size,
          progress: i + 1,
          total: files.length,
        });
      } catch (error) {
        throw new Error(
          `Failed to download ${filename}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

    /**
   * Downloads a single remote file to a local path using the recommended streaming approach.
   * This uses `ssh.exec('cat', ...)` with an `onStdout` handler.
   *
   * @param remotePath The full path to the file on the remote server.
   * @param localPath The full path to save the file to locally.
   */
  private async downloadFileAsStream(
    remotePath: string,
    localPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const localWriteStream = createWriteStream(localPath);

      // Handle errors during the local file writing process
      localWriteStream.on("error", (err) => {
        reject(
          new Error(
            `Failed to write to local file ${localPath}: ${err.message}`
          )
        );
      });

      // The 'finish' event is emitted after .end() is called and all data has been flushed.
      // This is the true signal that the file is completely written.
      localWriteStream.on("finish", () => {
        localWriteStream.close((err) => (err ? reject(err) : resolve()));
      });

      // Execute the remote 'cat' command
      this.ssh
        .exec("cat", [remotePath], {
          // This onStdout callback receives each chunk of data from the remote process.
          onStdout: (chunk: Buffer) => {
            localWriteStream.write(chunk);
          },
          // You could also log stderr if needed, e.g., for 'cat: file not found' messages
          // onStderr: (chunk: Buffer) => { console.error('STDERR: ' + chunk.toString('utf-8')) },
        })
        .then(() => {
          // When the Promise from ssh.exec resolves, the remote command has finished.
          // We can now safely end our local write stream. This will trigger the 'finish' event above.
          localWriteStream.end();
        })
        .catch((err: Error) => {
          // If the ssh.exec promise rejects, the command failed (e.g., non-zero exit code).
          localWriteStream.end(); // Attempt to close the stream on failure too
          reject(
            new Error(
              `Remote command 'cat ${remotePath}' failed: ${err.message}`
            )
          );
        });
    });
  }

  private async processVideo(
    files: string[],
    tempDir: string,
    outputFile: string,
    startEpoch: number,
    endEpoch: number
  ): Promise<string> {
    const filelistPath = path.join(tempDir, "filelist.txt");
    const filelistContent = files
      .map((file) => `file '${path.basename(file)}'`)
      .join("\n");
    await fs.writeFile(filelistPath, filelistContent);

    const tempConcat = path.join(tempDir, "temp_concat.mp4");
    await execAsync(
      `cd "${tempDir}" && ffmpeg -f concat -safe 0 -i "filelist.txt" -c copy "${path.basename(
        tempConcat
      )}" -y -loglevel warning -fflags +genpts`
    );

    const firstFileStart = this.filenameToEpoch(files[0]);
    const startTrim = Math.max(0, startEpoch - firstFileStart);
    const totalDuration = endEpoch - startEpoch;

    const absOutputFile = path.resolve(outputFile);

    const filters: string[] = [];
    if (this.config.cropLeftHalf) filters.push("crop=iw/2:ih:0:0");
    if (this.config.rotate90CCW) filters.push("transpose=2");

    // Determine if we need to re-encode video based on filters
    const needsVideoReencoding = filters.length > 0;
    
    let ffmpegCmd = `ffmpeg -i "${tempConcat}" -ss ${startTrim} -t ${totalDuration}`;
    
    if (needsVideoReencoding) {
      // Need to re-encode video due to filters
      ffmpegCmd += ` -vf "${filters.join(",")}" -c:v libx264`;
    } else {
      // No filters needed, copy video stream to avoid re-encoding
      ffmpegCmd += ` -c:v copy`;
    }
    
    // For audio, always copy if no video re-encoding, otherwise use aac
    ffmpegCmd += needsVideoReencoding ? ` -c:a aac` : ` -c:a copy`;
    ffmpegCmd += ` "${absOutputFile}" -y -loglevel warning`;

    await execAsync(ffmpegCmd);

    return absOutputFile;
  }

  /**
   * MediaService implementation: Download video for an event
   */
  async downloadVideo(
    startTime: Date, 
    endTime: Date, 
    eventType: string, 
    filename?: string
  ): Promise<void> {
    // Generate filename if not provided
    const videoFilename = filename || this.generateOutputFilename(startTime, eventType);
    const outputPath = path.join(this.config.recordingsDir, videoFilename);

    try {
      await this.connect();
      
      const result = await this.queueEvent({
        id: `${startTime.getTime()}-${eventType}`,
        startDateTime: startTime,
        endDateTime: endTime,
        outputFile: outputPath,
      });

      if (!result.success) {
        console.warn(`Video download failed for ${videoFilename}: ${result.error}`);
      } else {
        console.log(`✅ Video downloaded successfully: ${videoFilename}`);
      }
    } catch (error) {
      console.error(`❌ Video download error for ${videoFilename}:`, error);
      // Don't throw - allow migration to continue
    }
  }

  /**
   * MediaService implementation: Capture snapshot (not implemented)
   */
  async captureSnapshot(
    timestamp: Date, 
    eventType: string, 
    filename?: string
  ): Promise<void> {
    // For now, snapshots are not implemented in CameraEventDownloader
    // This could be extended in the future for drink/eat events
    console.log(`Snapshot capture not implemented for ${eventType} at ${timestamp.toISOString()}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      event.reject(new Error("Downloader is being cleaned up"));
    }
    await this.disconnect();
    try {
      await fs.rm(this.config.tempDir, { recursive: true, force: true });
    } catch {
      /* Ignore */
    }
  }

  /**
   * Alias for cleanup to match MediaService pattern
   */
  async destroy(): Promise<void> {
    await this.cleanup();
  }
}
