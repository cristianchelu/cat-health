import type { EntityDTO, EntityDisplayCategory } from 'shared';

const CONTROL_TYPES = new Set(['switch', 'number', 'select', 'button']);

const SENSOR_TYPES = new Set(['sensor', 'binary_sensor', 'text_sensor']);

export function compareEntitiesByName(a: EntityDTO, b: EntityDTO): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function getEntityDashboardCategory(
  entity: EntityDTO,
): EntityDisplayCategory {
  return entity.category ?? 'primary';
}

export interface PrimaryPartition {
  controls: EntityDTO[];
  sensors: EntityDTO[];
  /** Tier B and unknown types with category primary */
  other: EntityDTO[];
}

export function partitionPrimaryEntities(
  entities: EntityDTO[],
): PrimaryPartition {
  const controls: EntityDTO[] = [];
  const sensors: EntityDTO[] = [];
  const other: EntityDTO[] = [];

  for (const e of entities) {
    if (CONTROL_TYPES.has(e.type)) {
      controls.push(e);
    } else if (SENSOR_TYPES.has(e.type)) {
      sensors.push(e);
    } else {
      other.push(e);
    }
  }

  controls.sort(compareEntitiesByName);
  sensors.sort(compareEntitiesByName);
  other.sort(compareEntitiesByName);

  return { controls, sensors, other };
}

export interface GroupedDashboardEntities {
  primary: PrimaryPartition;
  config: EntityDTO[];
  diagnostic: EntityDTO[];
}

export function groupEntitiesForDashboard(
  entities: EntityDTO[],
): GroupedDashboardEntities {
  const primaryRaw: EntityDTO[] = [];
  const config: EntityDTO[] = [];
  const diagnostic: EntityDTO[] = [];

  for (const e of entities) {
    const c = getEntityDashboardCategory(e);
    if (c === 'primary') {
      primaryRaw.push(e);
    } else if (c === 'config') {
      config.push(e);
    } else {
      diagnostic.push(e);
    }
  }

  config.sort(compareEntitiesByName);
  diagnostic.sort(compareEntitiesByName);

  return {
    primary: partitionPrimaryEntities(primaryRaw),
    config,
    diagnostic,
  };
}
