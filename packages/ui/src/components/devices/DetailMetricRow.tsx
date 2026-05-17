import * as React from 'react';
import { cn } from '@/lib/utils';

import './DetailMetricRow.css';

export interface DetailMetricRowProps extends React.ComponentProps<'div'> {
  label: string;
  summary: string;
  badge?: string;
  meta?: string;
  rawPayload?: string;
  rawLabel: string;
}

const DetailMetricRow = React.forwardRef<HTMLDivElement, DetailMetricRowProps>(
  (
    {
      className,
      label,
      summary,
      badge,
      meta,
      rawPayload,
      rawLabel,
      ...props
    },
    ref,
  ) => {
    const showRaw =
      rawPayload !== undefined &&
      rawPayload !== '' &&
      rawPayload !== summary;

    const trimmedSummary = summary.trim();
    const isPlaceholderSummary =
      trimmedSummary === '' ||
      trimmedSummary === '—' ||
      trimmedSummary === '–' ||
      trimmedSummary === '-' ||
      trimmedSummary === '…';

    return (
      <div
        ref={ref}
        className={cn('detail-metric-row', className)}
        {...props}
      >
        <div className="detail-metric-row-header">
          <div className="detail-metric-row-main">
            <div className="detail-metric-row-title-line">
              <p className="detail-metric-row-label">{label}</p>
              {badge ? (
                <span className="detail-metric-row-badge">{badge}</span>
              ) : null}
            </div>
            {meta ? <p className="detail-metric-row-meta">{meta}</p> : null}
          </div>
          <div
            className={cn(
              'detail-metric-row-summary',
              isPlaceholderSummary && 'is-placeholder',
            )}
          >
            {summary}
          </div>
        </div>
        {showRaw ? (
          <details className="detail-metric-row-raw">
            <summary>{rawLabel}</summary>
            <pre>{rawPayload}</pre>
          </details>
        ) : null}
      </div>
    );
  },
);

DetailMetricRow.displayName = 'DetailMetricRow';

export { DetailMetricRow };
