import type { DeviceType } from 'shared';
import type { AddDeviceFlow } from './types';
import { DefaultRegisterDeviceForm } from './DefaultRegisterDeviceForm';
import { InferenceRegisterDeviceForm } from './InferenceRegisterDeviceForm';
import { CameraRegisterDeviceForm } from './CameraRegisterDeviceForm';
import { EsphomeRegisterDeviceForm } from './EsphomeRegisterDeviceForm';
import { SurePetRegisterDeviceForm } from './surepet/SurePetRegisterDeviceForm';
import { ThinginoRegisterDeviceForm } from './thingino/ThinginoRegisterDeviceForm';

const ALL_DEVICE_TYPES: readonly DeviceType[] = [
  'litterbox',
  'feeder',
  'water_fountain',
  'camera',
  'pet_recognizer',
];

const defaultFlow: AddDeviceFlow = {
  supportedTypes: ALL_DEVICE_TYPES,
  RegisterDeviceForm: DefaultRegisterDeviceForm,
};

/*
 * Whether discovery is skipped is not decided here: it comes from the API's
 * `skip_discovery` capability, which is what both the step plan and navigation
 * read. A local copy could only ever disagree with it.
 */
const inferenceFlow: AddDeviceFlow = {
  supportedTypes: ['pet_recognizer'],
  RegisterDeviceForm: InferenceRegisterDeviceForm,
};

const cameraFlow: AddDeviceFlow = {
  supportedTypes: ['camera'],
  RegisterDeviceForm: CameraRegisterDeviceForm,
};

const esphomeFlow: AddDeviceFlow = {
  allowsDirectRegistration: true,
  supportedTypes: ['litterbox', 'water_fountain'],
  RegisterDeviceForm: EsphomeRegisterDeviceForm,
};

const surepetFlow: AddDeviceFlow = {
  supportedTypes: ['feeder'],
  RegisterDeviceForm: SurePetRegisterDeviceForm,
  /*
   * SurePetRegisterDeviceForm collects only a name, defaulted to the
   * discovered one, so importing directly loses nothing but the chance to
   * rename — which /settings/devices/:id already handles. That makes discovery
   * multi-select for this provider while esphome, whose form genuinely asks
   * for a device type and per-type settings, stays single-select.
   */
  buildDeviceFromDiscovery: (account, device) => ({
    provider_account_id: account.id,
    external_id: device.externalId,
    name: device.name,
    type: device.type,
    config: device.config,
  }),
};

const thinginoFlow: AddDeviceFlow = {
  allowsDirectRegistration: true,
  supportedTypes: ['camera'],
  RegisterDeviceForm: ThinginoRegisterDeviceForm,
};

const PROVIDER_FLOWS: Record<string, AddDeviceFlow> = {
  inference: inferenceFlow,
  camera: cameraFlow,
  thingino: thinginoFlow,
  esphome: esphomeFlow,
  surepet: surepetFlow,
};

export function getFlow(provider: string): AddDeviceFlow {
  return PROVIDER_FLOWS[provider] ?? defaultFlow;
}
