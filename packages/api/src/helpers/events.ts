import { format } from 'date-fns';
import { type EventType } from '../database/types/EventTable.ts';

export const generateOutputFilename = (
  timestamp: Date,
  type: EventType,
  extension: string,
): string => {
  const time = format(timestamp, 'yyyyMMdd_HHmmss');
  return `event_${time}_${type}.${extension}`;
};
