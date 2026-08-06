import { getStringValue, isRecord } from '@/lib/utils';

export type BackTarget = {
  to: string;
  label: string;
};

/** Attach to Link / navigate() from non-canonical entry points. */
export function backState(to: string, label: string): { back: BackTarget } {
  return { back: { to, label } };
}

export function parseBackState(state: unknown): BackTarget | undefined {
  if (!isRecord(state)) return undefined;
  const back = state.back;
  if (!isRecord(back)) return undefined;
  const to = getStringValue(back, 'to');
  const label = getStringValue(back, 'label');
  if (to === undefined || label === undefined) return undefined;
  return { to, label };
}
