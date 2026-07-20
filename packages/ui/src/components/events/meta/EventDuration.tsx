import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';

interface EventDurationProps {
  /** Duration in seconds */
  duration: number;
}

interface DurationFormatInstance {
  format(duration: { seconds?: number; minutes?: number }): string;
}

interface DurationFormatConstructor {
  new (locale: string, options?: { style?: string }): DurationFormatInstance;
}

function getDurationFormatCtor(): DurationFormatConstructor | undefined {
  const globalIntl = globalThis.Intl as typeof globalThis.Intl & {
    DurationFormat?: DurationFormatConstructor;
  };
  return globalIntl.DurationFormat;
}

const formatterCache = new Map<string, DurationFormatInstance>();

const getFormatter = (locale: string): DurationFormatInstance | undefined => {
  const DurationFormat = getDurationFormatCtor();
  if (!DurationFormat) return undefined;

  const cached = formatterCache.get(locale);
  if (cached) return cached;

  const formatter = new DurationFormat(locale, { style: 'narrow' });
  formatterCache.set(locale, formatter);
  return formatter;
};

const EventDuration: React.FC<EventDurationProps> = ({ duration }) => {
  const { i18n } = useTranslation();
  const formatter = getFormatter(i18n.language);

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  return (
    <Timeline.MetaItem>
      <Timer />
      {minutes > 0 && formatter
        ? formatter.format({ minutes, seconds })
        : `${seconds}s`}
    </Timeline.MetaItem>
  );
};

export default EventDuration;
