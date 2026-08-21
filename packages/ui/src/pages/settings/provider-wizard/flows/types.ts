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
  /**
   * Abandons the wizard from the commit row. Step-back is the header control,
   * and the shell owns the dirty confirm for both — a form-local
   * `requestDiscard` here would ask twice.
   */
  onCancel: () => void;
  /** Report register-step dirty state for the shell's leave guard. */
  onDirtyChange?: (dirty: boolean) => void;
};

export interface AddDeviceFlow {
  /** If true, the user can open registration without picking a discovered row. */
  allowsDirectRegistration?: boolean;
  /**
   * Build a device payload straight from a discovered candidate, with no
   * further input from the user.
   *
   * When present, discovery becomes multi-select: rows get a toggle and the
   * whole selection is imported at once. Only set this where the registration
   * form adds nothing a discovered device does not already carry — otherwise
   * the flow stays single-select and hands off to RegisterDeviceForm.
   */
  buildDeviceFromDiscovery?: (
    account: ProviderAccountDTO,
    device: DiscoveredDeviceDTO,
  ) => PostDeviceRequestDTO;
  /**
   * Device types this flow can register directly. Used to scope the discovery
   * list to types the form actually handles and to drive any type selector.
   */
  supportedTypes: readonly DeviceType[];
  RegisterDeviceForm: React.FC<RegisterDeviceFormProps>;
}
