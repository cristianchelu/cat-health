import * as React from 'react';
import { useBlocker, type BlockerFunction } from 'react-router';

interface UseUnsavedBlockerResult {
  blockerOpen: boolean;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
  /**
   * Call before an intentional leave after a successful save so the blocker
   * does not fire while React still has a stale dirty render.
   */
  allowLeave: () => void;
}

/**
 * Blocks in-app navigation while `isDirty`. Render a ConfirmDialog with the
 * returned open/confirm/cancel handlers.
 */
function useUnsavedBlocker(isDirty: boolean): UseUnsavedBlockerResult {
  const allowLeaveRef = React.useRef(false);

  const shouldBlock = React.useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (allowLeaveRef.current) {
        return false;
      }
      return (
        isDirty && currentLocation.pathname !== nextLocation.pathname
      );
    },
    [isDirty],
  );

  const blocker = useBlocker(shouldBlock);

  const blockerOpen = blocker.state === 'blocked';

  const allowLeave = React.useCallback(() => {
    allowLeaveRef.current = true;
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
    allowLeave,
  };
}

export { useUnsavedBlocker, type UseUnsavedBlockerResult };
