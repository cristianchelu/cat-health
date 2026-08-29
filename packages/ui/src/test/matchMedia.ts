/**
 * A `matchMedia` the tests can drive.
 *
 * jsdom has none, and the stub this replaced answered `false` to everything
 * with no way to say otherwise — so the phone branch of every component that
 * asks `useIsPhone()` was unreachable, and so was anything gated on motion
 * preference. This keeps a registry keyed by the raw query string: nothing is
 * parsed, so a test flips exactly the query the component asks for.
 */

type ChangeCallback = (ev: { matches: boolean; media: string }) => void;

const state = new Map<string, boolean>();

/**
 * Defaults survive {@link resetMediaMatches}. jsdom cannot finish a CSS
 * transition, so the honest default is "this environment prefers no motion":
 * every animated component takes its instant path and tests stay synchronous.
 *
 * `MOBILE_QUERY` is deliberately NOT defaulted — `useIsPhone()` stays false and
 * every test that predates this helper keeps its desktop branch.
 */
const DEFAULTS = new Map<string, boolean>([
  ['(prefers-reduced-motion: reduce)', true],
]);

const listeners = new Map<string, Set<ChangeCallback>>();
const lists = new Map<string, Set<MockMediaQueryList>>();

function currentMatches(query: string): boolean {
  return state.get(query) ?? DEFAULTS.get(query) ?? false;
}

class MockMediaQueryList {
  readonly media: string;
  onchange: ChangeCallback | null = null;

  constructor(media: string) {
    this.media = media;
  }

  /* A getter, not a field: `useSyncExternalStore.getSnapshot` re-reads the
     same object and has to see the new value. */
  get matches(): boolean {
    return currentMatches(this.media);
  }

  addEventListener(type: string, callback: ChangeCallback): void {
    if (type !== 'change') return;
    const set = listeners.get(this.media) ?? new Set<ChangeCallback>();
    listeners.set(this.media, set);
    set.add(callback);
  }

  removeEventListener(type: string, callback: ChangeCallback): void {
    if (type !== 'change') return;
    listeners.get(this.media)?.delete(callback);
  }

  /** The pre-2018 pair, still what some libraries bind. */
  addListener(callback: ChangeCallback): void {
    this.addEventListener('change', callback);
  }

  removeListener(callback: ChangeCallback): void {
    this.removeEventListener('change', callback);
  }

  dispatchEvent(): boolean {
    return false;
  }
}

/**
 * Loosely typed on purpose: the caller is jsdom's `DOMWindow`, which is not
 * assignable to lib.dom's `Window`, and the mock list is a duck rather than a
 * full `MediaQueryList`. Nothing here ships.
 */
export function installMatchMedia(win: object): void {
  (win as { matchMedia: (query: string) => MockMediaQueryList }).matchMedia = (
    query: string,
  ) => {
    const list = new MockMediaQueryList(query);
    const set = lists.get(query) ?? new Set<MockMediaQueryList>();
    lists.set(query, set);
    set.add(list);
    return list;
  };
}

/** Flip a query. Wrap in `act()` when a component renders off the result. */
export function setMediaMatches(query: string, matches: boolean): void {
  if (currentMatches(query) === matches) {
    state.set(query, matches);
    return;
  }
  state.set(query, matches);
  const event = { matches, media: query };
  for (const list of lists.get(query) ?? []) list.onchange?.(event);
  for (const callback of [...(listeners.get(query) ?? [])]) callback(event);
}

/**
 * Back to the defaults — call from `afterEach` beside `cleanup()`.
 *
 * The registries go too. Nothing removes a `MockMediaQueryList` once built, so
 * left alone they would accumulate one entry per `useIsPhone()` call for the
 * whole run, and every `setMediaMatches` would walk the lot.
 */
export function resetMediaMatches(): void {
  state.clear();
  listeners.clear();
  lists.clear();
}
