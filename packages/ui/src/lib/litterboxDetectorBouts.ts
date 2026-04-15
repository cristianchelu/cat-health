import type { LitterboxAnalysisStatePeriod as StatePeriod } from 'shared';
import type { LitterboxBoutAnnotation } from '@/types/litterbox';

function isEliminatingPeriod(p: StatePeriod): boolean {
  return p.state === 'eliminating' && p.end > p.start;
}

function periodToBoutType(
  p: StatePeriod,
): LitterboxBoutAnnotation['bout_type'] {
  if (p.elimination_type === 'urination') return 'urination';
  if (p.elimination_type === 'defecation') return 'defecation';
  return 'unknown';
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

  return eliminating.map((period, i) => ({
    bout_index: i,
    t_start_s: period.start / hz,
    t_end_s: period.end / hz,
    bout_type: periodToBoutType(period),
  }));
}
