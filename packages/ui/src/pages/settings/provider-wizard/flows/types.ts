import type * as React from 'react';
import type {
  DeviceType,
  DiscoveredDeviceDTO,
  GetDeviceResponseDTO,
  PostDeviceRequestDTO,
  ProviderAccountDTO,
} from 'shared';
import type { RegisterSource } from '../wizardTypes';

export type RegisterDeviceFormProps = {
  account: ProviderAccountDTO;
  prefill: DiscoveredDeviceDTO | null;
  source: RegisterSource;
  existingDevices: GetDeviceResponseDTO[];
  isSubmitting: boolean;
  serverError: string | null;
  onSubmitDevice: (payload: PostDeviceRequestDTO) => Promise<void>;
  onBack: () => void;
  /** Report register-step dirty state for header Cancel leave guard. */
  onDirtyChange?: (dirty: boolean) => void;
};

export interface AddDeviceFlow {
  /** If true, the shell jumps straight from account selection to registration. */
  skipDiscovery?: boolean;
  /** If true, the user can open registration without picking a discovered row. */
  allowsDirectRegistration?: boolean;
  /**
   * Device types this flow can register directly. Used to scope the discovery
   * list to types the form actually handles and to drive any type selector.
   */
  supportedTypes: readonly DeviceType[];
  RegisterDeviceForm: React.FC<RegisterDeviceFormProps>;
}
