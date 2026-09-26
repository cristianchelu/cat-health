import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ControlGroup, DeviceControlsDTO, EntityDTO } from 'shared';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import { DetailMetricRow } from '@/components/devices/DetailMetricRow';
import { EntitySensor } from '@/components/devices/entities/EntitySensor';
import { EntityBinarySensor } from '@/components/devices/entities/EntityBinarySensor';
import { DeviceActions } from '@/components/devices/controls/DeviceActions';
import { DeviceLiveControls } from '@/components/devices/controls/DeviceLiveControls';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { groupEntitiesForDashboard } from '@/lib/deviceEntityDashboard';
import { formatStructuredValue } from '@/lib/formatStructuredValue';
import {
  coerceEpochDate,
  formatRelativeTimeAgo,
} from '@/lib/formatRelativeTime';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import './ESPHomeView.css';

interface ESPHomeViewProps {
  deviceId: number;
  entities: EntityDTO[];
  sensors?: Record<string, unknown>;
  controls?: DeviceControlsDTO;
}

const actionsIn = (
  controls: DeviceControlsDTO | undefined,
  group: ControlGroup,
) => controls?.actions.filter((action) => action.group === group) ?? [];

/** Settings that operate the device; the ones that configure it live on the Settings tab. */
const liveSettingsIn = (
  controls: DeviceControlsDTO | undefined,
  group: ControlGroup,
) =>
  controls?.settings.filter(
    (setting) => setting.group === group && setting.placement === 'control',
  ) ?? [];

/**
 * Stable per-tile identity. `entity.id` is the ESPHome object_id, which is
 * empty on state captured before the API learned to derive object_id for
 * firmware that omits it — an empty id collapses every sibling onto the same
 * React key. Type plus name is unique within a device and just as stable.
 */
function entityTileKey(entity: EntityDTO): string {
  return entity.id || `${entity.type}:${entity.name}`;
}

function mergeEntityValue(
  entity: EntityDTO,
  sensors: ESPHomeViewProps['sensors'],
): unknown {
  if (sensors && entity.id in sensors) {
    return sensors[entity.id];
  }
  return entity.value;
}

