import { Kysely, sql } from 'kysely';

/**
 * Dissolves the `pet_recognizer` device type into a per-device recognition
 * attachment.
 *
 * A recognizer used to be a device of its own that pointed at a camera through
 * a scalar `source_device_id` inside its config blob. That capped each
 * recognizer at one source, made "one recognizer per device" an invariant
 * nothing enforced, and put per-scene settings (scene prompt, reference
 * images, ignored pets, auto-identify) inside a device row belonging to
 * something else — so the camera's Recognition tab edited another device's
 * config. `device_recognition` mirrors `device_camera` instead: the row hangs
 * off the observed device, and the shared inference account it bills to is a
 * foreign key rather than a copied credential.
 *
 * Attribution history is untouched: `attributed_by = 'recognizer'` is a bare
 * token, and `event.device_id` was always the observed device.
 *
 * ## Failure and re-run behaviour
 *
 * SQLite gets no DDL transaction, so a failure part-way through leaves the
 * table created and only some rows copied. `up` is therefore idempotent: the
 * table is created `ifNotExists`, a source device that already has a
 * `device_recognition` row is skipped, and the delete of the old rows is a
 * no-op once they are gone. Re-running after a partial failure finishes the
 * job — and re-running after a *complete* one does nothing at all.
 *
 * ## Known holes (deliberate)
 *
 * - A recognizer whose config does not parse, names no `source_device_id`, or
 *   points at a device that no longer exists is dropped rather than migrated:
 *   there is no scene for it to attach to. It was already inert — the
 *   controller filtered `media_ready` on a source id it could never match.
 * - A recognizer's own `device_connectivity` events are deleted with it: they
 *   are the online/offline log of a device that stops existing. Any other event
 *   on a recognizer aborts the migration rather than being guessed at.
 * - Two recognizers claiming the same source is first-wins by id. The pair was
 *   never legal; picking the older one is the only stable answer, and the
 *   loser's reference images are recoverable from a backup if anyone wants
 *   them.
 *
 * `down` drops the table only. The recognizer device rows cannot be
 *  resurrected — their identity (`external_id`, name, timestamps) is gone once
 *  `up` deletes them, and inventing new ones would hand out ids that mean
 *  nothing to the provider.
 */

interface RecognizerRow {
  id: number;
  provider_account_id: number;
  config: unknown;
  enabled: number;
}

/** The SerializePlugin may hand back either a parsed object or raw JSON text. */
function parseConfig(value: unknown): Record<string, unknown> | null {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

function numberAt(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function referenceImagesAt(config: Record<string, unknown>) {
  const raw = config.reference_images;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number[]> = {};
  for (const [petId, ids] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    const numbers = ids.filter(
      (id): id is number => typeof id === 'number' && Number.isFinite(id),
    );
    if (numbers.length > 0) result[petId] = numbers;
  }
  return result;
}

function ignoredPetsAt(config: Record<string, unknown>): number[] | undefined {
  const raw = config.ignored_pets;
  if (!Array.isArray(raw)) return undefined;
  const numbers = raw.filter(
    (id): id is number => typeof id === 'number' && Number.isFinite(id),
  );
  return numbers.length > 0 ? numbers : undefined;
}

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema
    .createTable('device_recognition')
    .ifNotExists()
    .addColumn('device_id', 'integer', (col) =>
      col.primaryKey().references('device.id').onDelete('cascade'),
    )
    .addColumn('account_id', 'integer', (col) =>
      col.notNull().references('provider_account.id').onDelete('cascade'),
    )
    .addColumn('config', 'jsonb', (col) => col.notNull())
    .execute();

  const { rows: recognizers } = await sql<RecognizerRow>`
    SELECT id, provider_account_id, config, enabled
    FROM device
    WHERE type = 'pet_recognizer'
    ORDER BY id ASC
  `.execute(db);

  for (const recognizer of recognizers) {
    const config = parseConfig(recognizer.config);
    if (!config) continue;

    const sourceDeviceId = numberAt(config, 'source_device_id');
    if (sourceDeviceId === undefined) continue;

    const { rows: sources } = await sql<{
      id: number;
    }>`SELECT id FROM device WHERE id = ${sourceDeviceId}`.execute(db);
    if (sources.length === 0) continue;

    const { rows: existing } = await sql<{ device_id: number }>`
      SELECT device_id FROM device_recognition WHERE device_id = ${sourceDeviceId}
    `.execute(db);
    if (existing.length > 0) continue;

    // `model: null` rather than the constant this app ships: a migration is
    // frozen in time, and importing a default that later changes would pin
    // every migrated device to whatever it happened to say today.
    const model = typeof config.model === 'string' ? config.model : null;
    const promptTemplate =
      typeof config.prompt_template === 'string' ? config.prompt_template : '';
    // A recognizer that was switched off never fired. Carrying its
    // `auto_identify` across unchanged would silently switch identification on
    // for a device whose owner had turned it off.
    const autoIdentify =
      config.auto_identify !== false && recognizer.enabled === 1;
    const ignoredPets = ignoredPetsAt(config);

    const nextConfig = JSON.stringify({
      model,
      prompt_template: promptTemplate,
      auto_identify: autoIdentify,
      reference_images: referenceImagesAt(config),
      ...(ignoredPets ? { ignored_pets: ignoredPets } : {}),
    });

    await sql`
      INSERT INTO device_recognition (device_id, account_id, config)
      VALUES (${sourceDeviceId}, ${recognizer.provider_account_id}, ${nextConfig})
    `.execute(db);
  }

  /*
   * A recognizer's own connectivity log goes with it. `event.device_id` has no
   * ON DELETE action, so these rows would otherwise abort the delete below with
   * a bare foreign-key error — and they describe the online/offline history of
   * a device that is about to stop existing, which nothing can read afterwards.
   *
   * Only `device_connectivity`: a recognizer never published anything else, and
   * silently deleting a domain event nobody predicted would destroy real
   * history. If one turns up, the guard below says so instead of guessing.
   */
  await sql`
    DELETE FROM event
    WHERE device_id IN (SELECT id FROM device WHERE type = 'pet_recognizer')
      AND json_extract(data, '$.type') = 'device_connectivity'
  `.execute(db);

  const { rows: stranded } = await sql<{ id: number; device_id: number }>`
    SELECT id, device_id FROM event
    WHERE device_id IN (SELECT id FROM device WHERE type = 'pet_recognizer')
    LIMIT 5
  `.execute(db);
  if (stranded.length > 0) {
    throw new Error(
      'Cannot remove pet_recognizer devices: they still own events that are ' +
        'not connectivity records, e.g. ' +
        stranded
          .map((row) => `event ${row.id} on device ${row.device_id}`)
          .join(', ') +
        '. Decide what those events belong to before re-running this migration.',
    );
  }

  await sql`DELETE FROM device WHERE type = 'pet_recognizer'`.execute(db);
}

export async function down(db: Kysely<Record<string, never>>): Promise<void> {
  await db.schema.dropTable('device_recognition').ifExists().execute();
}
