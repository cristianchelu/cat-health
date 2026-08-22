import * as React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { getStringValue, isRecord } from '@/lib/utils';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';

/**
 * Whatever the registry has no row for. An event with a type is something we
 * simply do not render yet; one without is malformed, and says so.
 */
const GenericEvent: React.FC<EventComponentProps> = (props) => {
  const { data } = props.event;
  const type = isRecord(data) ? getStringValue(data, 'type') : undefined;

  return (
    <TimelineEventShell
      {...props}
      icon={type ? <Clock aria-hidden /> : <AlertTriangle aria-hidden />}
      title={type ?? 'Unknown Event'}
    />
  );
};

export default GenericEvent;
