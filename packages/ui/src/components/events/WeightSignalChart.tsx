import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  ChartLegend,
  type ChartLegendItem,
} from '@/components/charts/ChartLegend';
import { createPath } from '@/components/charts/path';
import { downsample } from '@/components/charts/downsample';
import type { LitterboxAnalysisStatePeriod as StatePeriod } from 'shared';
import type { LitterboxBoutAnnotation } from '@/types/litterbox';

import {
  formatMeanG,
  formatSigmaG,
  trimmedSliceMeanSigma,
} from './litterboxPeriodStats';

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
  entering: 'var(--color-signal-entering)',
  occupied: 'var(--color-signal-occupied)',
  eliminating: 'var(--color-signal-eliminating)',
  gap: 'var(--color-signal-gap)',
};

/** Urination: amber/orange; defecation: saddle brown (aligned with overview event dots). */
const BOUT_FILL_COLORS: Record<LitterboxBoutAnnotation['bout_type'], string> = {
  urination: 'rgba(180, 120, 20, 0.28)',
  defecation: 'rgba(139, 69, 19, 0.28)',
  unknown: 'rgba(156, 163, 175, 0.3)',
};

const BOUT_STROKE_COLORS: Record<LitterboxBoutAnnotation['bout_type'], string> =
  {
    urination: 'rgba(180, 120, 20, 0.9)',
    defecation: 'rgba(139, 69, 19, 0.9)',
    unknown: 'rgba(100, 110, 130, 0.8)',
  };

// Clamp a value between min and max
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
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

