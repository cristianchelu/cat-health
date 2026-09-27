import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PawPrint, SlidersHorizontal, UtensilsCrossed } from 'lucide-react';
import type { ControlValueType, SettingControl } from 'shared';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  isCompartmentsDraft,
  isIdentitiesDraft,
  type ControlDraft,
  type ControlDraftValue,
} from '@/lib/deviceControlDraft';
import { controlLabel } from '@/lib/deviceControlLabels';
import { ControlTiles } from './ControlTiles';
import { DeviceCompartmentsSetting } from './DeviceCompartmentsSetting';
import { DevicePetsSetting } from './DevicePetsSetting';
import { settingTileItems } from './settingTileItems';

type CompartmentsSettingControl = SettingControl & {
  type: Extract<ControlValueType, { kind: 'compartments' }>;
};

const isCompartmentsSetting = (
  setting: SettingControl,
): setting is CompartmentsSettingControl =>
  setting.type.kind === 'compartments';

type PetsSettingControl = SettingControl & {
  type: Extract<ControlValueType, { kind: 'identities' }>;
};

const isPetsSetting = (
  setting: SettingControl,
): setting is PetsSettingControl => setting.type.kind === 'identities';

interface DeviceSettingsSectionsProps {
  settings: SettingControl[];
  draft: ControlDraft;
  onChange: (key: string, value: ControlDraftValue) => void;
  invalidKeys: string[];
  disabled: boolean;
  /** The account a pets setting sends the user to for linking. */
  accountId?: number;
}

/**
 * A draft form's device settings: a section per identities setting and per
 * compartmented setting, each named by it, then one section of tiles for
 * every single-value setting.
 */
const DeviceSettingsSections: React.FC<DeviceSettingsSectionsProps> = ({
  settings,
  draft,
  onChange,
  invalidKeys,
  disabled,
  accountId,
}) => {
  const { t } = useTranslation();
  const tiles = settingTileItems(settings, draft, {
    t,
    invalidKeys,
    disabled,
  });
  return (
    <>
      {settings.filter(isPetsSetting).map((setting) => {
        const value = draft[setting.key];
        return isIdentitiesDraft(value) ? (
          <React.Fragment key={setting.key}>
            <SectionHeader
              size="compact"
              icon={<PawPrint aria-hidden="true" />}
            >
              {controlLabel(setting.label, t)}
            </SectionHeader>
            <DevicePetsSetting
              setting={setting}
              value={value}
              onChange={(next) => onChange(setting.key, next)}
              disabled={disabled}
              accountId={accountId}
            />
          </React.Fragment>
        ) : null;
      })}
      {settings.filter(isCompartmentsSetting).map((setting) => {
        const value = draft[setting.key];
        return isCompartmentsDraft(value) ? (
          <React.Fragment key={setting.key}>
            <SectionHeader
              size="compact"
              icon={<UtensilsCrossed aria-hidden="true" />}
            >
              {controlLabel(setting.label, t)}
            </SectionHeader>
            <DeviceCompartmentsSetting
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
          </React.Fragment>
        ) : null;
      })}
      {tiles.length > 0 ? (
        <>
          <SectionHeader
            size="compact"
            icon={<SlidersHorizontal aria-hidden="true" />}
          >
            {t('devices.controls.settings_title')}
          </SectionHeader>
          <ResponsiveTileGrid>
            <ControlTiles items={tiles} onChange={onChange} />
          </ResponsiveTileGrid>
        </>
      ) : null}
    </>
  );
};

export { DeviceSettingsSections, type DeviceSettingsSectionsProps };
