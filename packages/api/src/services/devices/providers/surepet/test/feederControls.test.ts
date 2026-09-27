import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProviderPetLink } from 'shared';

import { ControlRequestStatus, TagRequestAction } from '../constants.ts';
import {
  createFeederControlSurface,
  type FoodGroup,
  type SurePetControlWriter,
} from '../feederControls.ts';
import type {
  SurePetCloudPet,
  SurePetControlRequest,
  SurePetControlWrite,
  SurePetDeviceControlPayload,
  SurePetDeviceTag,
  SurePetTagWrite,
} from '../types.ts';

const FAST = { intervalMs: 1, timeoutMs: 200, learnTimeoutMs: 200 };

/**
 * A feeder whose cloud answers each write from `answer`, and whose status
 * queue is whatever `queue` holds when polled.
 */
function makeFeeder(
  control: SurePetDeviceControlPayload,
  answer: SurePetControlRequest | null,
  options: {
    config?: unknown;
    foods?: Record<number, FoodGroup>;
    /** Mutable: a learn test adds a tag while the feeder waits. */
    tags?: SurePetDeviceTag[];
    petLinks?: ProviderPetLink[];
    householdPets?: SurePetCloudPet[];
    /** What a re-read of the device finds, as the feeder applies a write. */
    onRefresh?: () => void;
  } = {},
) {
  const puts: SurePetControlWrite[] = [];
  const tagPuts: SurePetTagWrite[] = [];
  const saved: unknown[] = [];
  let refreshes = 0;
  const queue: SurePetControlRequest[] = [];
  const writer: SurePetControlWriter = {
    put: async (write) => {
      puts.push(write);
      return { request: answer, body: {} };
    },
    putTag: async (write) => {
      tagPuts.push(write);
      return { request: answer, body: {} };
    },
    tags: async () => [...(options.tags ?? [])],
    petLinks: () => options.petLinks ?? [],
    householdPets: () => options.householdPets ?? [],
    status: async () => [...queue],
    refresh: async () => {
      refreshes += 1;
      options.onRefresh?.();
    },
    foodGroups: async (ids) =>
      new Map(ids.map((id) => [id, options.foods?.[id] ?? 'unknown'])),
    saveFoodCompartments: async (rows) => {
      saved.push(rows);
    },
  };
  const surface = createFeederControlSurface(
    () => ({
      control,
      tags: options.tags ?? [],
      config: options.config ?? {},
      petLinks: options.petLinks ?? [],
      householdPets: options.householdPets ?? [],
    }),
    writer,
    FAST,
  );
  return { surface, puts, tagPuts, saved, queue, refreshes: () => refreshes };
}

const setDelay = (value: string) =>
  ({ kind: 'setting', key: 'lid_close_delay', value }) as const;

