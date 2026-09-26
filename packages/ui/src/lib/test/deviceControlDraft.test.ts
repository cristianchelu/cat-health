import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { SettingControl } from 'shared';

import { controlDraftBaseline, controlDraftPatch } from '../deviceControlDraft';

const setting = (
  key: `dev:${string}`,
  type: SettingControl['type'],
  value: unknown,
): SettingControl => ({
  key,
  label: { text: key },
  type,
  value,
  presentation: 'setting',
  group: 'config',
});

const settings = [
  setting('dev:number.target', { kind: 'number', min: 0, max: 100 }, 40),
  setting('dev:switch.pump', { kind: 'boolean' }, false),
  setting(
    'dev:select.mode',
    { kind: 'enum', options: [{ value: 'Eco', label: { text: 'Eco' } }] },
    null,
  ),
];

describe('controlDraftPatch', () => {
  const baseline = controlDraftBaseline(settings);

  it('starts every field from what the device last reported', () => {
    assert.deepEqual(baseline, {
      'dev:number.target': '40',
      'dev:switch.pump': false,
      'dev:select.mode': '',
    });
  });

  it('shows a float reading at the precision its step allows', () => {
    const draft = controlDraftBaseline([
      setting('dev:number.scale', { kind: 'number', step: 0.1 }, 0.10000000149),
    ]);
    assert.equal(draft['dev:number.scale'], '0.1');
  });

  it('sends only the fields that changed, as typed values', () => {
    const { patch, invalid } = controlDraftPatch(settings, baseline, {
      ...baseline,
      'dev:number.target': '45.5',
      'dev:switch.pump': true,
    });
    assert.deepEqual(patch, {
      'dev:number.target': 45.5,
      'dev:switch.pump': true,
    });
    assert.deepEqual(invalid, []);
  });

  it('blocks a Save on a number field left empty or unparseable', () => {
    const { patch, invalid } = controlDraftPatch(settings, baseline, {
      ...baseline,
      'dev:number.target': ' ',
    });
    assert.deepEqual(patch, {});
    assert.deepEqual(invalid, ['dev:number.target']);
  });
});
