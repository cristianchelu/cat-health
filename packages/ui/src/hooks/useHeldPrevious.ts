import * as React from 'react';

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
  const currentRef = React.useRef({ key: itemKey, item });
  const previousRef = React.useRef<{ key: string; item: T } | undefined>(
    undefined,
  );
  if (currentRef.current.key !== itemKey) {
    previousRef.current = currentRef.current;
    currentRef.current = { key: itemKey, item };
  } else {
    currentRef.current = { key: itemKey, item };
  }
  const previous = previousRef.current;
  const showPrevious = previous !== undefined && previous.key !== itemKey;
  return {
    current: item,
    previous: showPrevious ? previous.item : undefined,
    previousKey: showPrevious ? previous.key : undefined,
  };
}
