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
  it('returns null for connect until a provider is picked', () => {
    // The connect flow's length depends on the provider, so the caller renders
    // no stepper rather than promising a count it may not honour.
    assert.equal(buildWizardPlan('connect', undefined), null);
  });

  it('always plans the same three steps for add-device', () => {
    // The devices flow has a fixed shape whatever the source: a skip-discovery
    // account jumps over step 2 rather than shortening the flow, so the
    // stepper is available from the start and keeps its 1-2-3 orientation.
    const expected = ['pick', 'discover', 'register'];
    assert.deepEqual(stepIds(DISCOVERY_AND_LINKING, 'add-device'), expected);
    assert.deepEqual(stepIds(SKIP_DISCOVERY, 'add-device'), expected);
    assert.deepEqual(
      buildWizardPlan('add-device', undefined)?.steps.map((s) => s.id),
      expected,
    );
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

  it('lands a skipped-discovery registration on step 3, marking step 2 done', () => {
    // Stepper renders everything before currentStep as completed, which is how
    // "1 -> skip 2 -> 3" shows a checked Discover step.
    const plan = buildWizardPlan('add-device', SKIP_DISCOVERY)!;
    assert.equal(
      getVisualStep(plan, {
        step: 'register',
        accountId: 1,
        source: { kind: 'skip-discovery' },
      }),
      3,
    );
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
