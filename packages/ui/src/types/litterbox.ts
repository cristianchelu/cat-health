export interface LitterboxBoutAnnotation {
  bout_index: number;
  t_start_s: number;
  t_end_s: number;
  bout_type: 'urination' | 'defecation' | 'unknown';
}

export interface LitterboxAnnotation {
  bouts: LitterboxBoutAnnotation[];
  /** When true, omit from human-verified export / training fixtures (bad data). */
  excluded?: boolean;
}

/** Persisted annotation workspace data on a litterbox event (superset of verified-only). */
export function hasPersistedLitterboxAnnotation(data: {
  annotation?: LitterboxAnnotation;
}): boolean {
  return data.annotation != null && typeof data.annotation === 'object';
}
