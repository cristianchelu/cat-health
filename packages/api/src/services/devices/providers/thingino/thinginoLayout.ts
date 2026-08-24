import path from 'node:path';
import { format } from 'date-fns';

/** Overlap padding around a visit when selecting hour directories and files. */
export const BUFFER_SECONDS = 60;

/** Used when the camera does not report a segment length. */
export const DEFAULT_CLIP_DURATION_SECONDS = 60;

const DEFAULT_DEVICE_PATH = /^(?:%hostname\/)?records\/?$/i;
const DEFAULT_FILENAME = /^(?:%Y%m%d\/%H\/)?%Y%m%dT%H%M%S(?:\.mp4)?$/i;
const CIAO_FILENAME = /^%Y\/%m\/%d\/%H-%M-%S(?:\.mp4)?$/i;
const CIAO_DEVICE_PATH = /^(?:%hostname)?$/i;
const CIAO_PATH =
  /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})-(\d{2})-(\d{2})(?:\.mp4)?$/;

export type RecordingLayoutKind = 'prudynt-hour' | 'ciao-day';

export class ThinginoLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThinginoLayoutError';
  }
}

export function recordingLayoutKind(
  filename: string | null | undefined,
  devicePath: string | null | undefined,
): RecordingLayoutKind | null {
  const file = normalizeSetting(filename);
  const dir = normalizeSetting(devicePath);
  if (CIAO_FILENAME.test(file) && CIAO_DEVICE_PATH.test(dir)) return 'ciao-day';
  if (
    file &&
    dir &&
    DEFAULT_FILENAME.test(file) &&
    DEFAULT_DEVICE_PATH.test(dir)
  ) {
    return 'prudynt-hour';
  }
  return null;
}

export function isDefaultRecordingLayout(
  filename: string | null | undefined,
  devicePath: string | null | undefined,
): boolean {
  return recordingLayoutKind(filename, devicePath) != null;
}

export function assertDefaultRecordingLayout(
  filename: string | null | undefined,
  devicePath: string | null | undefined,
): void {
  if (!isDefaultRecordingLayout(filename, devicePath)) {
    throw new ThinginoLayoutError(
      "cat-health only supports Thingino's default recording path",
    );
  }
}

export function recordsRoot(mount: string, hostname: string): string {
  const trimmedMount = mount.replace(/\/+$/, '');
  const host = hostname.replace(/\/+$/, '').replace(/^\/+/, '');
  return `${trimmedMount}/${host}/records`;
}

export function clipsRoot(mount: string, hostname: string): string {
  const trimmedMount = mount.replace(/\/+$/, '');
  const host = hostname.replace(/\/+$/, '').replace(/^\/+/, '');
  return `${trimmedMount}/${host}`;
}

export function hourDirectories(
  recordsRootPath: string,
  start: Date,
  end: Date,
  bufferSeconds: number = BUFFER_SECONDS,
): string[] {
  const searchStart = new Date(start.getTime() - bufferSeconds * 1000);
  const cursor = new Date(
    searchStart.getFullYear(),
    searchStart.getMonth(),
    searchStart.getDate(),
    searchStart.getHours(),
  );
  const last = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
    end.getHours(),
  );

  const dirs: string[] = [];
  for (
    const d = new Date(cursor.getTime());
    d <= last;
    d.setHours(d.getHours() + 1)
  ) {
    dirs.push(`${recordsRootPath}/${format(d, 'yyyyMMdd/HH')}`);
  }
  return dirs;
}

export function dayDirectories(
  clipsRootPath: string,
  start: Date,
  end: Date,
  bufferSeconds: number = BUFFER_SECONDS,
): string[] {
  const searchStart = new Date(start.getTime() - bufferSeconds * 1000);
  const cursor = new Date(
    searchStart.getFullYear(),
    searchStart.getMonth(),
    searchStart.getDate(),
  );
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const dirs: string[] = [];
  for (
    const d = new Date(cursor.getTime());
    d <= last;
    d.setDate(d.getDate() + 1)
  ) {
    dirs.push(`${clipsRootPath}/${format(d, 'yyyy/MM/dd')}`);
  }
  return dirs;
}

/**
 * Parses a default prudynt basename `YYYYMMDDTHHMMSS.mp4` or Ciao
 * `.../YYYY/MM/DD/HH-MM-SS.mp4` in local time.
 */
export function filenameToEpoch(filePath: string): number {
  const ciao = filePath.match(CIAO_PATH);
  if (ciao) {
    const year = parseInt(ciao[1], 10);
    const month = parseInt(ciao[2], 10) - 1;
    const day = parseInt(ciao[3], 10);
    const hour = parseInt(ciao[4], 10);
    const minute = parseInt(ciao[5], 10);
    const second = parseInt(ciao[6], 10);
    const date = new Date(year, month, day, hour, minute, second);
    return Math.floor(date.getTime() / 1000);
  }

  const datetimePart = path.basename(filePath, '.mp4');
  if (!/^\d{8}T\d{6}$/.test(datetimePart)) return 0;
  const year = parseInt(datetimePart.slice(0, 4), 10);
  const month = parseInt(datetimePart.slice(4, 6), 10) - 1;
  const day = parseInt(datetimePart.slice(6, 8), 10);
  const hour = parseInt(datetimePart.slice(9, 11), 10);
  const minute = parseInt(datetimePart.slice(11, 13), 10);
  const second = parseInt(datetimePart.slice(13, 15), 10);
  const date = new Date(year, month, day, hour, minute, second);
  return Math.floor(date.getTime() / 1000);
}

export function filesOverlappingWindow(
  filePaths: string[],
  start: Date,
  end: Date,
  clipDurationSeconds: number,
  bufferSeconds: number = BUFFER_SECONDS,
): string[] {
  const startEpoch = Math.floor(start.getTime() / 1000);
  const endEpoch = Math.floor(end.getTime() / 1000);
  const extendedStart = startEpoch - bufferSeconds;
  const matched: string[] = [];
  for (const filePath of filePaths) {
    const fileStart = filenameToEpoch(filePath);
    if (fileStart === 0) continue;
    const fileEnd = fileStart + clipDurationSeconds;
    if (fileStart < endEpoch && fileEnd > extendedStart) {
      matched.push(filePath);
    }
  }
  return matched.sort();
}

export function joinListedFile(directory: string, name: string): string {
  if (name.startsWith('/')) return name;
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

function normalizeSetting(value: string | null | undefined): string {
  if (value == null) return '';
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}
