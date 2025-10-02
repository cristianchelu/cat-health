import { API_BASE_URL } from './apiClient';
import { addHours } from 'date-fns';

/**
 * Generate the full URL for an event recording video
 */
export function getEventVideoUrl(timestamp: string): string {
  // TODO: Implement timezone-aware formatting
  const date = addHours(new Date(timestamp), 3);
  const formattedTimestamp = date
    .toISOString()
    .replace(/[:-]/g, '')
    .replace('T', '_')
    .split('.')[0];
  const filename = `event_${formattedTimestamp}_litterbox_use.mp4`;

  return `${API_BASE_URL}/recordings/${filename}`;
}

/**
 * Check if a recording is likely available based on timestamp
 * Videos are available from 2025-08-14 onwards (migration start date)
 */
export function isRecordingAvailable(timestamp: string): boolean {
  return new Date(timestamp) >= new Date('2025-08-14');
}
