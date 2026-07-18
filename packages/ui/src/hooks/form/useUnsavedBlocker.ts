import * as React from 'react';
import { useBlocker } from 'react-router';

interface UseUnsavedBlockerResult {
  blockerOpen: boolean;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
}

/**
 * Blocks in-app navigation while `isDirty`. Render a ConfirmDialog with the
 * returned open/confirm/cancel handlers.
 */
function useUnsavedBlocker(isDirty: boolean): UseUnsavedBlockerResult {
  const blocker = useBlocker(isDirty);

  const blockerOpen = blocker.state === 'blocked';

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
  };
}

export { useUnsavedBlocker, type UseUnsavedBlockerResult };
