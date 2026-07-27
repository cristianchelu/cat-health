import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as React from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';

import { useDraftForm } from '../useDraftForm.ts';

describe('useDraftForm', () => {
  it('tracks dirty state and resets to baseline', () => {
    const { result } = renderHook(() =>
      useDraftForm({ name: 'Mochi' }, { baselineKey: '1' }),
    );

    assert.equal(result.current.isDirty, false);

    act(() => {
      result.current.patchDraft({ name: 'Luna' });
    });
    assert.equal(result.current.isDirty, true);
    assert.equal(result.current.draft.name, 'Luna');

    act(() => {
      result.current.reset();
    });
    assert.equal(result.current.isDirty, false);
    assert.equal(result.current.draft.name, 'Mochi');
  });

  it('resyncs draft when baselineKey changes', async () => {
    const { result, rerender } = renderHook(
      ({ baseline, baselineKey }) => useDraftForm(baseline, { baselineKey }),
      {
        initialProps: {
          baseline: { name: 'Mochi' },
          baselineKey: 'v1',
        },
      },
    );

    act(() => {
      result.current.patchDraft({ name: 'edited' });
    });
    assert.equal(result.current.isDirty, true);

    rerender({ baseline: { name: 'Server' }, baselineKey: 'v2' });

    await waitFor(() => {
      assert.equal(result.current.draft.name, 'Server');
      assert.equal(result.current.isDirty, false);
    });
  });

  it('requestDiscard proceeds immediately when clean', () => {
    const { result } = renderHook(() =>
      useDraftForm({ name: 'Mochi' }, { baselineKey: '1' }),
    );
    let proceeded = false;

    act(() => {
      result.current.requestDiscard(() => {
        proceeded = true;
      });
    });

    assert.equal(proceeded, true);
    assert.equal(result.current.discardConfirm.open, false);
  });

  it('requestDiscard confirms then resets and proceeds when dirty', () => {
    const { result } = renderHook(() =>
      useDraftForm({ name: 'Mochi' }, { baselineKey: '1' }),
    );
    let proceeded = false;

    act(() => {
      result.current.patchDraft({ name: 'Luna' });
    });
    act(() => {
      result.current.requestDiscard(() => {
        proceeded = true;
      });
    });

    assert.equal(result.current.discardConfirm.open, true);
    assert.equal(proceeded, false);

    act(() => {
      result.current.discardConfirm.onConfirm();
    });

    assert.equal(proceeded, true);
    assert.equal(result.current.discardConfirm.open, false);
    assert.equal(result.current.draft.name, 'Mochi');
    assert.equal(result.current.isDirty, false);
  });

  it('requestDiscard cancel keeps draft and does not proceed', () => {
    const { result } = renderHook(() =>
      useDraftForm({ name: 'Mochi' }, { baselineKey: '1' }),
    );
    let proceeded = false;

    act(() => {
      result.current.patchDraft({ name: 'Luna' });
    });
    act(() => {
      result.current.requestDiscard(() => {
        proceeded = true;
      });
    });
    act(() => {
      result.current.discardConfirm.onCancel();
    });

    assert.equal(proceeded, false);
    assert.equal(result.current.discardConfirm.open, false);
    assert.equal(result.current.draft.name, 'Luna');
    assert.equal(result.current.isDirty, true);
  });

  it('requestReset is a no-op when clean and confirms when dirty', () => {
    const { result } = renderHook(() =>
      useDraftForm({ name: 'Mochi' }, { baselineKey: '1' }),
    );

    act(() => {
      result.current.requestReset();
    });
    assert.equal(result.current.discardConfirm.open, false);

    act(() => {
      result.current.patchDraft({ name: 'Luna' });
    });
    act(() => {
      result.current.requestReset();
    });
    assert.equal(result.current.discardConfirm.open, true);

    act(() => {
      result.current.discardConfirm.onConfirm();
    });
    assert.equal(result.current.draft.name, 'Mochi');
    assert.equal(result.current.isDirty, false);
  });

  it('never commits a dirty render when only the baseline changed', () => {
    const committed: boolean[] = [];

    function Probe({
      baseline,
      baselineKey,
    }: {
      baseline: { gap: string };
      baselineKey: string;
    }) {
      const { isDirty } = useDraftForm(baseline, { baselineKey });
      // Recorded from an effect so only *committed* renders count — a render
      // React throws away cannot arm the navigation guard.
      React.useEffect(() => {
        committed.push(isDirty);
      });
      return null;
    }

    const { rerender } = render(
      <Probe baseline={{ gap: '' }} baselineKey="loading" />,
    );
    committed.length = 0;

    // Query resolves: the untouched form must never read as dirty.
    rerender(<Probe baseline={{ gap: '30' }} baselineKey="30" />);

    assert.deepEqual(committed, [false]);
  });

  it('commit holds dirty false until the server baseline catches up', () => {
    const { result, rerender } = renderHook(
      ({ baseline, baselineKey }) => useDraftForm(baseline, { baselineKey }),
      { initialProps: { baseline: { gap: '30' }, baselineKey: '30' } },
    );

    act(() => {
      result.current.patchDraft({ gap: '45' });
    });
    assert.equal(result.current.isDirty, true);

    // Saved, but the query still serves the old value.
    act(() => {
      result.current.commit();
    });
    assert.equal(result.current.isDirty, false);
    assert.equal(result.current.draft.gap, '45');

    rerender({ baseline: { gap: '30' }, baselineKey: '30' });
    assert.equal(result.current.isDirty, false);

    // Refetch lands with the saved value; the commit is superseded.
    rerender({ baseline: { gap: '45' }, baselineKey: '45' });
    assert.equal(result.current.isDirty, false);
    assert.equal(result.current.draft.gap, '45');
  });
});
