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

export class EventBus extends EventEmitter {
  publish(topic: string, event: unknown) {
    this.emit(topic, event);
  }

  subscribe<T = unknown>(topic: string, handler: (event: T) => void) {
    this.on(topic, handler);
  }
}
