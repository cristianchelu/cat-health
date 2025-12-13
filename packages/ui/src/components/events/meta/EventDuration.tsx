import * as React from 'react';
import { Timer } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';

interface EventDurationProps {
  duration: number; // in milliseconds
}

const EventDuration: React.FC<EventDurationProps> = ({ duration }) => {
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  return (
    <Timeline.MetaItem>
      <Timer />
      {minutes}m {seconds}s
    </Timeline.MetaItem>
  );
};

export default EventDuration;
