import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { StatePeriod } from './litterboxStateTracker';
import type { LitterboxBoutAnnotation } from '@/types/litterbox';

import './WeightSignalChart.css';

export interface WeightSignalChartMediaSync {
  /** Position along the chart timeline in seconds; null hides the playhead. */
  playheadChartSec: number | null;
  onAxisSeek: (chartSec: number) => void;
}

interface WeightSignalChartProps extends React.ComponentProps<'div'> {
  weights: number[];
  periods: StatePeriod[];
  sampleRate?: number;
  // Interactive bout annotation props (optional - presence enables interactive mode)
  bouts?: LitterboxBoutAnnotation[];
  onBoutsChange?: (bouts: LitterboxBoutAnnotation[]) => void;
  selectedBoutIndex?: number | null;
  onSelectBout?: (index: number | null) => void;
  /** Video sync: playhead and scrub only on the bottom time-axis strip (annotation workspace). */
  mediaSync?: WeightSignalChartMediaSync;
}

const STATE_COLORS: Record<string, string> = {
  entering: 'var(--color-state-entering)',
  occupied: 'var(--color-state-occupied)',
  eliminating: 'var(--color-state-eliminating)',
  gap: 'var(--color-state-gap)',
};

const BOUT_FILL_COLORS: Record<LitterboxBoutAnnotation['bout_type'], string> = {
  urination: 'rgba(99, 102, 241, 0.28)',
  defecation: 'rgba(180, 120, 20, 0.28)',
  unknown: 'rgba(156, 163, 175, 0.3)',
};

const BOUT_STROKE_COLORS: Record<LitterboxBoutAnnotation['bout_type'], string> = {
  urination: 'rgba(99, 102, 241, 0.9)',
  defecation: 'rgba(180, 120, 20, 0.9)',
  unknown: 'rgba(100, 110, 130, 0.8)',
};

