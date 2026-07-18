export function gramsPlateauAround(
  targetGrams: number,
  sampleCount: number,
): number[] {
  const burstLen = Math.min(40, Math.max(10, Math.floor(sampleCount / 20)));
  const tailA = Math.floor((sampleCount - burstLen) / 2);
  const tailB = sampleCount - burstLen - tailA;
  const mk = (n: number, phase: number) =>
    Array.from({ length: n }, (_, i) => {
      const x = i + phase;
      return targetGrams + 0.4 * Math.sin(x / 4);
    });
  const burst = Array.from({ length: burstLen }, (_, i) => {
    return targetGrams + 200 * Math.sin(i / 2);
  });
  return [...mk(tailA, 0), ...burst, ...mk(tailB, tailA + burstLen)];
}
