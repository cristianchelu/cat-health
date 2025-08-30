import * as React from "react";
import { FaTint, FaPoop, FaBan, FaQuestion, FaClock, FaGift } from 'react-icons/fa';

import BaseEvent from "./BaseEvent";
import { EventDataItem, EventSelect, EventPetSelect, EventStats } from "./EventDataItem";
import { EventChartButton, EventExpandedSection, EventContextData, EventExpandedChart } from "./EventChart";
import { EventVideoButton, EventVideoPlayer } from "./EventVideo";
import { parseRawBuffer, formatDuration, type Pet } from "./eventUtils";

interface LitterboxUseEventData {
  type: "litterbox_use";
  elimination_type: "urination" | "defecation" | "both" | "no_elimination" | "unknown";
  elimination_weight: number;
  duration: number;
}

interface LitterboxUseEventProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  data: LitterboxUseEventData;
  raw_data: number[] | null;
  human_verified: boolean;
  pets: Pet[];
  onDelete: () => void;
  onUpdate: (id: number, data: LitterboxUseEventData, human_verified: boolean, pet_id?: number | null) => Promise<void>;
  isDeleting: boolean;
  hasVideo?: boolean;
}

function formatEliminationType(type: string): { icon: React.JSX.Element; label: string } {
  switch (type) {
    case 'urination':
      return { icon: <FaTint title="Urination" color={"#FFD700"} />, label: 'Urination' };
    case 'defecation':
      return { icon: <FaPoop title="Defecation" color={"#8B4513"} />, label: 'Defecation' };
    case 'both':
      return { icon: <FaGift title="Both urination and defecation" color={"#32CD32"} />, label: 'Both' };
    case 'no_elimination':
      return { icon: <FaBan title="No elimination" color={"#808080"} />, label: 'No elimination' };
    case 'unknown':
      return { icon: <FaQuestion title="Unknown" />, label: 'Unknown' };
    default:
      return { icon: <FaQuestion title={type} />, label: type };
  }
}

const eliminationTypeOptions = [
  { value: "urination", label: "Urination" },
  { value: "defecation", label: "Defecation" },
  { value: "both", label: "Both" },
  { value: "no_elimination", label: "No elimination" },
  { value: "unknown", label: "Unknown" }
];

export default function LitterboxUseEvent({ 
  id, 
  pet_id, 
  timestamp, 
  data, 
  raw_data, 
  human_verified, 
  pets, 
  onDelete, 
  onUpdate, 
  isDeleting, 
  hasVideo = false 
}: LitterboxUseEventProps) {
  const { timestamps, weights, context } = parseRawBuffer(raw_data);
  const [showChart, setShowChart] = React.useState(false);
  const [showVideo, setShowVideo] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleEliminationTypeChange = async (newType: string) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const updatedData = { ...data, elimination_type: newType as typeof data.elimination_type };
      await onUpdate(id, updatedData, true, pet_id);
    } catch (error) {
      console.error('Failed to update event:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePetAssignmentChange = async (newPetId: number | null) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      await onUpdate(id, data, true, newPetId);
    } catch (error) {
      console.error('Failed to update pet assignment:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const elim = formatEliminationType(data.elimination_type);

  const chartAction = (
    <EventChartButton
      data={{ timestamps, weights }}
      isExpanded={showChart}
      onToggle={() => setShowChart(prev => !prev)}
      borderColor="rgb(75, 192, 192)"
      backgroundColor="rgba(75, 192, 192, 0.2)"
    />
  );

  const videoAction = (
    <EventVideoButton
      timestamp={timestamp}
      isExpanded={showVideo}
      onToggle={() => setShowVideo(prev => !prev)}
      hasVideo={hasVideo}
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
      <EventStats
        chartAction={chartAction}
        videoAction={videoAction}
        humanVerified={human_verified}
      >
        <EventDataItem icon={elim.icon}>
          <EventSelect
            value={data.elimination_type}
            options={eliminationTypeOptions}
            onChange={handleEliminationTypeChange}
            disabled={isUpdating}
          />
        </EventDataItem>

        <EventDataItem>
          Cat:
          <EventPetSelect
            value={pet_id}
            pets={pets}
            onChange={handlePetAssignmentChange}
            disabled={isUpdating}
          />
        </EventDataItem>

        <EventDataItem icon={<FaClock />}>
          {formatDuration(data.duration)}
        </EventDataItem>

        <EventDataItem icon={<FaGift />}>
          {data.elimination_weight.toFixed(0)}g
        </EventDataItem>
      </EventStats>

      {showChart && (
        <EventExpandedSection>
          <EventContextData context={context} />
          <EventExpandedChart
            data={{ timestamps, weights }}
            borderColor="rgb(75, 192, 192)"
            backgroundColor="rgba(75, 192, 192, 0.2)"
          />
        </EventExpandedSection>
      )}

      {showVideo && (
        <EventExpandedSection>
          <EventVideoPlayer timestamp={timestamp} />
        </EventExpandedSection>
      )}
    </BaseEvent>
  );
}
