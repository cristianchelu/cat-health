import { API_BASE_URL } from "./apiClient";

/**
 * Generate the full URL for an event recording video
 */
export function getEventVideoUrl(timestamp: string): string {
  const date = new Date(timestamp);
  const formattedTimestamp = date.toISOString().replace(/[:-]/g, '').replace('T', '_').split('.')[0];
  const filename = `event_${formattedTimestamp}_use.mp4`;
  
  return `${API_BASE_URL}/recordings/${filename}`;
}

/**
 * Check if a recording is likely available based on timestamp
 * Videos are available from 2025-08-14 onwards (migration start date)
 */
export function isRecordingAvailable(timestamp: string): boolean {
  return new Date(timestamp) >= new Date('2025-08-14');
}