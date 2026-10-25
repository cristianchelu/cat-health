import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isAttributionCandidate,
  isProfileClosed,
  toPreviousState,
} from '../petPresence.ts';
import type { PetPresenceEventData } from '../../../domain/events.ts';

const presence = (
  state: PetPresenceEventData['state'],
  context?: PetPresenceEventData['context'],
): PetPresenceEventData => ({
  type: 'pet_presence',
  state,
  ...(context ? { context } : {}),
});

describe('petPresence helpers', () => {
  it('reads a profile as closed only after a close', () => {
    assert.equal(isProfileClosed(null), false);
    assert.equal(isProfileClosed(presence('away', 'vet')), false);
    assert.equal(isProfileClosed(presence('home', 'profile_reopened')), false);
    assert.equal(isProfileClosed(presence('away', 'profile_closed')), true);
  });

  it('drops away pets from attribution and keeps outside and home ones', () => {
    assert.equal(isAttributionCandidate(null), true);
    assert.equal(isAttributionCandidate(presence('home')), true);
    assert.equal(isAttributionCandidate(presence('outside')), true);
    assert.equal(isAttributionCandidate(presence('away', 'vet')), false);
    assert.equal(isAttributionCandidate(presence('away', 'friend')), false);
    assert.equal(
      isAttributionCandidate(presence('away', 'profile_closed')),
      false,
    );
    assert.equal(
      isAttributionCandidate(presence('home', 'profile_reopened')),
      true,
    );
  });

  it('maps missing presence to unknown previous state', () => {
    assert.equal(toPreviousState(null), 'unknown');
    assert.equal(toPreviousState(presence('home')), 'home');
  });
});
