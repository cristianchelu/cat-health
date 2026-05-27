import type { DeviceType } from 'shared';
import type { AddDeviceFlow } from './types';
import { DefaultRegisterDeviceForm } from './DefaultRegisterDeviceForm';
import { InferenceRegisterDeviceForm } from './InferenceRegisterDeviceForm';
import { CameraRegisterDeviceForm } from './CameraRegisterDeviceForm';
import { EsphomeRegisterDeviceForm } from './EsphomeRegisterDeviceForm';
import { SurePetRegisterDeviceForm } from './surepet/SurePetRegisterDeviceForm';

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

const inferenceFlow: AddDeviceFlow = {
  skipDiscovery: true,
  supportedTypes: ['pet_recognizer'],
  RegisterDeviceForm: InferenceRegisterDeviceForm,
};

const cameraFlow: AddDeviceFlow = {
  skipDiscovery: true,
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
};

const PROVIDER_FLOWS: Record<string, AddDeviceFlow> = {
  inference: inferenceFlow,
  camera: cameraFlow,
  thingino: cameraFlow,
  esphome: esphomeFlow,
  surepet: surepetFlow,
};

export function getFlow(provider: string): AddDeviceFlow {
  return PROVIDER_FLOWS[provider] ?? defaultFlow;
}
