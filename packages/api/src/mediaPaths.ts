import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

function resolvedEnvPath(
  envValue: string | undefined,
  ...defaultSegments: string[]
): string {
  const trimmed = envValue?.trim();
  if (trimmed) return trimmed;
  return resolve(repoRoot, 'data', ...defaultSegments);
}

/** Permanent media root (MEDIA_PATH or `<repo>/data/media`). */
export function getMediaPath(): string {
  return resolvedEnvPath(process.env.MEDIA_PATH, 'media');
}

/** Temp uploads (MEDIA_TEMP_PATH or `<repo>/data/temp`). */
export function getMediaTempPath(): string {
  return resolvedEnvPath(process.env.MEDIA_TEMP_PATH, 'temp');
}
