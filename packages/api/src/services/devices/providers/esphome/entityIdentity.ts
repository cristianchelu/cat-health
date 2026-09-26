import { type Entity as EspHomeEntity, EntityCategory } from 'esphome-client';

/**
 * ESPHome's own object_id derivation (`sanitize(snake_case(name))`):
 * lowercase, spaces to underscores, any char outside [a-z0-9-_] to
 * underscore. Firmware ≥2025.10 omits object_id from ListEntities when it
 * equals this derivation, so the client must reproduce it exactly.
 */
export function objectIdFromName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0) {
    return null;
  }
  return name
    .toLowerCase()
    .replace(/ /g, '_')
    .replace(/[^a-z0-9-_]/g, '_');
}

export function mapEspHomeEntityCategory(
  entity: EspHomeEntity,
): 'primary' | 'config' | 'diagnostic' {
  const raw =
    'entityCategory' in entity &&
    typeof (entity as { entityCategory?: unknown }).entityCategory === 'number'
      ? (entity as { entityCategory: number }).entityCategory
      : undefined;
  if (raw === EntityCategory.CONFIG) {
    return 'config';
  }
  if (raw === EntityCategory.DIAGNOSTIC) {
    return 'diagnostic';
  }
  return 'primary';
}
