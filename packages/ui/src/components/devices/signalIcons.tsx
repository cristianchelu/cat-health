import * as React from 'react';
import {
  AlertTriangle,
  BatteryMedium,
  Check,
  Clock,
  Cctv,
  Droplet,
  Droplets,
  Filter,
  Scale,
  Shovel,
  Signal,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Waves,
} from 'lucide-react';
import type { SignalIcon } from 'shared';
import { LitterboxIcon } from '@/components/icons/LitterboxIcon';

const SIZE = 13;

/**
 * The signal icon vocabulary, resolved to glyphs.
 *
 * Exhaustive over `SignalIcon`: adding a name to the shared union makes this
 * fail to compile until it is drawn, so a provider cannot emit an icon that
 * silently renders nothing.
 */
const SIGNAL_ICON: Record<SignalIcon, React.ReactNode> = {
  water: <Droplets size={SIZE} />,
  drop: <Droplet size={SIZE} />,
  filter: <Filter size={SIZE} />,
  pump: <Waves size={SIZE} />,
  litter: <LitterboxIcon size={SIZE} />,
  scoop: <Shovel size={SIZE} />,
  waste: <Trash2 size={SIZE} />,
  clean: <Sparkles size={SIZE} />,
  food: <UtensilsCrossed size={SIZE} />,
  scale: <Scale size={SIZE} />,
  clock: <Clock size={SIZE} />,
  battery: <BatteryMedium size={SIZE} />,
  signal: <Signal size={SIZE} />,
  recognition: <Sparkles size={SIZE} />,
  camera: <Cctv size={SIZE} />,
  alert: <AlertTriangle size={SIZE} />,
  check: <Check size={SIZE} />,
};

export function getSignalIcon(icon: SignalIcon): React.ReactNode {
  return SIGNAL_ICON[icon];
}
