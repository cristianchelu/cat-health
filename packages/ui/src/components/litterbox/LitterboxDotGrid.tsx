import * as React from 'react';
import { cn } from '@/lib/utils';
import type { LitterboxUseEliminationType } from 'shared';
import './LitterboxDotGrid.css';

export type LitterboxDotType = Exclude<LitterboxUseEliminationType, 'both'>;

export interface LitterboxDotGridDot {
  type: LitterboxDotType;
  straining?: boolean;
  label?: string;
}

export interface LitterboxDotGridColumn {
  key: string;
  label?: string;
  dots: LitterboxDotGridDot[];
  overflowCount?: number;
}

interface LitterboxDotGridProps extends React.ComponentProps<'div'> {
  columns: LitterboxDotGridColumn[];
  maxDots?: number;
  maxHeight?: number | string;
  onColumnClick?: (column: LitterboxDotGridColumn) => void;
}

const DOT_COLORS: Record<LitterboxDotType, string> = {
  urination: 'var(--color-litterbox-urination)',
  defecation: 'var(--color-litterbox-defecation)',
  no_elimination: 'var(--color-text-muted)',
  unknown: 'var(--color-border)',
};

const LitterboxDotGrid = React.forwardRef<HTMLDivElement, LitterboxDotGridProps>(
  (
    {
      className,
      columns,
      maxDots,
      maxHeight,
      onColumnClick,
      style,
      ...props
    },
    ref,
  ) => {
    const rootStyle = {
      ...style,
      ...(maxHeight !== undefined
        ? {
            '--litterbox-dot-grid-max-height':
              typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          }
        : {}),
    } as React.CSSProperties;

    return (
      <div
        className={cn('litterbox-dot-grid', className)}
        ref={ref}
        style={rootStyle}
        {...props}
      >
        {columns.map((column) => {
          const visibleDots =
            maxDots !== undefined ? column.dots.slice(0, maxDots) : column.dots;
          const hiddenCount =
            column.overflowCount ??
            (maxDots !== undefined
              ? Math.max(0, column.dots.length - visibleDots.length)
              : 0);
          const isInteractive = onColumnClick !== undefined;
          const ColumnElement = isInteractive ? 'button' : 'div';

          return (
            <ColumnElement
              key={column.key}
              className="litterbox-dot-grid-column"
              {...(isInteractive ? { type: 'button' as const } : {})}
              aria-label={column.label}
              onClick={() => onColumnClick?.(column)}
            >
              <span className="litterbox-dot-grid-stack" aria-hidden>
                {visibleDots.map((dot, dotIndex) => {
                  const isTopDot = dotIndex === visibleDots.length - 1;
                  return (
                    <span key={dotIndex} className="litterbox-dot-grid-dot-wrap">
                      <span
                        className={cn('litterbox-dot-grid-dot', {
                          'litterbox-dot-grid-dot--straining': dot.straining,
                        })}
                        style={{ backgroundColor: DOT_COLORS[dot.type] }}
                      />
                      {isTopDot && hiddenCount > 0 && (
                        <span className="litterbox-dot-grid-overflow">
                          +{hiddenCount}
                        </span>
                      )}
                    </span>
                  );
                })}
              </span>
            </ColumnElement>
          );
        })}
      </div>
    );
  },
);

LitterboxDotGrid.displayName = 'LitterboxDotGrid';

export { type LitterboxDotGridProps };
export default LitterboxDotGrid;
