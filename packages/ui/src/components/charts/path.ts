/**
 * A polyline through evenly-spaced samples, as an SVG `d` attribute.
 *
 * The x step is derived from the sample count rather than passed in, because
 * every caller plots a whole signal across the full width of its viewport —
 * the samples are the x axis.
 *
 * A flat signal has no range to divide by, so the divisor falls back to 1 and
 * the line sits along the bottom rather than producing `NaN` and vanishing.
 */
export function createPath(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
): string {
  if (values.length === 0) return '';

  const range = max - min || 1;
  const xStep = width / (values.length - 1 || 1);

  let path = '';
  for (let i = 0; i < values.length; i++) {
    const x = i * xStep;
    const y = height - ((values[i] - min) / range) * height;
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  return path;
}
