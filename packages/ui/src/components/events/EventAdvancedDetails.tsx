import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetEventListItemDTO, LitterboxUseEliminationType } from 'shared';

import { SheetPageHeader } from '@/components/ui/SheetPageHeader';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';

import type { DecodedLitterboxRawData } from './decodeLitterboxRawData';
import type { DecodedWaterRawData } from './decodeWaterRawData';
import LitterboxAdvancedDetails from './LitterboxAdvancedDetails';
import WaterAdvancedDetails from './WaterAdvancedDetails';
import './EventAdvancedDetails.css';

/**
 * A decoded sensor blob, tagged with the kind of event it came off.
 *
 * Built by the drawer, which already has to decode the blob to know whether
 * there is anything worth walking into — so the menu entry and the page it
 * opens are gated on one answer rather than two that could disagree.
 */
export type AdvancedSignal =
  | { type: 'litterbox_use'; decoded: DecodedLitterboxRawData }
  | { type: 'water_intake'; decoded: DecodedWaterRawData };

const ELIMINATION_LABEL_KEYS: Record<LitterboxUseEliminationType, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
  both: 'overview.both',
  no_elimination: 'overview.no_elimination',
  unknown: 'common.unknown',
};

export interface EventAdvancedDetailsProps {
  event: GetEventListItemDTO;
  signal: AdvancedSignal;
  deviceName: string | undefined;
  /** Back to the event this was opened from. */
  onBack: () => void;
}

/**
 * What the device actually recorded, and what its analyzer made of it.
 *
 * A rung of the drawer rather than a page of its own: the grabber stays, the
 * chevron walks back to the event, and the height and the scroller are the
 * sheet's. Nothing here is interactive and nothing here is a correction — the
 * reading is on the surface behind it, and this is the trace under the
 * reading. A visit whose blob never arrived has no rung to walk onto, which is
 * why the menu entry is gated on the decode rather than on the event type.
 */
const EventAdvancedDetails: React.FC<EventAdvancedDetailsProps> = ({
  event,
  signal,
  deviceName,
  onBack,
}) => {
  const { t } = useTranslation();
  const { formatTime } = useFormatters();

  /*
   * What the page is of, said once under its name. The kind is the reading the
   * trace explains — for a visit that is what was deposited, not the word
   * "visit", because the σ column below is the number that decided it.
   */
  const kind =
    event.data.type === 'litterbox_use'
      ? t(ELIMINATION_LABEL_KEYS[event.data.elimination_type ?? 'unknown'])
      : t(`event_details.title_${event.data.type}`);
  const subtitle = [kind, formatTime(new Date(event.timestamp)), deviceName]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="event-advanced-details">
      <SheetPageHeader
        title={t('event_details.advanced_details')}
        subtitle={subtitle}
        onBack={onBack}
      />
      <div className="event-advanced-body">
        {signal.type === 'litterbox_use' &&
          event.data.type === 'litterbox_use' && (
            <LitterboxAdvancedDetails
              data={event.data}
              decoded={signal.decoded}
            />
          )}
        {signal.type === 'water_intake' &&
          event.data.type === 'water_intake' && (
            <WaterAdvancedDetails data={event.data} decoded={signal.decoded} />
          )}
      </div>
    </div>
  );
};

export default EventAdvancedDetails;
