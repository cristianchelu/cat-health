/**
 * `m:ss`, always — a length read off a chart.
 *
 * Deliberately not the drawer's own `formatDuration`, which drops to a bare
 * `14 s` under a minute. That shape is right for a fact chip read on its own
 * and wrong for a column of section lengths, where `0:19` under `1:04` is the
 * whole point. The advanced page is columns of numbers throughout, so it reads
 * every length the one way.
 */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const mins = Math.floor(whole / 60);
  return `${mins}:${String(whole % 60).padStart(2, '0')}`;
}
