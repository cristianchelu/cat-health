import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';

interface EventDurationProps {
  /** Duration in seconds */
  duration: number;
}

// TODO: TypeScript hasn't yet added types for DurationFormat
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DurationFormat = (Intl as any).DurationFormat;

const formatterCache = new Map<string, InstanceType<typeof DurationFormat>>();

const getFormatter = (locale: string) => {
  if (!formatterCache.has(locale)) {
    formatterCache.set(locale, new DurationFormat(locale, { style: 'narrow' }));
  }
  return formatterCache.get(locale)!;
};

const EventDuration: React.FC<EventDurationProps> = ({ duration }) => {
  const { i18n } = useTranslation();
  const formatter = getFormatter(i18n.language);

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  return (
    <Timeline.MetaItem>
      <Timer />
      {formatter.format({ minutes, seconds })}
    </Timeline.MetaItem>
  );
};

export default EventDuration;
