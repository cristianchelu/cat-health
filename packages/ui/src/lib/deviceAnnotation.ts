// visit_annotation_enabled is stored in device.config as a boolean flag.
// When true, the device header links to the visit annotation workspace (`/devices/:id/annotate`).
export function isVisitAnnotationEnabled(device: { config?: unknown }): boolean {
  const cfg = device.config as Record<string, unknown> | null | undefined;
  return cfg?.visit_annotation_enabled === true;
}
