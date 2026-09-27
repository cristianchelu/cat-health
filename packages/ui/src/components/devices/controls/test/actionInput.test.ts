import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ActionControl, ControlValueType } from 'shared';
import { actionInput } from '../actionInput';

const action = (args: ActionControl['args']): ActionControl => ({
  key: 'tare',
  label: { i18n: 'devices.controls.actions.tare' },
  args,
  confirm: false,
  available: true,
  group: 'primary',
});

const side: Extract<ControlValueType, { kind: 'enum' }> = {
  kind: 'enum',
  options: [{ value: 'left', label: { text: 'Left' } }],
};

describe('actionInput', () => {
  it('asks for nothing when the action takes no arguments', () => {
    assert.deepEqual(actionInput(action({})), { kind: 'none' });
  });

  it('asks for one choice when the action takes one enum argument', () => {
    assert.deepEqual(actionInput(action({ side })), {
      kind: 'choice',
      arg: 'side',
      options: side.options,
    });
  });

  it('cannot collect a number or more than one argument', () => {
    assert.equal(
      actionInput(action({ grams: { kind: 'number' } })).kind,
      'unsupported',
    );
    assert.equal(
      actionInput(action({ side, other: side })).kind,
      'unsupported',
    );
  });
});
