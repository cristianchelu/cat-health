import { EventEmitter } from 'events';

export interface ActivityStartEvent {
  deviceId: number;
  timestamp: Date;
}

export interface ActivityEndEvent {
  deviceId: number;
  timestamp: Date;
}

export interface DeviceEvent {
  deviceId: number;
  eventId: number;
  type: string;
  data: unknown;
  timestamp: Date;
}

export interface DeviceMediaReadyEvent {
  deviceId: number;
  eventId: number;
  type: string;
  timestamp: Date;
  mediaReady: true;
  linkedMediaIds?: number[];
}

/**
 * One message received on an `mqtt` account's topic prefix, published as
 * `mqtt.message`. Consumers filter by topic; nothing about the sender is
 * resolved here, so a controller waiting on a device's topic and a discovery
 * scan can share the subscription without knowing about each other.
 */
export interface MqttMessageEvent {
  accountId: number;
  topic: string;
  payload: Buffer;
  retain: boolean;
}

export class EventBus extends EventEmitter {
  publish(topic: string, event: unknown) {
    this.emit(topic, event);
  }

  subscribe<T = unknown>(topic: string, handler: (event: T) => void) {
    this.on(topic, handler);
  }
}
