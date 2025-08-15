import * as React from "react";
import type { Features } from '../types';

interface PhaseMarkersProps {
  features: Features;
  className?: string;
}

const PhaseMarkers = React.forwardRef<HTMLDivElement, PhaseMarkersProps>(
  ({ features, className }, ref) => {
    const { phases } = features;
    
    return (
      <div 
        className={`phase-markers${className ? ` ${className}` : ''}`}
        ref={ref}
      >
        <h4>Detected Phases - Enhanced Session Analysis:</h4>
        <div className="phase-markers-grid">
          <span className="phase-marker phase-entry">
            Step In: {(phases.stepIn/10).toFixed(1)}s
          </span>
          <span className="phase-marker phase-elimination">
            Pre: {((phases.eliminationStart-phases.stepIn)/10).toFixed(1)}s
          </span>
          <span className="phase-marker phase-elimination">
            Elimination: {((phases.eliminationEnd-phases.eliminationStart)/10).toFixed(1)}s
          </span>
          <span className="phase-marker phase-covering">
            Covering: {((phases.stepOut-phases.eliminationEnd)/10).toFixed(1)}s
          </span>
          <span className="phase-marker phase-exit">
            Step Out: {(phases.stepOut/10).toFixed(1)}s
          </span>
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
