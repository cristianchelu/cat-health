import { useRef, useCallback, useEffect } from 'react';
import { ChartJS } from '../lib/chartHelpers';

export const useChartManager = () => {
  const weightChartRef = useRef<HTMLCanvasElement>(null);
  const analysisChartRef = useRef<HTMLCanvasElement>(null);
  const scatterChartRef = useRef<HTMLCanvasElement>(null);
  const weightChartInstance = useRef<ChartJS | null>(null);
  const analysisChartInstance = useRef<ChartJS | null>(null);
  const scatterChartInstance = useRef<ChartJS | null>(null);

  const destroyCharts = useCallback(() => {
    if (weightChartInstance.current) {
      weightChartInstance.current.destroy();
      weightChartInstance.current = null;
    }
    if (analysisChartInstance.current) {
      analysisChartInstance.current.destroy();
      analysisChartInstance.current = null;
    }
    if (scatterChartInstance.current) {
      scatterChartInstance.current.destroy();
      scatterChartInstance.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyCharts();
    };
  }, [destroyCharts]);

  return {
    weightChartRef,
    analysisChartRef,
    scatterChartRef,
    weightChartInstance,
    analysisChartInstance,
    scatterChartInstance,
    destroyCharts,
  };
};