/** Single pass; avoid Math.min/max(...arr) on large arrays (re-renders per pointer frame during drag). */
function arrayMinMax(arr: number[]): { min: number; max: number } {
  if (arr.length === 0) return { min: 0, max: 0 };
  let min = arr[0]!;
  let max = arr[0]!;
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

type DragMode =
  | { type: 'none' }
  | { type: 'create'; startX: number; currentX: number }
  | {
      type: 'resize';
      boutIndex: number;
      handle: 'left' | 'right';
      currentX: number;
    }
  | { type: 'select'; boutIndex: number };

const SVG_WIDTH = 400;
const SVG_HEIGHT = 150;
const AXIS_HEIGHT = 18;
const HANDLE_W = 8;

function areWeightSignalChartPropsEqual(
  prev: Readonly<WeightSignalChartProps>,
  next: Readonly<WeightSignalChartProps>,
): boolean {
  if (prev.weights !== next.weights) return false;
  if (prev.periods !== next.periods) return false;
  if ((prev.sampleRate ?? 10) !== (next.sampleRate ?? 10)) return false;
  if (prev.bouts !== next.bouts) return false;
  if (prev.onBoutsChange !== next.onBoutsChange) return false;
  if (prev.selectedBoutIndex !== next.selectedBoutIndex) return false;
  if (prev.onSelectBout !== next.onSelectBout) return false;
  if (prev.className !== next.className) return false;
  const pm = prev.mediaSync;
  const nm = next.mediaSync;
  if (pm === nm) return true;
  if (!pm || !nm) return false;
  return (
    pm.playheadChartSec === nm.playheadChartSec &&
    pm.onAxisSeek === nm.onAxisSeek
  );
}

const WeightSignalChartInner = React.forwardRef<
  HTMLDivElement,
  WeightSignalChartProps
>(
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

    /*
     * The annotation-only keys sit behind `isInteractive` because μ/σ and the
     * bout shading are only drawn there — a read-only chart naming them would
     * be a key to marks that are not on it.
     */
    const legendItems: ChartLegendItem[] = [
      {
        tone: STATE_COLORS.entering,
        label: t('event_details.legend_entering'),
      },
      {
        tone: STATE_COLORS.occupied,
        label: t('event_details.legend_occupied'),
      },
      {
        tone: STATE_COLORS.eliminating,
        label: t('event_details.legend_eliminating'),
      },
      { tone: STATE_COLORS.gap, label: t('event_details.legend_gap') },
      ...(isInteractive
        ? ([
            {
              swatch: <span className="chart-stat-swatch mean" aria-hidden />,
              label: t('annotation.chart_legend_mean'),
            },
            {
              swatch: <span className="chart-stat-swatch sigma" aria-hidden />,
              label: t('annotation.chart_legend_sigma_rms'),
            },
            {
              swatch: <span className="bout-swatch urination" aria-hidden />,
              label: t('overview.urination'),
            },
            {
              swatch: <span className="bout-swatch defecation" aria-hidden />,
              label: t('overview.defecation'),
            },
          ] satisfies ChartLegendItem[])
        : []),
    ];

    const maxPoints = 800;
    const displayWeights = React.useMemo(
      () => downsample(weights, maxPoints),
      [weights],
    );
    const scaleFactor = weights.length / displayWeights.length;

    const { paddedMin, paddedMax } = React.useMemo(() => {
      const { min: minWeight, max: maxWeight } = arrayMinMax(weights);
      const range = maxWeight - minWeight || 1;
      const padding = range * 0.1;
      return {
        paddedMin: minWeight - padding,
        paddedMax: maxWeight + padding,
      };
    }, [weights]);

    const chartHeight = SVG_HEIGHT;
    const svgHeight = isInteractive ? SVG_HEIGHT + AXIS_HEIGHT : SVG_HEIGHT;

    const linePath = React.useMemo(
      () =>
        createPath(
          displayWeights,
          SVG_WIDTH,
          chartHeight,
          paddedMin,
          paddedMax,
        ),
      [chartHeight, displayWeights, paddedMax, paddedMin],
    );

    const scaledPeriods = React.useMemo(
      () =>
        periods.map((p) => ({
          ...p,
          start: p.start / scaleFactor,
          end: p.end / scaleFactor,
        })),
      [periods, scaleFactor],
    );

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
    /** Set on pointerdown; reused on pointermove so we do not call getScreenCTM().inverse() every move. */
    const svgScreenToUserInverseRef = React.useRef<DOMMatrix | null>(null);

    const refreshSvgScreenToUserInverse = React.useCallback(() => {
      const svg = svgRef.current;
      if (!svg) {
        svgScreenToUserInverseRef.current = null;
        return;
      }
      const ctm = svg.getScreenCTM();
      svgScreenToUserInverseRef.current = ctm ? ctm.inverse() : null;
    }, []);

    const clearSvgScreenToUserInverse = React.useCallback(() => {
      svgScreenToUserInverseRef.current = null;
    }, []);

    /**
     * Map screen coordinates to viewBox x (0…SVG_WIDTH). Required because the SVG uses
     * preserveAspectRatio="meet": the drawable area is letterboxed inside the layout box,
     * so mapping across the full bounding rect width misaligns drags with the chart.
     */
    const pointerClientToSvgX = React.useCallback(
      (clientX: number, clientY: number): number => {
        const svg = svgRef.current;
        if (!svg) return 0;
        const inv = svgScreenToUserInverseRef.current;
        if (inv) {
          const pt = svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const p = pt.matrixTransform(inv);
          return clamp(p.x, 0, SVG_WIDTH);
        }
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const pt = svg.createSVGPoint();
          pt.x = clientX;
          pt.y = clientY;
          const p = pt.matrixTransform(ctm.inverse());
          return clamp(p.x, 0, SVG_WIDTH);
        }
        const rect = svg.getBoundingClientRect();
        const scale = Math.min(rect.width / SVG_WIDTH, rect.height / svgHeight);
        const offsetX = (rect.width - SVG_WIDTH * scale) / 2;
        return clamp((clientX - rect.left - offsetX) / scale, 0, SVG_WIDTH);
      },
      [svgHeight],
    );

    const getSvgX = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) =>
        pointerClientToSvgX(e.clientX, e.clientY),
      [pointerClientToSvgX],
    );

    const getSvgXFromPointerLike = React.useCallback(
      (e: { clientX: number; clientY: number }) =>
        pointerClientToSvgX(e.clientX, e.clientY),
      [pointerClientToSvgX],
    );

    const axisDragRef = React.useRef(false);

    const handleAxisPointerDown = React.useCallback(
      (e: React.PointerEvent<SVGRectElement>) => {
        if (!mediaSync || !isInteractive || duration <= 0) return;
        e.stopPropagation();
        e.preventDefault();
        refreshSvgScreenToUserInverse();
        e.currentTarget.setPointerCapture(e.pointerId);
        axisDragRef.current = true;
        const x = getSvgXFromPointerLike(e);
        mediaSync.onAxisSeek(xToSec(x));
      },
      [
        duration,
        getSvgXFromPointerLike,
        isInteractive,
        mediaSync,
        refreshSvgScreenToUserInverse,
        xToSec,
      ],
    );

    const handleAxisPointerMove = React.useCallback(
      (e: React.PointerEvent<SVGRectElement>) => {
        if (!axisDragRef.current || !mediaSync || duration <= 0) return;
        const x = getSvgXFromPointerLike(e);
        mediaSync.onAxisSeek(xToSec(x));
      },
      [duration, getSvgXFromPointerLike, mediaSync, xToSec],
    );

    const handleAxisPointerUp = React.useCallback(
      (e: React.PointerEvent<SVGRectElement>) => {
        if (!axisDragRef.current) return;
        axisDragRef.current = false;
        clearSvgScreenToUserInverse();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      },
      [clearSvgScreenToUserInverse],
    );

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive) return;
        refreshSvgScreenToUserInverse();
        e.currentTarget.setPointerCapture(e.pointerId);
        const x = getSvgX(e);
        // Start a create drag from this point
        setDrag({ type: 'create', startX: x, currentX: x });
      },
      [getSvgX, isInteractive, refreshSvgScreenToUserInverse, setDrag],
    );

    const handlePointerMove = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive || drag.type === 'none') return;
        const x = getSvgX(e);
        if (drag.type === 'create') {
          setDrag((d) => (d.type === 'create' ? { ...d, currentX: x } : d));
        } else if (drag.type === 'resize') {
          setDrag((d) => (d.type === 'resize' ? { ...d, currentX: x } : d));
        }
      },
      [isInteractive, drag.type, getSvgX, setDrag],
    );

    const handlePointerUp = React.useCallback(
      (e: React.PointerEvent<SVGSVGElement>) => {
        if (!isInteractive) return;
        try {
          if (!bouts) return;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* already released */
          }

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
              const next = [...bouts, newBout].map((b, i) => ({
                ...b,
                bout_index: i,
              }));
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
        } finally {
          clearSvgScreenToUserInverse();
          setDrag({ type: 'none' });
        }
      },
      [
        bouts,
        clearSvgScreenToUserInverse,
        drag,
        duration,
        isInteractive,
        onBoutsChange,
        onSelectBout,
        setDrag,
        xToSec,
      ],
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
      const items: {
        key: string;
        cx: number;
        meanLabel: string;
        sigmaLabel: string;
      }[] = [];
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        if (p.state !== 'occupied') continue;
        const start = clamp(Math.round(p.start), 0, wlen - 1);
        const end = clamp(Math.round(p.end), 0, wlen - 1);
        const stats = trimmedSliceMeanSigma(weights, start, end);
        if (stats === null) continue;
        const cx = ((p.start + p.end) / 2 / wlen) * SVG_WIDTH;
        items.push({
          key: `occ-${i}-${p.start}-${p.end}`,
          cx,
          meanLabel: t('annotation.chart_occ_mean', {
            value: formatMeanG(stats.mean),
          }),
          sigmaLabel: t('annotation.chart_bout_sigma', {
            value: formatSigmaG(stats.sigma),
          }),
        });
      }
      return items;
    }, [isInteractive, periods, weights, t]);

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
          meanLabel: t('annotation.chart_occ_mean', {
            value: formatMeanG(stats.mean),
          }),
          sigmaLabel: t('annotation.chart_bout_sigma', {
            value: formatSigmaG(stats.sigma),
          }),
          isSelected: selectedBoutIndex === idx,
        };
      });
    }, [
      isInteractive,
      bouts,
      weights,
      sampleRate,
      secToX,
      selectedBoutIndex,
      t,
    ]);

    return (
      <div
        className={cn(
          'weight-signal-chart',
          isInteractive && 'interactive',
          className,
        )}
        /* Pan, zoom and the bout handles own every pointer here; a phone
           sheet around it must not claim the vertical ones. */
        data-vaul-no-drag=""
        ref={ref}
        {...props}
      >
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
            const periodWidth =
              ((period.end - period.start) / displayWeights.length) * SVG_WIDTH;
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
          {isInteractive &&
            bouts?.map((bout, idx) => {
              const x1 = secToX(bout.t_start_s);
              const x2 = secToX(bout.t_end_s);
              const w = Math.max(x2 - x1, 2);
              const isSelected = selectedBoutIndex === idx;
              const fill = BOUT_FILL_COLORS[bout.bout_type];
              const stroke = BOUT_STROKE_COLORS[bout.bout_type];

              return (
                <g
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBout?.(isSelected ? null : idx);
                  }}
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
                      refreshSvgScreenToUserInverse();
                      (svgRef.current as SVGSVGElement).setPointerCapture(
                        e.pointerId,
                      );
                      setDrag({
                        type: 'resize',
                        boutIndex: idx,
                        handle: 'left',
                        currentX: getSvgX(
                          e as unknown as React.PointerEvent<SVGSVGElement>,
                        ),
                      });
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
                      refreshSvgScreenToUserInverse();
                      (svgRef.current as SVGSVGElement).setPointerCapture(
                        e.pointerId,
                      );
                      setDrag({
                        type: 'resize',
                        boutIndex: idx,
                        handle: 'right',
                        currentX: getSvgX(
                          e as unknown as React.PointerEvent<SVGSVGElement>,
                        ),
                      });
                    }}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

          {/* Drag-create preview */}
          {drag.type === 'create' &&
            (() => {
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
                  textAnchor="middle"
                  dominantBaseline="auto"
                  fontSize={8}
                  className="chart-stat-overlay chart-stat-overlay--occupied"
                >
                  <tspan x={o.cx} y={boutMeanStatY}>
                    {o.meanLabel}
                  </tspan>
                  <tspan x={o.cx} y={chartStatY}>
                    {o.sigmaLabel}
                  </tspan>
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

        <ChartLegend items={legendItems} />

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

WeightSignalChartInner.displayName = 'WeightSignalChart';

const WeightSignalChart = React.memo(
  WeightSignalChartInner,
  areWeightSignalChartPropsEqual,
);
WeightSignalChart.displayName = 'WeightSignalChart';

export { type WeightSignalChartProps };
export default WeightSignalChart;
