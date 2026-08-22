/**
 * Largest-Triangle-Three-Buckets.
 *
 * Picks the `maxPoints` samples that preserve a signal's *shape* rather than
 * every nth one: each bucket keeps the sample forming the largest triangle with
 * the previously kept point and the next bucket's average. Plain decimation
 * drops the spikes, which on a litterbox trace are the whole reading.
 *
 * The first and last samples are always kept, so the line still starts and ends
 * where the data does.
 */
export function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;

  const sampled: number[] = [];
  const bucketSize = (data.length - 2) / (maxPoints - 2);

  sampled.push(data[0]);

  for (let i = 0; i < maxPoints - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.floor((i + 2) * bucketSize) + 1;

    let nextAvg = 0;
    const nextBucketLen =
      Math.min(nextBucketEnd, data.length) - nextBucketStart;
    for (
      let j = nextBucketStart;
      j < Math.min(nextBucketEnd, data.length);
      j++
    ) {
      nextAvg += data[j];
    }
    nextAvg /= nextBucketLen || 1;

    const prevX = sampled.length - 1;
    const prevY = sampled[sampled.length - 1];
    const nextX = i + 2;
    const nextY = nextAvg;

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const area = Math.abs(
        (prevX - nextX) * (data[j] - prevY) -
          (prevX - (j - bucketStart + i + 1)) * (nextY - prevY),
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}
