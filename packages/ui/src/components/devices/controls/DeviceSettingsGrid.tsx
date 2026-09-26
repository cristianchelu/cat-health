import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ControlValueType, SettingControl } from 'shared';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import {
  isCompartmentsDraft,
  type ControlDraft,
  type ControlDraftValue,
} from '@/lib/deviceControlDraft';
import { ControlTiles } from './ControlTiles';
import { DeviceCompartmentsSetting } from './DeviceCompartmentsSetting';
import { settingTileItems } from './settingTileItems';

type CompartmentsSettingControl = SettingControl & {
  type: Extract<ControlValueType, { kind: 'compartments' }>;
};

const isCompartmentsSetting = (
  setting: SettingControl,
): setting is CompartmentsSettingControl =>
  setting.type.kind === 'compartments';

interface DeviceSettingsGridProps {
  settings: SettingControl[];
  draft: ControlDraft;
  onChange: (key: string, value: ControlDraftValue) => void;
  invalidKeys: string[];
  disabled: boolean;
  className?: string;
}

/**
 * A draft form's device settings on one grid: compartmented settings first,
 * then a tile per single value.
 */
const DeviceSettingsGrid: React.FC<DeviceSettingsGridProps> = ({
  settings,
  draft,
  onChange,
  invalidKeys,
  disabled,
  className,
}) => {
  const { t } = useTranslation();
  return (
    <ResponsiveTileGrid className={className}>
      {settings.filter(isCompartmentsSetting).map((setting) => {
        const value = draft[setting.key];
        return isCompartmentsDraft(value) ? (
          <DeviceCompartmentsSetting
            key={setting.key}
            setting={setting}
            value={value}
            onChange={(next) => onChange(setting.key, next)}
            disabled={disabled}
            error={
              invalidKeys.includes(setting.key)
                ? t('devices.controls.invalid_value')
                : undefined
            }
          />
        ) : null;
      })}
      <ControlTiles
        items={settingTileItems(settings, draft, { t, invalidKeys, disabled })}
        onChange={onChange}
      />
    </ResponsiveTileGrid>
  );
};

export { DeviceSettingsGrid, type DeviceSettingsGridProps };