export const ESPHomeView: React.FC<ESPHomeViewProps> = ({
  deviceId,
  entities,
  sensors,
  controls,
}) => {
  const { t } = useTranslation();
  const { formatDateTime, dateFnsLocale, formatNumber } = useFormatters();
  const grouped = React.useMemo(
    () => groupEntitiesForDashboard(entities),
    [entities],
  );

  const renderEntityBody = React.useCallback(
    (entity: EntityDTO): React.ReactNode => {
      const value = mergeEntityValue(entity, sensors);

      switch (entity.type) {
        case 'sensor': {
          if (entity.deviceClass === 'timestamp') {
            const ts = coerceEpochDate(value);
            const absolute = ts != null ? formatDateTime(ts) : undefined;
            const relative =
              ts != null
                ? formatRelativeTimeAgo(ts, { locale: dateFnsLocale })
                : null;
            return (
              <EntitySensor
                label={entity.name}
                value={
                  relative ??
                  (ts != null ? absolute : null) ??
                  t('devices.esphome.no_reading')
                }
                unit={entity.unit}
                accuracyDecimals={entity.accuracyDecimals}
                deviceClass={entity.deviceClass}
                valueTitle={absolute}
                valueVariant="body"
              />
            );
          }
          return (
            <EntitySensor
              label={entity.name}
              value={value as number}
              unit={entity.unit}
              accuracyDecimals={entity.accuracyDecimals}
              deviceClass={entity.deviceClass}
            />
          );
        }
        case 'binary_sensor':
          return (
            <EntityBinarySensor
              label={entity.name}
              isOn={Boolean(value)}
              onLabel={entity.onLabel}
              offLabel={entity.offLabel}
            />
          );
        case 'text_sensor':
          return (
            <EntitySensor
              label={entity.name}
              value={
                value === undefined || value === null
                  ? t('devices.esphome.no_reading')
                  : String(value)
              }
              valueVariant="body"
            />
          );
        default: {
          const formatted = formatStructuredValue(value, {
            formatGroupedNumber: (numericValue) => formatNumber(numericValue),
          });
          const meta =
            entity.deviceClass !== undefined && entity.deviceClass !== ''
              ? entity.deviceClass
              : undefined;

          return (
            <DetailMetricRow
              label={entity.name}
              summary={formatted.summary}
              badge={entity.type}
              meta={meta}
              rawPayload={formatted.raw}
              rawLabel={t('devices.esphome.raw_payload')}
            />
          );
        }
      }
    },
    [dateFnsLocale, formatDateTime, formatNumber, sensors, t],
  );

  const renderEntityTile = React.useCallback(
    (entity: EntityDTO) => (
      <DashboardTile key={entityTileKey(entity)}>
        {renderEntityBody(entity)}
      </DashboardTile>
    ),
    [renderEntityBody],
  );

  const renderGrid = React.useCallback(
    (list: EntityDTO[]) => (
      <ResponsiveTileGrid>
        {list.map((entity) => renderEntityTile(entity))}
      </ResponsiveTileGrid>
    ),
    [renderEntityTile],
  );

  const renderControls = (group: ControlGroup) => {
    const actions = actionsIn(controls, group);
    const live = liveSettingsIn(controls, group);
    return (
      <>
        {actions.length > 0 ? (
          <DeviceActions deviceId={deviceId} actions={actions} />
        ) : null}
        {live.length > 0 ? (
          <DeviceLiveControls deviceId={deviceId} settings={live} />
        ) : null}
      </>
    );
  };

  const hasControls = (group: ControlGroup) =>
    actionsIn(controls, group).length > 0 ||
    liveSettingsIn(controls, group).length > 0;

  if (entities.length === 0 && !controls) {
    return (
      <div className="esphome-view">
        <p className="esphome-view-empty">
          {t('devices.esphome.empty_entities')}
        </p>
      </div>
    );
  }

  const {
    primary: { sensors: sensorEntities, other: primaryOther },
    config,
    diagnostic,
  } = grouped;

  const showPrimary =
    hasControls('primary') ||
    sensorEntities.length > 0 ||
    primaryOther.length > 0;

  return (
    <div className="esphome-view">
      {showPrimary ? (
        <section
          className="esphome-view-section"
          aria-label={t('devices.esphome.section_primary')}
        >
          <div className="esphome-view-panel">
            <SectionHeader>
              {t('devices.esphome.section_primary')}
            </SectionHeader>
            {hasControls('primary') ? (
              <div className="esphome-view-subsection">
                <h3 className="section-label esphome-view-subsection-title">
                  {t('devices.esphome.subsection_controls')}
                </h3>
                {renderControls('primary')}
              </div>
            ) : null}
            {sensorEntities.length > 0 ? (
              <div className="esphome-view-subsection">
                <h3 className="section-label esphome-view-subsection-title">
                  {t('devices.esphome.subsection_sensors')}
                </h3>
                {renderGrid(sensorEntities)}
              </div>
            ) : null}
            {primaryOther.length > 0 ? (
              <div className="esphome-view-subsection">
                {renderGrid(primaryOther)}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {config.length > 0 || hasControls('config') ? (
        <section
          className="esphome-view-section"
          aria-label={t('devices.esphome.section_config')}
        >
          <div className="esphome-view-panel">
            <SectionHeader>{t('devices.esphome.section_config')}</SectionHeader>
            {renderControls('config')}
            {config.length > 0 ? renderGrid(config) : null}
          </div>
        </section>
      ) : null}

      {diagnostic.length > 0 || hasControls('diagnostic') ? (
        <section
          className="esphome-view-section"
          aria-label={t('devices.esphome.section_diagnostic')}
        >
          <div className="esphome-view-panel">
            <SectionHeader>
              {t('devices.esphome.section_diagnostic')}
            </SectionHeader>
            {renderControls('diagnostic')}
            {diagnostic.length > 0 ? renderGrid(diagnostic) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};
