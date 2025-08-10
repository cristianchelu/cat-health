import { FaWeight, FaCalendarAlt, FaCheck } from 'react-icons/fa';

interface WeightMeasurementEventData {
  type: "weight_measurement";
  weight: number; // in grams
}

interface Pet {
  id: number;
  name: string;
  breed: string;
  birth_date: string;
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
  onUpdate: (id: number, data: WeightMeasurementEventData, human_verified: boolean, pet_id?: number | null) => Promise<void>;
  isDeleting: boolean;
}

export default function WeightMeasurementEvent({
  pet_id,
  timestamp,
  data,
  human_verified,
  pets,
  onDelete,
  isDeleting
}: WeightMeasurementEventProps) {
  const formatWeight = (weightInGrams: number): string => {
    const kg = weightInGrams / 1000;
    return `${kg.toFixed(2)} kg`;
  };

  const pet = pets.find(p => p.id === pet_id);

  return (
    <li className="weight-measurement-event-item" style={{ borderBottom: '1px solid #eee', padding: '0.5em 0' }}>
      <div className="event-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="event-timestamp" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <FaCalendarAlt style={{ marginRight: 4 }} />
          <b>{new Date(timestamp).toLocaleString()}</b>
        </div>
        <button
          className="event-delete-btn"
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete event"
          style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}
        >
          {isDeleting ? '...' : '×'}
        </button>
      </div>

      <div className="weight-event-details" style={{ marginTop: 6 }}>
        <div className="event-stats" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 18, 
          fontSize: 15, 
          color: '#444'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FaWeight style={{ color: '#4CAF50' }} />
            <span style={{ fontWeight: 'bold' }}>{formatWeight(data.weight)}</span>
          </div>
          {pet && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>Cat: {pet.name}</span>
            </div>
          )}
          {human_verified && (
            <FaCheck title="Human verified" style={{ color: '#4CAF50', fontSize: '12px' }} />
          )}
        </div>
      </div>
    </li>
  );
}
