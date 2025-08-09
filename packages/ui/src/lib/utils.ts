import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a date string (YYYY-MM-DD) to start and end ISO timestamp strings for that day
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns Object with startTime and endTime ISO strings
 */
export function dateToTimeRange(dateStr: string): { startTime: string; endTime: string } {
  // Create date objects for the start and end of the day in UTC
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
  
  return {
    startTime: startOfDay.toISOString(),
    endTime: endOfDay.toISOString(),
  };
}
