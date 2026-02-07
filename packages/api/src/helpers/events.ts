import { format } from 'date-fns';
import { type EventType } from 'shared';

export const generateOutputFilename = (
  timestamp: Date,
  type: EventType,
  extension: string,
): string => {
  const time = format(timestamp, 'yyyyMMdd_HHmmss');
  return `event_${time}_${type}.${extension}`;
};
