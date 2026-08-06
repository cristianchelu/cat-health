import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { backState, parseBackState } from '../navigationBack.ts';

describe('backState', () => {
  it('builds location state naming where leave should land', () => {
    assert.deepEqual(backState('/settings/providers/3', 'SurePet'), {
      back: { to: '/settings/providers/3', label: 'SurePet' },
    });
  });
});

describe('parseBackState', () => {
  it('reads a valid back target from location state', () => {
    assert.deepEqual(parseBackState(backState('/devices/7', 'Downstairs')), {
      to: '/devices/7',
      label: 'Downstairs',
    });
  });

  it('rejects missing or malformed state', () => {
    assert.equal(parseBackState(undefined), undefined);
    assert.equal(parseBackState(null), undefined);
    assert.equal(parseBackState({}), undefined);
    assert.equal(parseBackState({ back: { to: '/x' } }), undefined);
    assert.equal(parseBackState({ back: { label: 'X' } }), undefined);
    assert.equal(parseBackState({ back: { to: 1, label: 'X' } }), undefined);
    assert.equal(parseBackState({ back: 'nope' }), undefined);
  });
});
