import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type {
  PetPresenceEventData,
  PetPresenceState,
} from '../../database/types/EventTable.ts';

export type PetPresencePreviousState = PetPresenceState | 'unknown';

export function isAwayFromPresenceState(
  state: PetPresencePreviousState,
): boolean {
  return state === 'away' || state === 'outside';
}

export function deriveIsAway(
  data: PetPresenceEventData | null | undefined,
): boolean {
  if (!data) {
    return false;
  }
  return isAwayFromPresenceState(data.state);
}

export function toPreviousState(
  data: PetPresenceEventData | null | undefined,
): PetPresencePreviousState {
  if (!data) {
    return 'unknown';
  }
  return data.state;
}

export async function fetchLatestPresenceByPetIds(
  db: Kysely<Database>,
  petIds: number[],
): Promise<Map<number, PetPresenceEventData>> {
  if (petIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom('event')
    .select(['pet_id', 'data'])
    .where('pet_id', 'in', petIds)
    .where(sql`json_extract(data, '$.type')`, '=', 'pet_presence')
    .orderBy('timestamp', 'desc')
    .execute();

  const latestByPet = new Map<number, PetPresenceEventData>();
  for (const row of rows) {
    if (row.pet_id == null || latestByPet.has(row.pet_id)) {
      continue;
    }
    const data = row.data as PetPresenceEventData;
    if (data?.type === 'pet_presence') {
      latestByPet.set(row.pet_id, data);
    }
  }

  return latestByPet;
}

export async function fetchLatestPresenceForPet(
  db: Kysely<Database>,
  petId: number,
): Promise<PetPresenceEventData | null> {
  const map = await fetchLatestPresenceByPetIds(db, [petId]);
  return map.get(petId) ?? null;
}

export function buildToggledPresenceData(
  latest: PetPresenceEventData | null,
): PetPresenceEventData {
  const previous_state = toPreviousState(latest);
  const currentState = latest?.state ?? 'unknown';

  if (currentState === 'away' || currentState === 'outside') {
    const context =
      latest?.context === 'vet' ||
      latest?.context === 'travel' ||
      latest?.context === 'friend'
        ? latest.context
        : undefined;

    return {
      type: 'pet_presence',
      state: 'home',
      previous_state,
      ...(context ? { context } : {}),
    };
  }

  return {
    type: 'pet_presence',
    state: 'away',
    previous_state,
  };
}