describe('SureFeed controls', () => {
  it('reads the lid close delay as a named speed', () => {
    const { surface } = makeFeeder({ lid: { close_delay: 4 } }, null);
    assert.equal(surface.readSettings().get('lid_close_delay'), 'normal');
  });

  it('reads an unrecognised delay as unknown rather than guessing', () => {
    const { surface } = makeFeeder({ lid: { close_delay: 7 } }, null);
    assert.equal(surface.readSettings().get('lid_close_delay'), null);
  });

  it('sends the whole lid object with only the delay changed', async () => {
    const lid = { close_delay: 4, some_other_field: 1 } as never;
    const { surface, puts } = makeFeeder(
      { lid },
      { request_id: 'r1', status_id: ControlRequestStatus.SUCCESS },
    );

    await surface.submit(setDelay('slow'));

    assert.deepEqual(puts, [{ lid: { close_delay: 20, some_other_field: 1 } }]);
  });

  it('counts a write the cloud already applied as applied', async () => {
    const { surface, refreshes } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 'r1', status_id: ControlRequestStatus.NO_CHANGE },
    );

    assert.deepEqual(await surface.submit(setDelay('normal')), {
      status: 'applied',
    });
    assert.equal(refreshes(), 1);
  });

  it('follows a pending write until it leaves the queue', async () => {
    const { surface, queue, refreshes } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 42, status_id: ControlRequestStatus.PENDING },
    );
    queue.push({ request_id: 42, status: ControlRequestStatus.PENDING });

    const submission = await surface.submit(setDelay('fast'));
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    queue.length = 0;

    assert.deepEqual(await settled, { status: 'applied' });
    assert.equal(refreshes(), 1);
  });

  it('confirms a write the cloud named no request for by reading it back', async () => {
    const control: SurePetDeviceControlPayload = { lid: { close_delay: 4 } };
    const { surface } = makeFeeder(control, null, {
      onRefresh: () => {
        control.lid = { close_delay: 20 };
      },
    });

    const submission = await surface.submit(setDelay('slow'));
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    assert.deepEqual(await submission.settle(new AbortController().signal), {
      status: 'applied',
    });
  });

  it('times out a reply-less write the feeder never shows', async () => {
    const { surface } = makeFeeder({ lid: { close_delay: 4 } }, null);

    const submission = await surface.submit(setDelay('slow'));
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : null;

    assert.deepEqual(settlement, { status: 'failed', reason: 'timeout' });
  });

  it('follows a request whose status the cloud left out', async () => {
    const { surface, queue } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 'r3' },
    );
    queue.push({ request_id: 'r3' });

    const submission = await surface.submit(setDelay('fast'));
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    assert.deepEqual(await submission.settle(new AbortController().signal), {
      status: 'failed',
      reason: 'timeout',
    });
  });

  it('reports a request the feeder never picked up as a timeout', async () => {
    const { surface, queue } = makeFeeder(
      { lid: { close_delay: 4 } },
      { request_id: 'r9', status_id: ControlRequestStatus.PENDING },
    );
    queue.push({
      request_id: 'r9',
      status_id: ControlRequestStatus.DEVICE_TIMEOUT,
    });

    const submission = await surface.submit(setDelay('fast'));
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : null;

    assert.deepEqual(settlement, { status: 'failed', reason: 'timeout' });
  });
});

describe('SureFeed bowls', () => {
  const FOODS: Record<number, FoodGroup> = { 1: 'wet', 2: 'dry', 3: 'treat' };
  const split = {
    type: 4,
    settings: [
      { food_type: 1, target: 40 },
      { food_type: 2, target: 25 },
    ],
  };
  const setBowls = (value: unknown) =>
    ({ kind: 'setting', key: 'bowls', value }) as const;

  it('reads the layout, each bowl food from our record, and its portion', () => {
    const { surface } = makeFeeder({ bowls: split }, null, {
      config: {
        food_compartments: [
          { compartment: '0', food_id: 1 },
          { compartment: '1', food_id: 2 },
        ],
      },
    });

    assert.deepEqual(surface.readSettings().get('bowls'), {
      layout: 'split',
      compartments: [
        { food: 1, portion: 40 },
        { food: 2, portion: 25 },
      ],
    });
  });

  it('refuses a bowl without food and a portion under ten grams', () => {
    const { surface } = makeFeeder({ bowls: split }, null);
    const noFood = {
      layout: 'single',
      compartments: [{ food: null, portion: 30 }],
    };
    const tiny = { layout: 'single', compartments: [{ food: 2, portion: 5 }] };

    assert.ok(surface.validate(setBowls(noFood)));
    assert.ok(surface.validate(setBowls(tiny)));
    assert.equal(
      surface.validate(
        setBowls({ layout: 'single', compartments: [{ food: 2, portion: 0 }] }),
      ),
      null,
    );
  });

  it('sets the feeder first and records the foods only once it confirms', async () => {
    const { surface, puts, saved, queue } = makeFeeder(
      { bowls: { type: 1, settings: [{ food_type: 2, target: 60 }] } },
      { request_id: 7, status_id: ControlRequestStatus.PENDING },
      { foods: FOODS },
    );
    queue.push({ request_id: 7, status_id: ControlRequestStatus.PENDING });

    const submission = await surface.submit(
      setBowls({
        layout: 'split',
        compartments: [
          { food: 1, portion: 40 },
          { food: 2, portion: 25 },
        ],
      }),
    );

    assert.deepEqual(puts, [{ bowls: split }]);
    assert.deepEqual(saved, []);
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    queue.length = 0;
    assert.deepEqual(await settled, { status: 'applied' });
    assert.deepEqual(saved, [
      [
        { compartment: '0', food_id: 1 },
        { compartment: '1', food_id: 2 },
      ],
    ]);
  });

  it('only records the foods when the feeder already matches', async () => {
    const { surface, puts, saved } = makeFeeder({ bowls: split }, null, {
      foods: { ...FOODS, 4: 'wet' },
    });

    const submission = await surface.submit(
      setBowls({
        layout: 'split',
        compartments: [
          { food: 4, portion: 40 },
          { food: 2, portion: 25 },
        ],
      }),
    );

    assert.deepEqual(submission, { status: 'applied' });
    assert.deepEqual(puts, []);
    assert.equal(saved.length, 1);
  });

  it('refuses a food that is neither wet nor dry', async () => {
    const { surface, puts } = makeFeeder({ bowls: split }, null, {
      foods: FOODS,
    });

    const submission = await surface.submit(
      setBowls({ layout: 'single', compartments: [{ food: 3, portion: 20 }] }),
    );

    assert.equal(
      submission.status === 'failed' ? submission.reason : submission.status,
      'invalid',
    );
    assert.deepEqual(puts, []);
  });
});

