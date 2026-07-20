import { getBooleanValue, isRecord } from 'shared';

// visit_annotation_enabled is stored in device.config as a boolean flag.
// When true, the device header links to the visit annotation workspace (`/devices/:id/annotate`).
export function isVisitAnnotationEnabled(device: {
  config?: unknown;
}): boolean {
  if (!isRecord(device.config)) return false;
  return getBooleanValue(device.config, 'visit_annotation_enabled') === true;
}
