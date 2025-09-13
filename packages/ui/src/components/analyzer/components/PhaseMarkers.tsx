import * as React from "react";
import type { Features } from '../types';

import './PhaseMarkers.css';

interface PhaseMarkersProps {
  features: Features;
  className?: string;
}

const PhaseMarkers = React.forwardRef<HTMLDivElement, PhaseMarkersProps>(
  ({ features, className }, ref) => {
    // const { phases } = features;
    
    return (
      <div 
        className={`phase-markers${className ? ` ${className}` : ''}`}
        ref={ref}
      >
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
