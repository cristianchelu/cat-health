import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Brush,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { DeviceConnectivityEventDataDTO, GetEventDTO } from 'shared';
import { getStringValue, isRecord } from '@/lib/utils';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';
import './DeviceCentricEvent.css';

type LitterboxMaintenanceEventType =
  | 'scoop'
  | 'deep_clean'
  | 'litter_change'
  | 'litter_addition';

type ConnectivityState = DeviceConnectivityEventDataDTO['state'];

const CONNECTIVITY_ICON: Record<ConnectivityState, React.ElementType> = {
  online: Wifi,
  offline: WifiOff,
  error: AlertTriangle,
};

const CONNECTIVITY_VARIANT: Record<
  ConnectivityState,
  'success' | 'default' | 'danger'
> = {
  online: 'success',
  offline: 'default',
  error: 'danger',
};

const MAINTENANCE_LABEL_KEY: Record<LitterboxMaintenanceEventType, string> = {
  scoop: 'events.litterbox_maintenance_scoop',
  deep_clean: 'events.litterbox_maintenance_deep_clean',
  litter_change: 'events.litterbox_maintenance_litter_change',
  litter_addition: 'events.litterbox_maintenance_litter_addition',
};

function parseConnectivityData(
  event: GetEventDTO,
): DeviceConnectivityEventDataDTO | null {
  const data = event.data;
  if (!isRecord(data) || data.type !== 'device_connectivity') {
    return null;
  }

  const state = data.state;
  if (state !== 'online' && state !== 'offline' && state !== 'error') {
    return null;
  }

  const previousRaw = data.previous_state;
  const previous_state =
    previousRaw === 'online' ||
    previousRaw === 'offline' ||
    previousRaw === 'error' ||
    previousRaw === 'unknown'
      ? previousRaw
      : undefined;

  return {
    type: 'device_connectivity',
    state,
    previous_state,
  };
}

function parseMaintenanceType(event: GetEventDTO): LitterboxMaintenanceEventType | null {
  const data = event.data;
  if (!isRecord(data) || data.type !== 'litterbox_maintenance') {
    return null;
  }

  const maintenanceType = getStringValue(data, 'maintenance_type');
  if (
    maintenanceType === 'scoop' ||
    maintenanceType === 'deep_clean' ||
    maintenanceType === 'litter_change' ||
    maintenanceType === 'litter_addition'
  ) {
    return maintenanceType;
  }

  return null;
}

const DeviceConnectivityEventRow: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const connectivity = parseConnectivityData(props.event);
  if (!connectivity) {
    return null;
  }

  const Icon = CONNECTIVITY_ICON[connectivity.state];
  const titleKey = `events.device_connectivity_${connectivity.state}`;

  return (
    <TimelineEventShell
      {...props}
      className="device-centric-event device-connectivity-event"
      icon={<Icon aria-hidden />}
      iconVariant={CONNECTIVITY_VARIANT[connectivity.state]}
      title={t(titleKey)}
      value={
        connectivity.previous_state
          ? t(`events.device_connectivity_from_${connectivity.previous_state}`)
          : undefined
      }
      valueVariant="default"
    />
  );
};

const LitterboxMaintenanceEventRow: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const maintenanceType = parseMaintenanceType(props.event);
  const litterAmount =
    isRecord(props.event.data) &&
    typeof props.event.data.litter_amount === 'number'
      ? props.event.data.litter_amount
      : undefined;

  const detailKey = maintenanceType
    ? MAINTENANCE_LABEL_KEY[maintenanceType]
    : 'events.litterbox_maintenance';

  return (
    <TimelineEventShell
      {...props}
      className="device-centric-event litterbox-maintenance-event"
      icon={<Brush aria-hidden />}
      iconVariant="warning"
      title={t('events.litterbox_maintenance')}
      value={litterAmount != null ? `${litterAmount}g` : t(detailKey)}
      valueVariant="warning"
    />
  );
};

const DeviceCentricEvent: React.FC<EventComponentProps> = (props) => {
  const type = props.event.data?.type;

  if (type === 'device_connectivity') {
    return <DeviceConnectivityEventRow {...props} />;
  }

  if (type === 'litterbox_maintenance') {
    return <LitterboxMaintenanceEventRow {...props} />;
  }

  return null;
};

export default DeviceCentricEvent;
