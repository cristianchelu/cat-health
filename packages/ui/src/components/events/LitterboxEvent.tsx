import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Toilet } from 'lucide-react';
import { StatusPill } from '@/components/ui/StatusPill';
import type { TimelineVariant } from '@/components/ui/Timeline';
import type { EventComponentProps } from './types';
import EventDuration from './meta/EventDuration';
import EventAnnotated from './meta/EventAnnotated';
import PoopIcon from '../icons/PoopIcon';
import SplitIcon from '../icons/SplitIcon';
import { LITTERBOX_SAMPLE_HZ, type LitterboxUseEliminationType } from 'shared';
import { eliminationBadgeRowsFromSegments } from '@/lib/litterboxEliminationBadges';
import { hasPersistedLitterboxAnnotation } from '@/types/litterbox';
import EventEliminationSegments from './meta/EventEliminationSegments';
import TimelineEventShell from './TimelineEventShell';

/*
 * The app's elimination palette, shared with the deposit pips and the
 * elimination charts. `both` is in neither map: it is not one glyph or one
 * accent but two of each, so it renders a `SplitIcon` of the other two and
 * needs no accent of its own.
 */
const ICON_MAP: Partial<
  Record<LitterboxUseEliminationType, React.ElementType>
> = {
  urination: Droplets,
  defecation: PoopIcon,
  no_elimination: Toilet,
  unknown: Toilet,
};

const COLOR_MAP: Partial<Record<LitterboxUseEliminationType, string>> = {
  urination: 'var(--color-litterbox-urination)',
  defecation: 'var(--color-litterbox-defecation)',
  no_elimination: 'var(--color-litterbox-unknown)',
  unknown: 'var(--color-litterbox-unknown)',
};

const ELIMINATION_BOTH_HALVES = [
  { icon: Droplets, color: 'var(--color-litterbox-urination)' },
  { icon: PoopIcon, color: 'var(--color-litterbox-defecation)' },
] as const;

const TITLE_KEY: Record<LitterboxUseEliminationType, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
  both: 'overview.both',
  no_elimination: 'overview.no_elimination',
  unknown: 'overview.litterbox_visit',
};

const LitterboxEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const litterboxData =
    props.event.data.type === 'litterbox_use' ? props.event.data : null;
  const persistedSegments = litterboxData?.segments;
  const sampleRateHz = litterboxData?.sample_rate_hz ?? LITTERBOX_SAMPLE_HZ;
  const badgeSegments = React.useMemo(
    () => eliminationBadgeRowsFromSegments(persistedSegments, sampleRateHz),
    [persistedSegments, sampleRateHz],
  );

  if (!litterboxData) return null;

  const eliminationType = litterboxData.elimination_type ?? 'unknown';
  const Icon = ICON_MAP[eliminationType];
  const icon = Icon ? (
    <Icon aria-hidden />
  ) : (
    <SplitIcon halves={[...ELIMINATION_BOTH_HALVES]} />
  );

  /*
   * The weight is a reading about the visit, so straining — a sign, not a
   * measurement — colours it rather than sitting in the tone the icon carries.
   */
  const valueVariant: TimelineVariant = litterboxData.straining
    ? 'danger'
    : eliminationType === 'no_elimination'
      ? 'muted'
      : 'warning';

  return (
    <TimelineEventShell
      {...props}
      icon={icon}
      iconColor={COLOR_MAP[eliminationType]}
      value={
        litterboxData.elimination_weight !== undefined
          ? `${litterboxData.elimination_weight}g`
          : undefined
      }
      valueVariant={valueVariant}
      valueAdornment={
        litterboxData.straining ? (
          <StatusPill variant="warn">{t('overview.straining')}</StatusPill>
        ) : undefined
      }
      title={t(TITLE_KEY[eliminationType])}
      verifiedMark={
        hasPersistedLitterboxAnnotation(litterboxData) ? (
          <EventAnnotated />
        ) : undefined
      }
    >
      {litterboxData.duration > 0 && (
        <EventDuration duration={litterboxData.duration} />
      )}
      {badgeSegments.length > 0 && (
        <EventEliminationSegments segments={badgeSegments} />
      )}
    </TimelineEventShell>
  );
};

export default LitterboxEvent;
