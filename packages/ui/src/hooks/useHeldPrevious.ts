import * as React from 'react';

type Held<T> = {
  key: string;
  item: T;
  previous: { key: string; item: T } | undefined;
};

/**
 * When `itemKey` changes, the previous `item` stays available for one
 * generation so the caller can keep painting it under the incoming layer.
 */
export function useHeldPrevious<T>(
  item: T,
  itemKey: string,
): {
  current: T;
  previous: T | undefined;
  previousKey: string | undefined;
} {
  const [held, setHeld] = React.useState<Held<T>>(() => ({
    key: itemKey,
    item,
    previous: undefined,
  }));

  let previous = held.previous;
  if (held.key !== itemKey) {
    previous = { key: held.key, item: held.item };
    setHeld({ key: itemKey, item, previous });
  } else if (held.item !== item) {
    setHeld({ ...held, item });
  }

  const showPrevious = previous !== undefined && previous.key !== itemKey;
  return {
    current: item,
    previous: showPrevious ? previous?.item : undefined,
    previousKey: showPrevious ? previous?.key : undefined,
  };
}
