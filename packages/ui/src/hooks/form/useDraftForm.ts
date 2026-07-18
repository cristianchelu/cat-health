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
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const pendingProceedRef = React.useRef<(() => void) | null>(null);
  const baselineRef = React.useRef(baseline);
  const isEqualRef = React.useRef(isEqual);

  React.useEffect(() => {
    baselineRef.current = baseline;
    isEqualRef.current = isEqual;
  });

  React.useEffect(() => {
    const next = baselineRef.current;
    setDraft((prev) => (isEqualRef.current(prev, next) ? prev : next));
  }, [baselineKey]);

  const isDirty = !isEqual(draft, baseline);

  const reset = React.useCallback(() => {
    setDraft(baselineRef.current);
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
    draft,
    setDraft,
    patchDraft,
    reset,
    isDirty,
    requestDiscard,
    requestReset,
    discardConfirm,
  };
}

export { useDraftForm, type UseDraftFormOptions, type UseDraftFormResult };
