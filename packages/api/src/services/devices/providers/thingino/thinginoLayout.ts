import { format } from 'date-fns';

/** Overlap padding around a visit when selecting hour directories and files. */
export const BUFFER_SECONDS = 60;

/** Used when the camera does not report a segment length. */
export const DEFAULT_CLIP_DURATION_SECONDS = 60;

/**
 * Raptor writes two trees under the record root: the 24/7 recorder's
 * `YYYY-MM-DD/HH-MM-SS.mp4` day directories, which is what we read, and RMD's
 * motion clips in `clips/`, which we do not touch. The agent's `duration` is
 * `clip_length_sec` -- the motion-clip length -- so it says nothing about the
 * 24/7 segments, which rotate on `segment_minutes` (default 5).
 */
export const DEFAULT_RAPTOR_CLIP_DURATION_SECONDS = 300;

const PRUDYNT_FILENAME = /^%Y\/%m\/%d\/%H-%M-%S(?:\.mp4)?$/i;
const PRUDYNT_DEVICE_PATH = /^(?:%hostname)?$/i;
const PRUDYNT_PATH =
  /(?:^|\/)(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})-(\d{2})-(\d{2})(?:\.mp4)?$/;
const RAPTOR_FILENAME = /^%Y-%m-%d\/%H-%M-%S(?:\.mp4)?$/i;
const RAPTOR_PATH =
  /(?:^|\/)(\d{4})-(\d{2})-(\d{2})\/(\d{2})-(\d{2})-(\d{2})(?:\.mp4)?$/;

/**
 * The two recording trees Thingino ships, named for the recorder that writes
 * each -- which is what `backend.name` reports: Prudynt on the stable `ciao`
 * branch, Raptor on `master`. Anything else is a custom path we refuse.
 */
export type RecordingLayoutKind = 'prudynt-day' | 'raptor-day';

export class ThinginoLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThinginoLayoutError';
  }
}

/**
 * Raptor reports its record root verbatim, so an absolute `device_path` is the
 * layout on a Raptor image and a custom path -- which we do not support -- on
 * any other. Only the agent's backend name tells those apart.
 */
export function recordingLayoutKind(
  filename: string | null | undefined,
  devicePath: string | null | undefined,
  backendName?: string | null,
): RecordingLayoutKind | null {
  const file = normalizeSetting(filename);
  const dir = normalizeSetting(devicePath);
  if (
    isRaptorBackend(backendName) &&
    isAbsoluteRecordRoot(devicePath) &&
    (!file || RAPTOR_FILENAME.test(file))
  ) {
    return 'raptor-day';
  }
  if (PRUDYNT_FILENAME.test(file) && PRUDYNT_DEVICE_PATH.test(dir))
    return 'prudynt-day';
  return null;
}

export function clipsRoot(mount: string, hostname: string): string {
  const trimmedMount = mount.replace(/\/+$/, '');
  const host = hostname.replace(/\/+$/, '').replace(/^\/+/, '');
  return `${trimmedMount}/${host}`;
}

export function raptorRecordRoot(recordRoot: string): string {
  return recordRoot.replace(/\/+$/, '');
}

export function dayDirectories(
  clipsRootPath: string,
  start: Date,
  end: Date,
  bufferSeconds: number = BUFFER_SECONDS,
  datePattern = 'yyyy/MM/dd',
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
    dirs.push(`${clipsRootPath}/${format(d, datePattern)}`);
  }
  return dirs;
}

export function raptorDayDirectories(
  recordRootPath: string,
  start: Date,
  end: Date,
  bufferSeconds: number = BUFFER_SECONDS,
): string[] {
  return dayDirectories(
    raptorRecordRoot(recordRootPath),
    start,
    end,
    bufferSeconds,
    'yyyy-MM-dd',
  );
}

export function defaultClipDuration(
  kind: RecordingLayoutKind,
  reportedSeconds: number | null,
  observedSeconds: number | null = null,
): number {
  if (kind === 'raptor-day') {
    return observedSeconds ?? DEFAULT_RAPTOR_CLIP_DURATION_SECONDS;
  }
  return reportedSeconds ?? DEFAULT_CLIP_DURATION_SECONDS;
}

