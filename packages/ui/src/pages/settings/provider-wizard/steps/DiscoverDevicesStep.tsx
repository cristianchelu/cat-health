import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  DeviceType,
  DiscoveredDeviceDTO,
  GetDeviceResponseDTO,
} from 'shared';
import { isAlreadyAdded } from '../wizardUtils';

interface DiscoverDevicesStepProps {
  accountId: number;
  isDiscovering: boolean;
  discoveredDevices: DiscoveredDeviceDTO[] | undefined;
  existingDevices: GetDeviceResponseDTO[];
  supportedTypes: readonly DeviceType[];
  allowsDirectRegistration: boolean;
  onSelect: (device: DiscoveredDeviceDTO) => void;
  onDirectRegister: () => void;
  onRescan: () => void;
  onBack: () => void;
}

export const DiscoverDevicesStep: React.FC<DiscoverDevicesStepProps> = ({
  accountId,
  isDiscovering,
  discoveredDevices,
  existingDevices,
  supportedTypes,
  allowsDirectRegistration,
  onSelect,
  onDirectRegister,
  onRescan,
  onBack,
}) => {
  const { t } = useTranslation();
  const supportedTypeSet = new Set(supportedTypes);

  return (
    <>
      {isDiscovering ? (
        <div className="loading-state">
          <Loader2 className="animate-spin" size={32} />
          <p>{t('settings.scanning')}</p>
        </div>
      ) : (
        <div className="device-list">
          {discoveredDevices && discoveredDevices.length > 0 ? (
            discoveredDevices.map((device) => {
              const alreadyAdded = isAlreadyAdded(
                existingDevices,
                accountId,
                device,
              );
              const unsupported = !supportedTypeSet.has(device.type);
              const disabled = alreadyAdded || unsupported;

              return (
                <div
                  key={device.externalId}
                  className={`device-item${disabled ? ' disabled' : ''}`}
                  onClick={() => !disabled && onSelect(device)}
                >
                  <div className="device-info">
                    <span className="device-name">{device.name}</span>
                    <span className="device-type">
                      {t(`device_types.${device.type}`)}
                    </span>
                    <span className="device-id">{device.externalId}</span>
                  </div>
                  {alreadyAdded ? (
                    <span className="device-status">
                      {t('settings.already_added')}
                    </span>
                  ) : (
                    <Button size="sm" variant="secondary" disabled={disabled}>
                      {t('settings.select')}
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <p>{t('settings.no_devices_found')}</p>
            </div>
          )}
        </div>
      )}

      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('settings.back')}
        </Button>
        {allowsDirectRegistration && (
          <Button type="button" variant="secondary" onClick={onDirectRegister}>
            {t('settings.add_manually')}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={onRescan}
          disabled={isDiscovering}
        >
          {t('settings.rescan')}
        </Button>
      </div>
    </>
  );
};
