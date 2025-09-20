import * as React from 'react';
import {
  FaBroom,
  FaTrash,
  FaPlusCircle,
  FaExchangeAlt,
  FaWeight,
} from 'react-icons/fa';

import BaseEvent from './BaseEvent';
import { EventDataItem, EventSelect, EventStats } from './EventDataItem';
import {
  EventChartButton,
  EventExpandedSection,
  EventContextData,
  EventExpandedChart,
} from './EventChart';
import { parseRawBuffer } from './eventUtils';

interface LitterboxMaintenanceEventData {
  type: 'litterbox_maintenance';
  maintenance_type:
    | 'scoop'
    | 'deep_clean'
    | 'litter_change'
    | 'litter_addition';
  litter_amount?: number;
}

interface LitterboxMaintenanceEventProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  data: LitterboxMaintenanceEventData;
  raw_data: number[] | null;
  human_verified: boolean;
  onDelete: () => void;
  onUpdate: (
    id: number,
    data: LitterboxMaintenanceEventData,
    human_verified: boolean,
  ) => Promise<void>;
  isDeleting: boolean;
}

function formatMaintenanceType(type: string): {
  icon: React.JSX.Element;
  label: string;
  color: string;
} {
  switch (type) {
    case 'scoop':
      return {
        icon: <FaBroom title="Scoop" />,
        label: 'Scoop',
        color: '#4CAF50',
      };
    case 'deep_clean':
      return {
        icon: <FaTrash title="Deep Clean" />,
        label: 'Deep Clean',
        color: '#2196F3',
      };
    case 'litter_change':
      return {
        icon: <FaExchangeAlt title="Litter Change" />,
        label: 'Litter Change',
        color: '#FF9800',
      };
    case 'litter_addition':
      return {
        icon: <FaPlusCircle title="Litter Addition" />,
        label: 'Add Litter',
        color: '#9C27B0',
      };
    default:
      return {
        icon: <FaBroom title={type} />,
        label: type,
        color: '#757575',
      };
  }
}

const maintenanceTypeOptions = [
  { value: 'scoop', label: 'Scoop' },
  { value: 'deep_clean', label: 'Deep Clean' },
  { value: 'litter_change', label: 'Litter Change' },
  { value: 'litter_addition', label: 'Add Litter' },
];

export default function LitterboxMaintenanceEvent({
  id,
  pet_id,
  timestamp,
  data,
  raw_data,
  human_verified,
  onDelete,
  onUpdate,
  isDeleting,
}: LitterboxMaintenanceEventProps) {
  const { context, timestamps, weights } = parseRawBuffer(raw_data);
  const [showChart, setShowChart] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleMaintenanceTypeChange = async (newType: string) => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const updatedData = {
        ...data,
        maintenance_type: newType as typeof data.maintenance_type,
      };
      await onUpdate(id, updatedData, true);
    } catch (error) {
      console.error('Failed to update maintenance event:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const maintenance = formatMaintenanceType(data.maintenance_type);

  const chartAction = (
    <EventChartButton
      data={{ timestamps, weights }}
      isExpanded={showChart}
      onToggle={() => setShowChart((s) => !s)}
      title={showChart ? 'Hide weight chart' : 'Expand weight chart'}
      borderColor="rgb(153, 102, 255)"
      backgroundColor="rgba(153, 102, 255, 0.2)"
    />
  );

  return (
    <BaseEvent
      id={id}
      pet_id={pet_id}
      timestamp={timestamp}
      human_verified={human_verified}
      isDeleting={isDeleting}
      onDelete={onDelete}
    >
      <EventStats chartAction={chartAction} humanVerified={human_verified}>
        <EventDataItem
          icon={
            <span style={{ color: maintenance.color }}>{maintenance.icon}</span>
          }
        >
          <EventSelect
            value={data.maintenance_type}
            options={maintenanceTypeOptions}
            onChange={handleMaintenanceTypeChange}
            disabled={isUpdating}
          />
        </EventDataItem>

        <EventDataItem icon={<FaWeight />}>
          {data.litter_amount?.toFixed(1)}g
        </EventDataItem>
      </EventStats>

      {showChart && (
        <EventExpandedSection>
          <EventContextData context={context} />
          <EventExpandedChart
            data={{ timestamps, weights }}
            borderColor="rgb(153, 102, 255)"
            backgroundColor="rgba(153, 102, 255, 0.2)"
          />
        </EventExpandedSection>
      )}
    </BaseEvent>
  );
}
