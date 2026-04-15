import * as React from 'react';
import { Droplets } from 'lucide-react';
import PoopIcon from '@/components/icons/PoopIcon';

/** Icons for elimination `kind` on timeline badges (matches LitterboxEvent main icon semantics). */
export const ELIMINATION_KIND_ICONS: Record<
  'urination' | 'defecation',
  React.ElementType
> = {
  urination: Droplets,
  defecation: PoopIcon,
};
