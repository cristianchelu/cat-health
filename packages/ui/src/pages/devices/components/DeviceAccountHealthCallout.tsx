import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { GetDeviceResponseDTO } from 'shared';
import { accountHealthPresentation } from '@/lib/accountHealth';
import { backState } from '@/lib/navigationBack';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

interface DeviceAccountHealthCalloutProps {
  device: GetDeviceResponseDTO;
}

/** Why a device's data stopped: its account lost the remote, not the device. */
const DeviceAccountHealthCallout: React.FC<DeviceAccountHealthCalloutProps> = ({
  device,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const presentation = accountHealthPresentation(device.account_health_state);
  if (!presentation) return null;

  return (
    <Callout
      tone={presentation.tone}
      message={t(presentation.deviceMessageKey)}
      actions={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            navigate(`/settings/providers/${device.provider_account_id}`, {
              state: backState(`/devices/${device.id}`, device.name),
            })
          }
        >
          {t('devices.account_health.open_account')}
        </Button>
      }
    />
  );
};

export { type DeviceAccountHealthCalloutProps };
export default DeviceAccountHealthCallout;
