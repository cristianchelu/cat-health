export type WaterSegmentState = "drinking" | "spill" | "noise";

export interface WaterPeriod {
  state: WaterSegmentState;
  start: number;
  end: number;
}

export interface WeightSample {
  timestampMs: number;
  weight: number;
}

export interface DrinkingAnalysis {
  amount: number;
  duration: number;
  rawAmount: number;
  excludedAmount: number;
  filtered: boolean;
}
