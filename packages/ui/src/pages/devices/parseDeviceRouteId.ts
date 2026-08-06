/** Parse a `:id` route param into a positive device id, or null if unusable. */
export function parseDeviceRouteId(id: string | undefined): number | null {
  if (id == null || id === '') return null;
  if (!/^\d+$/.test(id)) return null;
  const parsed = Number.parseInt(id, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
