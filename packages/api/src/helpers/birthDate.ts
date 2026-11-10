import { format } from 'date-fns';

/** A stored birth date as its calendar day, `yyyy-MM-dd`, or null when unknown. */
export function formatBirthDate(value: Date | string | null): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : format(value, 'yyyy-MM-dd');
}
