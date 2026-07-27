import * as React from 'react';
import { useBlocker, type BlockerFunction } from 'react-router';

interface UseUnsavedBlockerResult {
  blockerOpen: boolean;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
  /**
   * Call in the success path of a save (or delete) before navigating away.
   *
   * Two things make the raw `isDirty` unusable at that moment: react-router
   * registers the blocker in an effect, so a `navigate()` in the same tick as
   * the state update that clears dirty still sees the previous render's flag;
   * and forms whose baseline comes from a query stay dirty until the refetch
   * lands. This suppresses the guard until `isDirty` reports clean again,
   * after which it re-arms on its own.
   */
  markSaved: () => void;
}

/**
 * Blocks in-app navigation while `isDirty`. Render a ConfirmDialog with the
 * returned open/confirm/cancel handlers.
 */
function useUnsavedBlocker(isDirty: boolean): UseUnsavedBlockerResult {
  const savedRef = React.useRef(false);

  // Re-arm once the form genuinely settles back to clean. Deliberately runs
  // after every commit rather than on an `isDirty` transition, so calling
  // `markSaved()` on an already-clean form cannot disable the guard for the
  // rest of the component's life.
  React.useEffect(() => {
    if (!isDirty) {
      savedRef.current = false;
    }
  });

  const shouldBlock = React.useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (savedRef.current) {
        return false;
      }
      return isDirty && currentLocation.pathname !== nextLocation.pathname;
    },
    [isDirty],
  );

  const blocker = useBlocker(shouldBlock);

  const blockerOpen = blocker.state === 'blocked';

  const markSaved = React.useCallback(() => {
    savedRef.current = true;
  }, []);

  const onConfirmLeave = React.useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  const onCancelLeave = React.useCallback(() => {
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    blockerOpen,
    onConfirmLeave,
    onCancelLeave,
    markSaved,
  };
}

export { useUnsavedBlocker, type UseUnsavedBlockerResult };
