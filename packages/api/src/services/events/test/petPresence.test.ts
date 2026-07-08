import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildToggledPresenceData,
  deriveIsAway,
  isAwayFromPresenceState,
  toPreviousState,
} from '../petPresence.ts';

describe('petPresence helpers', () => {
  it('treats away and outside as away states', () => {
    assert.equal(isAwayFromPresenceState('away'), true);
    assert.equal(isAwayFromPresenceState('outside'), true);
    assert.equal(isAwayFromPresenceState('home'), false);
    assert.equal(isAwayFromPresenceState('unknown'), false);
  });

  it('derives is_away from the latest presence payload', () => {
    assert.equal(deriveIsAway(null), false);
    assert.equal(
      deriveIsAway({
        type: 'pet_presence',
        state: 'outside',
        previous_state: 'home',
      }),
      true,
    );
    assert.equal(
      deriveIsAway({
        type: 'pet_presence',
        state: 'home',
        previous_state: 'away',
      }),
      false,
    );
  });

  it('maps missing presence to unknown previous state', () => {
    assert.equal(toPreviousState(null), 'unknown');
    assert.equal(
      toPreviousState({
        type: 'pet_presence',
        state: 'home',
        previous_state: 'away',
      }),
      'home',
    );
  });

  it('toggles away/outside back to home and home to away', () => {
    assert.deepEqual(
      buildToggledPresenceData({
        type: 'pet_presence',
        state: 'away',
        previous_state: 'home',
      }),
      {
        type: 'pet_presence',
        state: 'home',
        previous_state: 'away',
      },
    );

    assert.deepEqual(
      buildToggledPresenceData({
        type: 'pet_presence',
        state: 'home',
        previous_state: 'unknown',
      }),
      {
        type: 'pet_presence',
        state: 'away',
        previous_state: 'home',
      },
    );
  });

  it('preserves vet/travel/friend context when returning home', () => {
    assert.deepEqual(
      buildToggledPresenceData({
        type: 'pet_presence',
        state: 'outside',
        previous_state: 'home',
        context: 'vet',
      }),
      {
        type: 'pet_presence',
        state: 'home',
        previous_state: 'outside',
        context: 'vet',
      },
    );
  });
});