describe('SureFeed tare', () => {
  const tare = (args: Record<string, unknown> = {}) =>
    ({ kind: 'action', key: 'tare', args }) as const;
  const actionOf = (control: SurePetDeviceControlPayload) =>
    makeFeeder(control, null).surface.manifest().actions[0];

  it('offers a side to zero on a split tray and none on a single bowl', () => {
    const split = actionOf({ bowls: { type: 4 } });
    assert.deepEqual(
      split.args.side?.kind === 'enum' &&
        split.args.side.options.map((option) => option.value),
      ['left', 'right', 'both'],
    );
    assert.deepEqual(actionOf({ bowls: { type: 1 } }).args, {});
  });

  it('is unavailable until the feeder reports its layout', () => {
    assert.equal(actionOf({}).available, false);
  });

  it('sends the side as their tare type, and a single bowl as the left', async () => {
    const answer = {
      request_id: 'r1',
      status_id: ControlRequestStatus.SUCCESS,
    };
    const split = makeFeeder({ bowls: { type: 4 } }, answer);
    await split.surface.submit(tare({ side: 'right' }));
    await split.surface.submit(tare({ side: 'both' }));
    const single = makeFeeder({ bowls: { type: 1 } }, answer);
    await single.surface.submit(tare());

    assert.deepEqual(split.puts, [{ tare: 2 }, { tare: 3 }]);
    assert.deepEqual(single.puts, [{ tare: 1 }]);
  });

  it('fails a zero the feeder answers with no change', async () => {
    const { surface, queue } = makeFeeder(
      { bowls: { type: 1 } },
      { request_id: 'r2', status_id: ControlRequestStatus.PENDING },
    );
    queue.push({ request_id: 'r2', status_id: ControlRequestStatus.NO_CHANGE });

    const submission = await surface.submit(tare());
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : submission;

    assert.equal(settlement.status, 'failed');
    assert.equal(
      settlement.status === 'failed' && settlement.reason,
      'rejected',
    );
  });

  it('times out a zero the cloud named no request for, without waiting', async () => {
    const { surface, refreshes } = makeFeeder({ bowls: { type: 1 } }, null);

    const settlement = await surface.submit(tare());

    assert.equal(settlement.status, 'failed');
    assert.equal(
      settlement.status === 'failed' && settlement.reason,
      'timeout',
    );
    assert.equal(refreshes(), 0);
  });
});

