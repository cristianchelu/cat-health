import {
  LITTERBOX_SAMPLE_HZ,
  type LitterboxAnalysisStatePeriod,
  type LitterboxEliminationBadgeSegment,
} from 'shared';

/** Display-only: sample indices → seconds using persisted `elimination_type` from the server. */
export function eliminationBadgeRowsFromSegments(
  periods: LitterboxAnalysisStatePeriod[] | null | undefined,
  sampleHz: number,
): LitterboxEliminationBadgeSegment[] {
  if (periods == null || periods.length === 0) return [];
  const hz = sampleHz > 0 ? sampleHz : LITTERBOX_SAMPLE_HZ;
  const out: LitterboxEliminationBadgeSegment[] = [];
  for (const p of periods) {
    if (p.state !== 'eliminating' || p.elimination_type === undefined) continue;
    out.push({
      elimination_type: p.elimination_type,
      start_s: p.start / hz,
      end_s: p.end / hz,
    });
  }
  return out;
}