const RAPTOR_SECTION = /^\s*\[([^\]]+)\]/;
const RAPTOR_SETTING = /^\s*([A-Za-z0-9_]+)\s*=\s*([^#]*)/;

/**
 * The `[recording]` segment length from `/etc/raptor.conf`, whose path the
 * agent advertises at `config.backend.raw.config_path`. `segment_seconds`
 * overrides `segment_minutes` when nonzero; a commented-out key means the
 * recorder falls back to its own default, so it reads as absent here.
 */
export function parseRaptorSegmentSeconds(conf: string): number | null {
  let section = '';
  let minutes: number | null = null;
  let seconds: number | null = null;
  for (const line of conf.split('\n')) {
    const heading = line.match(RAPTOR_SECTION);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      continue;
    }
    if (section !== 'recording' || /^\s*[#;]/.test(line)) continue;
    const setting = line.match(RAPTOR_SETTING);
    if (!setting) continue;
    const value = Number(setting[2].trim());
    if (!Number.isFinite(value)) continue;
    if (setting[1] === 'segment_minutes') minutes = value;
    if (setting[1] === 'segment_seconds') seconds = value;
  }
  if (seconds != null && seconds > 0) return seconds;
  if (minutes != null && minutes > 0) return minutes * 60;
  return null;
}

/**
 * Parses Prudynt `.../YYYY/MM/DD/HH-MM-SS.mp4` or Raptor
 * `.../YYYY-MM-DD/HH-MM-SS.mp4` in local time. 0 means "not a clip".
 */
export function filenameToEpoch(filePath: string): number {
  const raptor = filePath.match(RAPTOR_PATH);
  if (raptor) {
    return localEpoch(
      raptor[1],
      raptor[2],
      raptor[3],
      raptor[4],
      raptor[5],
      raptor[6],
    );
  }

  const prudynt = filePath.match(PRUDYNT_PATH);
  if (prudynt) {
    return localEpoch(
      prudynt[1],
      prudynt[2],
      prudynt[3],
      prudynt[4],
      prudynt[5],
      prudynt[6],
    );
  }

  return 0;
}

export function filesOverlappingWindow(
  filePaths: string[],
  start: Date,
  end: Date,
  clipDurationSeconds: number,
  bufferSeconds: number = BUFFER_SECONDS,
  kind: RecordingLayoutKind | null = null,
): string[] {
  const startEpoch = Math.floor(start.getTime() / 1000);
  const endEpoch = Math.floor(end.getTime() / 1000);
  const extendedStart = startEpoch - bufferSeconds;
  const dated = filePaths
    .map((filePath) => ({ filePath, start: filenameToEpoch(filePath) }))
    .filter((row) => row.start !== 0)
    .sort((a, b) => a.start - b.start || a.filePath.localeCompare(b.filePath));

  const matched: string[] = [];
  for (let index = 0; index < dated.length; index++) {
    const row = dated[index];
    const nextStart = dated[index + 1]?.start ?? null;
    const duration =
      kind === 'raptor-day'
        ? inferredClipDuration(row.start, nextStart, clipDurationSeconds)
        : clipDurationSeconds;
    const fileEnd = row.start + duration;
    if (row.start < endEpoch && fileEnd > extendedStart) {
      matched.push(row.filePath);
    }
  }
  return matched;
}

/**
 * Adjacent-file delta when it looks like a rotation, otherwise the default.
 *
 * Raptor only, because it is the one recorder that never reports its rotation.
 * Prudynt reports a real `duration`, so a larger gap in its tree is a recorder
 * dropout rather than a longer clip; stretching one to reach the next would
 * make a clip that already ended look like it covers the visit, and it would
 * then become `files[0]` and throw off the `-ss` offset `processVideo`
 * measures from it.
 */
export function inferredClipDuration(
  fileStart: number,
  nextFileStart: number | null,
  defaultDurationSeconds: number,
): number {
  if (nextFileStart == null) return defaultDurationSeconds;
  const delta = nextFileStart - fileStart;
  if (delta > 0 && delta <= defaultDurationSeconds * 2) return delta;
  return defaultDurationSeconds;
}

export function joinListedFile(directory: string, name: string): string {
  if (name.startsWith('/')) return name;
  return `${directory.replace(/\/+$/, '')}/${name}`;
}

function isAbsoluteRecordRoot(value: string | null | undefined): boolean {
  if (value == null) return false;
  return value.trim().startsWith('/');
}

function isRaptorBackend(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.trim().toLowerCase() === 'raptor';
}

function localEpoch(
  year: string,
  month: string,
  day: string,
  hour: string,
  minute: string,
  second: string,
): number {
  const date = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10),
  );
  return Math.floor(date.getTime() / 1000);
}

function normalizeSetting(value: string | null | undefined): string {
  if (value == null) return '';
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}
