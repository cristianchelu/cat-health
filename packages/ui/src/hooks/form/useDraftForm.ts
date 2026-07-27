import * as React from 'react';

function defaultIsEqual<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface UseDraftFormOptions<T> {
  isEqual?: (a: T, b: T) => boolean;
  /**
   * When this changes, draft resets to the latest `baseline`.
   * Must change whenever baseline *content* changes (not only entity id),
   * or the draft stays stale while `isDirty` compares against the new baseline.
   */
  baselineKey: string | number;
}

interface DiscardConfirmState {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

interface UseDraftFormResult<T> {
  draft: T;
  setDraft: React.Dispatch<React.SetStateAction<T>>;
  patchDraft: (partial: Partial<T>) => void;
  reset: () => void;
  /**
   * Accept the current draft as the saved truth. Call after a successful save
   * that keeps the form mounted: `isDirty` goes false immediately instead of
   * lingering until the refetch that rebuilds `baseline` lands. Superseded
   * automatically once `baselineKey` changes.
   */
  commit: () => void;
  isDirty: boolean;
  /** If dirty, opens discard confirm; otherwise runs `onProceed` immediately. */
  requestDiscard: (onProceed: () => void) => void;
  /** If dirty, opens discard confirm then resets; if clean, no-op. */
  requestReset: () => void;
  discardConfirm: DiscardConfirmState;
}

function useDraftForm<T>(
  baseline: T,
  options: UseDraftFormOptions<T>,
): UseDraftFormResult<T> {
  const { isEqual = defaultIsEqual, baselineKey } = options;
  const [draft, setDraft] = React.useState<T>(baseline);
  const [appliedKey, setAppliedKey] = React.useState(baselineKey);
  const [committed, setCommitted] = React.useState<{
    key: string | number;
    value: T;
  } | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const pendingProceedRef = React.useRef<(() => void) | null>(null);
  const baselineRef = React.useRef(baseline);
  const baselineKeyRef = React.useRef(baselineKey);
  const isEqualRef = React.useRef(isEqual);
  const draftRef = React.useRef(draft);

  // Rebase during render rather than in an effect. `isDirty` is derived in the
  // same render, so an effect-based rebase leaves one committed render where
  // the old draft is compared against the new baseline — that spurious dirty
  // is enough to trip the navigation guard on a form nobody touched.
  const rebasing = appliedKey !== baselineKey;
  if (rebasing) {
    setAppliedKey(baselineKey);
    setDraft(baseline);
    setCommitted(null);
  }

  const effectiveDraft = rebasing ? baseline : draft;
  const effectiveBaseline =
    !rebasing && committed !== null && committed.key === baselineKey
      ? committed.value
      : baseline;

  React.useEffect(() => {
    baselineRef.current = baseline;
    baselineKeyRef.current = baselineKey;
    isEqualRef.current = isEqual;
    draftRef.current = effectiveDraft;
  });

  const isDirty = !isEqual(effectiveDraft, effectiveBaseline);

  const reset = React.useCallback(() => {
    setDraft(baselineRef.current);
    setCommitted(null);
  }, []);

  const commit = React.useCallback(() => {
    setCommitted({ key: baselineKeyRef.current, value: draftRef.current });
  }, []);

  const patchDraft = React.useCallback((partial: Partial<T>) => {
    setDraft((prev) => {
      if (prev !== null && typeof prev === 'object' && !Array.isArray(prev)) {
        return { ...prev, ...partial };
      }
      return prev;
    });
  }, []);

  const onCancelDiscard = React.useCallback(() => {
    pendingProceedRef.current = null;
    setDiscardOpen(false);
  }, []);

  const onConfirmDiscard = React.useCallback(() => {
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    setDiscardOpen(false);
    setDraft(baselineRef.current);
    setCommitted(null);
    proceed?.();
  }, []);

  const requestDiscard = React.useCallback(
    (onProceed: () => void) => {
      if (!isDirty) {
        onProceed();
        return;
      }
      pendingProceedRef.current = onProceed;
      setDiscardOpen(true);
    },
    [isDirty],
  );

  const requestReset = React.useCallback(() => {
    requestDiscard(() => undefined);
  }, [requestDiscard]);

  const discardConfirm: DiscardConfirmState = React.useMemo(
    () => ({
      open: discardOpen,
      onConfirm: onConfirmDiscard,
      onCancel: onCancelDiscard,
    }),
    [discardOpen, onConfirmDiscard, onCancelDiscard],
  );

  return {
    draft: effectiveDraft,
    setDraft,
    patchDraft,
    reset,
    commit,
    isDirty,
    requestDiscard,
    requestReset,
    discardConfirm,
  };
}

export { useDraftForm, type UseDraftFormOptions, type UseDraftFormResult };
