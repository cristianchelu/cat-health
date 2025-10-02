import * as React from 'react';
import { FaTint, FaClock } from 'react-icons/fa';

import BaseEvent from './BaseEvent';
import { EventDataItem, EventStats, EventPetSelect } from './EventDataItem';
import EventImageButton from './EventImageButton';
import './EventImageButton.css';
import { formatDuration, type Pet } from './eventUtils';

interface WaterIntakeEventData {
  type: 'water_intake';
  amount: number;
  duration?: number;
}

interface WaterIntakeEventProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  data: WaterIntakeEventData;
  raw_data: number[] | null;
  human_verified: boolean;
  pets: Pet[];
  onDelete: () => void;
  onUpdate: (
    id: number,
    data: WaterIntakeEventData,
    human_verified: boolean,
    pet_id?: number | null,
  ) => Promise<void>;
  isDeleting: boolean;
}

const WaterIntakeEvent: React.FC<WaterIntakeEventProps> = ({
  id,
  pet_id,
  timestamp,
  data,
  human_verified,
  pets,
  onDelete,
  onUpdate,
  isDeleting,
}) => {
  const [isPending, startTransition] = React.useTransition();

  const handlePetAssignmentChange = (newPetId: number | null) => {
    if (isPending) return;
    startTransition(() => {
      onUpdate(id, data, true, newPetId).catch((error) => {
        console.error('Failed to update pet assignment:', error);
      });
    });
  };

  return (
    <BaseEvent
      id={id}
      pet_id={pet_id}
      timestamp={timestamp}
      human_verified={human_verified}
      isDeleting={isDeleting}
      onDelete={onDelete}
    >
      <EventStats
        humanVerified={human_verified}
        chartAction={
          <EventImageButton timestamp={timestamp} type={data.type} />
        }
      >
        <EventDataItem icon={<FaTint title="Water Intake" color="#00BFFF" />}>
          {data.amount.toFixed(0)}ml
        </EventDataItem>

        <EventDataItem icon={<FaClock />}>
          {data.duration ? formatDuration(data.duration * 1000) : '-'}
        </EventDataItem>

        <EventDataItem>
          Cat
          <EventPetSelect
            value={pet_id}
            pets={pets}
            onChange={handlePetAssignmentChange}
            disabled={isPending}
          />
        </EventDataItem>
      </EventStats>
    </BaseEvent>
  );
};

WaterIntakeEvent.displayName = 'WaterIntakeEvent';

export { type WaterIntakeEventProps };
export default WaterIntakeEvent;
