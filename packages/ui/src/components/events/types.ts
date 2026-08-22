import type { GetEventListItemDTO } from 'shared';

export interface EventComponentProps {
  event: GetEventListItemDTO;
  onClick?: () => void;
  /** When true, show pet name in timeline meta. Default true. */
  showPet?: boolean;
  /** When true, show device name in timeline meta. Default true. */
  showDevice?: boolean;
}
