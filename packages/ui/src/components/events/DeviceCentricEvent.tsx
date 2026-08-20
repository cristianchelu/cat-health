import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Brush, Wifi, WifiOff } from 'lucide-react';
import type {
  DeviceConnectivityEventDataDTO,
  LitterboxMaintenanceEventTypeDTO,
} from 'shared';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';
import './DeviceCentricEvent.css';

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

const MAINTENANCE_LABEL_KEY: Record<LitterboxMaintenanceEventTypeDTO, string> =
  {
    scoop: 'events.litterbox_maintenance_scoop',
    deep_clean: 'events.litterbox_maintenance_deep_clean',
    litter_change: 'events.litterbox_maintenance_litter_change',
    litter_addition: 'events.litterbox_maintenance_litter_addition',
  };

const DeviceConnectivityEventRow: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const connectivity =
    props.event.data.type === 'device_connectivity' ? props.event.data : null;
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
  const maintenance =
    props.event.data.type === 'litterbox_maintenance' ? props.event.data : null;
  const maintenanceType = maintenance?.maintenance_type ?? null;
  const litterAmount = maintenance?.litter_amount;

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
