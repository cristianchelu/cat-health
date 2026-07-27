import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DeviceType,
  DiscoveredDeviceDTO,
  ProviderAccountDTO,
} from 'shared';
import { FormCard, FormCardHead } from '@/components/ui/form';
import { DeviceTypeTile } from '../../../components/DeviceTypeTile';

interface RegisterDeviceCardProps {
  account: ProviderAccountDTO;
  /** The discovered device being registered, when the flow has one. */
  prefill?: DiscoveredDeviceDTO | null;
  /** Type the form will submit. Names the card when nothing was discovered. */
  type: DeviceType;
  children: React.ReactNode;
}

/**
 * Card chrome for every register-device step, so the last step of the add
 * flow lands on the same surface as `/settings/devices/:id` and the provider
 * connect step.
 *
 * A discovered device already has a name to lead with and pushes its type down
 * into the subtitle; a directly-added one has neither until the form is filled
 * in, so the type leads and the account is all the provenance there is.
 */
export const RegisterDeviceCard: React.FC<RegisterDeviceCardProps> = ({
  account,
  prefill,
  type,
  children,
}) => {
  const { t } = useTranslation();
  const typeLabel = t(`device_types.${type}`);

  return (
    <FormCard>
      <FormCardHead
        titleAs="h2"
        tile={<DeviceTypeTile type={type} size="lg" />}
        title={prefill?.name || typeLabel}
        subtitle={prefill ? `${typeLabel} · ${account.name}` : account.name}
      />
      {children}
    </FormCard>
  );
};
