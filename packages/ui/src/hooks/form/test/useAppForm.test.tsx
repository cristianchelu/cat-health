import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { act, renderHook } from '@testing-library/react';

import { useAppForm } from '../useAppForm.ts';

describe('useAppForm', () => {
  it('requestDiscard resets to server values, not defaultValues', () => {
    const { result } = renderHook(() =>
      useAppForm({
        defaultValues: { name: 'Stale default' },
        values: { name: 'Server' },
      }),
    );
    let proceeded = false;

    act(() => {
      result.current.setValue('name', 'Edited', { shouldDirty: true });
    });
    assert.equal(result.current.getValues('name'), 'Edited');

    act(() => {
      result.current.requestDiscard(() => {
        proceeded = true;
      });
    });
    act(() => {
      result.current.discardConfirm.onConfirm();
    });

    assert.equal(proceeded, true);
    assert.equal(result.current.getValues('name'), 'Server');
    assert.equal(result.current.formState.isDirty, false);
  });

  it('requestDiscard uses the latest server values after a refresh', () => {
    const { result, rerender } = renderHook(
      ({ values }) =>
        useAppForm({
          defaultValues: { name: 'Stale default' },
          values,
        }),
      { initialProps: { values: { name: 'Server v1' } } },
    );

    rerender({ values: { name: 'Server v2' } });

    act(() => {
      result.current.setValue('name', 'Edited', { shouldDirty: true });
    });
    assert.equal(result.current.formState.isDirty, true);

    act(() => {
      result.current.requestDiscard(() => undefined);
    });
    assert.equal(result.current.discardConfirm.open, true);

    act(() => {
      result.current.discardConfirm.onConfirm();
    });

    assert.equal(result.current.getValues('name'), 'Server v2');
    assert.equal(result.current.formState.isDirty, false);
  });

  it('requestDiscard cancel keeps the dirty draft and does not proceed', () => {
    const { result } = renderHook(() =>
      useAppForm({
        defaultValues: { name: 'Mochi' },
        values: { name: 'Mochi' },
      }),
    );
    let proceeded = false;

    act(() => {
      result.current.setValue('name', 'Luna', { shouldDirty: true });
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
    assert.equal(result.current.getValues('name'), 'Luna');
    assert.equal(result.current.formState.isDirty, true);
  });
});
