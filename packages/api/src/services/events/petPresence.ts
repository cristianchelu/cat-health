import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '../../database/index.ts';
import type {
  EventData,
  PetPresenceEventData,
  PetPresenceState,
} from '../../domain/events.ts';

export type PetPresencePreviousState = PetPresenceState | 'unknown';

export interface PresenceRecord {
  data: PetPresenceEventData;
  timestamp: Date;
}

/**
 * A closed profile is the pet's latest presence being a close. Owner of the
 * rule that hides a pet and its history; reopen-profile is the only way out.
 */
export function isProfileClosed(
  presence: PetPresenceEventData | null | undefined,
): boolean {
  return presence?.context === 'profile_closed';
}

/**
 * Whether a guess (litterbox weight, camera) may name this pet. `away` covers
 * the vet, a friend's and a closed profile; `outside` stays a candidate because
 * an outdoor cat uses the litterbox before anyone marks it home.
 */
export function isAttributionCandidate(
  presence: PetPresenceEventData | null | undefined,
): boolean {
  return presence?.state !== 'away';
}

export function toPreviousState(
  data: Pick<PetPresenceEventData, 'state'> | null | undefined,
): PetPresencePreviousState {
  if (!data) {
    return 'unknown';
  }
  return data.state;
}

/**
 * One pet's latest presence event as of `at`: a single seek on
 * `idx_event_pet_presence`, which the `json_extract` term must match to be used.
 */
export function latestPresenceQuery(
  db: Kysely<Database>,
  petId: number,
  at?: Date,
) {
  let query = db
    .selectFrom('event')
    .select(['pet_id', 'data', 'timestamp'])
    .where('pet_id', '=', petId)
    .where(sql`json_extract(data, '$.type')`, '=', 'pet_presence');
  if (at) query = query.where('timestamp', '<=', at);
  return query.orderBy('timestamp', 'desc').orderBy('id', 'desc').limit(1);
}

/** Each pet's presence as of `at` (latest when omitted). */
export async function presenceAt(
  db: Kysely<Database>,
  petIds: readonly number[],
  at?: Date,
): Promise<Map<number, PresenceRecord>> {
  const rows = await Promise.all(
    [...new Set(petIds)].map((petId) =>
      latestPresenceQuery(db, petId, at).executeTakeFirst(),
    ),
  );

  const byPet = new Map<number, PresenceRecord>();
  for (const row of rows) {
    if (row?.pet_id == null || row.data.type !== 'pet_presence') continue;
    byPet.set(row.pet_id, {
      data: row.data,
      timestamp: new Date(row.timestamp),
    });
  }
  return byPet;
}

/** Every pet whose profile is closed right now. */
export async function fetchClosedPetIds(
  db: Kysely<Database>,
): Promise<number[]> {
  const pets = await db.selectFrom('pet').select('id').execute();
  const presence = await presenceAt(
    db,
    pets.map((pet) => pet.id),
  );
  return [...presence]
    .filter(([, record]) => isProfileClosed(record.data))
    .map(([petId]) => petId);
}

/** The pets among `petIds` that a guess made at `at` may name. */
export async function attributionCandidatesAt(
  db: Kysely<Database>,
  petIds: readonly number[],
  at: Date,
): Promise<Set<number>> {
  const presence = await presenceAt(db, petIds, at);
  return new Set(
    petIds.filter((petId) => isAttributionCandidate(presence.get(petId)?.data)),
  );
}

export interface PresenceWriteSide {
  petId: number | null;
  data: EventData;
}

/**
 * A presence write the guard refuses. It carries an HTTP `statusCode`, so a
 * route lets it propagate and Fastify answers `{ statusCode, error, message }`.
 */
export class PresenceWriteRefused extends Error {
  readonly statusCode: 400 | 409;

  constructor(statusCode: 400 | 409, message: string) {
    super(message);
    this.name = 'PresenceWriteRefused';
    this.statusCode = statusCode;
  }
}

function isProfileEvent(data: EventData): boolean {
  return (
    data.type === 'pet_presence' &&
    (data.context === 'profile_closed' || data.context === 'profile_reopened')
  );
}

interface PresenceWrite {
  /** Null for a delete. */
  incoming: PresenceWriteSide | null;
  /** Null for a create. */
  existing: PresenceWriteSide | null;
}

function touchesPresence({ incoming, existing }: PresenceWrite): boolean {
  return (
    incoming?.data.type === 'pet_presence' ||
    existing?.data.type === 'pet_presence'
  );
}

function presencePetIds({ incoming, existing }: PresenceWrite): number[] {
  return [incoming?.petId, existing?.petId].filter(
    (petId): petId is number => petId != null,
  );
}

/**
 * Guard for every presence write but the profile endpoints'. Closure and
 * attribution are both read from presence events, so only those endpoints
 * write the profile contexts, and no presence event moves on or onto a closed
 * pet. `presence` must hold the current presence of the write's pets.
 */
export function checkPresenceWrite(
  write: PresenceWrite,
  presence: ReadonlyMap<number, PresenceRecord>,
): void {
  const { incoming, existing } = write;
  if (existing && isProfileEvent(existing.data)) {
    throw new PresenceWriteRefused(
      409,
      'A profile close or reopen event cannot be changed',
    );
  }
  if (incoming && isProfileEvent(incoming.data)) {
    throw new PresenceWriteRefused(
      400,
      'Profile close and reopen are recorded by the pet endpoints',
    );
  }

  if (!incoming || !touchesPresence(write)) return;

  if (
    presencePetIds(write).some((petId) =>
      isProfileClosed(presence.get(petId)?.data),
    )
  ) {
    throw new PresenceWriteRefused(409, "The pet's profile is closed");
  }
}

/** `checkPresenceWrite` with the presence it needs fetched first. */
export async function assertPresenceWriteAllowed(
  db: Kysely<Database>,
  write: PresenceWrite,
): Promise<void> {
  const petIds = touchesPresence(write) ? presencePetIds(write) : [];
  checkPresenceWrite(write, await presenceAt(db, petIds));
}
