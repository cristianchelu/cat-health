
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
import { FaTint, FaPoop, FaBan, FaQuestion, FaClock, FaWeight, FaCalendarAlt } from 'react-icons/fa';

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

interface LitterboxEventItemProps {
  timestamp: string;
  data: LitterboxUseEventData;
  raw_data: number[] | null;
  onDelete: () => void;
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

function formatEliminationType(type: string): { icon: JSX.Element; label: string } {
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

export default function LitterboxEventItem({ timestamp, data, raw_data, onDelete, isDeleting }: LitterboxEventItemProps) {
  const { timestamps, weights, context } = parseRawBuffer(raw_data || []);
  const [showChart, setShowChart] = useState(false);

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

  const elim = formatEliminationType(data.elimination_type);
  return (
    <li className="litterbox-event-item" style={{ borderBottom: '1px solid #eee', padding: '0.5em 0' }}>
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

      <div className="litterbox-event-details" style={{ marginTop: 6 }}>
        <div className="event-stats" style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 15, color: '#444', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span title={elim.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{elim.icon} {elim.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FaClock /> {formatDuration(data.duration)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FaWeight /> {data.elimination_weight.toFixed(1)}g</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FaWeight /> {raw_data?.length || 0} samples</span>
          </div>
          {weights.length > 0 && (
            <button
              className="weight-chart"
              style={{ display: 'flex', alignItems: 'center', height: 28, width: 80, minWidth: 60, marginLeft: 8, justifySelf: 'flex-end', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              onClick={() => setShowChart(s => !s)}
              title={showChart ? 'Hide chart' : 'Expand chart'}
            >
              <Line data={chartData} options={chartOptions} height={28} width={80} />
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
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '4px' }}>
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