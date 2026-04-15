import type { LitterboxAnalysisStatePeriod } from 'shared';

import type { StatePeriod } from './StateAnalyzer.ts';
import { URINATION_VARIANCE_THRESHOLD_G } from './StateAnalyzer.ts';

function eliminationTypeFromVariance(
  variance: number | undefined,
): 'urination' | 'defecation' | undefined {
  if (variance === undefined) return undefined;
  return variance < URINATION_VARIANCE_THRESHOLD_G ? 'urination' : 'defecation';
}

export function persistedLitterboxSegments(
  periods: StatePeriod[],
): LitterboxAnalysisStatePeriod[] {
  return periods.map((p) => {
    const row: LitterboxAnalysisStatePeriod = {
      state: p.state,
      start: p.start,
      end: p.end,
    };
    if (p.state === 'eliminating' && p.variance !== undefined) {
      const et = eliminationTypeFromVariance(p.variance);
      if (et !== undefined) {
        row.elimination_type = et;
      }
    }
    return row;
  });
}
