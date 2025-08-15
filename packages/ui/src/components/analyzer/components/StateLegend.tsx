import * as React from "react";

interface StateLegendProps {
  className?: string;
}

const StateLegend = React.forwardRef<HTMLDivElement, StateLegendProps>(
  ({ className }, ref) => {
    return (
      <div 
        className={`state-legend compact${className ? ` ${className}` : ''}`}
        ref={ref}
      >
        <h4>State Machine States</h4>
        <div className="phase-markers-grid" style={{ marginBottom: 0 }}>
          <span className="phase-marker state-empty">EMPTY</span>
          <span className="phase-marker state-entering">ENTERING</span>
          <span className="phase-marker state-occupied">OCCUPIED</span>
          <span className="phase-marker state-hesitating">HESITATING</span>
          <span className="phase-marker state-short-exit">SHORT EXIT</span>
          <span className="phase-marker state-exiting">EXITING</span>
          <span className="phase-marker state-ended">ENDED</span>
        </div>
      </div>
    );
  }
);

StateLegend.displayName = "StateLegend";

export { type StateLegendProps };
export default StateLegend;
