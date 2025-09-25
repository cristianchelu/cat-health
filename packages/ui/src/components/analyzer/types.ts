export interface EventData {
  id: number;
  timestamp: string;
  data: Record<string, unknown>;
  raw_data?: number[] | null;
  human_verified: boolean;
}

export interface DecodedData {
  startTime: Date;
  measurements: { weight: number }[];
  context: {
    wasteWeight?: number;
    litterRemaining?: number;
    deepCleanTimer?: number;
    totalVisits?: number;
    daysSinceLitterReplaced?: number;
    hoursSinceLastScoop?: number;
  };
}

export interface Features {
  preEliminationDuration: number;
  eliminationDuration: number;
  coveringDuration: number;
  totalDuration: number;
  wasteWeight: number;
  maxWeight: number;
  initialWeight: number;
  finalWeight: number;
  eliminationVariance: number;
  coveringVariance: number;
  coveringFluctuations: number;
  coveringSpectralEntropy: number;
  preEliminationVariance: number;
  eliminationRate: number;
  eliminationRmsDerivative: number;

  periods: StatePeriod[];
}

export interface StateTransition {
  from: string;
  to: string;
  index: number;
  timestamp: number;
}

export interface StateResult {
  state: string;
  catWeight: number;
  events: {
    entries: number;
    exits: number;
    hesitations: number;
  };
}

export interface StateTimelineEntry {
  index: number;
  weight: number;
  state: string;
  catWeight: number;
  events: {
    entries: number;
    exits: number;
    hesitations: number;
  };
}

export interface StatePeriod {
  state: string;
  start: number;
  end: number;
  variance?: number;
}

export interface FeatureDimension {
  key: string;
  label: string;
  unit: string;
}

export interface ProcessedEventData {
  event: EventData;
  features: Features;
  eliminationType: string;
}

export interface LitterboxAnalyzerProps {
  events: EventData[];
  className?: string;
}
