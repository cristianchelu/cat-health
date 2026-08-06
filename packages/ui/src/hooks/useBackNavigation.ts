import * as React from 'react';
import { useLocation, useNavigate } from 'react-router';

import { parseBackState, type BackTarget } from '@/lib/navigationBack.ts';

/**
 * Resolve where leave navigation should land and what to call it.
 *
 * Prefers `location.state.back` from a non-canonical inbound link: when present,
 * leave navigates to that named path (replace) so the label stays honest even
 * if history would pop somewhere else — e.g. escaping a wizard via a hint link.
 * Without named state, pops in-app history when available, else replaces onto
 * the page's canonical parent.
 */
export function useBackNavigation(fallback: BackTarget): BackTarget & {
  go: () => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const fromState = parseBackState(location.state);
  const target = fromState ?? fallback;
  const namedTo = fromState?.to;

  const go = React.useCallback(() => {
    if (namedTo !== undefined) {
      void navigate(namedTo, { replace: true });
      return;
    }
    if (location.key !== 'default') {
      void navigate(-1);
      return;
    }
    void navigate(fallback.to, { replace: true });
  }, [fallback.to, location.key, namedTo, navigate]);

  return { to: target.to, label: target.label, go };
}
