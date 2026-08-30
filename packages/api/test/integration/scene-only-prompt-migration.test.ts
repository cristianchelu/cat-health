import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  sceneOnlyTemplate,
  up,
} from '../../src/database/migrations/202608311200_scene_only_prompt_template.ts';
import {
  insertDevice,
  insertDeviceRecognition,
  insertProviderAccount,
} from '../helpers/fixtures.ts';
import {
  createTestDb,
  destroyTestDb,
  type TestDbContext,
} from '../helpers/testDb.ts';

const OLD_DEFAULT = [
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

describe('sceneOnlyTemplate', () => {
  it('empties a template the user never customized', () => {
    assert.equal(sceneOnlyTemplate(OLD_DEFAULT), '');
  });

  it('keeps a customized scene, minus the pets block', () => {
    const customized = [
      'This camera watches the litter tray in the bathroom.',
      '',
      'Pets that may appear here:',
      '{{reference_images}}',
    ].join('\n');
    assert.equal(
      sceneOnlyTemplate(customized),
      'This camera watches the litter tray in the bathroom.',
    );
  });

  it('sheds the meta-header a user kept above their own scene', () => {
    const kept = [
      'Describe what this camera sees, so the model can tell the animals apart from',
      'the surroundings. For example:',
      '',
      'My garden camera, pointed at the bird feeder.',
      '{{reference_images}}',
    ].join('\n');
    assert.equal(
      sceneOnlyTemplate(kept),
      'My garden camera, pointed at the bird feeder.',
    );
  });

  it('is a fixed point on an already-clean scene', () => {
    const scene = 'the hallway fountain';
    assert.equal(sceneOnlyTemplate(scene), scene);
    assert.equal(sceneOnlyTemplate(''), '');
  });
});

describe('202608311200 scene-only prompt template', () => {
  let ctx: TestDbContext;
  let deviceId: number;

  before(async () => {
    ctx = await createTestDb();
    const account = await insertProviderAccount(ctx.db, {
      provider: 'inference',
      name: 'OpenRouter',
      config: { api_key: 'k', base_url: 'http://inference.local' },
    });
    const fountain = await insertDevice(ctx.db, {
      provider_account_id: account.id,
      name: 'Hall fountain',
      type: 'water_fountain',
      external_id: 'wf-scene-1',
    });
    deviceId = fountain.id;
    await insertDeviceRecognition(ctx.db, fountain.id, account.id, {
      prompt_template: OLD_DEFAULT,
      reference_images: { '1': [10] },
    });
  });

  after(async () => {
    await destroyTestDb(ctx);
  });

  const readTemplate = async () => {
    const row = await ctx.db
      .selectFrom('device_recognition')
      .select('config')
      .where('device_id', '=', deviceId)
      .executeTakeFirstOrThrow();
    const config =
      typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
    return config as { prompt_template: string; reference_images: unknown };
  };

  it('rewrites stored templates and touches nothing else', async () => {
    // createTestDb migrates an empty database, so the row seeded above never
    // passed through the migration; running `up` again is the real exercise —
    // and legal, since every rewrite is a fixed point.
    await up(ctx.db as never);

    const config = await readTemplate();
    assert.equal(config.prompt_template, '');
    assert.deepEqual(config.reference_images, { '1': [10] });

    await up(ctx.db as never);
    assert.equal((await readTemplate()).prompt_template, '');
  });
});
