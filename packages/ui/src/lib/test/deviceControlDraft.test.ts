import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FoodValueType, SettingControl } from 'shared';

import {
  controlDraftBaseline,
  controlDraftPatch,
  resizeCompartments,
  type CompartmentsDraft,
} from '../deviceControlDraft';

const setting = (
  key: `dev:${string}`,
  type: SettingControl['type'],
  value: unknown,
): SettingControl => ({
  key,
  label: { text: key },
  type,
  value,
  placement: 'setting',
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

describe('compartments drafts', () => {
  const portion = { kind: 'number', min: 0, max: 100, unit: 'g' } as const;
  const food: FoodValueType = { kind: 'food', groups: ['wet', 'dry'] };
  const bowls = setting(
    'dev:compartments.bowls',
    {
      kind: 'compartments',
      layouts: [
        {
          value: 'single',
          label: { text: 'One' },
          compartments: [{ text: 'Bowl' }],
          fields: {
            food: { label: { text: 'Food' }, type: food },
            portion: { label: { text: 'Portion' }, type: portion },
          },
        },
        {
          value: 'split',
          label: { text: 'Two' },
          compartments: [{ text: 'Left' }, { text: 'Right' }],
          fields: {
            food: { label: { text: 'Food' }, type: food },
            portion: { label: { text: 'Portion' }, type: portion },
          },
        },
      ],
    },
    { layout: 'single', compartments: [{ food: 3, portion: 40 }] },
  );
  const type = bowls.type.kind === 'compartments' ? bowls.type : null;

  it('keeps a compartment through a layout change and adds a blank one', () => {
    const [draft] = Object.values(controlDraftBaseline([bowls]));
    assert.ok(type);
    const split = resizeCompartments(type, draft as CompartmentsDraft, 'split');
    assert.deepEqual(split, {
      layout: 'split',
      compartments: [
        { food: 3, portion: '40' },
        { food: null, portion: '' },
      ],
    });
  });

  it('holds back a layout whose portion is left empty', () => {
    const baseline = controlDraftBaseline([bowls]);
    assert.ok(type);
    const split = resizeCompartments(
      type,
      baseline['dev:compartments.bowls'] as CompartmentsDraft,
      'split',
    );
    const { patch, invalid } = controlDraftPatch([bowls], baseline, {
      'dev:compartments.bowls': split,
    });
    assert.deepEqual(patch, {});
    assert.deepEqual(invalid, ['dev:compartments.bowls']);
  });
});

describe('identities drafts', () => {
  const pets = setting(
    'dev:pets.served',
    {
      kind: 'identities',
      options: [
        { id: 'a', label: 'A', pet_id: 1 },
        { id: 'b', label: 'B', pet_id: null },
      ],
    },
    ['b', 'a'],
  );

  it('starts from the reported identities in a fixed order', () => {
    assert.deepEqual(controlDraftBaseline([pets]), {
      'dev:pets.served': ['a', 'b'],
    });
  });

  it('sends the chosen identities in a fixed order and skips an unchanged set', () => {
    const baseline = controlDraftBaseline([pets]);
    assert.deepEqual(
      controlDraftPatch([pets], baseline, { 'dev:pets.served': ['a', 'b'] }),
      { patch: {}, invalid: [] },
    );
    assert.deepEqual(
      controlDraftPatch([pets], baseline, { 'dev:pets.served': ['b'] }).patch,
      { 'dev:pets.served': ['b'] },
    );
  });
});
