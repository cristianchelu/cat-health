import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDeviceConfigModule } from '../deviceConfigRegistry.ts';
import { DEFAULT_MODEL } from '../inference/inferenceDeviceConfig.ts';

describe('device config registry', () => {
  it('resolves providers that have device settings', () => {
    for (const provider of ['camera', 'inference', 'thingino']) {
      assert.ok(getDeviceConfigModule(provider).Fields);
      assert.notEqual(
        getDeviceConfigModule(provider),
        getDeviceConfigModule('esphome'),
      );
    }
  });

  it('falls back to the generic module for everything else', () => {
    const generic = getDeviceConfigModule('esphome');
    for (const provider of ['esphome', 'surepet', 'unknown', '']) {
      assert.equal(getDeviceConfigModule(provider), generic);
    }
  });

  it('gives the generic module a config that owns nothing', () => {
    const generic = getDeviceConfigModule('esphome');
    assert.deepEqual(generic.defaultConfigValues, {});
    assert.deepEqual(generic.toFormValues({ host: '10.0.0.5' }), {});
    assert.deepEqual(
      generic.toConfig({ anything: 'here' }, { host: '10.0.0.5' }),
      {
        host: '10.0.0.5',
      },
    );
  });

  it('round-trips thingino origin and token and drops the SSH leftovers', () => {
    const module = getDeviceConfigModule('thingino');
    const values = module.toFormValues({
      origin: 'http://littercam.local',
      token: 'key',
      recording: { remotePath: '/mnt/sd' },
      snapshotUrl: 'http://old/snapshot.jpg',
    });
    assert.deepEqual(values, {
      origin: 'http://littercam.local',
      token: 'key',
    });
    assert.deepEqual(
      module.toConfig(
        { origin: '  http://littercam.local  ', token: '  key  ' },
        {
          origin: 'http://old.local',
          token: 'old',
          recording: { remotePath: '/mnt/sd' },
          snapshotUrl: 'http://old/snapshot.jpg',
          visit_annotation_enabled: true,
        },
      ),
      { origin: 'http://littercam.local', token: 'key' },
    );
  });

  it('trims the generic camera snapshot URL', () => {
    const module = getDeviceConfigModule('camera');
    assert.deepEqual(
      module.toConfig({ snapshotUrl: '  http://cam/snap.jpg  ' }, {}),
      { snapshotUrl: 'http://cam/snap.jpg' },
    );
  });

  it('keeps recognizer reference images across a settings save', () => {
    const module = getDeviceConfigModule('inference');
    const next = module.toConfig(
      {
        source_device_id: '4',
        model: DEFAULT_MODEL,
        prompt_template: 'the hallway',
        auto_identify: true,
      },
      { reference_images: { 1: 'a.jpg' }, visit_annotation_enabled: true },
    );
    assert.deepEqual(next.reference_images, { 1: 'a.jpg' });
    assert.equal(next.source_device_id, 4);
    assert.equal(next.visit_annotation_enabled, undefined);
  });

  it('opens devices that predate config validation', () => {
    const thingino = getDeviceConfigModule('thingino');
    assert.deepEqual(thingino.toFormValues({ origin: 'http://cam.local' }), {
      origin: 'http://cam.local',
      token: '',
    });
  });

  it('tolerates junk config for every module', () => {
    for (const provider of ['camera', 'inference', 'thingino', 'esphome']) {
      const module = getDeviceConfigModule(provider);
      for (const junk of [null, undefined, 42, [], 'nope']) {
        assert.doesNotThrow(() => module.toFormValues(junk));
      }
    }
  });
});
