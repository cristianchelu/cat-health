import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, renderHook, waitFor } from '@testing-library/react';

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
});
