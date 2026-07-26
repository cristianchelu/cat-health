import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProviderCapabilities } from 'shared';

import {
  buildWizardPlan,
  getBackTarget,
  getVisualStep,
  sourceKey,
} from '../wizardPlan.ts';

const DISCOVERY_AND_LINKING: ProviderCapabilities = {
  supports_discovery: true,
  supports_pet_linking: true,
  supported_device_types: ['feeder'],
};

const SKIP_DISCOVERY: ProviderCapabilities = {
  skip_discovery: true,
  supported_device_types: ['pet_recognizer'],
};

const DISCOVERY_ONLY: ProviderCapabilities = {
  supports_discovery: true,
  supported_device_types: ['litterbox'],
};

const stepIds = (capabilities: ProviderCapabilities, entry = 'connect') =>
  buildWizardPlan(entry as 'connect' | 'add-device', capabilities)?.steps.map(
    (s) => s.id,
  );

describe('buildWizardPlan', () => {
  it('returns null until the shaping choice is made', () => {
    // The caller renders no stepper at all in this state — the step count is
    // not knowable before a provider or account is picked.
    assert.equal(buildWizardPlan('connect', undefined), null);
    assert.equal(buildWizardPlan('add-device', undefined), null);
  });

  it('plans the full connect flow for a discoverable, linkable provider', () => {
    assert.deepEqual(stepIds(DISCOVERY_AND_LINKING), [
      'pick',
      'connect',
      'discover',
      'link-pets',
    ]);
  });

  it('collapses the connect flow when there is nothing to discover or link', () => {
    assert.deepEqual(stepIds(SKIP_DISCOVERY), ['pick', 'connect']);
  });

  it('omits pet linking when the provider does not support it', () => {
    assert.deepEqual(stepIds(DISCOVERY_ONLY), ['pick', 'connect', 'discover']);
  });

  it('plans the add-device flow', () => {
    assert.deepEqual(stepIds(DISCOVERY_AND_LINKING, 'add-device'), [
      'pick',
      'discover',
      'register',
    ]);
    // A skip_discovery source has nothing to scan.
    assert.deepEqual(stepIds(SKIP_DISCOVERY, 'add-device'), [
      'pick',
      'register',
    ]);
  });

  it('never puts pet linking in the add-device flow', () => {
    assert.ok(
      !stepIds(DISCOVERY_AND_LINKING, 'add-device')?.includes('link-pets'),
    );
  });
});

describe('getVisualStep', () => {
  it('counts the pick as step 1', () => {
    const plan = buildWizardPlan('connect', DISCOVERY_AND_LINKING)!;
    assert.equal(getVisualStep(plan, { step: 'pick' }), 1);
    assert.equal(
      getVisualStep(plan, { step: 'connect', provider: 'surepet' }),
      2,
    );
    assert.equal(getVisualStep(plan, { step: 'discover', accountId: 1 }), 3);
    assert.equal(getVisualStep(plan, { step: 'link-pets', accountId: 1 }), 4);
  });

  it('falls back to the first step for a step outside the plan', () => {
    const plan = buildWizardPlan('connect', SKIP_DISCOVERY)!;
    assert.equal(getVisualStep(plan, { step: 'discover', accountId: 1 }), 1);
  });
});

describe('getBackTarget', () => {
  const plan = buildWizardPlan('add-device', DISCOVERY_ONLY)!;

  it('exits from the first step', () => {
    assert.equal(getBackTarget(plan, { step: 'pick' }), 'exit');
    assert.equal(getBackTarget(null, { step: 'pick' }), 'exit');
  });

  it('steps back through the plan', () => {
    assert.deepEqual(getBackTarget(plan, { step: 'discover', accountId: 3 }), {
      step: 'pick',
    });
  });

  it('skips discovery when the source never passed through it', () => {
    // Landing on a step the user never saw would be disorienting, and for a
    // skip_discovery provider discovery would fail outright.
    assert.deepEqual(
      getBackTarget(plan, {
        step: 'register',
        accountId: 3,
        source: { kind: 'skip-discovery' },
      }),
      { step: 'pick' },
    );
  });

  it('returns to discovery from a discovered registration', () => {
    assert.deepEqual(
      getBackTarget(plan, {
        step: 'register',
        accountId: 3,
        source: {
          kind: 'discovery',
          device: {
            externalId: 'abc',
            name: 'Feeder',
            type: 'feeder',
            config: {},
          },
        },
      }),
      { step: 'discover', accountId: 3 },
    );
  });
});

describe('sourceKey', () => {
  it('distinguishes discovered devices from each other and from direct entry', () => {
    const keys = new Set([
      sourceKey({ kind: 'direct' }),
      sourceKey({ kind: 'skip-discovery' }),
      sourceKey({
        kind: 'discovery',
        device: { externalId: 'a', name: 'A', type: 'feeder', config: {} },
      }),
      sourceKey({
        kind: 'discovery',
        device: { externalId: 'b', name: 'B', type: 'feeder', config: {} },
      }),
    ]);
    assert.equal(keys.size, 4);
  });
});
