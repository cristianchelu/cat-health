import type { GetEventListItemDTO } from 'shared';
import type { ReactNode } from 'react';

export interface EventComponentProps {
  event: GetEventListItemDTO;
  children?: ReactNode;
  onClick?: () => void;
  /** When true, show pet name in timeline meta. Default true. */
  showPet?: boolean;
  /** When true, show device name in timeline meta. Default true. */
  showDevice?: boolean;
}
