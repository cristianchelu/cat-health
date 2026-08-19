import { encodeLitterboxRawData } from 'shared';
import type { LitterboxUseEliminationType } from 'shared';

import type { LitterboxUseEventData } from '../../domain/events.ts';
import { mergeAnalyzerIntoLitterboxData } from '../../services/devices/providers/esphome/analyzeLitterboxUse.ts';
import { StateAnalyzer } from '../../services/devices/providers/esphome/StateAnalyzer.ts';

const SAMPLE_HZ = 10;
const RAMP_SAMPLES = 25;
const PRE_ELIM_SAMPLES = 30;
const POST_ELIM_SAMPLES = 30;
const EXIT_SAMPLES = 25;

export interface VisitScenario {
  eliminationType: LitterboxUseEliminationType;
  catWeightGrams: number;
  eliminationWeightGrams: number;
  eliminationActiveSeconds: number;
  straining: boolean;
  knownCatWeightsGrams: number[];
}

export interface GeneratedVisit {
  data: LitterboxUseEventData;
  rawData: Buffer;
  detectedCatWeightGrams: number;
}

type StreamMode = 'urination' | 'defecation' | 'uti' | 'no_elimination';

function streamModeFor(
  eliminationType: LitterboxUseEliminationType,
  straining: boolean,
): StreamMode {
  if (eliminationType === 'no_elimination') return 'no_elimination';
  if (eliminationType === 'defecation') return 'defecation';
  if (straining) return 'uti';
  return 'urination';
}

/** Analyzer-detected eliminating segments run ~3s longer than the core plateau. */
function streamEliminationSeconds(displaySeconds: number): number {
  return Math.max(1, displaySeconds - 3);
}

function buildNoEliminationStream(catWeightGrams: number): number[] {
  const sampleCount = 140 + Math.floor(catWeightGrams % 40);
  return Array.from({ length: sampleCount }, (_, i) => {
    const edge = Math.min(i, sampleCount - 1 - i, 12);
    if (edge < 12) {
      return 400 + (catWeightGrams - 400) * (edge / 12);
    }
    return catWeightGrams + 0.3 * Math.sin(i / 4);
  });
}

function buildEliminationStream(
  catWeightGrams: number,
  eliminationActiveSeconds: number,
  mode: StreamMode,
): number[] {
  const ramp = Array.from({ length: RAMP_SAMPLES }, (_, i) => {
    return 400 + (catWeightGrams - 400) * (i / (RAMP_SAMPLES - 1));
  });
  const pre = Array.from({ length: PRE_ELIM_SAMPLES }, () => catWeightGrams);
  const elimSamples = Math.round(
    streamEliminationSeconds(eliminationActiveSeconds) * SAMPLE_HZ,
  );
  const elim = Array.from({ length: elimSamples }, (_, i) => {
    if (mode === 'defecation') {
      return catWeightGrams + 7 * Math.sin(i * 1.4) + 3 * Math.sin(i * 0.35);
    }
    const wobble = mode === 'uti' ? 2.5 : 1.5;
    return catWeightGrams + wobble * Math.sin(i * 0.9);
  });
  const post = Array.from({ length: POST_ELIM_SAMPLES }, (_, i) => {
    return catWeightGrams + 0.2 * Math.sin(i);
  });
  const exit = Array.from({ length: EXIT_SAMPLES }, (_, i) => {
    return catWeightGrams - (catWeightGrams - 350) * (i / (EXIT_SAMPLES - 1));
  });
  return [...ramp, ...pre, ...elim, ...post, ...exit];
}

function buildWeightStream(
  catWeightGrams: number,
  eliminationType: LitterboxUseEliminationType,
  eliminationActiveSeconds: number,
  straining: boolean,
): number[] {
  const mode = streamModeFor(eliminationType, straining);
  if (mode === 'no_elimination') {
    return buildNoEliminationStream(catWeightGrams);
  }
  return buildEliminationStream(catWeightGrams, eliminationActiveSeconds, mode);
}

export function generateDemoVisit(
  timestamp: Date,
  scenario: VisitScenario,
): GeneratedVisit {
  const weights = buildWeightStream(
    scenario.catWeightGrams,
    scenario.eliminationType,
    scenario.eliminationActiveSeconds,
    scenario.straining,
  );
  const durationSeconds = Math.round(weights.length / SAMPLE_HZ);
  const sampleOffsetsMs = weights.map((_, i) =>
    Math.round((i * 1000) / SAMPLE_HZ),
  );

  const rawData = Buffer.from(
    encodeLitterboxRawData({
      version: 2,
      startTimeMs: timestamp.getTime(),
      context: {
        wasteWeight: 0,
        litterRemaining: 3200,
        daysSinceDeepClean: 3,
        visitsSinceScoop: 1,
        urinationsSinceScoop: 1,
        defecationsSinceScoop: 0,
      },
      weights,
      sampleOffsetsMs,
    }),
  );

  const knownWeights = [...scenario.knownCatWeightsGrams].sort((a, b) => a - b);
  const analyzer = new StateAnalyzer(knownWeights);
  const analysis = analyzer.processEvent(weights);

  const baseData: LitterboxUseEventData = {
    type: 'litterbox_use',
    elimination_type: scenario.eliminationType,
    elimination_weight: scenario.eliminationWeightGrams,
    duration: durationSeconds,
    sample_rate_hz: SAMPLE_HZ,
    straining: scenario.straining,
    segments: null,
  };

  const analyzed = mergeAnalyzerIntoLitterboxData(baseData, analysis);

  return {
    data: {
      ...analyzed,
      elimination_type: scenario.eliminationType,
      elimination_weight: scenario.eliminationWeightGrams,
      duration: durationSeconds,
      straining: scenario.straining,
    },
    rawData,
    detectedCatWeightGrams:
      analysis.catWeight > 0
        ? Math.round(analysis.catWeight)
        : scenario.catWeightGrams,
  };
}
