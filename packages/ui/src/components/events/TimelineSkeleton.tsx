import * as React from 'react';
import { Drumstick, GlassWater, Toilet } from 'lucide-react';

import Timeline from '@/components/ui/Timeline';

const SKELETON_ROWS = [
  {
    icon: Toilet,
    value: '--g',
    iconColor: 'var(--color-litterbox-unknown)',
  },
  {
    icon: GlassWater,
    value: '---ml',
    iconColor: 'var(--color-water)',
  },
  {
    icon: Drumstick,
    value: '--- kcal',
    iconColor: 'var(--color-food)',
  },
] as const;

const TimelineSkeleton: React.FC = () => {
  return (
    <>
      {SKELETON_ROWS.map(({ icon: Icon, value, iconColor }, index) => (
        <Timeline.Item
          key={index}
          className="timeline-item-skeleton"
          aria-hidden
          style={{ '--timeline-icon-color': iconColor } as React.CSSProperties}
        >
          <Timeline.Icon>
            <Icon />
          </Timeline.Icon>
          <Timeline.Content>
            <Timeline.Header>
              <Timeline.Timestamp className="timeline-placeholder">
                --:--
              </Timeline.Timestamp>
              <Timeline.Value className="timeline-placeholder">
                {value}
              </Timeline.Value>
              <Timeline.Title className="timeline-placeholder">
                · · ·
              </Timeline.Title>
            </Timeline.Header>
            <Timeline.Meta>
              <Timeline.MetaItem className="timeline-placeholder">
                --
              </Timeline.MetaItem>
              <Timeline.MetaItem className="timeline-placeholder">
                · · ·
              </Timeline.MetaItem>
            </Timeline.Meta>
          </Timeline.Content>
        </Timeline.Item>
      ))}
    </>
  );
};

export default TimelineSkeleton;
