import type { GetEventDTO } from 'shared';
import type { ReactNode } from 'react';

export interface EventComponentProps {
  event: GetEventDTO;
  children?: ReactNode;
}
