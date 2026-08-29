import type * as React from 'react';

/**
 * The shape both anchors of a picker read from.
 *
 * Its own module so the dropdown and the page can share it without either
 * importing the other's component file — and so neither ends up exporting a
 * helper beside a component, which costs fast refresh.
 */
export interface PickerOption {
  value: string;
  label: string;
  /** A quiet second line under the label. */
  subline?: string;
  /** An avatar or icon at the head of the row. Decorative — the label names it. */
  leading?: React.ReactNode;
  /** Options sharing a heading are drawn together, in first-seen order. */
  group?: string;
  /** Right-aligned metadata: a count, a kcal density, a last-logged note. */
  trailing?: React.ReactNode;
  /** `forward` drills into another level; `down` opens a picker. */
  chevron?: 'forward' | 'down' | 'none';
  /** For options that name an absence — "Not linked", "No brand". */
  muted?: boolean;
  disabled?: boolean;
}

/** Groups in first-seen order; ungrouped options keep their place at the top. */
export function groupOptions(
  options: readonly PickerOption[],
): { heading: string | undefined; options: PickerOption[] }[] {
  const groups: { heading: string | undefined; options: PickerOption[] }[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.heading === option.group) last.options.push(option);
    else groups.push({ heading: option.group, options: [option] });
  }
  return groups;
}
