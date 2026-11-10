import type { EventData } from '../../domain/events.ts';

/**
 * A write to a target event that the generic event routes refuse. It carries
 * an HTTP `statusCode`, so a route lets it propagate, as `PresenceWriteRefused`
 * does.
 */
export class TargetWriteRefused extends Error {
  readonly statusCode: 400 | 409;

  constructor(statusCode: 400 | 409, message: string) {
    super(message);
    this.name = 'TargetWriteRefused';
    this.statusCode = statusCode;
  }
}

function isTarget(data: EventData): boolean {
  return data.type === 'intake_target' || data.type === 'weight_target';
}

/**
 * Target events are snapshots written by the dietary-needs endpoint, which
 * carries the plan forward. The generic event routes neither create one nor
 * edit one; `existing` is null for a create.
 */
export function checkTargetWrite(
  incoming: EventData,
  existing: EventData | null,
): void {
  if (existing && isTarget(existing)) {
    throw new TargetWriteRefused(409, 'A dietary target cannot be edited here');
  }
  if (isTarget(incoming)) {
    throw new TargetWriteRefused(
      400,
      "Dietary targets are recorded by the pet's dietary needs",
    );
  }
}
