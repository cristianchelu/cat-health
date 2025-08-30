import { FaWeight } from "react-icons/fa";

import BaseEvent from "./BaseEvent";
import { EventDataItem, EventStats } from "./EventDataItem";
import { formatWeight, type Pet } from "./eventUtils";

interface WeightMeasurementEventData {
  type: "weight_measurement";
  weight: number; // in grams
}

interface WeightMeasurementEventProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  data: WeightMeasurementEventData;
  raw_data: number[] | null;
  human_verified: boolean;
  pets: Pet[];
  onDelete: () => void;
  onUpdate: (
    id: number,
    data: WeightMeasurementEventData,
    human_verified: boolean,
    pet_id?: number | null
  ) => Promise<void>;
  isDeleting: boolean;
}

export default function WeightMeasurementEvent({
  id,
  pet_id,
  timestamp,
  data,
  human_verified,
  pets,
  onDelete,
  isDeleting,
}: WeightMeasurementEventProps) {
  const pet = pets.find((p) => p.id === pet_id);

  return (
    <BaseEvent
      id={id}
      pet_id={pet_id}
      timestamp={timestamp}
      human_verified={human_verified}
      isDeleting={isDeleting}
      onDelete={onDelete}
    >
      <EventStats humanVerified={human_verified}>
        <EventDataItem icon={<FaWeight className="weight-icon" />}>
          {formatWeight(data.weight, 'kg')}
        </EventDataItem>

        {pet && (
          <EventDataItem>
            <span>Cat: {pet.name}</span>
          </EventDataItem>
        )}
      </EventStats>
    </BaseEvent>
  );
}
