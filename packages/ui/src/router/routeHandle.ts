import type { UIMatch } from 'react-router';

export type AppRouteHandle = {
  showPetSelector?: boolean;
};

export const petSelectorRouteHandle = {
  showPetSelector: true,
} satisfies AppRouteHandle;

export function matchShowsPetSelector(match: UIMatch): boolean {
  const handle = match.handle;
  if (typeof handle !== 'object' || handle === null) {
    return false;
  }
  return Reflect.get(handle, 'showPetSelector') === true;
}