describe('SureFeed pets', () => {
  const link = (pet_id: number, tag_id?: number): ProviderPetLink => ({
    external_pet_id: String(pet_id * 100),
    pet_id,
    ...(tag_id === undefined ? {} : { metadata: { tag_id } }),
  });
  // Luna's link names her tag, Jazz's link names only his remote pet, and the
  // household's third "pet" is a spare tag linked to nobody.
  const petLinks = [link(2, 22), link(1)];
  const householdPets: SurePetCloudPet[] = [
    { id: 200, name: 'Luna', tag_id: 22 },
    { id: 100, name: 'Jazzy', tag_id: 11 },
    { id: 300, name: 'Spare tag', tag_id: 99 },
  ];
  const tags = [{ id: 22 }, { id: 99 }];
  const setPets = (value: string[]) =>
    ({ kind: 'setting', key: 'pets', value }) as const;
  const petsType = (surface: { manifest(): { settings: unknown[] } }) =>
    (
      surface
        .manifest()
        .settings.find(
          (setting) => (setting as { key: string }).key === 'pets',
        ) as { type: unknown } | undefined
    )?.type;

  it('offers every household tag, naming the pet each link claims', () => {
    const { surface } = makeFeeder({}, null, {
      petLinks,
      householdPets,
      tags,
    });
    assert.deepEqual(petsType(surface), {
      kind: 'identities',
      options: [
        { id: '22', label: 'Luna', pet_id: 2 },
        { id: '11', label: 'Jazzy', pet_id: 1 },
        { id: '99', label: 'Spare tag', pet_id: null },
      ],
    });
  });

  it('lists a tag the feeder holds that the household does not', () => {
    const { surface } = makeFeeder({}, null, {
      petLinks,
      householdPets,
      tags: [...tags, { id: 7 }],
    });
    const type = petsType(surface) as { options: { id: string }[] };
    assert.deepEqual(type.options.at(-1), {
      id: '7',
      label: 'Tag 7',
      pet_id: null,
    });
  });

  it('reads the assigned tags as identities', () => {
    const { surface } = makeFeeder({}, null, { petLinks, householdPets, tags });
    assert.deepEqual(surface.readSettings().get('pets'), ['22', '99']);
  });

  it('assigns and unassigns by tag, one request each', async () => {
    const { surface, tagPuts } = makeFeeder(
      {},
      { request_id: 'r1', status_id: ControlRequestStatus.SUCCESS },
      { petLinks, householdPets, tags },
    );

    const submission = await surface.submit(setPets(['11', '22']));

    assert.deepEqual(submission, { status: 'applied' });
    assert.deepEqual(tagPuts, [
      { tag_id: 11, request_action: TagRequestAction.ASSIGN },
      { tag_id: 99, request_action: TagRequestAction.UNASSIGN },
    ]);
  });

  it('sends nothing when the feeder already has the chosen identities', async () => {
    const { surface, tagPuts } = makeFeeder({}, null, {
      petLinks,
      householdPets,
      tags,
    });

    assert.deepEqual(await surface.submit(setPets(['99', '22'])), {
      status: 'applied',
    });
    assert.deepEqual(tagPuts, []);
  });

  it('follows a queued tag request and counts no change as applied', async () => {
    const { surface, queue, refreshes } = makeFeeder(
      {},
      { request_id: 5, status_id: ControlRequestStatus.PENDING },
      { petLinks, householdPets, tags },
    );
    queue.push({ request_id: 5, status_id: ControlRequestStatus.NO_CHANGE });

    const submission = await surface.submit(setPets(['11', '22', '99']));
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    assert.deepEqual(await submission.settle(new AbortController().signal), {
      status: 'applied',
    });
    assert.equal(refreshes(), 1);
  });

  it('fails a tag write the cloud queued no request for', async () => {
    const { surface } = makeFeeder({}, null, { petLinks, householdPets, tags });

    const submission = await surface.submit(setPets(['11', '22', '99']));

    assert.equal(submission.status, 'failed');
    assert.equal(
      submission.status === 'failed' && submission.reason,
      'timeout',
    );
  });
});

describe('SureFeed learn a pet', () => {
  const present = () =>
    ({
      kind: 'procedure',
      key: 'learn_pet',
      step: 'present',
      inputs: {},
    }) as const;

  it('is offered as one step with nothing to enter', () => {
    const { surface } = makeFeeder({}, null);
    const [procedure] = surface.manifest().procedures;
    assert.equal(procedure?.key, 'learn_pet');
    assert.deepEqual(
      procedure?.steps.map((step) => [step.key, step.inputs.length]),
      [['present', 0]],
    );
  });

  it('settles once the feeder lists a tag it did not have', async () => {
    const tags: SurePetDeviceTag[] = [{ id: 22 }];
    const { surface, tagPuts, puts, refreshes } = makeFeeder({}, null, {
      tags,
    });

    const submission = await surface.submit(present());
    assert.equal(submission.status, 'pending');
    if (submission.status !== 'pending') return;

    const settled = submission.settle(new AbortController().signal);
    tags.push({ id: 31 });

    assert.deepEqual(await settled, { status: 'applied' });
    assert.deepEqual([...tagPuts, ...puts], []);
    assert.equal(refreshes(), 1);
  });

  it('times out when no new tag turns up', async () => {
    const { surface } = makeFeeder({}, null, { tags: [{ id: 22 }] });

    const submission = await surface.submit(present());
    const settlement =
      submission.status === 'pending'
        ? await submission.settle(new AbortController().signal)
        : submission;

    assert.equal(settlement.status, 'failed');
    assert.equal(
      settlement.status === 'failed' && settlement.reason,
      'timeout',
    );
  });
});
