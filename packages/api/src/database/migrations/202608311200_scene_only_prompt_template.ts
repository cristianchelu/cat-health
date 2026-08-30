import { Kysely, sql } from 'kysely';

/**
 * Reduces `device_recognition.config.prompt_template` to scene context only.
 *
 * The old recognizer template carried three different things in one string:
 * instructions to the *user* ("Describe what this camera sees… For example:"),
 * the actual scene description, and a `{{reference_images}}` placeholder that
 * was really a piece of the output contract living in user config. The code
 * now appends the candidate list itself and the meta-instructions became the
 * form's hint and placeholder, so stored templates must shed both.
 *
 * - A template still equal to the shipped default was never customized: it
 *   becomes `''`, which the form renders as the example placeholder.
 * - A customized template keeps its scene text, minus the "Pets that may
 *   appear here" block, any stray placeholder token, and the meta-header if
 *   the user kept it.
 *
 * The old default is spelled out below rather than imported: a migration is
 * frozen in time, and this is what the app shipped when these rows were
 * written.
 *
 * Idempotent: every rewrite is a fixed point — a cleaned template contains
 * none of the stripped markers, so a re-run writes back what it read.
 *
 * `down` is a no-op. The stripped text was boilerplate the app itself used to
 * insert; nothing user-authored is lost, and the old code that needed the
 * token is gone.
 */

const OLD_DEFAULT_TEMPLATE = [
  'Describe what this camera sees, so the model can tell the animals apart from',
  'the surroundings. For example:',
  '',
  'This camera watches a pet water fountain in a hallway. The fountain is a',
  'white cylinder standing on tiled floor. It is equipment and is always in',
  'frame — it is never itself a cause, and it is not a robot vacuum.',
  '',
  'Pets that may appear here:',
  '{{reference_images}}',
].join('\n');

const META_HEADER = [
  'Describe what this camera sees, so the model can tell the animals apart from',
  'the surroundings. For example:',
].join('\n');

export function sceneOnlyTemplate(template: string): string {
  if (template === OLD_DEFAULT_TEMPLATE) return '';

  let scene = template;
  if (scene.startsWith(META_HEADER)) {
    scene = scene.slice(META_HEADER.length);
  }
  scene = scene
    .replace(/\n*Pets that may appear here:\s*\n\{\{reference_images\}\}/g, '')
    .replace(/\{\{reference_images\}\}/g, '');
  return scene.trim();
}

export async function up(db: Kysely<Record<string, never>>): Promise<void> {
  const { rows } = await sql<{ device_id: number; config: unknown }>`
    SELECT device_id, config FROM device_recognition
  `.execute(db);

  for (const row of rows) {
    const config =
      typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    if (config === null || typeof config !== 'object') continue;
    const record = config as Record<string, unknown>;
    if (typeof record.prompt_template !== 'string') continue;

    const scene = sceneOnlyTemplate(record.prompt_template);
    if (scene === record.prompt_template) continue;

    const nextConfig = JSON.stringify({ ...record, prompt_template: scene });
    await sql`
      UPDATE device_recognition SET config = ${nextConfig}
      WHERE device_id = ${row.device_id}
    `.execute(db);
  }
}

export async function down(): Promise<void> {}
