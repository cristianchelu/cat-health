import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ProviderAccountDTO,
  ProviderCapabilities,
  ProviderInfoDTO,
} from 'shared';

import {
  buildWizardPlan,
  getBackTarget,
  getBackTargetLabelKey,
  getVisualStep,
  initialAddDeviceState,
  planHasStep,
  sourceKey,
  stepAfterAccountPick,
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

/** Nothing to discover, but pets still need mapping. */
const LINKING_ONLY: ProviderCapabilities = {
  skip_discovery: true,
  supports_pet_linking: true,
  supported_device_types: ['feeder'],
};

/** Declares no discovery capability at all — not the same as opting out of it. */
const NO_CAPABILITY_FLAGS: ProviderCapabilities = {
  supported_device_types: ['camera'],
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

  it('plans linking without discovery', () => {
    // The combination the plan claims to handle: nothing to import, but pets
    // still have to be mapped. Previously the stepper promised the step and
    // navigation jumped straight past it to the account page.
    assert.deepEqual(stepIds(LINKING_ONLY), ['pick', 'connect', 'link-pets']);
  });

  it('does not offer discovery to a provider that never claimed it', () => {
    // `!skip_discovery` used to be treated as "can discover", which stranded the
    // user on an empty result with no way forward in the add-device entry.
    assert.deepEqual(stepIds(NO_CAPABILITY_FLAGS), ['pick', 'connect']);
  });
});

describe('planHasStep', () => {
  it('reports what the stepper actually promised', () => {
    const linkingOnly = buildWizardPlan('connect', LINKING_ONLY)!;
    assert.equal(planHasStep(linkingOnly, 'discover'), false);
    assert.equal(planHasStep(linkingOnly, 'link-pets'), true);
    assert.equal(planHasStep(null, 'discover'), false);
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

  it('holds a connect-flow registration at discovery instead of jumping to step 1', () => {
    // `register` is a detour off discovery for providers that register one
    // device at a time, and is never a planned connect step. Reporting it as
    // step 1 made the stepper jump backwards in the middle of the flow.
    const plan = buildWizardPlan('connect', DISCOVERY_AND_LINKING)!;
    assert.equal(
      getVisualStep(plan, {
        step: 'register',
        accountId: 1,
        source: { kind: 'direct' },
      }),
      3,
    );
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

  it('exits rather than returning to the picker once the account exists', () => {
    // The account was created on the connect step and there is no DELETE for
    // provider accounts. Going back to `pick` let the user submit the credential
    // form again, leaving a second identical account that could never be removed.
    const connectPlan = buildWizardPlan('connect', DISCOVERY_AND_LINKING)!;
    assert.equal(
      getBackTarget(connectPlan, { step: 'discover', accountId: 7 }),
      'exit',
    );
  });

  it('steps back from linking to discovery, carrying the account', () => {
    const connectPlan = buildWizardPlan('connect', DISCOVERY_AND_LINKING)!;
    assert.deepEqual(
      getBackTarget(connectPlan, { step: 'link-pets', accountId: 7 }),
      { step: 'discover', accountId: 7 },
    );
  });

  it('exits from linking when the flow had no discovery step', () => {
    const linkingOnly = buildWizardPlan('connect', LINKING_ONLY)!;
    assert.equal(
      getBackTarget(linkingOnly, { step: 'link-pets', accountId: 7 }),
      'exit',
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

describe('getBackTargetLabelKey', () => {
  const plan = buildWizardPlan('add-device', DISCOVERY_ONLY)!;

  it('names the step the control lands on', () => {
    assert.equal(
      getBackTargetLabelKey(plan, { step: 'discover', accountId: 3 }),
      'settings.step_select_account',
    );
  });

  it('has no step to name when back leaves the wizard', () => {
    // The header falls back to the page outside the wizard, which only it knows.
    assert.equal(getBackTargetLabelKey(plan, { step: 'pick' }), null);

    const connectPlan = buildWizardPlan('connect', DISCOVERY_AND_LINKING)!;
    assert.equal(
      getBackTargetLabelKey(connectPlan, { step: 'discover', accountId: 7 }),
      null,
    );
  });
});

const PROVIDERS: ProviderInfoDTO[] = [
  { name: 'surepet', internal: false, capabilities: DISCOVERY_AND_LINKING },
  { name: 'esphome', internal: true, capabilities: SKIP_DISCOVERY },
];

const account = (
  overrides: Partial<ProviderAccountDTO>,
): ProviderAccountDTO => ({
  id: 1,
  provider: 'surepet',
  name: 'Home',
  config: {},
  enabled: true,
  internal: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('stepAfterAccountPick', () => {
  it('sends a discoverable account to discovery', () => {
    assert.deepEqual(stepAfterAccountPick(account({ id: 7 }), PROVIDERS), {
      step: 'discover',
      accountId: 7,
    });
  });

  it('jumps a skip-discovery account straight to registration', () => {
    assert.deepEqual(
      stepAfterAccountPick(
        account({ id: 4, provider: 'esphome', internal: true }),
        PROVIDERS,
      ),
      { step: 'register', accountId: 4, source: { kind: 'skip-discovery' } },
    );
  });

  it('does not claim skip-discovery for an unregistered provider', () => {
    // An absent provider has not declared `skip_discovery`, so this keeps the
    // planned three steps rather than inventing a jump over the middle one.
    // Callers are expected to filter these out first — `initialAddDeviceState`
    // does, and the picker only offers registered providers.
    assert.deepEqual(
      stepAfterAccountPick(account({ id: 9, provider: 'ghost' }), PROVIDERS),
      { step: 'discover', accountId: 9 },
    );
  });
});

describe('initialAddDeviceState', () => {
  const accounts = [
    account({ id: 1 }),
    account({ id: 2, provider: 'esphome', internal: true }),
    account({ id: 3, enabled: false }),
    account({ id: 4, provider: 'legacy' }),
  ];

  it('opens on the picker when no account was named', () => {
    assert.deepEqual(initialAddDeviceState(null, accounts, PROVIDERS), {
      step: 'pick',
    });
  });

  it('skips the picker for the account the link came from', () => {
    assert.deepEqual(initialAddDeviceState(1, accounts, PROVIDERS), {
      step: 'discover',
      accountId: 1,
    });
    assert.deepEqual(initialAddDeviceState(2, accounts, PROVIDERS), {
      step: 'register',
      accountId: 2,
      source: { kind: 'skip-discovery' },
    });
  });

  it('falls back to the picker for an account it must not honour', () => {
    // Each of these would strand the user on a step that can never resolve:
    // an id that matches nothing, a switched-off account, and an account
    // whose provider has no manager behind it.
    const rejected = { step: 'pick' };
    assert.deepEqual(initialAddDeviceState(99, accounts, PROVIDERS), rejected);
    assert.deepEqual(initialAddDeviceState(3, accounts, PROVIDERS), rejected);
    assert.deepEqual(initialAddDeviceState(4, accounts, PROVIDERS), rejected);
  });

  it('falls back to the picker before the lists have loaded', () => {
    assert.deepEqual(initialAddDeviceState(1, [], []), { step: 'pick' });
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
