import * as React from "react";
import type { Features } from '../types';

import './PhaseMarkers.css';

interface PhaseMarkersProps {
  features: Features;
  className?: string;
}

const PhaseMarkers = React.forwardRef<HTMLDivElement, PhaseMarkersProps>(
  ({ features, className }, ref) => {
    const { periods } = features;
    
    return (
      <div 
        className={`phase-markers${className ? ` ${className}` : ''}`}
        ref={ref}
      >
        <h4>Detected Phases - Enhanced Session Analysis:</h4>
        <div className="phase-markers-grid">
          {periods.map((period) => (
            <span key={period.start} className={`phase-marker state-${period.state}`}>
              {period.state.charAt(0).toUpperCase() + period.state.slice(1)}: {((period.end - period.start) / 10).toFixed(1)}s ({period.variance !== undefined ? `Var: ${period.variance.toFixed(2)}` : 'Var: N/A'})
            </span>
          ))}
        </div>
        <div className="metrics-row">
          <span className="metric">
            Total: <strong>{features.totalDuration.toFixed(1)}s</strong>
          </span>
          <span className="metric">
            Waste: <strong>{features.wasteWeight.toFixed(1)}g</strong>
          </span>
          <span className="metric">
            Rate: <strong>{features.eliminationRate.toFixed(2)}g/s</strong>
          </span>
          <span className="metric">
            Covering Activity: <strong>{features.coveringFluctuations} peaks</strong>
          </span>
        </div>
      </div>
    );
  }
);

PhaseMarkers.displayName = "PhaseMarkers";

export { type PhaseMarkersProps };
export default PhaseMarkers;
