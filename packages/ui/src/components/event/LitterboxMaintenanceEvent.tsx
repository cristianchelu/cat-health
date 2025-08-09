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
import { useState, type JSX } from 'react';
import type { TooltipItem } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { FaBroom, FaTrash, FaPlusCircle, FaExchangeAlt, FaCalendarAlt, FaCheck, FaClock, FaWeight } from 'react-icons/fa';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LitterboxMaintenanceEventData {
  type: "litterbox_maintenance";
  maintenance_type: "scoop" | "deep_clean" | "litter_change" | "litter_addition";
  litter_amount?: number;
}

interface LitterboxMaintenanceEventItemProps {
  id: number;
  pet_id: number | null;
  timestamp: string;
  data: LitterboxMaintenanceEventData;
  raw_data: number[] | null;
  human_verified: boolean;
  onDelete: () => void;
  onUpdate: (id: number, data: LitterboxMaintenanceEventData, human_verified: boolean) => Promise<void>;
  isDeleting: boolean;
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
      const weight = dataView.getInt16(offset + i * 2, false);
      
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

function formatMaintenanceType(type: string): { icon: JSX.Element; label: string; color: string } {
  switch (type) {
    case 'scoop':
      return { 
        icon: <FaBroom title="Scoop" />, 
        label: 'Scoop', 
        color: '#4CAF50' 
      };
    case 'deep_clean':
      return { 
        icon: <FaTrash title="Deep Clean" />, 
        label: 'Deep Clean', 
        color: '#2196F3' 
      };
    case 'litter_change':
      return { 
        icon: <FaExchangeAlt title="Litter Change" />, 
        label: 'Litter Change', 
        color: '#FF9800' 
      };
    case 'litter_addition':
      return { 
        icon: <FaPlusCircle title="Litter Addition" />, 
        label: 'Add Litter', 
        color: '#9C27B0' 
      };
    default:
      return { 
        icon: <FaBroom title={type} />, 
        label: type, 
        color: '#757575' 
      };
  }
}

export default function LitterboxMaintenanceEventItem({ 
  id, 
  timestamp, 
  data, 
  raw_data,
  human_verified, 
  onDelete, 
  onUpdate, 
  isDeleting 
}: LitterboxMaintenanceEventItemProps) {
  const { context, timestamps, weights } = parseRawBuffer(raw_data || []);
  const [showChart, setShowChart] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Create chart data using actual weight measurements (like LitterboxUseEvent)
  const chartData = {
    labels: timestamps.map(t => (t / 1000).toFixed(1)),
    datasets: [
      {
        label: 'Weight (grams)',
        data: weights,
        borderColor: 'rgb(153, 102, 255)',
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const sparklineOptions = {
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
    ...sparklineOptions,
    plugins: {
      ...sparklineOptions.plugins,
      tooltip: {
        enabled: true,
        callbacks: {
          title: (context: TooltipItem<'line'>[]) => `Time: ${context[0].label}s`,
          label: (context: TooltipItem<'line'>) => `Weight: ${context.parsed.y?.toFixed(1)}g`,
        },
      },
    },
    events: undefined, // allow interactivity for expanded chart
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

  const handleMaintenanceTypeChange = async (newType: "scoop" | "deep_clean" | "litter_change" | "litter_addition") => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const updatedData = { ...data, maintenance_type: newType };
      await onUpdate(id, updatedData, true);
    } catch (error) {
      console.error('Failed to update maintenance event:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const maintenance = formatMaintenanceType(data.maintenance_type);
  return (
    <li className="maintenance-event-item" style={{ 
      borderBottom: '1px solid #eee', 
      padding: '0.5em 0',
    }}>
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

      <div className="maintenance-event-details" style={{ marginTop: 6 }}>
        <div className="event-stats" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 18, 
          fontSize: 15, 
          color: '#444',
          flexWrap: 'wrap',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: maintenance.color }}>{maintenance.icon}</span>
            <select 
              value={data.maintenance_type}
              onChange={(e) => handleMaintenanceTypeChange(e.target.value as "scoop" | "deep_clean" | "litter_change" | "litter_addition")}
              disabled={isUpdating}
              style={{ 
                border: 'none',
                background: 'none',
                fontSize: '15px',
                cursor: isUpdating ? 'wait' : 'pointer'
              }}
            >
              <option value="scoop">Scoop</option>
              <option value="deep_clean">Deep Clean</option>
              <option value="litter_change">Litter Change</option>
              <option value="litter_addition">Add Litter</option>
            </select>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FaWeight /> {data.litter_amount?.toFixed(1)}g</span>
            {human_verified && (
              <FaCheck title="Human verified" style={{ color: '#4CAF50', fontSize: '12px' }} />
            )}
          </div>
          {/* Weight sparkline chart */}
          {weights.length > 0 && (
            <button
              className="context-chart"
              style={{ display: 'flex', alignItems: 'center', height: 28, width: 80, minWidth: 60, marginLeft: 8, justifySelf: 'flex-end', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              onClick={() => setShowChart(s => !s)}
              title={showChart ? 'Hide weight chart' : 'Expand weight chart'}
            >
              <Line data={chartData} options={sparklineOptions} height={28} width={80} />
            </button>
          )}
        </div>
        {weights.length > 0 && showChart && (
          <div style={{ marginTop: 8 }}>
            {/* Context data display */}
            {(context.wasteWeight !== null || context.litterRemaining !== null || 
              context.daysSinceLitterReplaced !== null || context.hoursSinceLastScoop !== null) && (
              <div style={{ 
                padding: '12px 0',
                borderRadius: '4px', 
                marginBottom: '8px',
                fontSize: '14px',
                color: '#555'
              }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '4px' }}>
                  {context.wasteWeight !== null && (
                    <div>Existing waste: <strong>{context.wasteWeight}</strong>g</div>
                  )}
                  {context.litterRemaining !== null && (
                    <div>Litter: <strong>{(context.litterRemaining / 1000).toFixed(1)}</strong>kg</div>
                  )}
                  {context.daysSinceLitterReplaced !== null && (
                    <div>Litter age: <strong>{context.daysSinceLitterReplaced}</strong>d</div>
                  )}
                  {context.hoursSinceLastScoop !== null && (
                    <div>Last scoop: <strong>{context.hoursSinceLastScoop}</strong>h</div>
                  )}
                  {context.totalVisits !== null && (
                    <div>Visits since scoop: <strong>{context.totalVisits}</strong></div>
                  )}
                  {context.deepCleanTimer !== null && (
                    <div>Days since deep clean: <strong>{context.deepCleanTimer}</strong>d</div>
                  )}
                </div>
              </div>
            )}
            {/* Weight chart */}
            <div style={{ height: 200 }}>
              <Line data={chartData} options={expandedChartOptions} />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
