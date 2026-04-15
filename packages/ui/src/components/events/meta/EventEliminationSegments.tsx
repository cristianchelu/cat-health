import * as React from 'react';
import type { LitterboxEliminationBadgeSegment } from 'shared';
import Timeline from '@/components/ui/Timeline';
import { ELIMINATION_KIND_ICONS } from '@/components/events/litterboxEventIcons';

import './EventEliminationSegments.css';

interface EventEliminationSegmentsProps {
  segments: LitterboxEliminationBadgeSegment[];
}

function eliminationDurationLabel(start_s: number, end_s: number): string {
  const sec = Math.max(0, Math.round(end_s - start_s));
  return `${sec}s`;
}

const EventEliminationSegments: React.FC<EventEliminationSegmentsProps> = ({
  segments,
}) => {
  if (segments.length === 0) return null;

  return (
    <Timeline.MetaItem className="event-elimination-segments">
      {segments.map((seg, i) => {
        const Icon = ELIMINATION_KIND_ICONS[seg.elimination_type];
        return (
          <React.Fragment
            key={`${seg.elimination_type}-${seg.start_s}-${seg.end_s}-${i}`}
          >
            {i > 0 ? (
              <span className="event-elimination-segments__sep" aria-hidden>
                ·
              </span>
            ) : null}
            <Icon aria-hidden />
            <span>{eliminationDurationLabel(seg.start_s, seg.end_s)}</span>
          </React.Fragment>
        );
      })}
    </Timeline.MetaItem>
  );
};

export default EventEliminationSegments;
