import * as React from 'react';
import { Settings as SettingsIcon, CctvIcon, Sparkles } from 'lucide-react';
import type { DeviceType } from 'shared';
import { LitterboxIcon } from '@/components/icons/LitterboxIcon';
import { WaterFountainIcon } from '@/components/icons/WaterFountainIcon';

const SIZE = '1em';

export const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  litterbox: <LitterboxIcon size={SIZE} />,
  water_fountain: <WaterFountainIcon size={SIZE} />,
  feeder: <SettingsIcon size={SIZE} />,
  camera: <CctvIcon size={SIZE} />,
  pet_recognizer: <Sparkles size={SIZE} />,
};

export function getDeviceIcon(
  type: DeviceType,
  fallback?: React.ReactNode,
): React.ReactNode {
  return DEVICE_ICON[type] ?? fallback ?? null;
}
