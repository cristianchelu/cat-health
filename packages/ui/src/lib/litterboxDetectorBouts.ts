import type { StatePeriod } from '@/components/events/litterboxStateTracker';
import type { LitterboxBoutAnnotation } from '@/types/litterbox';

/** Must match `URINATION_VARIANCE_THRESHOLD_G` in `packages/api/.../StateAnalyzer.ts`. */
const URINATION_VARIANCE_THRESHOLD_G = 4;

function isEliminatingPeriod(p: StatePeriod): boolean {
  return p.state === 'eliminating' && p.end > p.start;
}

function varianceToBoutType(v: number | undefined): LitterboxBoutAnnotation['bout_type'] {
  if (v === undefined) return 'unknown';
  return v < URINATION_VARIANCE_THRESHOLD_G ? 'urination' : 'defecation';
}

export function deriveDetectorBouts(periods: StatePeriod[], sampleRateHz: number): LitterboxBoutAnnotation[] {
  const hz = Number.isFinite(sampleRateHz) && sampleRateHz > 0 ? sampleRateHz : 10;

  const eliminating: StatePeriod[] = [];
  for (const period of periods) {
    if (!isEliminatingPeriod(period)) continue;
    const t_start_s = period.start / hz;
    const t_end_s = period.end / hz;
    if (t_end_s - t_start_s < 0.05) continue;
    eliminating.push(period);
  }

  const bouts: LitterboxBoutAnnotation[] = eliminating.map((period, i) => ({
    bout_index: i,
    t_start_s: period.start / hz,
    t_end_s: period.end / hz,
    bout_type: 'unknown' as const,
  }));

  if (bouts.length === 1) {
    bouts[0].bout_type = varianceToBoutType(eliminating[0].variance);
  }

  return bouts;
}