// LTTB (Largest Triangle Three Buckets) downsampling
function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  sampled.push(data[0]);

  for (let i = 0; i < maxPoints - 2; i++) {
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;

    let nextAvg = 0;
    const nextBucketLen = Math.min(nextBucketEnd, data.length) - nextBucketStart;
    for (let j = nextBucketStart; j < Math.min(nextBucketEnd, data.length); j++) {
      nextAvg += data[j];
    }
    nextAvg /= nextBucketLen || 1;

    const prevX = sampled.length - 1;
    const prevY = sampled[sampled.length - 1];
    const nextX = i + 2;
    const nextY = nextAvg;

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const area = Math.abs(
        (prevX - nextX) * (data[j] - prevY) -
        (prevX - (j - bucketStart + i + 1)) * (nextY - prevY),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

function createPath(
  weights: number[],
  width: number,
  height: number,
  minWeight: number,
  maxWeight: number,
): string {
  if (weights.length === 0) return '';
  const range = maxWeight - minWeight || 1;
  const xStep = width / (weights.length - 1 || 1);
  let path = '';
  for (let i = 0; i < weights.length; i++) {
    const x = i * xStep;
    const y = height - ((weights[i] - minWeight) / range) * height;
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return path;
}

// Clamp a value between min and max
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Must match `buffer` in `LitterboxStateTracker.processEvent`. */
const PERIOD_STATS_BUFFER = 10;

function trimmedSliceMeanSigma(
  weights: number[],
  startSample: number,
  endSample: number,
): { mean: number; sigma: number } | null {
  const lo = startSample + PERIOD_STATS_BUFFER;
  const hiExclusive = endSample + 1 - PERIOD_STATS_BUFFER;
  if (hiExclusive - lo < 2) return null;
  const slice = weights.slice(lo, hiExclusive);
  if (slice.length < 2) return null;
  const mean = slice.reduce((s, w) => s + w, 0) / slice.length;
  const v = slice.reduce((s, w) => s + (w - mean) ** 2, 0) / slice.length;
  return { mean, sigma: Math.sqrt(v) };
}

function boutTimeToSampleRange(
  tStartS: number,
  tEndS: number,
  sampleRate: number,
  weightCount: number,
): { start: number; end: number } {
  const last = Math.max(0, weightCount - 1);
  const a = clamp(Math.floor(tStartS * sampleRate), 0, last);
  const b = clamp(Math.ceil(tEndS * sampleRate), 0, last);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function formatSigmaG(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatMeanG(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

type DragMode =
  | { type: 'none' }
  | { type: 'create'; startX: number; currentX: number }
  | { type: 'resize'; boutIndex: number; handle: 'left' | 'right'; currentX: number }
  | { type: 'select'; boutIndex: number };

const SVG_WIDTH = 400;
const SVG_HEIGHT = 150;
const AXIS_HEIGHT = 18;
const HANDLE_W = 8;

const WeightSignalChart = React.forwardRef<HTMLDivElement, WeightSignalChartProps>(
  (
    {
      className,
      weights,
      periods,
      sampleRate = 10,
      bouts,
      onBoutsChange,
      selectedBoutIndex,
      onSelectBout,
      mediaSync,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const isInteractive = !!onBoutsChange;

    const maxPoints = 800;
    const displayWeights = React.useMemo(() => downsample(weights, maxPoints), [weights]);
    const scaleFactor = weights.length / displayWeights.length;

    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const range = maxWeight - minWeight || 1;
    const padding = range * 0.1;
    const paddedMin = minWeight - padding;
    const paddedMax = maxWeight + padding;

    const chartHeight = isInteractive ? SVG_HEIGHT : SVG_HEIGHT;
    const svgHeight = isInteractive ? SVG_HEIGHT + AXIS_HEIGHT : SVG_HEIGHT;

    const linePath = createPath(displayWeights, SVG_WIDTH, chartHeight, paddedMin, paddedMax);

    const scaledPeriods = periods.map((p) => ({
      ...p,
      start: p.start / scaleFactor,
      end: p.end / scaleFactor,
    }));

    const duration = weights.length / sampleRate;

    const lastW = weights.at(-1);
    const lastSampleWeightG =
      lastW !== undefined && Number.isFinite(lastW) ? lastW : undefined;

    // Convert seconds to SVG x coordinate
    const secToX = React.useCallback(
      (s: number) => (s / duration) * SVG_WIDTH,
      [duration],
    );

    // Convert SVG x coordinate to seconds
    const xToSec = React.useCallback(
      (x: number) => clamp((x / SVG_WIDTH) * duration, 0, duration),
      [duration],
    );

    // Drag state (only in interactive mode)
    const [drag, setDrag] = React.useState<DragMode>({ type: 'none' });
    const svgRef = React.useRef<SVGSVGElement>(null);

    // Get SVG-space x from a pointer event
    const getSvgX = React.useCallback((e: React.PointerEvent<SVGSVGElement>): number => {
      if (!svgRef.current) return 0;
      const rect = svgRef.current.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
      return clamp(rawX, 0, SVG_WIDTH);
    }, []);

    const getSvgXFromPointerLike = React.useCallback((e: { clientX: number; clientY: number }): number => {
      if (!svgRef.current) return 0;
      const rect = svgRef.current.getBoundingClientRect();
      const rawX = ((e.clientX - rect.left) / rect.width) * SVG_WIDTH;
      return clamp(rawX, 0, SVG_WIDTH);
    }, []);

    const axisDragRef = React.useRef(false);

    const handleAxisPointerDown = React.useCallback(
      (e: React.PointerEvent<SVGRectElement>) => {
        if (!mediaSync || !isInteractive || duration <= 0) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        axisDragRef.current = true;
        const x = getSvgXFromPointerLike(e);
        mediaSync.onAxisSeek(xToSec(x));
      },
      [duration, getSvgXFromPointerLike, isInteractive, mediaSync, xToSec],
    );

    const handleAxisPointerMove = React.useCallback(
      (e: React.PointerEvent<SVGRectElement>) => {
        if (!axisDragRef.current || !mediaSync || duration <= 0) return;
        const x = getSvgXFromPointerLike(e);
        mediaSync.onAxisSeek(xToSec(x));
      },
      [duration, getSvgXFromPointerLike, mediaSync, xToSec],
    );

    const handleAxisPointerUp = React.useCallback((e: React.PointerEvent<SVGRectElement>) => {
      if (!axisDragRef.current) return;
      axisDragRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }, []);

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const x = getSvgX(e);
        // Start a create drag from this point
        setDrag({ type: 'create', startX: x, currentX: x });
      },
      [isInteractive, getSvgX, setDrag],
    );

    const handlePointerMove = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive || drag.type === 'none') return;
        const x = getSvgX(e);
        if (drag.type === 'create') {
          setDrag((d) => d.type === 'create' ? { ...d, currentX: x } : d);
        } else if (drag.type === 'resize') {
          setDrag((d) => d.type === 'resize' ? { ...d, currentX: x } : d);
        }
      },
      [isInteractive, drag.type, getSvgX, setDrag],
    );

    const handlePointerUp = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive || !bouts) return;
        e.currentTarget.releasePointerCapture(e.pointerId);

        if (drag.type === 'create') {
          const x1 = Math.min(drag.startX, drag.currentX);
          const x2 = Math.max(drag.startX, drag.currentX);
          // Only create if drag is at least a few pixels wide
          if (x2 - x1 > 4) {
            const t_start_s = xToSec(x1);
            const t_end_s = xToSec(x2);
            const newBout: LitterboxBoutAnnotation = {
              bout_index: bouts.length,
              t_start_s,
              t_end_s,
              bout_type: 'unknown',
            };
            const next = [...bouts, newBout].map((b, i) => ({ ...b, bout_index: i }));
            onBoutsChange?.(next);
            onSelectBout?.(next.length - 1);
          }
        } else if (drag.type === 'resize') {
          const newSec = xToSec(drag.currentX);
          const next = bouts.map((b, i) => {
            if (i !== drag.boutIndex) return b;
            if (drag.handle === 'left') {
              const t_start_s = clamp(newSec, 0, b.t_end_s - 0.1);
              return { ...b, t_start_s };
            } else {
              const t_end_s = clamp(newSec, b.t_start_s + 0.1, duration);
              return { ...b, t_end_s };
            }
          });
          onBoutsChange?.(next);
        }

        setDrag({ type: 'none' });
      },
      [isInteractive, bouts, drag, xToSec, duration, onBoutsChange, onSelectBout, setDrag],
    );

    // Time axis ticks (only in interactive mode)
    const axisTicks = React.useMemo(() => {
      if (!isInteractive || duration === 0) return [];
      const targetTicks = 6;
      const rawStep = duration / targetTicks;
      const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300];
      const step = steps.find((s) => s >= rawStep) ?? steps[steps.length - 1];
      const ticks: number[] = [];
      for (let s = 0; s <= duration; s += step) {
        ticks.push(s);
      }
      return ticks;
    }, [isInteractive, duration]);

    const chartStatY = chartHeight - 3;
    /** Elimination bout labels: μ above σ at the bottom band */
    const boutMeanStatY = chartHeight - 14;

    const occupiedMeanOverlays = React.useMemo(() => {
      if (!isInteractive || weights.length === 0) return [];
      const wlen = weights.length;
      const items: { key: string; cx: number; label: string }[] = [];
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        if (p.state !== 'occupied' || p.meanWeight === undefined) continue;
        const cx = ((p.start + p.end) / 2 / wlen) * SVG_WIDTH;
        items.push({
          key: `occ-${i}-${p.start}-${p.end}`,
          cx,
          label: t('annotation.chart_occ_mean', { value: formatMeanG(p.meanWeight) }),
        });
      }
      return items;
    }, [isInteractive, periods, weights.length, t]);

    const boutStatOverlays = React.useMemo(() => {
      if (!isInteractive || !bouts?.length || weights.length === 0) return [];
      return bouts.map((bout, idx) => {
        const { start, end } = boutTimeToSampleRange(
          bout.t_start_s,
          bout.t_end_s,
          sampleRate,
          weights.length,
        );
        const stats = trimmedSliceMeanSigma(weights, start, end);
        if (stats === null) return null;
        const x1 = secToX(bout.t_start_s);
        const x2 = secToX(bout.t_end_s);
        const cx = (x1 + x2) / 2;
        return {
          key: `bout-${idx}`,
          cx,
          meanLabel: t('annotation.chart_occ_mean', { value: formatMeanG(stats.mean) }),
          sigmaLabel: t('annotation.chart_bout_sigma', { value: formatSigmaG(stats.sigma) }),
          isSelected: selectedBoutIndex === idx,
        };
      });
    }, [isInteractive, bouts, weights, sampleRate, secToX, selectedBoutIndex, t]);

    return (
      <div className={cn('weight-signal-chart', isInteractive && 'interactive', className)} ref={ref} {...props}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
          preserveAspectRatio="xMidYMid meet"
          style={isInteractive ? { cursor: 'crosshair' } : undefined}
          onPointerDown={isInteractive ? handlePointerDown : undefined}
          onPointerMove={isInteractive ? handlePointerMove : undefined}
          onPointerUp={isInteractive ? handlePointerUp : undefined}
        >
          {/* Analyzer period backgrounds (read-only reference) */}
          {scaledPeriods.map((period, i) => {
            const x = (period.start / displayWeights.length) * SVG_WIDTH;
            const periodWidth = ((period.end - period.start) / displayWeights.length) * SVG_WIDTH;
            const color = STATE_COLORS[period.state] || 'transparent';
            return (
              <rect
                key={i}
                x={x}
                y={0}
                width={Math.max(periodWidth, 1)}
                height={chartHeight}
                fill={color}
              />
            );
          })}

          {/* Weight signal line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-signal-line)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Human bout overlays */}
          {isInteractive && bouts?.map((bout, idx) => {
            const x1 = secToX(bout.t_start_s);
            const x2 = secToX(bout.t_end_s);
            const w = Math.max(x2 - x1, 2);
            const isSelected = selectedBoutIndex === idx;
            const fill = BOUT_FILL_COLORS[bout.bout_type];
            const stroke = BOUT_STROKE_COLORS[bout.bout_type];

            return (
              <g
                key={idx}
                onClick={(e) => { e.stopPropagation(); onSelectBout?.(isSelected ? null : idx); }}
                style={{ cursor: 'pointer' }}
              >
                {/* Bout body */}
                <rect
                  x={x1}
                  y={0}
                  width={w}
                  height={chartHeight}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={isSelected ? undefined : '4 3'}
                  vectorEffect="non-scaling-stroke"
                />

                {/* Left resize handle */}
                <rect
                  x={x1 - HANDLE_W / 2}
                  y={chartHeight * 0.25}
                  width={HANDLE_W}
                  height={chartHeight * 0.5}
                  fill={stroke}
                  rx={2}
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!svgRef.current) return;
                    (svgRef.current as SVGSVGElement).setPointerCapture(e.pointerId);
                    setDrag({ type: 'resize', boutIndex: idx, handle: 'left', currentX: getSvgX(e as unknown as React.PointerEvent<SVGSVGElement>) });
                  }}
                  vectorEffect="non-scaling-stroke"
                />

                {/* Right resize handle */}
                <rect
                  x={x2 - HANDLE_W / 2}
                  y={chartHeight * 0.25}
                  width={HANDLE_W}
                  height={chartHeight * 0.5}
                  fill={stroke}
                  rx={2}
                  style={{ cursor: 'ew-resize' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!svgRef.current) return;
                    (svgRef.current as SVGSVGElement).setPointerCapture(e.pointerId);
                    setDrag({ type: 'resize', boutIndex: idx, handle: 'right', currentX: getSvgX(e as unknown as React.PointerEvent<SVGSVGElement>) });
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}

          {/* Drag-create preview */}
          {drag.type === 'create' && (() => {
            const x1 = Math.min(drag.startX, drag.currentX);
            const x2 = Math.max(drag.startX, drag.currentX);
            return (
              <rect
                x={x1}
                y={0}
                width={Math.max(x2 - x1, 1)}
                height={chartHeight}
                fill="rgba(156,163,175,0.25)"
                stroke="rgba(156,163,175,0.8)"
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            );
          })()}

          {/* Drag-resize preview line */}
          {drag.type === 'resize' && (
            <line
              x1={drag.currentX}
              y1={0}
              x2={drag.currentX}
              y2={chartHeight}
              stroke="rgba(156,163,175,0.9)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}

          {/* Bottom stat overlays (annotation / interactive only) */}
          {isInteractive && (
            <g className="chart-stat-overlays" pointerEvents="none">
              {occupiedMeanOverlays.map((o) => (
                <text
                  key={o.key}
                  x={o.cx}
                  y={chartStatY}
                  textAnchor="middle"
                  dominantBaseline="auto"
                  fontSize={8}
                  className="chart-stat-overlay chart-stat-overlay--occupied"
                >
                  {o.label}
                </text>
              ))}
              {boutStatOverlays.map((o) =>
                o ? (
                  <text
                    key={o.key}
                    textAnchor="middle"
                    dominantBaseline="auto"
                    fontSize={8}
                    className={cn(
                      'chart-stat-overlay chart-stat-overlay--bout',
                      o.isSelected && 'chart-stat-overlay--selected',
                    )}
                  >
                    <tspan x={o.cx} y={boutMeanStatY}>
                      {o.meanLabel}
                    </tspan>
                    <tspan x={o.cx} y={chartStatY}>
                      {o.sigmaLabel}
                    </tspan>
                  </text>
                ) : null,
              )}
            </g>
          )}

          {/* Time axis (interactive mode only) */}
          {isInteractive && (
            <g className="chart-time-axis">
              <line
                x1={0}
                y1={chartHeight}
                x2={SVG_WIDTH}
                y2={chartHeight}
                stroke="var(--color-border)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {axisTicks.map((s) => {
                const x = secToX(s);
                return (
                  <g key={s}>
                    <line
                      x1={x}
                      y1={chartHeight}
                      x2={x}
                      y2={chartHeight + 4}
                      stroke="var(--color-text-muted)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={x}
                      y={chartHeight + AXIS_HEIGHT - 3}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--color-text-muted)"
                      style={{ userSelect: 'none' }}
                    >
                      {s}s
                    </text>
                  </g>
                );
              })}
              {mediaSync && isInteractive && duration > 0 && (
                <rect
                  className="chart-axis-scrub-hit"
                  x={0}
                  y={chartHeight}
                  width={SVG_WIDTH}
                  height={AXIS_HEIGHT}
                  fill="transparent"
                  cursor="ew-resize"
                  aria-label={t('annotation.chart_axis_scrub')}
                  onPointerDown={handleAxisPointerDown}
                  onPointerMove={handleAxisPointerMove}
                  onPointerUp={handleAxisPointerUp}
                  onPointerCancel={handleAxisPointerUp}
                />
              )}
              {mediaSync &&
                mediaSync.playheadChartSec != null &&
                Number.isFinite(mediaSync.playheadChartSec) &&
                duration > 0 && (
                  <line
                    className="chart-axis-playhead"
                    x1={secToX(clamp(mediaSync.playheadChartSec, 0, duration))}
                    y1={chartHeight}
                    x2={secToX(clamp(mediaSync.playheadChartSec, 0, duration))}
                    y2={svgHeight}
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
            </g>
          )}
        </svg>

        {/* Legend */}
        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-color entering" />
            <span>{t('event_details.legend_entering')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color occupied" />
            <span>{t('event_details.legend_occupied')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color eliminating" />
            <span>{t('event_details.legend_eliminating')}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color gap" />
            <span>{t('event_details.legend_gap')}</span>
          </div>
          {isInteractive && (
            <>
              <div className="legend-item">
                <span className="legend-swatch chart-stat-legend-swatch--mean" aria-hidden />
                <span>{t('annotation.chart_legend_mean')}</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch chart-stat-legend-swatch--sigma" aria-hidden />
                <span>{t('annotation.chart_legend_sigma_rms')}</span>
              </div>
              <div className="legend-item">
                <span className="legend-color bout-urination" />
                <span>{t('overview.urination')}</span>
              </div>
              <div className="legend-item">
                <span className="legend-color bout-defecation" />
                <span>{t('overview.defecation')}</span>
              </div>
            </>
          )}
        </div>

        {/* Duration + last-sample ending weight (same pill, no extra row) */}
        <div className="chart-duration">
          <span>{duration.toFixed(1)}s</span>
          {lastSampleWeightG !== undefined && (
            <>
              <span className="chart-duration-sep" aria-hidden>
                ·
              </span>
              <span>
                {t('event_details.chart_ending_weight', {
                  value: formatMeanG(lastSampleWeightG),
                })}
              </span>
            </>
          )}
        </div>
      </div>
    );
  },
);

WeightSignalChart.displayName = 'WeightSignalChart';

export { type WeightSignalChartProps };
export default WeightSignalChart;
