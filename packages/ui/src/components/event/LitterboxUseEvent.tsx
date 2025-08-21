
import * as React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { FaTint, FaPoop, FaBan, FaQuestion, FaClock, FaCalendarAlt, FaGift, FaCheck, FaCamera } from 'react-icons/fa';

import { cn } from "@/lib/utils";
import { getEventVideoUrl, isRecordingAvailable } from "@/api/recordings";
import "./LitterboxUseEvent.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LitterboxUseEventData {
  type: "litterbox_use";
  elimination_type: "urination" | "defecation" | "no_elimination" | "unknown";
  elimination_weight: number;
  duration: number;
}

interface Pet {
  id: number;
  name: string;
  breed: string;
  birth_date: string;
}

interface LitterboxEventItemProps {
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

interface ContextData {
  wasteWeight: number | null;
  litterRemaining: number | null;
  deepCleanTimer: number | null;
  totalVisits: number | null;
  daysSinceLitterReplaced: number | null;
  hoursSinceLastScoop: number | null;
}

function parseRawBuffer(bufferData: number[]): { 
  timestamps: number[]; 
  weights: number[];
  context: ContextData;
} {
  if (!bufferData || bufferData.length < 23) {
    return { timestamps: [], weights: [], context: {} as ContextData };
  }
  
  try {
    const uint8Array = new Uint8Array(bufferData);
    const dataView = new DataView(uint8Array.buffer);
    
    let offset = 0;
    
    // Skip version (1 byte)
    offset += 1;
    
    // Skip startTimestamp (8 bytes)
    offset += 8;
    
    // Read context data (10 bytes)
    const context: ContextData = {
      wasteWeight: null,
      litterRemaining: null,
      deepCleanTimer: null,
      totalVisits: null,
      daysSinceLitterReplaced: null,
      hoursSinceLastScoop: null,
    };
    
    const wasteWeight = dataView.getUint16(offset, false);
    context.wasteWeight = wasteWeight === 65535 ? null : wasteWeight;
    offset += 2;
    
    const litterRemaining = dataView.getUint16(offset, false);
    context.litterRemaining = litterRemaining === 65535 ? null : litterRemaining;
    offset += 2;
    
    const deepCleanTimer = dataView.getUint8(offset);
    context.deepCleanTimer = deepCleanTimer === 255 ? null : deepCleanTimer;
    offset += 1;
    
    const totalVisits = dataView.getUint8(offset);
    context.totalVisits = totalVisits === 255 ? null : totalVisits;
    offset += 1;
    
    const daysSinceLitterReplaced = dataView.getUint8(offset);
    context.daysSinceLitterReplaced = daysSinceLitterReplaced === 255 ? null : daysSinceLitterReplaced;
    offset += 1;
    
    const hoursSinceLastScoop = dataView.getUint8(offset);
    context.hoursSinceLastScoop = hoursSinceLastScoop === 255 ? null : hoursSinceLastScoop;
    offset += 1;
    
    // Skip reserved bytes (2 bytes)
    offset += 2;

    
    // Read weight count
    const count = dataView.getUint32(offset, false);
    offset += 4;
    
    const timestamps: number[] = [];
    const weights: number[] = [];
    
    // Read our calculated tared weights
    for (let i = 0; i < count && (offset + i * 2) < uint8Array.length; i++) {
      const weight = dataView.getInt16(offset + i * 2, false); // Our calculated tared weights
      
      timestamps.push(i * 100); // 100ms intervals (10Hz)
      weights.push(weight);
    }
    offset += count * 2;
    
    return { timestamps, weights, context };
  } catch (error) {
    console.error('Failed to parse buffer data:', error);
    return { timestamps: [], weights: [], context: {} as ContextData };
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatEliminationType(type: string): { icon: React.JSX.Element; label: string } {
  switch (type) {
    case 'urination':
      return { icon: <FaTint title="Urination" color={"#FFD700"} />, label: 'Urination' };
    case 'defecation':
      return { icon: <FaPoop title="Defecation" color={"#8B4513"} />, label: 'Defecation' };
    case 'no_elimination':
      return { icon: <FaBan title="No elimination" color={"#808080"} />, label: 'No elimination' };
    case 'unknown':
      return { icon: <FaQuestion title="Unknown" />, label: 'Unknown' };
    default:
      return { icon: <FaQuestion title={type} />, label: type };
  }
}

export default function LitterboxEventItem({ id, pet_id, timestamp, data, raw_data, human_verified, pets, onDelete, onUpdate, isDeleting, hasVideo = false }: LitterboxEventItemProps) {
  const { timestamps, weights, context } = parseRawBuffer(raw_data || []);
  const [showChart, setShowChart] = React.useState(false);
  const [showVideo, setShowVideo] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);
  
  // Check if video is available for this event
  const videoAvailable = hasVideo || isRecordingAvailable(timestamp);

  const chartData = {
    labels: timestamps.map(t => (t / 1000).toFixed(1)),
    datasets: [
      {
        label: 'Weight (grams)',
        data: weights,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    events: [], // disables all interactivity
    scales: {
      x: { display: false },
      y: { display: false },
    },
    animation: { duration: 0 },
  };

  const expandedChartOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: false }, // No legend needed for single dataset
      tooltip: {
        enabled: true,
        callbacks: {
          title: (context: TooltipItem<'line'>[]) => `Time: ${context[0].label}s`,
          label: (context: TooltipItem<'line'>) => `Weight: ${context.parsed.y?.toFixed(1)}g`,
        },
      },
    },
    events: undefined, // allow interactivity for expanded chart
    animation: { duration: 0 },
    scales: {
      x: {
        display: true,
        title: { display: true, text: 'Time (seconds)' },
        grid: { display: false },
      },
      y: {
        display: true,
        title: { display: true, text: 'Weight (grams)' },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
    },
  };

  const handleEliminationTypeChange = async (newType: "urination" | "defecation" | "no_elimination" | "unknown") => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const updatedData = { ...data, elimination_type: newType };
      await onUpdate(id, updatedData, true, pet_id); // Mark as human verified when manually changed
    } catch (error) {
      console.error('Failed to update event:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePetAssignmentChange = async (newPetId: string) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      let petId: number | null = null;
      if (newPetId && newPetId !== '') {
        const parsed = parseInt(newPetId, 10);
        petId = isNaN(parsed) ? null : parsed;
      }
      await onUpdate(id, data, true, petId); // Mark as human verified when manually changed
    } catch (error) {
      console.error('Failed to update pet assignment:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const elim = formatEliminationType(data.elimination_type);
  return (
    <li className="litterbox-event-item">
      <div className="event-header">
        <div className="event-timestamp">
          <FaCalendarAlt />
          <b>{new Date(timestamp).toLocaleString()}</b>
        </div>
        <button
          className={cn("event-delete-btn", { disabled: isDeleting })}
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete event"
        >
          {isDeleting ? '...' : '×'}
        </button>
      </div>

      <div className="litterbox-event-details">
        <div className="event-stats">
          <div className="event-stats-main">
            <div className="event-stat-item">
              {elim.icon}
              <select 
                value={data.elimination_type}
                onChange={(e) => handleEliminationTypeChange(e.target.value as "urination" | "defecation" | "no_elimination" | "unknown")}
                disabled={isUpdating}
                className="event-elimination-select"
              >
                <option value="urination">Urination</option>
                <option value="defecation">Defecation</option>
                <option value="no_elimination">No elimination</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="event-stat-item">
              <span>Cat:</span>
              <select 
                value={pet_id || ''}
                onChange={(e) => handlePetAssignmentChange(e.target.value)}
                disabled={isUpdating}
                className={cn("event-pet-select", pet_id ? "assigned" : "unknown")}
              >
                <option value="">Unknown</option>
                {pets.map(pet => (
                  <option key={pet.id} value={pet.id}>{pet.name}</option>
                ))}
              </select>
            </div>
            <span className="event-stat-item"><FaClock /> {formatDuration(data.duration)}</span>
            <span className="event-stat-item"><FaGift /> {data.elimination_weight.toFixed(0)}g</span>
            {videoAvailable && (
              <button
                className="video-toggle-button"
                onClick={() => setShowVideo(prev => !prev)}
                title={showVideo ? 'Hide video' : 'Show video'}
              >
                <FaCamera />
              </button>
            )}
            {human_verified && (
              <FaCheck title="Human verified" className="verification-icon" />
            )}
          </div>
          {weights.length > 0 && (
            <button
              className="weight-chart-button"
              onClick={() => setShowChart((prev: boolean) => !prev)}
              title={showChart ? 'Hide chart' : 'Expand chart'}
            >
              <Line data={chartData} options={chartOptions} height={28} width={80} />
            </button>
          )}
        </div>
        {(weights.length > 0 && showChart) && (
          <div className="expanded-chart-container">
            {/* Context data display */}
            {(context.wasteWeight !== null || context.litterRemaining !== null || 
              context.daysSinceLitterReplaced !== null || context.hoursSinceLastScoop !== null) && (
              <div className="context-data">
                <div className="context-data-grid">
                  {context.wasteWeight !== null && (
                    <div className="context-data-item">Existing waste: <strong>{context.wasteWeight}</strong>g</div>
                  )}
                  {context.litterRemaining !== null && (
                    <div className="context-data-item">Litter: <strong>{(context.litterRemaining / 1000).toFixed(1)}</strong>kg</div>
                  )}
                  {context.daysSinceLitterReplaced !== null && (
                    <div className="context-data-item">Litter age: <strong>{context.daysSinceLitterReplaced}</strong>d</div>
                  )}
                  {context.hoursSinceLastScoop !== null && (
                    <div className="context-data-item">Last scoop: <strong>{context.hoursSinceLastScoop}</strong>h</div>
                  )}
                  {context.totalVisits !== null && (
                    <div className="context-data-item">Visits since scoop: <strong>{context.totalVisits}</strong></div>
                  )}
                </div>
              </div>
            )}
            {/* Weight chart */}
            <div className="weight-chart-expanded">
              <Line data={chartData} options={expandedChartOptions} />
            </div>
          </div>
        )}
        {videoAvailable && showVideo && (
          <div className="video-container">
            <video 
              controls 
              preload="metadata"
              className="event-video"
              onError={() => {
                console.warn('Video failed to load for timestamp:', timestamp);
                // Could show a "Video not available" message here
              }}
            >
              <source src={getEventVideoUrl(timestamp)} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
      </div>
    </li>
  );
}