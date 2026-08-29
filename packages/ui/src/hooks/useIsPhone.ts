import * as React from 'react';
import { MOBILE_QUERY } from '@/lib/breakpoints';

/**
 * Whether the viewport is phone-width, as a value you can branch a render on.
 *
 * The existing `matchMedia` callers ({@link useAppHeaderScroll},
 * {@link useFabScrollAway}) want the `MediaQueryList` itself — they bind
 * listeners imperatively and never re-render. This is the other half: a
 * component that must mount a *different control* per platform, which is a
 * render decision and cannot be made in CSS.
 *
 * Reach for CSS first. A layout that differs by width belongs in a media query;
 * this is for the cases where the two platforms need different DOM — a menu
 * anchored to its trigger on desktop against a sheet on a phone, where showing
 * both and hiding one would mount two live listboxes.
 *
 * `useSyncExternalStore` rather than an effect + state: the first paint reads
 * the real value instead of flashing the desktop branch on a phone.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** Server/prerender has no viewport; desktop is the safer guess for layout. */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsPhone(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useIsPhone;
