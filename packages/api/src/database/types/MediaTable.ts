import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Optional metadata for the media file.
 * - For images: width, height.
 * - For videos: duration, width, height.
 */
export interface MediaMetadata {
  width?: number;
  height?: number;
  duration?: number; // in seconds
  [key: string]: unknown;
}

export interface MediaTable {
  id: Generated<number>;
  created_at: number; // unix epoch seconds (matches migration)
  /** The path or URL to the media file. */
  file_path: string;
  /** The MIME type of the file (e.g., 'image/jpeg', 'video/mp4'). */
  mime_type: string;
  /** The size of the file in bytes. */
  file_size: number;
  /** A short description or title for the media. */
  description: string | null;
  /** Additional metadata (e.g., image dimensions, video duration). */
  metadata: MediaMetadata | null;
}

export type Media = Selectable<MediaTable>;
export type NewMedia = Insertable<MediaTable>;
export type MediaUpdate = Updateable<MediaTable>;
