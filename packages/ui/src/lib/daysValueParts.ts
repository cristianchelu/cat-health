/**
 * How a days-kind signal value reads.
 *
 * Whole days above one; hours below it, because "0 days left" on a 12-hour
 * bowl cycle says nothing while "5 hours left" is the actual answer. Inside
 * the last half hour either unit rounds to zero, so the value collapses to
 * "due now" rather than counting nothing.
 */
export interface DaysValueParts {
  key: 'days_left' | 'days_overdue' | 'hours_left' | 'hours_overdue' | 'due_now';
  count: number;
}

export function daysValueParts(days: number): DaysValueParts {
  const overdue = days < 0;
  const magnitude = Math.abs(days);

  if (magnitude < 1) {
    const hours = Math.round(magnitude * 24);
    if (hours === 0) {
      return { key: 'due_now', count: 0 };
    }
    return { key: overdue ? 'hours_overdue' : 'hours_left', count: hours };
  }

  return {
    key: overdue ? 'days_overdue' : 'days_left',
    count: Math.round(magnitude),
  };
}
