/**
 * Canonical JSON shape for StateAnalyzer replay parity (TS golden + C++ sa_replay).
 * Keep in sync with esphome-litterbox-monitor tools/sa_replay.cpp output.
 *
 * schema_version 2: cat_weight_g and waste_weight_g are whole grams (nearest integer).
 * schema_version 3: eliminating-period variance (motion RMS, g) rounded to 0.1 g.
 */

export const REPLAY_GOLDEN_SCHEMA_VERSION = 3;

/** One merged period after postProcessTransitions (sample indices). */
export interface ReplayGoldenPeriod {
  state: string;
  start: number;
  end: number;
  /** Present for eliminating periods when computable; null otherwise. */
  variance: number | null;
}

export interface ReplayGoldenVisit {
  visit_id: string;
  elimination_type: string;
  periods: ReplayGoldenPeriod[];
  cat_weight_g: number;
  waste_weight_g: number;
  detected_cat_index: number;
}

export interface ReplayGoldenFile {
  schema_version: typeof REPLAY_GOLDEN_SCHEMA_VERSION;
  visits: ReplayGoldenVisit[];
}
