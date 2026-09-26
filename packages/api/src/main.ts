import { config } from 'dotenv';

config();

import fs from 'node:fs/promises';

import { createDb } from './database/index.ts';
import { migrateToLatest } from './database/migrate.ts';
import { getMediaPath, getMediaTempPath } from './mediaPaths.ts';
import { buildApp, registerProductionSpa } from './app.ts';

import { EventBus } from './services/devices/EventBus.ts';
import { IntegrationManager } from './services/devices/IntegrationManager.ts';
import { EventMediaCoordinator } from './services/media/EventMediaCoordinator.ts';
import { RecognitionService } from './services/recognition/RecognitionService.ts';
import { CameraPreviewService } from './services/devices/cameraPreview/CameraPreviewService.ts';
import { ESPHomeProvider } from './services/devices/providers/esphome/ESPHomeProvider.ts';
import { CameraProvider } from './services/devices/providers/camera/CameraProvider.ts';
import { InferenceProvider } from './services/devices/providers/inference/InferenceProvider.ts';
import { ThinginoProvider } from './services/devices/providers/thingino/ThinginoProvider.ts';
import { SurePetProvider } from './services/devices/providers/surepet/SurePetProvider.ts';
import { MqttProvider } from './services/devices/providers/mqtt/MqttProvider.ts';
import { DeviceControl } from './services/devices/control/DeviceControl.ts';

const isDev = process.env.NODE_ENV !== 'production';

await fs.mkdir(getMediaPath(), { recursive: true });
await fs.mkdir(getMediaTempPath(), { recursive: true });

const db = createDb();
await migrateToLatest(db);

const eventBus = new EventBus();
const integrationManager = new IntegrationManager(db, eventBus);

integrationManager.registerProvider(new ESPHomeProvider());
integrationManager.registerProvider(new CameraProvider());
integrationManager.registerProvider(new ThinginoProvider());
integrationManager.registerProvider(new InferenceProvider());
integrationManager.registerProvider(new SurePetProvider());
integrationManager.registerProvider(new MqttProvider());

await integrationManager.initialize();

const eventMediaCoordinator = new EventMediaCoordinator(
  db,
  eventBus,
  integrationManager.getMediaManager(),
  integrationManager,
);
await eventMediaCoordinator.initialize();

const cameraPreview = new CameraPreviewService(db, integrationManager);
integrationManager.bindPreviewCache(cameraPreview);
cameraPreview.start();

// After the coordinator: recognition reacts to the `media_ready` the
// coordinator publishes, so it has nothing to hear until that is running.
const recognitionService = new RecognitionService(db, eventBus);
await recognitionService.initialize();

const deviceControl = new DeviceControl({
  context: integrationManager,
  eventBus,
});

const app = await buildApp({
  db,
  integrationManager,
  recognitionService,
  cameraPreview,
  deviceControl,
});

if (!isDev) {
  await registerProductionSpa(app);
}

try {
  await app.listen({ port: 3000, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
